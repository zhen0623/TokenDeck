package com.darius.tokendeck

import android.content.ContentValues
import android.os.Build
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.provider.MediaStore
import android.webkit.JavascriptInterface
import android.webkit.WebView
import org.json.JSONObject
import java.io.File
import java.net.URL
import java.util.concurrent.Executors
import javax.net.ssl.HttpsURLConnection

/**
 * JS ↔ 原生桥
 *
 * 两块能力：
 *  1. HTTP：WebView 里 fetch 厂商 API 会被 CORS 拦死（厂商不返回
 *     Access-Control-Allow-Origin），必须由原生发请求。
 *  2. 文件：WebView 的 <input type=file> 与 a[download] 都不可用，
 *     配置导入导出必须靠 SAF（系统文件选择器）与 MediaStore。
 */
class NativeBridge(
    private val webView: WebView,
    /** 打开系统文件选择器；回调传入读到的文本，取消为 null */
    private val onPickText: (callback: (String?) -> Unit) -> Unit,
    /** 保存文本文件；回调 (成功, 提示信息) */
    private val onSaveText: (filename: String, content: String, done: (Boolean, String) -> Unit) -> Unit,
) {

    private val pool = Executors.newFixedThreadPool(4)
    private val main = Handler(Looper.getMainLooper())

    /**
     * 域名白名单：与前端 src/settings.ts 的厂商注册表一一对应。
     * 新增厂商时必须同步这里，否则请求会被拒绝（安全边界，不做通配）。
     */
    private val allowedHostsMutable = mutableSetOf<String>()

    private val allowedHosts = setOf(
        // ---- 小米 MiMo（按量付费 + Token Plan 三区域）----
        "api.xiaomimimo.com",
        "token-plan-cn.xiaomimimo.com",
        "token-plan-sgp.xiaomimimo.com",
        "token-plan-ams.xiaomimimo.com",
        // ---- 国内 ----
        "api.deepseek.com",
        "dashscope.aliyuncs.com",
        "api.moonshot.cn",
        "open.bigmodel.cn",
        "api.minimax.chat",
        "api.minimaxi.com",
        "api.stepfun.com",
        "ark.cn-beijing.volces.com",
        "qianfan.baidubce.com",
        "api.hunyuan.cloud.tencent.com",
        "api.sensenova.cn",
        // ---- 国际 ----
        "api.openai.com",
        "api.anthropic.com",
        "generativelanguage.googleapis.com",
        "api.x.ai",
        "api.mistral.ai",
        "api.cohere.ai",
        "api.groq.com",
        "api.together.xyz",
        "api.fireworks.ai",
        "api.perplexity.ai",
        "api.cerebras.ai",
        // ---- 聚合 ----
        "openrouter.ai",
        "api.openrouter.ai",
        "api.siliconflow.cn",
    )

    /* ============================================================ HTTP */

    @JavascriptInterface
    fun request(id: String, url: String, method: String, headersJson: String, body: String) {
        pool.execute {
            val result = try {
                perform(url, method, headersJson, body)
            } catch (e: Exception) {
                err("请求异常：${e.javaClass.simpleName} ${e.message ?: ""}")
            }
            deliver(id, result)
        }
    }

    /** JS 侧探测用：判断当前是否运行在 App 内 */
    @JavascriptInterface
    fun hasKey(@Suppress("UNUSED_PARAMETER") id: String): Boolean = true

    /**
     * 自定义厂商放行：只有用户在 App 内主动添加的 Base URL 才额外放行。
     * 只接受形如 api.example.com 的 HTTPS 主机名，不做通配，避免变成任意外联通道。
     */
    @JavascriptInterface
    fun allowHost(host: String) {
        val h = host.trim().lowercase()
        if (h.isNotEmpty() && h.matches(Regex("^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$"))) {
            allowedHostsMutable.add(h)
        }
    }

    private fun perform(
        urlStr: String,
        method: String,
        headersJson: String,
        body: String,
    ): String {
        val parsed = URL(urlStr)
        if (parsed.protocol != "https") {
            return err("只允许 HTTPS")
        }
        if (parsed.host !in allowedHosts && parsed.host !in allowedHostsMutable) {
            return err("域名不在白名单：${parsed.host}")
        }

        val conn = parsed.openConnection() as HttpsURLConnection
        conn.requestMethod = if (method.isBlank()) "GET" else method.uppercase()
        conn.connectTimeout = 12_000
        conn.readTimeout = 12_000
        conn.instanceFollowRedirects = false
        conn.setRequestProperty("Accept", "application/json")
        conn.setRequestProperty("User-Agent", "TokenDeck/0.2 (Android)")

        if (headersJson.isNotBlank()) {
            runCatching {
                val h = JSONObject(headersJson)
                for (key in h.keys()) {
                    conn.setRequestProperty(key, h.getString(key))
                }
            }
        }

        if (body.isNotBlank() && conn.requestMethod != "GET") {
            conn.doOutput = true
            conn.setRequestProperty("Content-Type", "application/json")
            conn.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
        }

        val status = conn.responseCode
        val stream = if (status in 200..299) conn.inputStream else conn.errorStream
        val text = stream?.bufferedReader()?.use { it.readText() } ?: ""
        conn.disconnect()

        return JSONObject()
            .put("ok", status in 200..299)
            .put("status", status)
            .put("body", text.take(200_000))
            .toString()
    }

    private fun err(message: String): String =
        JSONObject().put("ok", false).put("status", 0).put("body", "").put("error", message).toString()

    private fun deliver(id: String, payload: String) {
        main.post {
            /*
             * payload 必须用 JSONObject.quote 包成字符串字面量，不能原样拼接。
             *
             * 原因：payload 本身是一段 JSON 文本（perform() 返回的 JSONObject.toString()），
             * 而前端 window.__nativeResolve 收到后会执行 JSON.parse(payload)。
             *
             * 若原样拼进去：  window.__nativeResolve("r1", {"ok":true,...})
             *   → JS 把第二个参数当成**对象**求值，typeof 为 object，
             *     前端再 JSON.parse(object) 直接抛
             *     SyntaxError: "[object Object]" is not valid JSON
             *   → 落入 catch，报"原生返回格式异常"。
             *
             * 加 quote 后：   window.__nativeResolve("r1", "{\"ok\":true,...}")
             *   → 收到字符串，JSON.parse 正常。
             *
             * 这个 bug 从 0.2 一直到 0.9.1 都存在：App 内"测试连接"必然失败，
             * 且与厂商无关。浏览器里走 fetch 分支所以不复现，只在真机暴露。
             */
            val js = "window.__nativeResolve(${JSONObject.quote(id)}, ${JSONObject.quote(payload)})"
            webView.evaluateJavascript(js, null)
        }
    }

    /* ============================================================ 文件 */

    /**
     * 导出文本文件。
     * Android 10+ 写进「下载/TokenDeck」，无需存储权限；
     * 更低版本退回 App 专属目录（同样免权限），并把路径回给 JS 显示。
     */
    @JavascriptInterface
    fun saveText(filename: String, content: String) {
        onSaveText(filename, content) { ok, message ->
            main.post {
                val js = "window.__lbSaveText($ok, ${JSONObject.quote(message)})"
                webView.evaluateJavascript(js, null)
            }
        }
    }

    /**
     * 让用户挑一个 JSON 文件并读成文本。
     * 走 SAF，不申请任何存储权限。
     */
    @JavascriptInterface
    fun pickText() {
        onPickText { text ->
            main.post {
                val js = if (text == null) {
                    "window.__lbPickText(null, true)"
                } else {
                    "window.__lbPickText(${JSONObject.quote(text)}, false)"
                }
                webView.evaluateJavascript(js, null)
            }
        }
    }

    /**
     * 读剪贴板纯文本。
     *
     * 为什么需要这个：WebView 里 <input type="password"> 在部分安卓版本
     * （尤其国产 ROM）不弹系统长按菜单，用户没法把 API Key 粘进去，
     * 只能逐字敲。前端因此提供一个"粘贴"按钮，直接向原生要剪贴板内容。
     *
     * 返回空字符串表示剪贴板为空或类型不对（不是文本），前端据此提示。
     * 只读、不写、不上送，内容仅回传给当前 WebView。
     */
    @JavascriptInterface
    fun readClipboard(): String {
        val ctx = webView.context
        return try {
            val cm = ctx.getSystemService(android.content.Context.CLIPBOARD_SERVICE)
                as? android.content.ClipboardManager
                ?: return ""
            val clip = cm.primaryClip ?: return ""
            if (clip.itemCount == 0) return ""
            // 有些 ROM 会把 URI/Intent 放进剪贴板，toString 会得到授权串，需排除
            clip.getItemAt(0).text?.toString()?.trim() ?: ""
        } catch (e: Exception) {
            // 部分系统在后台读剪贴板会抛 SecurityException，静默降级为空
            ""
        }
    }

    // 文件写入由 MainActivity 实现（它持有 Context），这里不重复造轮子
}

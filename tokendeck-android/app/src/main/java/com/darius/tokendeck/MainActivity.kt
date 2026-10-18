package com.darius.tokendeck

import android.annotation.SuppressLint
import android.content.ContentValues
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.provider.MediaStore
import android.view.KeyEvent
import android.view.View
import android.view.ViewGroup
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.window.OnBackInvokedDispatcher
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.WindowCompat
import androidx.webkit.WebViewAssetLoader

/**
 * TokenDeck —— 纯本地 WebView 外壳
 *
 * 资源通过 WebViewAssetLoader 以 https://appassets.androidplatform.net/ 提供，
 * 而不是 file://。原因：
 *   1. file:// 下 localStorage / 同源策略受限，主题持久化会失效
 *   2. https 源下同源策略与真实站点一致，前端代码零改动
 *   3. 可拦截未知请求，避免外链跳转
 */
class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView

    /** 等待用户挑选文件的 JS 回调（SAF 是异步的，先存这里） */
    private var pendingPick: ((String?) -> Unit)? = null
    private var pendingSave: ((Boolean, String) -> Unit)? = null

    /**
     * 系统文件选择器。
     * WebView 的 <input type=file> 在外壳里拿不到结果，
     * 所以配置导入改成：JS → 原生 → SAF → 读文本 → 回传 JS。
     */
    private val pickFile = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        val cb = pendingPick
        pendingPick = null
        if (result.resultCode != RESULT_OK) {
            cb?.invoke(null)
            return@registerForActivityResult
        }
        val uri: Uri? = result.data?.data
        if (uri == null) {
            cb?.invoke(null)
            return@registerForActivityResult
        }
        val text = runCatching {
            contentResolver.openInputStream(uri)?.bufferedReader()?.use { it.readText() }
        }.getOrNull()
        cb?.invoke(text)
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // 不延伸到系统栏下：交给系统留出状态栏/导航栏空间。
        // 之前用 edge-to-edge + 手动 insets padding，实测仍有元素被状态栏压住，
        // 这里改为系统托管，从根上避免遮挡。
        WindowCompat.setDecorFitsSystemWindows(window, true)

        val assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler(
                "/assets/",
                WebViewAssetLoader.AssetsPathHandler(this)
            )
            .build()

        // 先建对象（不能写在 apply 里 —— 注入桥接时 webView 还没赋值）
        webView = WebView(this)
        webView.layoutParams = ViewGroup.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        )
        webView.setBackgroundColor(Color.TRANSPARENT)
        webView.overScrollMode = View.OVER_SCROLL_NEVER

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true          // 主题/字号/API Key 持久化必需
            databaseEnabled = true
            allowFileAccess = false
            allowContentAccess = false
            mediaPlaybackRequiresUserGesture = false
            // 锁死系统字体缩放（安卓设置里的「字体大小」）：
            // 实测 130% 时卡片数字直接顶破容器。字号只由 App 内设置控制。
            textZoom = 100
            setSupportZoom(false)
            builtInZoomControls = false
            displayZoomControls = false
            mixedContentMode = android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW
        }

        webView.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(
                view: WebView,
                request: WebResourceRequest
            ): WebResourceResponse? = assetLoader.shouldInterceptRequest(request.url)

            // 外链不跳出 app
            override fun shouldOverrideUrlLoading(
                view: WebView,
                request: WebResourceRequest
            ): Boolean {
                val url = request.url.toString()
                return !url.startsWith("https://appassets.androidplatform.net")
            }
        }

        // 注入原生桥：HTTP（绕 CORS）+ 文件（SAF 导入 / MediaStore 导出）
        webView.addJavascriptInterface(
            NativeBridge(
                webView,
                onPickText = { cb ->
                    pendingPick = cb
                    val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
                        addCategory(Intent.CATEGORY_OPENABLE)
                        type = "application/json"
                        // 部分文件管理器把 .json 标成 text/plain，多给一类更稳
                        putExtra(Intent.EXTRA_MIME_TYPES, arrayOf("application/json", "text/plain", "*/*"))
                    }
                    runCatching { pickFile.launch(intent) }
                        .onFailure {
                            pendingPick = null
                            cb(null)
                        }
                },
                onSaveText = { filename, content, done ->
                    pendingSave = done
                    Thread {
                        val (_, message) = writeToDownloads(filename, content)
                        val ok = message?.startsWith("已保存") == true
                        runOnUiThread {
                            pendingSave = null
                            done(ok, message ?: "保存失败")
                        }
                    }.start()
                },
            ),
            "NativeApi"
        )

        webView.loadUrl("https://appassets.androidplatform.net/assets/index.html")

        setContentView(webView)

        // 关闭长按选中/上下文菜单残留
        webView.setOnLongClickListener { true }
        webView.isLongClickable = false
        webView.isHapticFeedbackEnabled = false

        installBackHandling()
    }

    /**
     * 屏蔽返回手势 / 返回键。
     *
     * 关键教训：targetSdk 34 且 enableOnBackInvokedCallback=true 时，
     * Android 13+ 走「预测性返回」，onBackPressed() **不会被调用** ——
     * 之前只覆写 onBackPressed，等于完全没生效，边缘一滑就退出 App。
     * 正确做法是注册 OnBackInvokedCallback（33+），旧版本保留 onBackPressed。
     *
     * 0.8.0 起导航改为底部 dock，不再有抽屉，返回键语义随之改变：
     *   子页面 → 回到「总览」；已在总览 → 退到后台（moveTaskToBack）。
     * 仍不直接 finish()：边缘误触返回不该把 App 关掉，退后台保留了现场。
     */
    private fun installBackHandling() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            onBackInvokedDispatcher.registerOnBackInvokedCallback(
                OnBackInvokedDispatcher.PRIORITY_DEFAULT
            ) { handleBack() }
        }
    }

    /** 旧系统（Android 12 及以下）的返回键 */
    @Suppress("DEPRECATION")
    override fun onBackPressed() {
        handleBack()
    }

    /** 部分机型把返回键当 KEYCODE 直接下发，这里也拦一道 */
    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        if (event.keyCode == KeyEvent.KEYCODE_BACK) {
            if (event.action == KeyEvent.ACTION_UP) {
                handleBack()
            }
            return true
        }
        return super.dispatchKeyEvent(event)
    }

    /**
     * 交给前端判断：子页面则回总览并返回 "home"，否则返回 "none" 由原生退后台。
     * 判定放在 JS 里，是因为「当前是哪个页面」只有前端知道。
     */
    private fun handleBack() {
        if (!this::webView.isInitialized) {
            moveTaskToBack(true)
            return
        }
        webView.evaluateJavascript(BACK_JS) { result ->
            if (result == null || !result.contains("home")) {
                moveTaskToBack(true)
            }
        }
    }

    override fun onPause() {
        super.onPause()
        if (this::webView.isInitialized) webView.onPause()
    }

    /**
     * 保存 JSON 到「下载/TokenDeck」。
     * Android 10+ 走 MediaStore，无需申请存储权限；
     * 更低版本退回 App 专属外部目录（同样免权限）。
     *
     * @return Pair(文件路径或 null, 提示信息)
     */
    private fun writeToDownloads(filename: String, content: String): Pair<String?, String?> {
        return try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                val values = ContentValues().apply {
                    put(MediaStore.Downloads.DISPLAY_NAME, filename)
                    put(MediaStore.Downloads.MIME_TYPE, "application/json")
                    put(
                        MediaStore.Downloads.RELATIVE_PATH,
                        "${Environment.DIRECTORY_DOWNLOADS}/TokenDeck"
                    )
                    put(MediaStore.Downloads.IS_PENDING, 1)
                }
                val uri = contentResolver.insert(
                    MediaStore.Downloads.EXTERNAL_CONTENT_URI, values
                ) ?: return null to "保存失败：无法创建文件"
                contentResolver.openOutputStream(uri)?.use {
                    it.write(content.toByteArray(Charsets.UTF_8))
                }
                values.clear()
                values.put(MediaStore.Downloads.IS_PENDING, 0)
                contentResolver.update(uri, values, null, null)
                null to "已保存到 下载/TokenDeck/$filename"
            } else {
                val dir = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS)
                dir?.mkdirs()
                val f = java.io.File(dir, filename)
                f.writeText(content, Charsets.UTF_8)
                null to "已保存到 ${f.absolutePath}"
            }
        } catch (e: Exception) {
            null to "保存失败：${e.message ?: e.javaClass.simpleName}"
        }
    }

    override fun onResume() {
        super.onResume()
        if (this::webView.isInitialized) webView.onResume()
    }

    override fun onDestroy() {
        if (this::webView.isInitialized) {
            webView.loadUrl("about:blank")
            webView.destroy()
        }
        super.onDestroy()
    }

    companion object {
        /**
         * 子页面回到总览，返回 "home"；已在总览返回 "none"。
         * replaceState 不触发 hashchange，必须手动派发，否则 React 不知道路由变了。
         */
        private const val BACK_JS =
            "(function(){var h=(location.hash||'').replace('#','');" +
                "if(h&&h!=='overview'){" +
                "history.replaceState(null,'','#overview');" +
                "window.dispatchEvent(new Event('hashchange'));" +
                "var m=document.querySelector('main');if(m)m.scrollTop=0;" +
                "return 'home';}" +
                "return 'none';})()"
    }
}

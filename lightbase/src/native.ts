// ============================================================================
// 原生桥接层
// ----------------------------------------------------------------------------
// 为什么需要它：
//   WebView 里 fetch('https://api.openai.com/...') 会被 CORS 拦掉 ——
//   各厂商接口都不返回 Access-Control-Allow-Origin，浏览器端无解。
//   因此请求交给 Android 原生发（不受同源策略约束），结果回传 JS。
//
// 在浏览器里跑（npm run dev）时自动退回普通 fetch，功能不中断。
// ============================================================================

interface NativeBridge {
  request: (id: string, url: string, method: string, headers: string, body: string) => void;
  hasKey: (id: string) => boolean;
  allowHost?: (host: string) => void;
  saveText?: (filename: string, content: string) => void;
  pickText?: () => void;
  /** 读剪贴板纯文本，无内容返回空串 */
  readClipboard?: () => string;
}

declare global {
  interface Window {
    NativeApi?: NativeBridge;
    __nativeResolve?: (id: string, payload: string) => void;
    __lbNativeKeys?: Record<string, string>;
    __lbSaveText?: (ok: boolean, message: string) => void;
    __lbPickText?: (text: string | null, cancelled: boolean) => void;
  }
}

export interface HttpResponse {
  ok: boolean;
  status: number;
  body: string;
  /** 网络层错误（DNS/超时/证书），区别于 HTTP 错误码 */
  error?: string;
}

export function hasNativeBridge(): boolean {
  return typeof window !== 'undefined' && !!window.NativeApi;
}

/**
 * 读剪贴板。
 *
 * 两条路径，原因不同：
 *  - 原生壳：WebView 里 <input type="password"> 在部分安卓 ROM 上不弹长按菜单，
 *    用户根本没法粘贴，必须走 NativeBridge.readClipboard()。
 *  - 浏览器：navigator.clipboard.readText() 需要安全上下文与用户授权，
 *    失败就返回空串，让调用方提示"请手动粘贴"，不要吞掉不报。
 */
export async function readClipboardText(): Promise<string> {
  if (hasNativeBridge() && window.NativeApi?.readClipboard) {
    try {
      return (window.NativeApi.readClipboard() ?? '').trim();
    } catch {
      return '';
    }
  }
  try {
    if (navigator.clipboard?.readText) {
      return (await navigator.clipboard.readText()).trim();
    }
  } catch {
    /* 未授权或无安全上下文 */
  }
  return '';
}

/**
 * 放行自定义厂商的域名。
 * 原生侧只放行白名单内的主机，用户添加的 Base URL 需显式放行，
 * 否则会报「域名不在白名单」。
 */
export function allowHostFor(baseUrl: string): boolean {
  if (!hasNativeBridge() || !window.NativeApi?.allowHost) return false;
  try {
    const host = new URL(baseUrl).host.toLowerCase();
    window.NativeApi.allowHost(host);
    return true;
  } catch {
    return false;
  }
}

let seq = 0;
const pending = new Map<string, (r: HttpResponse) => void>();

/* ------------------------------------------------------------ 文件能力 */

/**
 * 保存文本文件。
 * WebView 里 a[download] 不会真落盘，必须交给原生写进「下载/TokenDeck」。
 * 浏览器环境退回 Blob 下载。
 */
export function saveTextFile(filename: string, content: string): Promise<{ ok: boolean; message: string }> {
  if (hasNativeBridge() && window.NativeApi?.saveText) {
    return new Promise((resolve) => {
      const timer = window.setTimeout(() => {
        window.__lbSaveText = undefined;
        resolve({ ok: false, message: '保存超时' });
      }, 10_000);

      window.__lbSaveText = (ok: boolean, message: string) => {
        window.clearTimeout(timer);
        window.__lbSaveText = undefined;
        resolve({ ok, message });
      };

      try {
        window.NativeApi!.saveText!(filename, content);
      } catch (e) {
        window.clearTimeout(timer);
        window.__lbSaveText = undefined;
        resolve({ ok: false, message: String(e) });
      }
    });
  }

  // 浏览器回退
  try {
    const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 4000);
    return Promise.resolve({ ok: true, message: `已下载 ${filename}` });
  } catch (e) {
    return Promise.resolve({ ok: false, message: String(e) });
  }
}

/**
 * 让用户挑一个文件并读出文本。
 * WebView 里 <input type=file> 拿不到结果，走原生 SAF。
 */
export function pickTextFile(): Promise<{ text: string | null; cancelled: boolean }> {
  if (hasNativeBridge() && window.NativeApi?.pickText) {
    return new Promise((resolve) => {
      const timer = window.setTimeout(() => {
        window.__lbPickText = undefined;
        resolve({ text: null, cancelled: true });
      }, 180_000); // 用户可能在文件管理器里停留较久

      window.__lbPickText = (text: string | null, cancelled: boolean) => {
        window.clearTimeout(timer);
        window.__lbPickText = undefined;
        resolve({ text, cancelled });
      };

      try {
        window.NativeApi!.pickText!();
      } catch {
        window.clearTimeout(timer);
        window.__lbPickText = undefined;
        resolve({ text: null, cancelled: true });
      }
    });
  }

  // 浏览器回退：动态建 input
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return resolve({ text: null, cancelled: true });
      const reader = new FileReader();
      reader.onload = () => resolve({ text: String(reader.result ?? ''), cancelled: false });
      reader.onerror = () => resolve({ text: null, cancelled: true });
      reader.readAsText(file);
    };
    // 用户直接取消不会触发任何事件，靠超时兜底
    window.setTimeout(() => resolve({ text: null, cancelled: true }), 180_000);
    input.click();
  });
}

// 原生回调用全局函数，这里挂一次
if (typeof window !== 'undefined') {
  window.__nativeResolve = (id: string, payload: string | HttpResponse) => {
    const cb = pending.get(id);
    if (!cb) return;
    pending.delete(id);
    try {
      /*
       * 兼容两种回传形态。
       *
       * 原生侧 deliver() 曾把 payload 原样拼进 JS 调用，导致这里是
       * object 而不是 string，JSON.parse 抛 "[object Object]"，
       * 全部请求都退化到 catch 报"原生返回格式异常"。
       * 原生已改为 JSONObject.quote(payload) 正常传字符串；
       * 这里仍保留对象分支，避免旧版 APK 配新版前端时再次踩坑。
       */
      cb(typeof payload === 'string' ? (JSON.parse(payload) as HttpResponse) : payload);
    } catch {
      cb({ ok: false, status: 0, body: '', error: '原生返回格式异常' });
    }
  };
}

const TIMEOUT = 15_000;

/** 发一个 HTTP 请求：优先原生，退化到 fetch */
export function httpRequest(
  url: string,
  init: { method?: string; headers?: Record<string, string>; body?: string } = {},
): Promise<HttpResponse> {
  const method = init.method ?? 'GET';
  const headers = init.headers ?? {};

  if (hasNativeBridge()) {
    return new Promise((resolve) => {
      const id = `r${++seq}`;
      const timer = window.setTimeout(() => {
        pending.delete(id);
        resolve({ ok: false, status: 0, body: '', error: '请求超时' });
      }, TIMEOUT);

      pending.set(id, (r) => {
        window.clearTimeout(timer);
        resolve(r);
      });

      try {
        window.NativeApi!.request(
          id,
          url,
          method,
          JSON.stringify(headers),
          init.body ?? '',
        );
      } catch (e) {
        window.clearTimeout(timer);
        pending.delete(id);
        resolve({ ok: false, status: 0, body: '', error: String(e) });
      }
    });
  }

  // 浏览器回退
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), TIMEOUT);
  return fetch(url, { method, headers, body: init.body, signal: ctrl.signal })
    .then(async (res) => ({
      ok: res.ok,
      status: res.status,
      body: await res.text(),
    }))
    .catch((e: unknown) => ({
      ok: false,
      status: 0,
      body: '',
      error: e instanceof Error ? e.message : String(e),
    }))
    .finally(() => window.clearTimeout(timer));
}

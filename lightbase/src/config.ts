import { loadKeys, saveKeys, loadCustomProviders, saveCustomProviders } from './settings';

/* ============================================================================
 * 配置导入 / 导出
 * ----------------------------------------------------------------------------
 * 场景：在一台设备上配好厂商 Key 与自定义端点，导出 JSON，另一台导入。
 *
 * ⚠️ 导出文件包含**明文 API Key**。这是功能本身的要求（否则到新设备还得手抄），
 * 所以界面上必须明确提示，并建议导入后删除该文件。不做隐式加密——
 * 假加密只会让人误以为文件安全。
 *
 * 兼容性设计：
 * - 带 version 与 app，导入时校验，避免把别的 JSON 塞进来
 * - 只认识的字段才写入，未知字段忽略（前向兼容）
 * - 导入前先做备份，失败可回滚
 * ========================================================================== */

export const CONFIG_VERSION = 1;
export const CONFIG_APP = 'tokendeck';

export interface ConfigFile {
  app: typeof CONFIG_APP;
  version: number;
  exportedAt: string;
  /** 设备上看到的版本号，仅供排查 */
  appVersion?: string;
  keys: Record<string, string>;
  customProviders: Array<{ id: string; name: string; baseUrl: string }>;
  settings?: {
    theme?: 'light' | 'dark' | 'system';
    glassMode?: 'off' | 'frosted' | 'liquid';
    fontScale?: 0 | 1 | 2;
    autoRefresh?: number;
  };
}

const KEY_THEME = 'lb-theme';
const KEY_GLASS_MODE = 'lb-glass-mode';
const KEY_FS = 'lb-fs';
const KEY_REFRESH = 'lb-auto-refresh';

function readRaw<T>(key: string): T | undefined {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? undefined : (JSON.parse(raw) as T);
  } catch {
    return undefined;
  }
}

/* ------------------------------------------------------------------ 导出 */

export function buildConfig(
  opts: { includeKeys: boolean; includeSettings: boolean; appVersion: string } = {
    includeKeys: true,
    includeSettings: true,
    appVersion: '',
  },
): ConfigFile {
  const cfg: ConfigFile = {
    app: CONFIG_APP,
    version: CONFIG_VERSION,
    exportedAt: new Date().toISOString(),
    appVersion: opts.appVersion,
    keys: opts.includeKeys ? loadKeys() : {},
    customProviders: loadCustomProviders(),
  };

  if (opts.includeSettings) {
    cfg.settings = {
      theme: readRaw<'light' | 'dark' | 'system'>(KEY_THEME),
      glassMode: readRaw<'off' | 'frosted' | 'liquid'>(KEY_GLASS_MODE),
      fontScale: readRaw<0 | 1 | 2>(KEY_FS),
      autoRefresh: readRaw<number>(KEY_REFRESH),
    };
  }
  return cfg;
}

export function configFileName(appVersion: string): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
  return `TokenDeck-config-${appVersion}-${stamp}.json`;
}

/** 触发浏览器下载（WebView 内由原生接管会更稳，这里先走 Blob） */
export function downloadJson(filename: string, data: unknown): boolean {
  try {
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 4000);
    return true;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ 导入 */

export interface ImportResult {
  ok: boolean;
  message: string;
  /** 统计，用于回显 */
  keys: number;
  custom: number;
  settings: boolean;
  /** 导入前的备份，供撤销 */
  backup?: ConfigFile;
}

const VALID_PROVIDER_ID = /^[a-zA-Z0-9_-]+$/;

export function parseConfig(text: string): { ok: true; cfg: ConfigFile } | { ok: false; error: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: '不是合法的 JSON 文件' };
  }
  if (!raw || typeof raw !== 'object') return { ok: false, error: '文件内容不是对象' };

  const o = raw as Record<string, unknown>;
  if (o.app !== CONFIG_APP) {
    return { ok: false, error: '这不是 TokenDeck 的配置文件' };
  }
  if (typeof o.version !== 'number' || o.version > CONFIG_VERSION) {
    return {
      ok: false,
      error: `配置版本不支持（文件 v${String(o.version)}，当前支持 v${CONFIG_VERSION}）`,
    };
  }

  const keys: Record<string, string> = {};
  if (o.keys && typeof o.keys === 'object') {
    for (const [k, v] of Object.entries(o.keys as Record<string, unknown>)) {
      // 只接受规整的 key 名与非空字符串值，挡掉畸形数据
      if (VALID_PROVIDER_ID.test(k) && typeof v === 'string' && v.trim()) {
        keys[k] = v.trim();
      }
    }
  }

  const customProviders: ConfigFile['customProviders'] = [];
  if (Array.isArray(o.customProviders)) {
    for (const item of o.customProviders) {
      if (!item || typeof item !== 'object') continue;
      const c = item as Record<string, unknown>;
      if (typeof c.name !== 'string' || typeof c.baseUrl !== 'string') continue;
      if (!/^https:\/\//.test(c.baseUrl)) continue; // 与原生桥约束一致：只收 HTTPS
      customProviders.push({
        id: typeof c.id === 'string' && VALID_PROVIDER_ID.test(c.id) ? c.id : `custom-${Date.now().toString(36)}-${customProviders.length}`,
        name: c.name.slice(0, 60),
        baseUrl: c.baseUrl.replace(/\/+$/, ''),
      });
    }
  }

  let settings: ConfigFile['settings'];
  if (o.settings && typeof o.settings === 'object') {
    const s = o.settings as Record<string, unknown>;
    settings = {};
    if (s.theme === 'light' || s.theme === 'dark' || s.theme === 'system') settings.theme = s.theme;
    if (s.glassMode === 'off' || s.glassMode === 'frosted' || s.glassMode === 'liquid')
      settings.glassMode = s.glassMode;
    if (s.fontScale === 0 || s.fontScale === 1 || s.fontScale === 2) settings.fontScale = s.fontScale;
    if (typeof s.autoRefresh === 'number' && s.autoRefresh >= 0 && s.autoRefresh <= 1440)
      settings.autoRefresh = s.autoRefresh;
  }

  return {
    ok: true,
    cfg: {
      app: CONFIG_APP,
      version: o.version,
      exportedAt: typeof o.exportedAt === 'string' ? o.exportedAt : '',
      appVersion: typeof o.appVersion === 'string' ? o.appVersion : undefined,
      keys,
      customProviders,
      settings,
    },
  };
}

/** 应用配置；返回统计。合并而非覆盖 keys，避免抹掉目标设备已有配置 */
export function applyConfig(
  cfg: ConfigFile,
  appVersion: string,
  opts: { replaceKeys: boolean } = { replaceKeys: false },
): ImportResult {
  const backup = buildConfig({ includeKeys: true, includeSettings: true, appVersion });

  const existingKeys = loadKeys();
  const nextKeys = opts.replaceKeys ? { ...cfg.keys } : { ...existingKeys, ...cfg.keys };
  saveKeys(nextKeys);

  const existingCustom = loadCustomProviders();
  const mergedCustom = [...existingCustom];
  let addedCustom = 0;
  for (const c of cfg.customProviders) {
    // 按 baseUrl 去重，避免重复导入产生一堆同名条目
    if (mergedCustom.some((e) => e.baseUrl.replace(/\/+$/, '') === c.baseUrl)) continue;
    mergedCustom.push(c);
    addedCustom++;
  }
  saveCustomProviders(mergedCustom);

  let settingsApplied = false;
  if (cfg.settings) {
    const s = cfg.settings;
    try {
      if (s.theme) localStorage.setItem(KEY_THEME, JSON.stringify(s.theme));
      if (s.glassMode) localStorage.setItem(KEY_GLASS_MODE, JSON.stringify(s.glassMode));
      if (typeof s.fontScale === 'number') localStorage.setItem(KEY_FS, JSON.stringify(s.fontScale));
      if (typeof s.autoRefresh === 'number')
        localStorage.setItem(KEY_REFRESH, JSON.stringify(s.autoRefresh));
      settingsApplied = true;
    } catch {
      /* 忽略 */
    }
  }

  const keyCount = Object.keys(cfg.keys).length;
  return {
    ok: true,
    message: `已导入 ${keyCount} 个 Key、${addedCustom} 个自定义厂商${
      settingsApplied ? '，并应用了外观与刷新设置' : ''
    }`,
    keys: keyCount,
    custom: addedCustom,
    settings: settingsApplied,
    backup,
  };
}

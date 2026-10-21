// ============================================================================
// 真实数据层
// ----------------------------------------------------------------------------
// 这个文件只做一件事：从用户已配置的厂商接口读取真实数据。
// 没有种子随机数、没有手写常量、没有「结构对齐的假数据」。
//
// 能拿到的：
//   GET  {baseUrl}/models          → 可用模型清单（OpenAI 兼容，几乎都支持）
//   GET  {baseUrl}{balance.path}   → 余额（仅部分厂商开放，如 DeepSeek / Moonshot）
//
// 拿不到的（因此界面显示「未接入」而不是编一个数）：
//   逐日 token 消耗、历史调用次数、延迟、错误率
//   这些需要厂商提供用量/账单接口，或者本地代理记账。
//
// 取不到就是取不到：宁可显示「未接入」，也不让界面看起来在工作。
// ============================================================================

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { allowHostFor, hasNativeBridge, httpRequest } from './native';
import {
  allProviders,
  balanceRequest,
  loadKeys,
  modelsRequest,
  usageRequest,
} from './settings';
import { priceOf, type ModelPricing } from './pricing';
import { useRefresh } from './refresh';

/* ---------------------------------------------------------------- 格式化 */

export function fmtTokens(n: number, digits = 1): string {
  if (!Number.isFinite(n)) return '—';
  if (n >= 1e9) return `${(n / 1e9).toFixed(digits)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(digits)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(digits)}K`;
  return String(Math.round(n));
}

export function fmtMoney(n: number): string {
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtDelta(d: number): string {
  if (!Number.isFinite(d)) return '—';
  return `${d >= 0 ? '+' : ''}${(d * 100).toFixed(1)}%`;
}

export function fmtDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/* ---------------------------------------------------------------- 类型 */

/**
 * 真实用量。
 *
 * 单位只有两种可能，且绝不混算：
 *   tokens  —— 厂商真给了 token 数
 *   credits —— 厂商只给金额账单（如 OpenRouter 的 total_usage）
 *
 * 拿不到就是 null。实测 GLM / MiMo 的 /usage 系列全部 404，
 * 与随手编的路径返回一致 —— 厂商没这个接口，不能靠 Key 反推。
 */
export interface UsageFigure {
  value: number;
  unit: 'tokens' | 'credits';
  currency?: 'USD' | 'CNY';
}

/** 一个已配置厂商的实时状态 */
export interface LivePlatform {
  id: string;
  name: string;
  /** 分组或备注，用作副标题 */
  vendor: string;
  color: string;
  /** 余额；厂商没提供余额接口时为 null */
  balance: number | null;
  currency: 'USD' | 'CNY';
  /** 该厂商是否有余额接口 */
  balanceSupported: boolean;
  /** 可用模型数；请求失败为 null */
  modelCount: number | null;
  /** 真实用量；厂商无用量接口或调用失败为 null */
  usage: UsageFigure | null;
  /** 该厂商是否声明了用量接口 */
  usageSupported: boolean;
  /** 连接状态 */
  status: 'ok' | 'auth' | 'error';
  /** 状态说明（失败原因） */
  message?: string;
}

/** 一条真实模型记录 */
export interface LiveModel {
  /** 模型 id，来自厂商 /models */
  id: string;
  /** 展示名，多数接口给的就是 id */
  name: string;
  platformId: string;
  platformName: string;
  color: string;
  pricing: ModelPricing;
}

export interface LiveData {
  loading: boolean;
  /** 最后一次成功加载的时间戳；从未成功过为 0 */
  loadedAt: number;
  platforms: LivePlatform[];
  models: LiveModel[];
  /** 全局提示（如未配置任何 Key） */
  error?: string;
}

/* ---------------------------------------------------------------- 解析 */

const asObj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' ? (v as Record<string, unknown>) : {};

/**
 * 从 /models 的返回里取模型数组。
 * 兼容三种常见形态：
 *   { data: [{ id, name }] }
 *   { models: [...] }
 *   [...]                      直接是数组
 */
export function pickModels(body: string): Array<{ id: string; name?: string }> | null {
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return null;
  }
  const o = asObj(json);
  const arr = Array.isArray(json)
    ? json
    : Array.isArray(o.data)
      ? o.data
      : Array.isArray(o.models)
        ? o.models
        : null;
  if (!arr) return null;
  const out: Array<{ id: string; name?: string }> = [];
  for (const item of arr) {
    const m = asObj(item);
    const id = typeof m.id === 'string' ? m.id : typeof m.model === 'string' ? m.model : '';
    if (!id) continue;
    const name = typeof m.name === 'string' && m.name.trim() ? m.name : undefined;
    out.push(name ? { id, name } : { id });
  }
  return out;
}

/** 判断响应体是不是 HTML（站点把未知路径回退到首页时会出现） */
function looksHtml(body: string): boolean {
  const t = body.trimStart().slice(0, 200).toLowerCase();
  return t.startsWith('<!doctype html') || t.startsWith('<html') || t.startsWith('<');
}

const COLORS = ['#10a37f', '#d97757', '#4d6bfe', '#4285f4', '#615ced', '#0ea5b7', '#c026d3', '#ea580c'];

/* ---------------------------------------------------------------- 拉取 */

/**
 * 拉取全部已配置厂商的真实数据。
 *
 * 并发进行，单个厂商失败不影响其它厂商 —— 一个 Key 写错不该让整页空白。
 * 每个厂商都先 allowHostFor，否则 App 内会被原生白名单拦掉。
 */
export async function fetchLiveData(): Promise<Omit<LiveData, 'loading'>> {
  const keys = loadKeys();
  const providers = allProviders().filter((p) => (keys[p.id] ?? '').trim() !== '');

  if (providers.length === 0) {
    return { loadedAt: 0, platforms: [], models: [], error: '还没有配置任何厂商的 Key' };
  }

  const results = await Promise.all(
    providers.map(async (spec, idx) => {
      const key = keys[spec.id].trim();
      const color = COLORS[idx % COLORS.length];

      // 原生白名单：自定义域名必须先放行
      allowHostFor(spec.baseUrl);

      const platform: LivePlatform = {
        id: spec.id,
        name: spec.name,
        vendor: spec.note ?? spec.group,
        color,
        balance: null,
        currency: 'USD',
        balanceSupported: !!spec.balance,
        modelCount: null,
        usage: null,
        usageSupported: !!spec.usage,
        status: 'ok',
      };

      // --- 余额（只有部分厂商有）---
      const bal = balanceRequest(spec, key);
      if (bal) {
        const balRes = await httpRequest(bal.url, { headers: bal.headers });
        if (balRes.ok && !looksHtml(balRes.body)) {
          try {
            const picked = bal.pick(JSON.parse(balRes.body) as Record<string, unknown>);
            if (picked) {
              platform.balance = picked.amount;
              platform.currency = picked.currency === 'CNY' ? 'CNY' : 'USD';
            }
          } catch {
            /* 结构不符就留 null，不要编 */
          }
        }
      }

      // --- 用量（只有极少数厂商开放）---
      const ur = usageRequest(spec, key);
      if (ur) {
        const uRes = await httpRequest(ur.url, { headers: ur.headers });
        if (uRes.ok && !looksHtml(uRes.body)) {
          try {
            const picked = ur.pick(JSON.parse(uRes.body) as Record<string, unknown>);
            if (picked) platform.usage = picked;
          } catch {
            /* 结构不符就留 null，不要编 */
          }
        }
      }

      // --- 模型清单 ---
      const mr = modelsRequest(spec, key);
      const res = await httpRequest(mr.url, { headers: mr.headers });

      if (res.error) {
        platform.status = 'error';
        /*
         * 浏览器里几乎必然走到这里：多数厂商不给 CORS 头，
         * fetch 会以 TypeError / ERR_ABORTED 失败，看起来像网络故障。
         * App 内走原生 HTTP，不受同源策略限制 —— 必须把区别说清楚，
         * 否则用户会以为 Key 或地址填错了。
         */
        platform.message = hasNativeBridge()
          ? res.error
          : `${res.error}（浏览器受跨域限制，App 内不受此限制）`;
        return { platform, models: [] as LiveModel[] };
      }
      if (res.status === 401 || res.status === 403) {
        platform.status = 'auth';
        platform.message = `Key 无效或无权限（HTTP ${res.status}）`;
        return { platform, models: [] as LiveModel[] };
      }
      if (!res.ok) {
        platform.status = 'error';
        platform.message = `请求失败 HTTP ${res.status}`;
        return { platform, models: [] as LiveModel[] };
      }
      if (looksHtml(res.body)) {
        platform.status = 'error';
        platform.message = '返回的是网页，Base URL 可能填到了首页路径';
        return { platform, models: [] as LiveModel[] };
      }

      const list = pickModels(res.body);
      if (!list) {
        platform.status = 'error';
        platform.message = '响应不是可识别的模型列表';
        return { platform, models: [] as LiveModel[] };
      }

      platform.modelCount = list.length;
      const models: LiveModel[] = list.map((m) => ({
        id: m.id,
        name: m.name ?? m.id,
        platformId: spec.id,
        platformName: spec.name,
        color,
        pricing: priceOf(m.id, spec.id),
      }));

      return { platform, models };
    }),
  );

  return {
    loadedAt: Date.now(),
    platforms: results.map((r) => r.platform),
    models: results.flatMap((r) => r.models),
  };
}

/** 是否运行在 App 内（原生桥可用） */
export function inApp(): boolean {
  return hasNativeBridge();
}

/** 汇总：只统计真实取到的值，绝不跨币种相加 */
export function summarize(platforms: LivePlatform[]) {
  const withBalance = platforms.filter((p) => p.balance !== null);
  const usd = withBalance.filter((p) => p.currency === 'USD');
  const cny = withBalance.filter((p) => p.currency === 'CNY');
  return {
    /** 有余额接口且取数成功的厂商数 */
    balanceCount: withBalance.length,
    /** 有余额接口但没取到的厂商数 */
    balanceFailed: platforms.filter((p) => p.balanceSupported && p.balance === null).length,
    usdTotal: usd.reduce((a, p) => a + (p.balance ?? 0), 0),
    cnyTotal: cny.reduce((a, p) => a + (p.balance ?? 0), 0),
    usdProviders: usd.length,
    cnyProviders: cny.length,
    modelTotal: platforms.reduce((a, p) => a + (p.modelCount ?? 0), 0),
    okCount: platforms.filter((p) => p.status === 'ok').length,
    badCount: platforms.filter((p) => p.status !== 'ok').length,
  };
}

/* ---------------------------------------------------------------- 上下文 */

export interface LiveState extends LiveData {
  reload: () => void;
}

const Ctx = createContext<LiveState | null>(null);

/**
 * 全局真实数据源。
 *
 * 放在 Shell 里包一层，而不是每个页面各调一次 useLiveData()：
 * 否则切页面会重复请求，且各页面看到的数据快照不一致。
 *
 * 与自动刷新联动：useRefresh 的 lastAt 变化就重新拉一遍，
 * 保证「刷新」是真的重新请求，不是只转个圈。
 */
export function LiveProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<LiveData>({
    loading: true,
    loadedAt: 0,
    platforms: [],
    models: [],
  });
  const { lastAt } = useRefresh();
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true }));
    void fetchLiveData().then((next) => {
      if (!alive) return;
      setState({ ...next, loading: false });
    });
    return () => {
      alive = false;
    };
  }, [lastAt, tick]);

  const reload = useCallback(() => setTick((n) => n + 1), []);

  return <Ctx.Provider value={{ ...state, reload }}>{children}</Ctx.Provider>;
}

export function useLive(): LiveState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useLive 必须在 LiveProvider 内使用');
  return ctx;
}

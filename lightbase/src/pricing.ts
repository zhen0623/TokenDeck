// ============================================================================
// 计费规则
// ----------------------------------------------------------------------------
// 现实里模型计费有四种形态，展示必须能区分，否则会误导：
//   1. per-token   按量：输入/输出/缓存 分别计价（多数厂商）
//   2. subscription 订阅：固定套餐扣 Credits，没有单价（小米 Token Plan）
//   3. free        免费额度 / 自建
//   4. unknown     厂商未公开或未接入发现接口
//
// 单价单位统一为「每 100 万 tokens」，与厂商官网一致，避免小数点后很多 0。
// 数据来源分两级：内置参考（builtin）与厂商接口实时发现（live）。
// 聚合类网关（OpenRouter 等）的 /models 会返回真实单价，可覆盖内置值。
// ============================================================================

export type BillingMode = 'per-token' | 'subscription' | 'free' | 'unknown';

export type PriceSource = 'builtin' | 'live';

export interface ModelPricing {
  mode: BillingMode;
  currency: 'USD' | 'CNY';
  /** 每 100 万 tokens，输入价 */
  input?: number;
  /** 每 100 万 tokens，输出价 */
  output?: number;
  /** 缓存命中读取价 */
  cacheRead?: number;
  /** 缓存写入价 */
  cacheWrite?: number;
  /** 阶梯价 / 长上下文加价 / 订阅额度等补充说明 */
  note?: string;
  source: PriceSource;
}

/** 计费方式的中文名与语气 */
export const BILLING_META: Record<
  BillingMode,
  { label: string; short: string; tone: 'success' | 'neutral' | 'warning' | 'info' }
> = {
  'per-token': { label: '按量计费', short: '按量', tone: 'success' },
  subscription: { label: '订阅扣 Credits', short: '订阅', tone: 'info' },
  free: { label: '免费', short: '免费', tone: 'neutral' },
  unknown: { label: '计费未知', short: '未知', tone: 'warning' },
};

/* ------------------------------------------------------------------ 内置表 */

/**
 * 以内置参考价打底。
 * 说明：这些是演示模型，单价按公开目录量级填写，仅用于界面演示与成本估算；
 * 接入厂商接口后应以接口返回为准（source 会变成 live）。
 */
export const BUILTIN_PRICING: Record<string, ModelPricing> = {
  'gpt-5.1': {
    mode: 'per-token', currency: 'USD', input: 1.25, output: 10, cacheRead: 0.125,
    note: '缓存命中按输入价 10% 计', source: 'builtin',
  },
  'claude-opus-4.5': {
    mode: 'per-token', currency: 'USD', input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25,
    note: '缓存读约为输入价 10%，写入约 125%', source: 'builtin',
  },
  'gpt-5-mini': {
    mode: 'per-token', currency: 'USD', input: 0.25, output: 2, cacheRead: 0.025,
    source: 'builtin',
  },
  'deepseek-v3.2': {
    mode: 'per-token', currency: 'CNY', input: 2, output: 3, cacheRead: 0.2,
    note: '人民币计价，缓存命中大幅折扣', source: 'builtin',
  },
  'gemini-3-pro': {
    mode: 'per-token', currency: 'USD', input: 1.25, output: 10,
    note: '超过 20 万上下文部分按更高档计价', source: 'builtin',
  },
  'claude-sonnet-4.5': {
    mode: 'per-token', currency: 'USD', input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75,
    source: 'builtin',
  },
  'deepseek-r1': {
    mode: 'per-token', currency: 'CNY', input: 4, output: 16, cacheRead: 1,
    note: '推理模型，思维链 token 按输出计费', source: 'builtin',
  },
  'qwen3-max': {
    mode: 'per-token', currency: 'CNY', input: 8, output: 32,
    note: '阶梯价：上下文越长单价越高', source: 'builtin',
  },
  'gpt-5-nano': {
    mode: 'per-token', currency: 'USD', input: 0.05, output: 0.4, cacheRead: 0.005,
    source: 'builtin',
  },
  'gemini-3-flash': {
    mode: 'per-token', currency: 'USD', input: 0.3, output: 2.5,
    source: 'builtin',
  },
  'qwen3-vl': {
    mode: 'per-token', currency: 'CNY', input: 4, output: 12,
    note: '图像输入按 token 折算后计费', source: 'builtin',
  },
  'gpt-5-pro': {
    mode: 'per-token', currency: 'USD', input: 15, output: 60,
    note: '高推理强度，长输出单价最高', source: 'builtin',
  },

  // 小米 MiMo：按量付费有公开单价；Token Plan 走订阅 Credits，没有单价
  'mimo-v2.5': {
    mode: 'per-token', currency: 'CNY', input: 2, output: 8,
    note: '百万上下文；Token Plan 下改为订阅扣 Credits', source: 'builtin',
  },
  'mimo-v2.5-pro': {
    mode: 'per-token', currency: 'CNY', input: 6, output: 24,
    note: '旗舰推理；Token Plan 下改为订阅扣 Credits', source: 'builtin',
  },
};

/** 订阅制厂商：整体没有 per-token 单价 */
export const SUBSCRIPTION_PROVIDERS = new Set([
  'xiaomi-token-plan-cn',
  'xiaomi-token-plan-sgp',
  'xiaomi-token-plan-ams',
]);

/* -------------------------------------------------------------------- 工具 */

const SYMBOL: Record<string, string> = { USD: '$', CNY: '¥' };

export function money(v: number | undefined, currency: 'USD' | 'CNY'): string {
  if (v === undefined || !Number.isFinite(v)) return '—';
  const sym = SYMBOL[currency] ?? '';
  if (v === 0) return `${sym}0`;
  if (v < 0.01) return `${sym}${v.toPrecision(2)}`;
  if (v >= 100) return `${sym}${v.toFixed(0)}`;
  return `${sym}${v % 1 === 0 ? v.toFixed(0) : v.toFixed(v < 1 ? 3 : 2)}`;
}

export function priceOf(
  modelId: string,
  providerId?: string,
): ModelPricing {
  // 订阅制厂商优先：同一模型在订阅下没有单价
  if (providerId && SUBSCRIPTION_PROVIDERS.has(providerId)) {
    return {
      mode: 'subscription',
      currency: 'CNY',
      note: '按订阅套餐扣 Credits，无逐 token 单价',
      source: 'builtin',
    };
  }
  return (
    BUILTIN_PRICING[modelId] ?? {
      mode: 'unknown',
      currency: 'USD',
      note: '该模型未收录单价，可在厂商控制台查看',
      source: 'builtin',
    }
  );
}

/** 用真实 token 数估算成本；订阅制返回 null（不该用金额衡量） */
export function estimateCost(p: ModelPricing, tokensIn: number, tokensOut: number): number | null {
  if (p.mode !== 'per-token' || p.input === undefined || p.output === undefined) return null;
  return (tokensIn / 1e6) * p.input + (tokensOut / 1e6) * p.output;
}

/** 一行紧凑表述：$1.25 / $10 */
export function compactPrice(p: ModelPricing): string {
  if (p.mode === 'subscription') return '订阅额度';
  if (p.mode === 'free') return '免费';
  if (p.input === undefined || p.output === undefined) return '未收录';
  return `${money(p.input, p.currency)} / ${money(p.output, p.currency)}`;
}

// ============================================================================
// 假数据层 —— 结构与真实 API 返回对齐，后续把 fetch 换掉即可
// ============================================================================

export type PlatformId = 'openai' | 'anthropic' | 'deepseek' | 'google' | 'qwen';

export interface Platform {
  id: PlatformId;
  name: string;
  vendor: string;
  color: string;
  /** 账户余额（USD） */
  balance: number;
  /** 配额总量（tokens） */
  quotaTotal: number;
  /** 已消耗（tokens） */
  quotaUsed: number;
  todayTokens: number;
  yesterdayTokens: number;
  monthTokens: number;
  /** 速率限制：已用 / 上限（RPM） */
  rateUsed: number;
  rateLimit: number;
  status: 'healthy' | 'warning' | 'critical';
  /** 最近 30 天每日 token 消耗 */
  series: number[];
}

export interface ModelStat {
  id: string;
  name: string;
  platformId: PlatformId;
  tokens: number;
  cost: number;
  calls: number;
  /** 近 12 天走势，用于 sparkline */
  trend: number[];
  /** 平均延迟 ms */
  latency: number;
  /** 错误率 0~1 */
  errorRate: number;
}

/* ---------------------------------------------------------------- 随机数 */

function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ------------------------------------------------------------ 平台定义 */

const META: Array<Omit<Platform, 'series' | 'todayTokens' | 'yesterdayTokens' | 'monthTokens'>> = [
  {
    id: 'openai',
    name: 'OpenAI',
    vendor: 'GPT 系列',
    color: '#10a37f',
    balance: 128.42,
    quotaTotal: 400_000_000,
    quotaUsed: 262_800_000,
    rateUsed: 42,
    rateLimit: 500,
    status: 'healthy',
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    vendor: 'Claude 系列',
    color: '#d97757',
    balance: 86.15,
    quotaTotal: 300_000_000,
    quotaUsed: 231_400_000,
    rateUsed: 78,
    rateLimit: 100,
    status: 'warning',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    vendor: 'V3 / R 系列',
    color: '#4d6bfe',
    balance: 42.8,
    quotaTotal: 500_000_000,
    quotaUsed: 188_600_000,
    rateUsed: 15,
    rateLimit: 600,
    status: 'healthy',
  },
  {
    id: 'google',
    name: 'Google AI',
    vendor: 'Gemini 系列',
    color: '#4285f4',
    balance: 64.03,
    quotaTotal: 350_000_000,
    quotaUsed: 301_200_000,
    rateUsed: 91,
    rateLimit: 120,
    status: 'critical',
  },
  {
    id: 'qwen',
    name: '通义千问',
    vendor: 'Qwen 系列',
    color: '#615ced',
    balance: 19.6,
    quotaTotal: 250_000_000,
    quotaUsed: 74_300_000,
    rateUsed: 8,
    rateLimit: 300,
    status: 'healthy',
  },
];

/* -------------------------------------------------------------- 生成数据 */

function buildPlatform(meta: (typeof META)[number], seed: number): Platform {
  const rnd = mulberry32(seed);
  const base = meta.quotaUsed / 60; // 日均基准
  const series: number[] = [];
  for (let i = 0; i < 30; i++) {
    const dow = (i + 3) % 7;
    // 工作日高、周末低
    const week = dow === 0 || dow === 6 ? 0.42 : 1;
    // 轻微上升趋势
    const growth = 0.82 + (i / 29) * 0.36;
    const noise = 0.78 + rnd() * 0.44;
    series.push(Math.round(base * week * growth * noise));
  }
  const today = series[series.length - 1];
  const yesterday = series[series.length - 2];
  return {
    ...meta,
    series,
    todayTokens: today,
    yesterdayTokens: yesterday,
    monthTokens: series.reduce((a, b) => a + b, 0),
  };
}

export const PLATFORMS: Platform[] = META.map((m, i) => buildPlatform(m, 1000 + i * 77));

/* ---------------------------------------------------------------- 模型 */

const MODEL_SEED: Array<Omit<ModelStat, 'trend'>> = [
  { id: 'gpt-5.1', name: 'GPT-5.1', platformId: 'openai', tokens: 96_400_000, cost: 385.6, calls: 18_420, latency: 1840, errorRate: 0.004 },
  { id: 'claude-opus-4.5', name: 'Claude Opus 4.5', platformId: 'anthropic', tokens: 88_200_000, cost: 1323.0, calls: 12_960, latency: 2260, errorRate: 0.007 },
  { id: 'gpt-5-mini', name: 'GPT-5 mini', platformId: 'openai', tokens: 74_900_000, cost: 112.35, calls: 24_180, latency: 940, errorRate: 0.002 },
  { id: 'deepseek-v3.2', name: 'DeepSeek V3.2', platformId: 'deepseek', tokens: 68_500_000, cost: 96.4, calls: 15_720, latency: 1260, errorRate: 0.003 },
  { id: 'gemini-3-pro', name: 'Gemini 3 Pro', platformId: 'google', tokens: 61_300_000, cost: 245.2, calls: 9_840, latency: 1680, errorRate: 0.006 },
  { id: 'claude-sonnet-4.5', name: 'Claude Sonnet 4.5', platformId: 'anthropic', tokens: 54_700_000, cost: 410.25, calls: 14_310, latency: 1420, errorRate: 0.005 },
  { id: 'deepseek-r1', name: 'DeepSeek R1', platformId: 'deepseek', tokens: 41_200_000, cost: 78.9, calls: 6_240, latency: 3820, errorRate: 0.009 },
  { id: 'qwen3-max', name: 'Qwen3 Max', platformId: 'qwen', tokens: 38_600_000, cost: 54.05, calls: 8_960, latency: 1180, errorRate: 0.004 },
  { id: 'gpt-5-nano', name: 'GPT-5 nano', platformId: 'openai', tokens: 31_800_000, cost: 12.72, calls: 31_460, latency: 620, errorRate: 0.001 },
  { id: 'gemini-3-flash', name: 'Gemini 3 Flash', platformId: 'google', tokens: 27_400_000, cost: 16.44, calls: 19_280, latency: 780, errorRate: 0.003 },
  { id: 'qwen3-vl', name: 'Qwen3 VL', platformId: 'qwen', tokens: 14_900_000, cost: 21.6, calls: 3_120, latency: 2140, errorRate: 0.008 },
  { id: 'gpt-5-pro', name: 'GPT-5 pro', platformId: 'openai', tokens: 9_600_000, cost: 288.0, calls: 1_240, latency: 5240, errorRate: 0.011 },
];

export const MODELS: ModelStat[] = MODEL_SEED.map((m, idx) => {
  const rnd = mulberry32(5000 + idx * 31);
  const trend: number[] = [];
  let v = 0.7 + rnd() * 0.5;
  for (let i = 0; i < 12; i++) {
    v = Math.max(0.15, v + (rnd() - 0.45) * 0.22);
    trend.push(v);
  }
  return { ...m, trend };
});

/* ---------------------------------------------------------------- 汇总 */

export function totals() {
  const balance = PLATFORMS.reduce((a, p) => a + p.balance, 0);
  const quotaTotal = PLATFORMS.reduce((a, p) => a + p.quotaTotal, 0);
  const quotaUsed = PLATFORMS.reduce((a, p) => a + p.quotaUsed, 0);
  const todayTokens = PLATFORMS.reduce((a, p) => a + p.todayTokens, 0);
  const yesterdayTokens = PLATFORMS.reduce((a, p) => a + p.yesterdayTokens, 0);
  const monthTokens = PLATFORMS.reduce((a, p) => a + p.monthTokens, 0);
  const monthCost = MODELS.reduce((a, m) => a + m.cost, 0);
  return {
    balance,
    quotaTotal,
    quotaUsed,
    quotaLeft: quotaTotal - quotaUsed,
    todayTokens,
    yesterdayTokens,
    monthTokens,
    monthCost,
    dayDelta: (todayTokens - yesterdayTokens) / Math.max(1, yesterdayTokens),
  };
}

/** 30 天逐日合计，供堆叠图使用 */
export function dailyTotals() {
  return PLATFORMS[0].series.map((_, i) => {
    const row: Record<string, number> = { total: 0 };
    for (const p of PLATFORMS) {
      row[p.id] = p.series[i];
      row.total += p.series[i];
    }
    const d = new Date();
    d.setDate(d.getDate() - (29 - i));
    row.date = d.getTime();
    return row as Record<PlatformId, number> & { total: number; date: number };
  });
}

/* ---------------------------------------------------------------- 格式化 */

export function fmtTokens(n: number, digits = 1): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(digits)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(digits)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(digits)}K`;
  return String(Math.round(n));
}

export function fmtMoney(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtDelta(d: number): string {
  return `${d >= 0 ? '+' : ''}${(d * 100).toFixed(1)}%`;
}

export function fmtDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function platformOf(id: PlatformId): Platform {
  return PLATFORMS.find((p) => p.id === id)!;
}

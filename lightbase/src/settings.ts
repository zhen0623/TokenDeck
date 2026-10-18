// ============================================================================
// 厂商注册表（数据驱动）
// ----------------------------------------------------------------------------
// 设计原则：新增厂商 = 往 PROVIDERS 里加一条数据，不改任何渲染/请求代码。
// 每条记录只描述「怎么鉴权、去哪验证、能不能查余额」，UI 自动生成。
//
// 另有「自定义厂商」：用户填 Base URL + Key，即可接入任何 OpenAI 兼容服务。
// Key 只存在本机 localStorage，不上传任何服务器。
// ============================================================================

export type AuthStyle = 'bearer' | 'x-api-key' | 'query';

export type ProviderGroup = '国内' | '国际' | '聚合';

export interface ProviderSpec {
  id: string;
  name: string;
  group: ProviderGroup;
  /** 输入框占位提示 */
  hint: string;
  /** 申请 Key 的页面 */
  /** OpenAI 兼容 base URL（不带末尾斜杠） */
  baseUrl: string;
  auth: AuthStyle;
  /** 额外请求头（如 Anthropic 的 version） */
  extraHeaders?: Record<string, string>;
  /** 模型列表路径，默认 /models */
  modelsPath?: string;
  /** 余额查询（多数厂商不开放，只有少数有） */
  balance?: {
    path: string;
    /** 从返回 JSON 里取金额与币种 */
    pick: (json: Record<string, unknown>) => { amount: number; currency: string } | null;
  };
  /** 展示用备注 */
  note?: string;
  /** 用户自定义添加 */
  custom?: boolean;
}

/* ---------------------------------------------------------------- 帮助函数 */

const asObj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' ? (v as Record<string, unknown>) : {};

/** DeepSeek / Moonshot 常见结构：{ data: { available_balance } } 或 { balance_infos:[...] } */
const pickBalanceInfos = (json: Record<string, unknown>) => {
  const infos = asObj(json).balance_infos;
  if (Array.isArray(infos) && infos.length > 0) {
    const first = asObj(infos[0]);
    const amount = Number(first.total_balance ?? first.balance ?? NaN);
    if (Number.isFinite(amount)) {
      return { amount, currency: String(first.currency ?? 'CNY') };
    }
  }
  const data = asObj(asObj(json).data);
  const avail = Number(data.available_balance ?? data.balance ?? NaN);
  if (Number.isFinite(avail)) {
    return { amount: avail, currency: String(data.currency ?? 'CNY') };
  }
  return null;
};

/** OpenRouter：{ data: { total_credits, total_usage } } → 剩余额度 */
const pickOpenRouter = (json: Record<string, unknown>) => {
  const d = asObj(asObj(json).data);
  const total = Number(d.total_credits ?? NaN);
  const used = Number(d.total_usage ?? NaN);
  if (Number.isFinite(total)) {
    return { amount: total - (Number.isFinite(used) ? used : 0), currency: 'USD' };
  }
  return null;
};

/* ---------------------------------------------------------------- 厂商清单 */

export const PROVIDERS: ProviderSpec[] = [
  /* ------------------------------ 国内 ------------------------------ */
  {
    id: 'xiaomi',
    name: '小米 MiMo',
    group: '国内',
    hint: 'sk-…（按量付费 Key）',
    baseUrl: 'https://api.xiaomimimo.com/v1',
    auth: 'bearer',
    note: 'MiMo V2.5 / V2.5 Pro，百万上下文，支持推理',
  },
  {
    id: 'xiaomi-token-plan-cn',
    name: '小米 MiMo · Token Plan 中国',
    group: '国内',
    hint: 'tp-…（Token Plan Key）',
    baseUrl: 'https://token-plan-cn.xiaomimimo.com/v1',
    auth: 'bearer',
    note: '订阅制，按 Credits 计费；Key 以 tp- 开头',
  },
  {
    id: 'xiaomi-token-plan-sgp',
    name: '小米 MiMo · Token Plan 新加坡',
    group: '国内',
    hint: 'tp-…（Token Plan Key）',
    baseUrl: 'https://token-plan-sgp.xiaomimimo.com/v1',
    auth: 'bearer',
    note: '区域端点需与订阅页一致',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    group: '国内',
    hint: 'sk-…',
    baseUrl: 'https://api.deepseek.com',
    auth: 'bearer',
    balance: { path: '/user/balance', pick: pickBalanceInfos },
    note: '余额接口开放，可直接读真实余额',
  },
  {
    id: 'qwen',
    name: '通义千问 / 阿里百炼',
    group: '国内',
    hint: 'sk-…',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    auth: 'bearer',
  },
  {
    id: 'moonshot',
    name: '月之暗面 Kimi',
    group: '国内',
    hint: 'sk-…',
    baseUrl: 'https://api.moonshot.cn/v1',
    auth: 'bearer',
    balance: { path: '/users/me/balance', pick: pickBalanceInfos },
  },
  {
    id: 'zhipu',
    name: '智谱 GLM',
    group: '国内',
    hint: '…（API Key）',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    auth: 'bearer',
  },
  {
    id: 'minimax',
    name: 'MiniMax',
    group: '国内',
    hint: '…（API Key）',
    baseUrl: 'https://api.minimax.chat/v1',
    auth: 'bearer',
  },
  {
    id: 'stepfun',
    name: '阶跃星辰 StepFun',
    group: '国内',
    hint: '…（API Key）',
    baseUrl: 'https://api.stepfun.com/v1',
    auth: 'bearer',
  },
  {
    id: 'volcengine',
    name: '火山方舟（豆包）',
    group: '国内',
    hint: '…（方舟 API Key）',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    auth: 'bearer',
    note: '模型 ID 需先在方舟控制台开通',
  },
  {
    id: 'baidu',
    name: '百度千帆',
    group: '国内',
    hint: '…（千帆 API Key）',
    baseUrl: 'https://qianfan.baidubce.com/v2',
    auth: 'bearer',
  },
  {
    id: 'hunyuan',
    name: '腾讯混元',
    group: '国内',
    hint: '…（API Key）',
    baseUrl: 'https://api.hunyuan.cloud.tencent.com/v1',
    auth: 'bearer',
  },
  {
    id: 'sensetime',
    name: '商汤日日新',
    group: '国内',
    hint: '…（API Key）',
    baseUrl: 'https://api.sensenova.cn/compatible-mode/v1',
    auth: 'bearer',
    note: '不同套餐端点可能不同，可在自定义里改',
  },

  /* ------------------------------ 国际 ------------------------------ */
  {
    id: 'openai',
    name: 'OpenAI',
    group: '国际',
    hint: 'sk-… 或 sk-proj-…',
    baseUrl: 'https://api.openai.com/v1',
    auth: 'bearer',
  },
  {
    id: 'anthropic',
    name: 'Anthropic Claude',
    group: '国际',
    hint: 'sk-ant-…',
    baseUrl: 'https://api.anthropic.com/v1',
    auth: 'x-api-key',
    extraHeaders: { 'anthropic-version': '2023-06-01' },
  },
  {
    id: 'google',
    name: 'Google Gemini',
    group: '国际',
    hint: 'AIza…',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    auth: 'query',
  },
  {
    id: 'xai',
    name: 'xAI Grok',
    group: '国际',
    hint: 'xai-…',
    baseUrl: 'https://api.x.ai/v1',
    auth: 'bearer',
  },
  {
    id: 'mistral',
    name: 'Mistral AI',
    group: '国际',
    hint: '…（API Key）',
    baseUrl: 'https://api.mistral.ai/v1',
    auth: 'bearer',
  },
  {
    id: 'cohere',
    name: 'Cohere',
    group: '国际',
    hint: '…（API Key）',
    baseUrl: 'https://api.cohere.ai/compatibility/v1',
    auth: 'bearer',
  },
  {
    id: 'groq',
    name: 'Groq',
    group: '国际',
    hint: 'gsk_…',
    baseUrl: 'https://api.groq.com/openai/v1',
    auth: 'bearer',
  },
  {
    id: 'together',
    name: 'Together AI',
    group: '国际',
    hint: '…（API Key）',
    baseUrl: 'https://api.together.xyz/v1',
    auth: 'bearer',
  },
  {
    id: 'fireworks',
    name: 'Fireworks AI',
    group: '国际',
    hint: 'fw_…',
    baseUrl: 'https://api.fireworks.ai/inference/v1',
    auth: 'bearer',
  },
  {
    id: 'perplexity',
    name: 'Perplexity',
    group: '国际',
    hint: 'pplx-…',
    baseUrl: 'https://api.perplexity.ai',
    auth: 'bearer',
  },
  {
    id: 'cerebras',
    name: 'Cerebras',
    group: '国际',
    hint: 'csk-…',
    baseUrl: 'https://api.cerebras.ai/v1',
    auth: 'bearer',
  },
  {
    id: 'openrouter',
    name: 'OpenRouter（聚合）',
    group: '聚合',
    hint: 'sk-or-…',
    baseUrl: 'https://openrouter.ai/api/v1',
    auth: 'bearer',
    balance: { path: '/credits', pick: pickOpenRouter },
    note: '一个 Key 通吃数百模型，且有完整用量接口',
  },
  {
    id: 'siliconflow',
    name: '硅基流动 SiliconFlow',
    group: '聚合',
    hint: 'sk-…',
    baseUrl: 'https://api.siliconflow.cn/v1',
    auth: 'bearer',
  },
];

/* ------------------------------------------------------------ 自定义厂商 */

const CUSTOM_STORE = 'lb-custom-providers';

export interface CustomProvider {
  id: string;
  name: string;
  baseUrl: string;
}

export function loadCustomProviders(): CustomProvider[] {
  try {
    const raw = localStorage.getItem(CUSTOM_STORE);
    const arr = raw ? (JSON.parse(raw) as CustomProvider[]) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function saveCustomProviders(list: CustomProvider[]) {
  try {
    localStorage.setItem(CUSTOM_STORE, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

export function toSpec(c: CustomProvider): ProviderSpec {
  return {
    id: c.id,
    name: c.name,
    group: '聚合',
    hint: 'API Key（OpenAI 兼容）',
    baseUrl: c.baseUrl.replace(/\/+$/, ''),
    auth: 'bearer',
    custom: true,
    note: '自定义端点',
  };
}

/** 内置 + 自定义，UI 直接遍历这个 */
export function allProviders(): ProviderSpec[] {
  return [...PROVIDERS, ...loadCustomProviders().map(toSpec)];
}

/* ---------------------------------------------------------------- 请求构造 */

export function buildHeaders(spec: ProviderSpec, key: string): Record<string, string> {
  const h: Record<string, string> = { Accept: 'application/json', ...(spec.extraHeaders ?? {}) };
  if (spec.auth === 'bearer') h.Authorization = `Bearer ${key}`;
  else if (spec.auth === 'x-api-key') h['x-api-key'] = key;
  return h;
}

function withQuery(url: string, key: string, auth: AuthStyle) {
  if (auth !== 'query') return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}key=${encodeURIComponent(key)}`;
}

/** 验证 Key：优先查余额（能拿到钱），否则查模型列表 */
export function validateRequest(
  spec: ProviderSpec,
  key: string,
): { url: string; headers: Record<string, string>; kind: 'balance' | 'models' } {
  const path = spec.balance?.path ?? spec.modelsPath ?? '/models';
  const url = withQuery(`${spec.baseUrl}${path}`, key, spec.auth);
  return { url, headers: buildHeaders(spec, key), kind: spec.balance ? 'balance' : 'models' };
}

/** 余额请求（仅部分厂商支持） */
export function balanceRequest(spec: ProviderSpec, key: string) {
  if (!spec.balance) return null;
  return {
    url: withQuery(`${spec.baseUrl}${spec.balance.path}`, key, spec.auth),
    headers: buildHeaders(spec, key),
    pick: spec.balance.pick,
  };
}

/** 拉模型清单（配置成功后可展示真实可用模型） */
export function modelsRequest(spec: ProviderSpec, key: string) {
  return {
    url: withQuery(`${spec.baseUrl}${spec.modelsPath ?? '/models'}`, key, spec.auth),
    headers: buildHeaders(spec, key),
  };
}

/* ---------------------------------------------------------------- 存储 */

const KEY_STORE = 'lb-api-keys';

export type ApiKeys = Record<string, string>;

export function loadKeys(): ApiKeys {
  try {
    const raw = localStorage.getItem(KEY_STORE);
    const obj = raw ? (JSON.parse(raw) as ApiKeys) : {};
    return obj && typeof obj === 'object' ? obj : {};
  } catch {
    return {};
  }
}

export function saveKeys(keys: ApiKeys) {
  try {
    localStorage.setItem(KEY_STORE, JSON.stringify(keys));
  } catch {
    /* 隐私模式下可能失败，忽略 */
  }
}

/** 掩码显示：sk-abcd••••wxyz */
export function maskKey(k: string): string {
  if (!k) return '';
  if (k.length <= 10) return '•'.repeat(k.length);
  return `${k.slice(0, 5)}${'•'.repeat(6)}${k.slice(-4)}`;
}

export interface ProbeResult {
  ok: boolean;
  status: number;
  message: string;
  balance?: number;
  currency?: string;
  /** 探测到的模型数量 */
  modelCount?: number;
}

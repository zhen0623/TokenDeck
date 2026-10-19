import { useMemo, useState } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  Trash2,
  Eye,
  EyeOff,
  Loader2,
  ShieldCheck,
  Search,
  Plus,
  KeyRound,
  ChevronDown,
  Info,
  ClipboardPaste,
} from 'lucide-react';
import { Button, Badge, cx } from './ui';
import { Section, INPUT_CLS } from './settings-ui';
import {
  allProviders,
  loadKeys,
  saveKeys,
  maskKey,
  validateRequest,
  loadCustomProviders,
  saveCustomProviders,
  type ProviderSpec,
  type ProviderGroup,
  type CustomProvider,
} from './settings';
import { httpRequest, hasNativeBridge, allowHostFor, readClipboardText } from './native';
import { APP_VERSION } from './version';

/* ============================================================ 厂商行 */

type ProbeState =
  | { kind: 'idle' }
  | { kind: 'testing' }
  | { kind: 'ok'; message: string; balance?: number; currency?: string; models?: number }
  | { kind: 'fail'; message: string };

function ProviderRow({
  spec,
  value,
  expanded,
  onToggle,
  onChange,
}: {
  spec: ProviderSpec;
  value: string;
  expanded: boolean;
  onToggle: () => void;
  onChange: (v: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const [show, setShow] = useState(false);
  const [probe, setProbe] = useState<ProbeState>({ kind: 'idle' });

  const test = async () => {
    const key = (draft || value).trim();
    if (!key) return;
    setProbe({ kind: 'testing' });

    // 自定义厂商：先让原生放行其域名，否则会被白名单拦掉
    if (spec.custom) allowHostFor(spec.baseUrl);

    const { url, headers, kind } = validateRequest(spec, key);
    const res = await httpRequest(url, { headers });

    if (res.error) return setProbe({ kind: 'fail', message: res.error });
    if (res.status === 401 || res.status === 403) {
      return setProbe({ kind: 'fail', message: `Key 无效或无权限（HTTP ${res.status}）` });
    }
    if (res.status === 429) {
      return setProbe({ kind: 'ok', message: 'Key 有效（触发限流 429）' });
    }
    if (!res.ok) {
      return setProbe({ kind: 'fail', message: `请求失败 HTTP ${res.status}` });
    }

    /*
     * 先判断响应到底是不是 JSON。
     *
     * 有些站点（如 cc-vibe.com）对所有未知路径都回退到首页：任意 /xxx
     * 都返回 200 + 676KB HTML。若不先拦，"测试连接"会因为 HTTP 200
     * 就报"Key 有效"，用户以为配通了，实际请求的是网页。
     * 这类误判比报错更难查，所以宁可判失败并把原因说清楚。
     */
    const bodyTrim = res.body.trimStart();
    const looksHtml =
      bodyTrim.startsWith('<') ||
      /^<!doctype html/i.test(bodyTrim) ||
      /^<html/i.test(bodyTrim);
    if (looksHtml) {
      return setProbe({
        kind: 'fail',
        message:
          '接口返回的是网页而不是 JSON。Base URL 可能填到了站点首页路径，请只填到 /v1 为止',
      });
    }

    if (kind === 'balance' && spec.balance) {
      try {
        const json = JSON.parse(res.body) as Record<string, unknown>;
        const picked = spec.balance.pick(json);
        if (picked) {
          return setProbe({
            kind: 'ok',
            message: 'Key 有效',
            balance: picked.amount,
            currency: picked.currency,
          });
        }
      } catch {
        /* 结构不符则退回通用成功 */
      }
      return setProbe({ kind: 'ok', message: 'Key 有效' });
    }

    try {
      const json = JSON.parse(res.body) as Record<string, unknown>;
      const arr = (json.data ?? json.models ?? json) as unknown;
      const n = Array.isArray(arr) ? arr.length : undefined;
      return setProbe({ kind: 'ok', message: 'Key 有效', models: n });
    } catch {
      /*
       * 走到这里说明 HTTP 成功、又不是 HTML，但正文不是合法 JSON。
       * 旧逻辑直接报"Key 有效"——这是错的：可能是网关返回了纯文本错误、
       * 或端点路径不对。报"有效"会让用户带着坏配置继续用。
       * 但也不能一口咬定失败（鉴权确实通过了），所以分开说。
       */
      return setProbe({
        kind: 'ok',
        message: `Key 有效，但响应不是 JSON（${res.body.slice(0, 40).replace(/\s+/g, ' ') || '空'}…）`,
      });
    }
  };

  const save = () => {
    onChange(draft.trim());
    setProbe({ kind: 'idle' });
    onToggle();
  };

  return (
    <div className="border-b border-[var(--border-muted)] last:border-0">
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-[var(--sp-2)] py-[var(--sp-2)] text-left"
      >
        <span
          className={cx(
            'flex h-[1.9em] w-[1.9em] shrink-0 items-center justify-center rounded-[0.5em]',
            value
              ? 'bg-[var(--brand-green-10)] text-[var(--brand-green-text)]'
              : 'bg-[var(--bg-hover)] text-[var(--text-faint)]',
          )}
        >
          <KeyRound size="0.95em" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[0.92em] text-[var(--text-primary)]">
            {spec.name}
          </span>
          {spec.note && (
            <span className="block truncate text-[0.74em] text-[var(--text-faint)]">
              {spec.note}
            </span>
          )}
        </span>
        {value ? <Badge tone="success">已配置</Badge> : <Badge tone="neutral">未配置</Badge>}
        <ChevronDown
          size="0.95em"
          className={cx(
            'shrink-0 text-[var(--text-faint)] transition-transform',
            expanded && 'rotate-180',
          )}
        />
      </button>

      {expanded && (
        <div className="pb-[var(--sp-3)] pl-[calc(1.9em+var(--sp-2))]">
          <div className="relative">
            {/* 右侧两个按钮各占 2em，输入框避开它们，否则长 Key 会被按钮压住 */}
            <input
              type={show ? 'text' : 'password'}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={spec.hint}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              inputMode="text"
              className={cx(INPUT_CLS, 'pr-[5em]')}
            />
            {/*
              粘贴按钮：WebView 里 type=password 的输入框在部分国产 ROM 上
              长按不弹系统菜单，用户没法粘贴 API Key。这里显式向原生要剪贴板，
              浏览器环境退回 navigator.clipboard。

              两个按钮放进一个 flex 容器统一排版，不要各自 absolute：
               试过给每个按钮加 padding 扩触控区，结果两者宽度从 13px 涨到 29px，
               互相重叠 5.6px，右侧那个还越出了输入框边界。
               容器定宽 + 子项等宽，才是能保证不重叠的写法。
            */}
            <div className="absolute right-[var(--sp-1)] top-1/2 flex -translate-y-1/2 items-center">
              <button
                type="button"
                onClick={async () => {
                  const text = await readClipboardText();
                  if (!text) {
                    setProbe({ kind: 'fail', message: '剪贴板为空，或未授权读取' });
                    return;
                  }
                  setDraft(text);
                  setProbe({ kind: 'idle' });
                }}
                aria-label="从剪贴板粘贴"
                title="从剪贴板粘贴"
                className="flex h-[2em] w-[2em] items-center justify-center rounded-[0.4em] text-[var(--text-muted)] hover:text-[var(--text-primary)] active:bg-[var(--bg-hover)]"
              >
                <ClipboardPaste size="0.95em" />
              </button>
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                aria-label={show ? '隐藏' : '显示'}
                title={show ? '隐藏' : '显示'}
                className="flex h-[2em] w-[2em] items-center justify-center rounded-[0.4em] text-[var(--text-muted)] hover:text-[var(--text-primary)] active:bg-[var(--bg-hover)]"
              >
                {show ? <EyeOff size="0.95em" /> : <Eye size="0.95em" />}
              </button>
            </div>
          </div>

          {value && (
            <div className="mt-[var(--sp-1)] flex items-center gap-[var(--sp-2)] text-[0.78em]">
              <code className="text-[var(--text-muted)]">{maskKey(value)}</code>
              <button
                onClick={() => {
                  onChange('');
                  setDraft('');
                  setProbe({ kind: 'idle' });
                }}
                className="inline-flex items-center gap-[0.2em] text-[var(--color-danger)] hover:underline"
              >
                <Trash2 size="0.85em" />
                清除
              </button>
            </div>
          )}

          <div className="mt-[var(--sp-2)] flex flex-wrap gap-[var(--sp-1)]">
            <Button variant="primary" size="sm" onClick={save} disabled={!draft.trim()}>
              保存
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={test}
              disabled={probe.kind === 'testing' || (!draft.trim() && !value)}
            >
              测试连接
            </Button>
          </div>

          <div className="mt-[var(--sp-1)] truncate text-[0.72em] text-[var(--text-faint)]">
            {spec.baseUrl}
          </div>

          {probe.kind !== 'idle' && (
            <div
              className={cx(
                'mt-[var(--sp-2)] flex items-start gap-[0.35em] text-[0.8em] leading-relaxed',
                probe.kind === 'ok'
                  ? 'text-[var(--brand-green-text)]'
                  : probe.kind === 'fail'
                    ? 'text-[var(--color-danger)]'
                    : 'text-[var(--text-muted)]',
              )}
            >
              {probe.kind === 'testing' && (
                <Loader2 size="0.9em" className="mt-[0.15em] animate-spin" />
              )}
              {probe.kind === 'ok' && <CheckCircle2 size="0.9em" className="mt-[0.15em]" />}
              {probe.kind === 'fail' && <AlertTriangle size="0.9em" className="mt-[0.15em]" />}
              <span>
                {probe.kind === 'testing' && '正在验证…'}
                {probe.kind === 'ok' && probe.message}
                {probe.kind === 'ok' &&
                  probe.balance !== undefined &&
                  ` · 余额 ${probe.currency === 'USD' ? '$' : '¥'}${probe.balance.toFixed(2)}`}
                {probe.kind === 'ok' && probe.models !== undefined && ` · ${probe.models} 个模型`}
                {probe.kind === 'fail' && probe.message}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ============================================================ 自定义厂商 */

function CustomSection({
  list,
  onAdd,
  onRemove,
}: {
  list: CustomProvider[];
  onAdd: (name: string, baseUrl: string) => void;
  onRemove: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [baseUrl, setBaseUrl] = useState('');

  return (
    <Section
      title="自定义厂商"
      desc="任何 OpenAI 兼容端点都能接：填 Base URL（到 /v1 为止）和 Key 即可。"
      right={
        <button
          onClick={() => setOpen((o) => !o)}
          className="inline-flex shrink-0 items-center gap-[0.25em] rounded-[var(--radius-btn)] border border-[var(--border-color)] px-[var(--sp-2)] py-[0.35em] text-[0.82em] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
        >
          <Plus size="0.9em" />
          添加
        </button>
      }
    >
      {open && (
        <div className="mb-[var(--sp-3)] space-y-[var(--sp-2)] rounded-[var(--radius-btn)] bg-[var(--bg-hover)] p-[var(--sp-3)]">
          <input
            className={INPUT_CLS}
            placeholder="名称，如 公司内网网关"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            className={INPUT_CLS}
            placeholder="https://api.example.com/v1"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
          <Button
            variant="primary"
            size="sm"
            disabled={!name.trim() || !/^https:\/\//.test(baseUrl.trim())}
            onClick={() => {
              onAdd(name.trim(), baseUrl.trim());
              setName('');
              setBaseUrl('');
              setOpen(false);
            }}
          >
            添加
          </Button>
          <p className="text-[0.74em] text-[var(--text-faint)]">
            必须 HTTPS。添加后会出现在下方列表，可单独配置 Key 并测试。
          </p>
        </div>
      )}

      {list.length === 0 ? (
        <p className="text-[0.82em] text-[var(--text-faint)]">还没有自定义厂商。</p>
      ) : (
        <div className="space-y-[var(--sp-1)]">
          {list.map((c) => (
            <div
              key={c.id}
              className="flex items-center gap-[var(--sp-2)] rounded-[var(--radius-btn)] bg-[var(--bg-hover)] px-[var(--sp-2)] py-[var(--sp-2)]"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-[0.88em] text-[var(--text-primary)]">{c.name}</div>
                <div className="truncate text-[0.74em] text-[var(--text-faint)]">{c.baseUrl}</div>
              </div>
              <button
                onClick={() => onRemove(c.id)}
                aria-label="删除"
                className="shrink-0 text-[var(--color-danger)]"
              >
                <Trash2 size="0.95em" />
              </button>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

/* ============================================================ 厂商页 */

const GROUPS: Array<'全部' | ProviderGroup> = ['全部', '国内', '国际', '聚合'];

export function ProvidersPage() {
  const [keys, setKeys] = useState(() => loadKeys());
  const [custom, setCustom] = useState(() => loadCustomProviders());
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState<'全部' | ProviderGroup>('全部');
  const [expanded, setExpanded] = useState<string | null>(null);

  const providers = useMemo(() => allProviders(), [keys, custom]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return providers.filter((p) => {
      if (group !== '全部' && p.group !== group) return false;
      if (!q) return true;
      return p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q);
    });
  }, [providers, group, query]);

  const setKey = (id: string, v: string) => {
    const next = { ...keys };
    if (v) next[id] = v;
    else delete next[id];
    setKeys(next);
    saveKeys(next);
  };

  const addCustom = (name: string, baseUrl: string) => {
    allowHostFor(baseUrl);
    const next = [...custom, { id: `custom-${Date.now().toString(36)}`, name, baseUrl }];
    setCustom(next);
    saveCustomProviders(next);
  };

  const removeCustom = (id: string) => {
    const next = custom.filter((c) => c.id !== id);
    setCustom(next);
    saveCustomProviders(next);
    setKey(id, '');
    window.setTimeout(() => setCustom([...next]), 0);
  };

  const configured = Object.keys(keys).filter((k) => keys[k]).length;

  return (
    <div className="lb-enter space-y-[var(--gap-grid)] p-[var(--pad-page)]">
      <Section
        title="模型厂商"
        desc={`已配置 ${configured} 个。Key 只保存在本机，卸载即删除。`}
        right={
          <Badge tone={configured > 0 ? 'success' : 'neutral'}>{providers.length} 家可选</Badge>
        }
      >
        <div className="mb-[var(--sp-2)] flex items-start gap-[0.45em] rounded-[var(--radius-btn)] bg-[var(--bg-hover)] px-[var(--sp-2)] py-[var(--sp-2)]">
          <ShieldCheck
            size="0.95em"
            className="mt-[0.1em] shrink-0 text-[var(--brand-green-text)]"
          />
          <p className="text-[0.76em] leading-relaxed text-[var(--text-muted)]">
            Key 存在本机 localStorage，请求经 App 原生通道直连厂商（浏览器里会被 CORS 拦截）。
          </p>
        </div>

        <div className="relative mb-[var(--sp-2)]">
          <Search
            size="0.9em"
            className="pointer-events-none absolute left-[var(--sp-2)] top-1/2 -translate-y-1/2 text-[var(--text-faint)]"
          />
          <input
            className={cx(INPUT_CLS, 'pl-[2em]')}
            placeholder="搜索厂商…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <div className="mb-[var(--sp-2)] flex flex-wrap gap-[var(--sp-1)]">
          {GROUPS.map((g) => (
            <button
              key={g}
              onClick={() => setGroup(g)}
              className={cx(
                'rounded-[var(--radius-btn)] px-[var(--sp-2)] py-[0.28em] text-[0.82em] transition-colors',
                group === g
                  ? 'bg-[var(--brand-green-10)] font-medium text-[var(--brand-green-text)]'
                  : 'text-[var(--text-muted)] hover:bg-[var(--bg-hover)]',
              )}
            >
              {g}
            </button>
          ))}
        </div>

        <div>
          {filtered.length === 0 ? (
            <p className="py-[var(--sp-3)] text-center text-[0.82em] text-[var(--text-faint)]">
              没有匹配的厂商
            </p>
          ) : (
            filtered.map((spec) => (
              <ProviderRow
                key={spec.id}
                spec={spec}
                value={keys[spec.id] ?? ''}
                expanded={expanded === spec.id}
                onToggle={() => setExpanded(expanded === spec.id ? null : spec.id)}
                onChange={(v) => setKey(spec.id, v)}
              />
            ))
          )}
        </div>
      </Section>

      <CustomSection list={custom} onAdd={addCustom} onRemove={removeCustom} />

      <Section title="数据来源">
        <div className="flex items-start gap-[0.45em]">
          <Info size="0.95em" className="mt-[0.1em] shrink-0 text-[var(--color-warning)]" />
          <div className="text-[0.82em] leading-relaxed text-[var(--text-muted)]">
            <p>
              未配置 Key 时界面不显示任何数字。配置后余额、模型清单可取真值；
              但多数厂商<strong className="text-[var(--text-primary)]">不提供</strong>
              按模型的历史用量，跨平台曲线需接入
              <a
                href="https://openrouter.ai/"
                target="_blank"
                rel="noreferrer"
                className="mx-[0.15em] text-[var(--brand-green-text)] hover:underline"
              >
                OpenRouter
              </a>
              这类聚合网关，或本地代理记账。
            </p>
          </div>
        </div>
      </Section>

      <p className="pb-[var(--sp-2)] text-center text-[0.75em] text-[var(--text-faint)]">
        TokenDeck v{APP_VERSION} · 原生通道 {hasNativeBridge() ? '已连接' : '不可用（浏览器模式）'}
      </p>
    </div>
  );
}

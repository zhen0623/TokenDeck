import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Wallet,
  Coins,
  TrendingUp,
  TrendingDown,
  Activity,
  AlertTriangle,
  CheckCircle2,
  Gauge,
  RefreshCw,
  ArrowUpRight,
  Zap,
  Clock,
  CircleDollarSign,
  Settings,
  KeyRound,
} from 'lucide-react';
import { ThemeProvider } from './theme';
import { RefreshProvider, useRefresh, fmtCountdown } from './refresh';
import { LiquidGlass } from './liquid-glass';
import { Segmented, Badge, cx } from './ui';
import { StackedAreaChart, Sparkline, Donut, RankBar } from './charts';
import { SystemSettingsPage } from './SystemSettingsPage';
import { ProvidersPage } from './ProvidersPage';
import { EmptyBlock, StatSkeleton } from './empty';
import { BillingDetail, PriceHint } from './BillingDetail';
import { APP_VERSION } from './version';
import { loadKeys } from './settings';
import {
  PLATFORMS,
  MODELS,
  totals,
  dailyTotals,
  fmtTokens,
  fmtMoney,
  fmtDelta,
  platformOf,
  type PlatformId,
} from './data';

/* ============================================================ 顶部指标卡 */

function StatCard({
  icon,
  label,
  value,
  sub,
  delta,
  accent = 'var(--brand-green)',
  progress,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  delta?: number;
  accent?: string;
  progress?: number;
}) {
  const up = (delta ?? 0) >= 0;
  return (
    <LiquidGlass radius={10} bezel={24} strength={14} blur={10} tint="rgba(255,255,255,0.4)" tintDark="rgba(26,30,38,0.44)">
      <div className="p-[var(--pad-card)]">
        <div className="mb-[0.6em] flex items-center gap-[var(--sp-2)]">
          <span
            className="flex h-[1.9em] w-[1.9em] items-center justify-center rounded-[0.5em]"
            style={{ background: `${accent}1f`, color: accent }}
          >
            {icon}
          </span>
          <span className="text-[0.82em] text-[var(--text-muted)]">{label}</span>
        </div>

        <div className="flex min-w-0 flex-wrap items-end gap-x-[0.45em] gap-y-[0.25em]">
          <span className="min-w-0 break-all text-[1.5em] font-semibold leading-none tabular-nums text-[var(--text-primary)]">
            {value}
          </span>
          {delta !== undefined && (
            <span
              className={cx(
                'mb-[0.1em] inline-flex items-center gap-[var(--sp-1)] rounded-[0.4em] px-[var(--sp-1)] py-[0.05em] text-[0.75em] font-medium',
                up
                  ? 'bg-[rgb(250_81_81_/_0.12)] text-[var(--color-danger)]'
                  : 'bg-[var(--brand-green-10)] text-[var(--brand-green-text)]',
              )}
            >
              {up ? <TrendingUp size="0.85em" /> : <TrendingDown size="0.85em" />}
              {fmtDelta(delta)}
            </span>
          )}
        </div>

        {sub && <div className="mt-[0.3em] text-[0.8em] text-[var(--text-faint)]">{sub}</div>}

        {progress !== undefined && (
          <div className="mt-[0.7em] h-[5px] w-full overflow-hidden rounded-full bg-[var(--bg-track)]">
            <div
              className="h-full rounded-full transition-[width] duration-500"
              style={{ width: `${Math.min(100, progress)}%`, background: accent }}
            />
          </div>
        )}
      </div>
    </LiquidGlass>
  );
}

/* ============================================================ 平台卡片 */

function PlatformCard({ p }: { p: (typeof PLATFORMS)[number] }) {
  const usedPct = (p.quotaUsed / p.quotaTotal) * 100;
  const ratePct = (p.rateUsed / p.rateLimit) * 100;
  const delta = (p.todayTokens - p.yesterdayTokens) / Math.max(1, p.yesterdayTokens);

  const statusMap = {
    healthy: { tone: 'success' as const, text: '正常', icon: CheckCircle2 },
    warning: { tone: 'warning' as const, text: '注意', icon: AlertTriangle },
    critical: { tone: 'danger' as const, text: '告急', icon: AlertTriangle },
  }[p.status];
  const StatusIcon = statusMap.icon;

  return (
    <LiquidGlass radius={10} bezel={22} strength={12} blur={10} tint="rgba(255,255,255,0.38)" tintDark="rgba(26,30,38,0.42)">
      <div className="p-[var(--pad-card)]">
        {/* 头部 */}
        <div className="mb-[var(--sp-3)] flex items-start gap-[var(--sp-2)]">
          <span
            className="mt-[0.15em] h-[0.7em] w-[0.7em] shrink-0 rounded-full"
            style={{ background: p.color, boxShadow: `0 0 8px ${p.color}80` }}
          />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[0.98em] font-medium text-[var(--text-primary)]">
              {p.name}
            </div>
            <div className="truncate text-[0.78em] text-[var(--text-faint)]">{p.vendor}</div>
          </div>
          <Badge tone={statusMap.tone}>
            <StatusIcon size="0.8em" className="mr-[0.15em]" />
            {statusMap.text}
          </Badge>
        </div>

        {/* 余额 */}
        <div className="mb-[0.65em] flex items-baseline justify-between">
          <span className="text-[0.78em] text-[var(--text-muted)]">余额</span>
          <span className="text-[1.05em] font-semibold tabular-nums text-[var(--text-primary)]">
            ${fmtMoney(p.balance)}
          </span>
        </div>

        {/* 今日消耗 */}
        <div className="mb-[0.5em] flex items-center justify-between text-[0.8em]">
          <span className="text-[var(--text-muted)]">今日消耗</span>
          <span className="flex items-center gap-[var(--sp-1)]">
            <span className="tabular-nums text-[var(--text-secondary)]">
              {fmtTokens(p.todayTokens)}
            </span>
            <span
              className={cx(
                'tabular-nums text-[0.92em]',
                delta >= 0 ? 'text-[var(--color-danger)]' : 'text-[var(--brand-green-text)]',
              )}
            >
              {fmtDelta(delta)}
            </span>
          </span>
        </div>

        {/* 配额进度 */}
        <div className="mb-[0.35em] flex items-center justify-between text-[0.78em]">
          <span className="text-[var(--text-muted)]">配额已用</span>
          <span className="tabular-nums text-[var(--text-secondary)]">
            {usedPct.toFixed(1)}%
          </span>
        </div>
        <div className="h-[5px] w-full overflow-hidden rounded-full bg-[var(--bg-track)]">
          <div
            className="h-full rounded-full transition-[width] duration-500"
            style={{
              width: `${Math.min(100, usedPct)}%`,
              background: usedPct > 85 ? 'var(--color-danger)' : usedPct > 70 ? 'var(--color-warning)' : p.color,
            }}
          />
        </div>

        {/* 速率 */}
        <div className="mt-[0.6em] flex items-center gap-[var(--sp-1)] text-[0.75em] text-[var(--text-faint)]">
          <Gauge size="0.9em" />
          <span className="tabular-nums">
            {p.rateUsed}/{p.rateLimit} RPM
          </span>
          <div className="ml-auto h-[3px] w-[3.5em] overflow-hidden rounded-full bg-[var(--bg-track)]">
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.min(100, ratePct)}%`,
                background: ratePct > 85 ? 'var(--color-danger)' : 'var(--brand-green)',
              }}
            />
          </div>
        </div>
      </div>
    </LiquidGlass>
  );
}

/* ============================================================ 模型排行 */

type SortKey = 'tokens' | 'cost' | 'calls' | 'latency' | 'errorRate';

function ModelTable({ items, sort, onSort }: {
  items: typeof MODELS;
  sort: SortKey;
  onSort: (k: SortKey) => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const maxTokens = Math.max(...MODELS.map((m) => m.tokens));
  const cols: Array<{ key: SortKey; label: string; align?: string }> = [
    { key: 'tokens', label: 'Token 用量' },
    { key: 'cost', label: '成本' },
    { key: 'calls', label: '调用次数' },
    { key: 'latency', label: '延迟' },
    { key: 'errorRate', label: '错误率' },
  ];

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[0.86em] sm:min-w-[42em]">
        <thead>
          <tr className="border-b border-[var(--border-color)]">
            <th className="w-[2.2em] pb-[0.6em] text-left font-medium text-[var(--text-faint)]">#</th>
            <th className="pb-[0.6em] text-left font-medium text-[var(--text-faint)]">模型</th>
            {cols.map((c) => (
              <th
                key={c.key}
                onClick={() => onSort(c.key)}
                className={cx(
                  'cursor-pointer select-none pb-[0.6em] text-right font-medium transition-colors duration-150',
                  (c.key === 'calls' || c.key === 'latency' || c.key === 'errorRate') && 'hidden sm:table-cell',
                  sort === c.key ? 'text-[var(--brand-green-text)]' : 'text-[var(--text-faint)] hover:text-[var(--text-secondary)]',
                )}
              >
                {c.label}
                {sort === c.key && <span className="ml-[0.2em]">↓</span>}
              </th>
            ))}
            <th className="hidden pb-[0.6em] pl-[0.8em] text-left font-medium text-[var(--text-faint)] sm:table-cell">走势</th>
          </tr>
        </thead>
        <tbody>
          {items.map((m, i) => {
            const p = platformOf(m.platformId);
            return (
              <Fragment key={m.id}>
              <tr
                onClick={() => setOpenId(openId === m.id ? null : m.id)}
                className={cx(
                  'cursor-pointer border-b border-[var(--border-muted)] transition-colors duration-150 hover:bg-[var(--bg-hover)]',
                  openId === m.id && 'bg-[var(--bg-hover)]',
                )}
              >
                <td className="py-[var(--sp-2)]">
                  <span
                    className={cx(
                      'tabular-nums',
                      i < 3 ? 'font-semibold text-[var(--brand-green-text)]' : 'text-[var(--text-faint)]',
                    )}
                  >
                    {i + 1}
                  </span>
                </td>
                <td className="py-[var(--sp-2)] pr-[0.8em]">
                  <div className="flex items-center gap-[var(--sp-1)]">
                    <span
                      className="h-[0.5em] w-[0.5em] shrink-0 rounded-full"
                      style={{ background: p.color }}
                    />
                    <div className="min-w-0">
                      <div className="truncate font-medium text-[var(--text-primary)]">{m.name}</div>
                      <div className="flex items-center gap-[0.3em] text-[0.82em] text-[var(--text-faint)]">
                        <span className="truncate">{p.name}</span>
                        <span className="shrink-0">·</span>
                        <PriceHint modelId={m.id} providerId={m.platformId} />
                      </div>
                    </div>
                  </div>
                </td>
                <td className="py-[var(--sp-2)] text-right">
                  <div className="tabular-nums text-[var(--text-secondary)]">{fmtTokens(m.tokens)}</div>
                  <div className="mt-[0.25em]">
                    <RankBar value={m.tokens} max={maxTokens} color={p.color} />
                  </div>
                </td>
                <td className="py-[var(--sp-2)] text-right tabular-nums text-[var(--text-secondary)]">
                  ${fmtMoney(m.cost)}
                </td>
                <td className="hidden py-[var(--sp-2)] text-right tabular-nums text-[var(--text-secondary)] sm:table-cell">
                  {m.calls.toLocaleString()}
                </td>
                <td className="hidden py-[var(--sp-2)] text-right tabular-nums text-[var(--text-secondary)] sm:table-cell">
                  {m.latency >= 1000 ? `${(m.latency / 1000).toFixed(1)}s` : `${m.latency}ms`}
                </td>
                <td className="hidden py-[var(--sp-2)] text-right tabular-nums sm:table-cell">
                  <span
                    className={
                      m.errorRate > 0.008
                        ? 'text-[var(--color-danger)]'
                        : m.errorRate > 0.005
                          ? 'text-[var(--color-warning)]'
                          : 'text-[var(--text-secondary)]'
                    }
                  >
                    {(m.errorRate * 100).toFixed(1)}%
                  </span>
                </td>
                <td className="hidden py-[var(--sp-2)] pl-[0.8em] sm:table-cell">
                  <Sparkline values={m.trend} color={p.color} />
                </td>
              </tr>
              {openId === m.id && (
                <tr className="border-b border-[var(--border-muted)]">
                  <td colSpan={8} className="pb-[var(--sp-3)] pt-[var(--sp-1)]">
                    <BillingDetail
                      modelId={m.id}
                      providerId={m.platformId}
                      providerName={p.name}
                    />
                  </td>
                </tr>
              )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ============================================================ 顶栏 */

/**
 * 指标卡容器。
 *
 * 三张卡只在「够宽」时同排，否则一律纵向 —— 绝不出现 2+1。
 * 用 auto-fit 会得到 [2,1] 这种半吊子排列：右边空一格，看起来像漏了一个。
 * 所以这里实测可用宽度，只有放得下三张等宽卡才切三列。
 */
function StatGrid({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [cols, setCols] = useState<1 | 3>(3);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // 单卡最小可读宽度 + 卡片间距；不足就纵排
    const MIN_CARD = 170;
    const GAP = 12;
    const measure = () => {
      const w = el.clientWidth;
      setCols(w >= MIN_CARD * 3 + GAP * 2 ? 3 : 1);
    };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className="grid gap-[var(--gap-grid)]"
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
    >
      {children}
    </div>
  );
}

function TopBar() {
  const { refreshing, interval, countdown } = useRefresh();
  const hasKeys = Object.keys(loadKeys()).length > 0;

  return (
    <LiquidGlass
      as="header"
      /* 圆角与内容卡片统一为 14。
         之前顶栏 16、dock 18、卡片 14，三者圆角不同会让边缘的抗锯齿范围不同，
         实测像素边缘因此差 1–2px —— 看起来就是"没对齐"。 */
      radius={10}
      bezel={18}
      strength={9}
      blur={12}
      tint="rgba(255,255,255,0.42)"
      tintDark="rgba(20,24,31,0.48)"
      /* 放在 main 内部并 sticky：与内容共享同一个滚动盒，
         宽屏下滚动条只出现在这一层之外，不再把内容挤窄 10px。 */
      className="sticky top-0 z-20 mx-[var(--pad-page)] mt-[var(--sp-2)] mb-[var(--sp-2)] flex items-center gap-[var(--sp-2)] rounded-[10px] px-[var(--pad-page)] py-[var(--sp-3)]"
    >
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-[1.05em] font-semibold text-[var(--text-primary)]">
          Token 用量监控
        </h1>
        <p className="hidden truncate text-[0.76em] text-[var(--text-muted)] sm:block">
          {hasKeys
            ? `${PLATFORMS.length} 个平台 · ${MODELS.length} 个模型 · 近 30 天`
            : '未配置 Key · 不显示任何数据'}
          {interval > 0 && countdown !== null && (
            <span className="ml-[0.6em] text-[var(--text-faint)]">
              自动刷新 {fmtCountdown(countdown)}
            </span>
          )}
        </p>
        {/* 手机上副标题是隐藏的，倒计时单独给一个可见的小徽标 */}
        <p className="flex items-center gap-[0.3em] text-[0.72em] text-[var(--text-faint)] sm:hidden">
          {interval > 0 && countdown !== null ? (
            <>
              <RefreshCw size="0.75em" className={refreshing ? 'animate-spin' : ''} />
              <span className="tabular-nums">{fmtCountdown(countdown)}</span>
            </>
          ) : (
            <span>{refreshing ? '刷新中…' : '自动刷新已关闭'}</span>
          )}
        </p>
      </div>

    </LiquidGlass>
  );
}

/* ============================================================ 侧边栏 */

/**
 * 导航项。
 * label 用于侧栏/无障碍名称，short 用于底部 dock（6 项等分，390px 下每项约 65px，
 * 三个字就会挤成两行，所以 dock 统一用两个字）。
 */
const NAV = [
  { id: 'overview', label: '总览', short: '总览', icon: Activity },
  { id: 'platforms', label: '平台', short: '平台', icon: Wallet },
  { id: 'models', label: '模型排行', short: '模型', icon: Coins },
  { id: 'trend', label: '用量趋势', short: '趋势', icon: TrendingUp },
  { id: 'providers', label: '模型厂商', short: '厂商', icon: KeyRound },
  { id: 'appearance', label: '系统设置', short: '设置', icon: Settings },
];

/** 桌面侧栏（md 及以上）。手机端不用抽屉，改用底部 dock。 */
function Sidebar({ active, onSelect }: { active: string; onSelect: (id: string) => void }) {
  const t = totals();
  const hasKeys = Object.keys(loadKeys()).length > 0;
  return (
    <LiquidGlass
      as="aside"
      radius={0}
      bezel={24}
      strength={13}
      blur={13}
      tint="rgba(255,255,255,0.46)"
      tintDark="rgba(20,24,31,0.52)"
      className="z-40 hidden w-[13em] shrink-0 flex-col px-[var(--sp-3)] py-[var(--sp-4)] md:flex"
    >
        <div className="mb-[1.2em] flex items-center gap-[var(--sp-2)] px-[var(--sp-1)]">
          <span className="flex h-[2em] w-[2em] items-center justify-center rounded-[0.55em] bg-[var(--brand-green)] text-white shadow-[0_2px_8px_rgba(7,193,96,0.35)]">
            <Zap size="1.1em" strokeWidth={2.2} />
          </span>
          <div className="leading-tight">
            <div className="text-[1em] font-semibold text-[var(--text-primary)]">TokenDeck</div>
            <div className="text-[0.74em] text-[var(--text-faint)]">用量监控台</div>
          </div>
        </div>

        <nav className="flex flex-col gap-[var(--sp-1)]">
          {NAV.map((n) => {
            const Icon = n.icon;
            const on = n.id === active;
            return (
              <button
                key={n.id}
                onClick={() => onSelect(n.id)}
                className={cx(
                  'flex items-center gap-[var(--sp-2)] rounded-[var(--radius-btn)] px-[var(--sp-3)] py-[var(--sp-2)] text-[0.9em] transition-all duration-150',
                  on
                    ? 'bg-[var(--brand-green-10)] font-medium text-[var(--brand-green-text)]'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]',
                )}
              >
                <Icon size="1.1em" strokeWidth={on ? 2.2 : 1.8} />
                <span>{n.label}</span>
                {on && <span className="ml-auto h-[0.32em] w-[0.32em] rounded-full bg-[var(--brand-green)]" />}
              </button>
            );
          })}
        </nav>

        {/* 余额摘要 */}
        <div className="mt-[var(--sp-5)] rounded-[var(--radius-sm)] bg-[var(--bg-hover)] px-[var(--sp-3)] py-[var(--sp-2)]">
          <div className="text-[0.74em] text-[var(--text-faint)]">总余额</div>
          {hasKeys ? (
            <>
              <div className="text-[1.1em] font-semibold tabular-nums text-[var(--text-primary)]">
                ${fmtMoney(t.balance)}
              </div>
              <div className="mt-[0.35em] text-[0.72em] text-[var(--text-muted)]">
                可用余额
              </div>
            </>
          ) : (
            <>
              <div className="text-[1.1em] font-semibold text-[var(--text-faint)]">—</div>
              <div className="mt-[0.35em] text-[0.72em] text-[var(--text-faint)]">
                未配置 Key
              </div>
            </>
          )}
        </div>

        <div className="mt-auto pt-[0.8em] text-[0.72em] leading-relaxed text-[var(--text-faint)]">
          v{APP_VERSION} · {hasKeys ? '已配置 Key' : '未配置 Key'}
        </div>
    </LiquidGlass>
  );
}

/* ============================================================ 底部 dock */

/**
 * 手机端主导航。
 *
 * 侧栏（抽屉）是网页端思路：要先点汉堡、再在遮罩上选，两次点击才到达目标，
 * 而且抽屉会盖住内容。移动端惯例是把一级导航常驻在拇指可达的底部。
 *
 * 两条硬约束：
 *   1. 6 项等分，390px 下每项约 65px —— 文字只能两个字，否则换行撑高。
 *   2. 内容区必须让出 dock 高度，否则最后一屏被遮住；
 *      高度含 safe-area-inset-bottom（iPhone/全面屏手势条），在 Shell 里用
 *      CSS 变量 --dock-h 统一算，避免两处各写一个魔法数字。
 */
function BottomDock({ active, onSelect }: { active: string; onSelect: (id: string) => void }) {
  return (
    <LiquidGlass
      as="nav"
      /* 胶囊形：radius 传 999，组件内部会按 Math.min(radius, h/2) 夹到半高，
         所以窄条上必然得到两端半圆的真胶囊。
         之前用 10px —— 在 390px 宽、46px 高的条上，10px 圆角几乎看不出弧度，
         整条读起来仍是通栏矩形，这正是"没像酷安那样两边缩短"的根源。 */
      radius={999}
      bezel={20}
      strength={11}
      blur={14}
      tint="rgba(255,255,255,0.52)"
      tintDark="rgba(20,24,31,0.58)"
      /* 尺寸演进（都经过真机截图比对）：
         1.2em(17px) 只比卡片多缩 2.8px —— 肉眼等于没缩，读作通栏
         1.5em(21px) 多缩 7px           —— 能看出收窄，但横向仍偏宽
         2.4em(34px) 390 宽下 322.8px   —— 上一版
         当前：宽度 = 视口的 55%（390 下 215px），正好是上一版的 2/3。
         用百分比而不是 em 内缩，才能在 360/480 各档都保持同样的相对宽度；
         写死 em 内缩会让 360 屏上窄到放不下两字标签。
         高度配 py 7.8px → 61.8px（比上一版 +3px，按 px 给值才能精确到像素）。
         两个条件缺一不可：① 明显窄于内容卡  ② 两端是半圆（radius 999 被夹到高度一半） */
      className="lb-dock fixed left-1/2 w-[55%] -translate-x-1/2 bottom-[max(0.5em,env(safe-area-inset-bottom,0px))] flex items-stretch rounded-full py-[7.8px] md:hidden"
      aria-label="主导航"
    >
      {NAV.map((n) => {
        const Icon = n.icon;
        const on = n.id === active;
        return (
          <button
            key={n.id}
            onClick={() => onSelect(n.id)}
            aria-current={on ? 'page' : undefined}
            aria-label={n.label}
            className={cx(
              'flex min-w-0 flex-1 items-center justify-center py-[0.3em] transition-colors duration-150',
              on ? 'text-[var(--brand-green-text)]' : 'text-[var(--text-muted)]',
            )}
          >
            {/*
              选中态：胶囊把「图标 + 文字」整体包住，而不是只垫在图标背后。
              之前那块绿色只是图标底下的小方块，等于在 dock 里又开一层卡片，
              层级过多就是违和感的来源。整体成胶囊后，一个导航项只读作一个整体。
              圆角用 999px（真胶囊），因为 6 项等分后每项仅约 61px 宽，
              固定圆角在窄项上会退化成方块。
            */}
            <span
              className={cx(
                'flex min-w-0 max-w-full flex-col items-center justify-center gap-[0.16em] rounded-full px-[0.62em] py-[0.34em] transition-colors duration-150',
                on ? 'bg-[var(--brand-green-10)]' : 'bg-transparent',
              )}
            >
              <Icon size="1.1em" strokeWidth={on ? 2.2 : 1.85} />
              <span
                className={cx(
                  'text-[0.62em] leading-none whitespace-nowrap',
                  on ? 'font-medium' : '',
                )}
              >
                {n.short}
              </span>
            </span>
          </button>
        );
      })}
    </LiquidGlass>
  );
}

/* ============================================================ 总览 */

function Overview() {
  const configured = Object.keys(loadKeys()).length > 0;
  const t = totals();
  const daily = dailyTotals();
  const [range, setRange] = useState<'7' | '14' | '30'>('30');

  const days = Number(range);
  const series = PLATFORMS.map((p) => ({
    id: p.id,
    name: p.name,
    color: p.color,
    values: p.series.slice(-days),
  }));
  const dates = daily.slice(-days).map((d) => d.date);

  const topModels = useMemo(
    () => [...MODELS].sort((a, b) => b.tokens - a.tokens).slice(0, 5),
    [],
  );

  const donutSegments = PLATFORMS.map((p) => ({
    value: p.monthTokens,
    color: p.color,
    name: p.name,
  }));

  return (
    <div className="lb-enter space-y-[var(--gap-grid)] p-[var(--pad-page)]">
      {/* 未配置 Key 时的醒目入口：避免用户找不到设置页 */}
      {!configured && (
        <a
          href="#providers"
          className={
            'flex items-start gap-[var(--sp-2)] rounded-[var(--radius-card)] border border-[var(--brand-green-20)] ' +
            'bg-[var(--brand-green-10)] p-[var(--sp-3)] transition-colors hover:bg-[var(--brand-green-20)]'
          }
        >
          <KeyRound size="1.05em" className="mt-[0.1em] shrink-0 text-[var(--brand-green-text)]" />
          <div className="min-w-0 flex-1">
            <div className="text-[0.92em] font-medium text-[var(--text-primary)]">
              还没配置模型 API Key
            </div>
            <div className="mt-[0.15em] text-[0.8em] leading-relaxed text-[var(--text-muted)]">
              点这里填入 OpenAI / Anthropic / DeepSeek 等厂商的 Key，可验证有效性并读取余额。
            </div>
          </div>
          <ArrowUpRight size="0.95em" className="mt-[0.15em] shrink-0 text-[var(--brand-green-text)]" />
        </a>
      )}

      {/* 四个指标 */}
      <StatGrid>
        {!configured ? (
          <>
            <StatSkeleton icon={<CircleDollarSign size="1em" />} label="账户总余额" />
            <StatSkeleton icon={<Activity size="1em" />} label="今日消耗" />
            <StatSkeleton icon={<Wallet size="1em" />} label="本月花费" />
          </>
        ) : (
          <>
            <StatCard
              icon={<CircleDollarSign size="1em" />}
              label="账户总余额"
              value={`$${fmtMoney(t.balance)}`}
              sub="5 个平台合计"
              accent="#07C160"
            />
            <StatCard
              icon={<Activity size="1em" />}
              label="今日消耗"
              value={fmtTokens(t.todayTokens)}
              sub={`昨日 ${fmtTokens(t.yesterdayTokens)}`}
              delta={t.dayDelta}
              accent="#FA9D3B"
            />
            <StatCard
              icon={<Wallet size="1em" />}
              label="本月花费"
              value={`$${fmtMoney(t.monthCost)}`}
              sub={`本月 ${fmtTokens(t.monthTokens)} tokens`}
              accent="#D97757"
            />
          </>
        )}
      </StatGrid>

      {/* 趋势图 + 平台占比 */}
      <div className="grid gap-[var(--gap-grid)] xl:grid-cols-[1.7fr_1fr]">
        <LiquidGlass radius={10} bezel={22} strength={12} blur={10} tint="rgba(255,255,255,0.4)" tintDark="rgba(26,30,38,0.44)">
          <div className="p-[var(--pad-card)]">
            <div className="mb-[var(--sp-3)] flex flex-wrap items-center gap-[var(--sp-2)]">
              <div className="min-w-0 flex-1">
                <h2 className="text-[0.98em] font-medium text-[var(--text-primary)]">Token 消耗趋势</h2>
                <p className="text-[0.78em] text-[var(--text-faint)]">按平台堆叠 · 近 {days} 天</p>
              </div>
              <Segmented<'7' | '14' | '30'>
                value={range}
                onChange={setRange}
                options={[
                  { value: '7', label: '7天' },
                  { value: '14', label: '14天' },
                  { value: '30', label: '30天' },
                ]}
              />
            </div>
            {configured ? (
              <>
                <StackedAreaChart series={series} dates={dates} height={230} />
                {/* 图例 */}
                <div className="mt-[var(--sp-3)] flex flex-wrap gap-x-[var(--sp-4)] gap-y-[var(--sp-2)]">
                  {PLATFORMS.map((p) => (
                    <span key={p.id} className="flex items-center gap-[var(--sp-1)] text-[0.76em] text-[var(--text-muted)]">
                      <span className="h-[0.55em] w-[0.55em] rounded-[0.15em]" style={{ background: p.color }} />
                      {p.name}
                    </span>
                  ))}
                </div>
              </>
            ) : (
              <EmptyBlock
                title="暂无趋势数据"
                desc="配置 Key 后即可按平台展示逐日消耗。"
                height="14em"
              />
            )}
          </div>
        </LiquidGlass>

        <LiquidGlass radius={10} bezel={22} strength={12} blur={10} tint="rgba(255,255,255,0.4)" tintDark="rgba(26,30,38,0.44)">
          <div className="flex h-full flex-col p-[var(--pad-card)]">
            <h2 className="mb-[0.15em] text-[0.98em] font-medium text-[var(--text-primary)]">平台用量占比</h2>
            <p className="mb-[var(--sp-3)] text-[0.78em] text-[var(--text-faint)]">近 30 天合计</p>
            <div className="flex flex-1 flex-col items-center justify-center gap-[var(--sp-3)]">
              {configured ? (
                <>
                  <Donut
                    segments={donutSegments}
                    size={144}
                    thickness={14}
                    centerValue={fmtTokens(t.monthTokens)}
                    centerLabel="总消耗"
                  />
                  <div className="w-full space-y-[var(--sp-1)]">
                    {PLATFORMS.map((p) => {
                      const pct = (p.monthTokens / t.monthTokens) * 100;
                      return (
                        <div key={p.id} className="flex items-center gap-[var(--sp-2)] text-[0.78em]">
                          <span className="h-[0.5em] w-[0.5em] shrink-0 rounded-full" style={{ background: p.color }} />
                          <span className="truncate text-[var(--text-muted)]">{p.name}</span>
                          <span className="ml-auto tabular-nums text-[var(--text-secondary)]">{pct.toFixed(1)}%</span>
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                <EmptyBlock title="暂无占比" desc="配置后按平台展示用量构成。" height="12em" />
              )}
            </div>
          </div>
        </LiquidGlass>
      </div>

      {/* Top 模型 */}
      <LiquidGlass radius={10} bezel={22} strength={12} blur={10} tint="rgba(255,255,255,0.4)" tintDark="rgba(26,30,38,0.44)">
        <div className="p-[var(--pad-card)]">
          <div className="mb-[var(--sp-3)] flex items-center justify-between gap-[var(--sp-2)]">
            <div className="min-w-0">
              <h2 className="text-[0.98em] font-medium text-[var(--text-primary)]">模型用量 Top 5</h2>
              <p className="text-[0.78em] text-[var(--text-faint)]">按 token 消耗排序</p>
            </div>
            {configured && (
              <a href="#models" aria-label="查看全部模型">
                <ArrowUpRight size="1.1em" className="text-[var(--text-faint)]" />
              </a>
            )}
          </div>
          {!configured && (
            <EmptyBlock
              title="暂无模型排行"
              desc="配置 Key 并接通用量数据后显示。"
              height="10em"
            />
          )}
          <div className={configured ? 'space-y-[var(--sp-2)]' : 'hidden'}>
            {topModels.map((m, i) => {
              const p = platformOf(m.platformId);
              const maxTokens = topModels[0].tokens;
              return (
                <div key={m.id} className="flex items-center gap-[var(--sp-2)]">
                  <span
                    className={cx(
                      'w-[1.1em] shrink-0 text-center text-[0.82em] tabular-nums',
                      i === 0 ? 'font-bold text-[var(--brand-green-text)]' : 'text-[var(--text-faint)]',
                    )}
                  >
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-[2]">
                    <div className="truncate text-[0.86em] font-medium text-[var(--text-primary)]">{m.name}</div>
                    <div className="truncate text-[0.74em] text-[var(--text-faint)]">{p.name}</div>
                  </div>
                  <div className="flex-[3]">
                    <RankBar value={m.tokens} max={maxTokens} color={p.color} />
                  </div>
                  <span className="w-[4em] shrink-0 text-right text-[0.8em] tabular-nums text-[var(--text-secondary)]">
                    {fmtTokens(m.tokens)}
                  </span>
                  <span className="hidden w-[3.6em] shrink-0 text-right text-[0.78em] tabular-nums text-[var(--text-faint)] sm:block">
                    ${fmtMoney(m.cost)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </LiquidGlass>
    </div>
  );
}

/* ============================================================ 平台页 */

function PlatformsPage() {
  const configured = Object.keys(loadKeys()).length > 0;

  if (!configured) {
    return (
      <div className="lb-enter flex h-full min-h-[calc(100vh-9em)] items-center justify-center p-[var(--pad-page)]">
        <LiquidGlass radius={10} bezel={22} strength={12} blur={10} tint="rgba(255,255,255,0.4)" tintDark="rgba(26,30,38,0.44)" className="w-full">
          <EmptyBlock
            title="还没有已连接的平台"
            desc="配置厂商 API Key 后，这里会按平台显示余额、配额占用和速率限制。"
            height="16em"
            action={
              <a
                href="#providers"
                className="mt-[var(--sp-1)] inline-flex items-center gap-[var(--sp-1)] rounded-[var(--radius-btn)] bg-[var(--brand-green)] px-[var(--sp-3)] py-[var(--sp-2)] text-[0.86em] font-medium text-white"
              >
                <KeyRound size="0.95em" />
                去配置 Key
              </a>
            }
          />
        </LiquidGlass>
      </div>
    );
  }

  return (
    <div className="lb-enter space-y-[var(--gap-grid)] p-[var(--pad-page)]">
      <div className="grid gap-[var(--gap-grid)] sm:grid-cols-2 xl:grid-cols-3">
        {PLATFORMS.map((p) => (
          <PlatformCard key={p.id} p={p} />
        ))}
      </div>
    </div>
  );
}

/* ============================================================ 模型页 */

function ModelsPage() {
  const configured = Object.keys(loadKeys()).length > 0;
  const [sort, setSort] = useState<SortKey>('tokens');
  const [filter, setFilter] = useState<PlatformId | 'all'>('all');

  const items = useMemo(() => {
    const base = filter === 'all' ? MODELS : MODELS.filter((m) => m.platformId === filter);
    return [...base].sort((a, b) => (b[sort] as number) - (a[sort] as number));
  }, [sort, filter]);

  if (!configured) {
    return (
      <div className="lb-enter flex h-full min-h-[calc(100vh-9em)] items-center justify-center p-[var(--pad-page)]">
        <LiquidGlass radius={10} bezel={22} strength={12} blur={10} tint="rgba(255,255,255,0.4)" tintDark="rgba(26,30,38,0.44)" className="w-full">
          <EmptyBlock
            title="还没有模型数据"
            desc="配置 Key 后可读取各厂商的可用模型；按模型的用量与成本需要用量接口或聚合网关才能拿到。"
            height="16em"
            action={
              <a
                href="#providers"
                className="mt-[var(--sp-1)] inline-flex items-center gap-[var(--sp-1)] rounded-[var(--radius-btn)] bg-[var(--brand-green)] px-[var(--sp-3)] py-[var(--sp-2)] text-[0.86em] font-medium text-white"
              >
                <KeyRound size="0.95em" />
                去配置 Key
              </a>
            }
          />
        </LiquidGlass>
      </div>
    );
  }

  return (
    <div className="lb-enter space-y-[var(--gap-grid)] p-[var(--pad-page)]">
      <LiquidGlass radius={10} bezel={22} strength={12} blur={10} tint="rgba(255,255,255,0.4)" tintDark="rgba(26,30,38,0.44)">
        <div className="p-[var(--pad-card)]">
          <div className="mb-[var(--sp-3)] flex flex-wrap items-center gap-[var(--sp-2)]">
            <div className="min-w-0 flex-1">
              <h2 className="text-[0.98em] font-medium text-[var(--text-primary)]">模型排行榜</h2>
              <p className="text-[0.78em] text-[var(--text-faint)]">
                点击表头排序 · 共 {items.length} 个模型
              </p>
            </div>
            <div className="flex flex-wrap gap-[var(--sp-1)]">
              <button
                onClick={() => setFilter('all')}
                className={cx(
                  'rounded-[var(--radius-btn)] px-[var(--sp-2)] py-[var(--sp-1)] text-[0.8em] transition-colors duration-150',
                  filter === 'all'
                    ? 'bg-[var(--brand-green-10)] font-medium text-[var(--brand-green-text)]'
                    : 'text-[var(--text-muted)] hover:bg-[var(--bg-hover)]',
                )}
              >
                全部
              </button>
              {PLATFORMS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setFilter(p.id)}
                  className={cx(
                    'flex items-center gap-[var(--sp-1)] rounded-[var(--radius-btn)] px-[var(--sp-2)] py-[var(--sp-1)] text-[0.8em] transition-colors duration-150',
                    filter === p.id
                      ? 'bg-[var(--bg-hover)] font-medium text-[var(--text-primary)]'
                      : 'text-[var(--text-muted)] hover:bg-[var(--bg-hover)]',
                  )}
                >
                  <span className="h-[0.45em] w-[0.45em] rounded-full" style={{ background: p.color }} />
                  {p.name}
                </button>
              ))}
            </div>
          </div>
          <ModelTable items={items} sort={sort} onSort={setSort} />
        </div>
      </LiquidGlass>
    </div>
  );
}

/* ============================================================ 趋势页 */

function TrendPage() {
  const configured = Object.keys(loadKeys()).length > 0;
  const [range, setRange] = useState<'7' | '14' | '30'>('30');
  const days = Number(range);
  const series = PLATFORMS.map((p) => ({
    id: p.id,
    name: p.name,
    color: p.color,
    values: p.series.slice(-days),
  }));
  const dates = dailyTotals().slice(-days).map((d) => d.date);

  if (!configured) {
    return (
      <div className="lb-enter flex h-full min-h-[calc(100vh-9em)] items-center justify-center p-[var(--pad-page)]">
        <LiquidGlass radius={10} bezel={24} strength={14} blur={10} tint="rgba(255,255,255,0.4)" tintDark="rgba(26,30,38,0.44)" className="w-full">
          <EmptyBlock
            title="还没有用量记录"
            desc="累计用量需要一个能查询历史的数据源。多数厂商只给当前余额，逐日曲线需要接入 OpenRouter 这类聚合网关，或本地代理记账。"
            height="18em"
            action={
              <a
                href="#providers"
                className="mt-[var(--sp-1)] inline-flex items-center gap-[var(--sp-1)] rounded-[var(--radius-btn)] bg-[var(--brand-green)] px-[var(--sp-3)] py-[var(--sp-2)] text-[0.86em] font-medium text-white"
              >
                <KeyRound size="0.95em" />
                去配置 Key
              </a>
            }
          />
        </LiquidGlass>
      </div>
    );
  }

  return (
    <div className="lb-enter space-y-[var(--gap-grid)] p-[var(--pad-page)]">
      <LiquidGlass radius={10} bezel={24} strength={14} blur={10} tint="rgba(255,255,255,0.4)" tintDark="rgba(26,30,38,0.44)">
        <div className="p-[var(--pad-card)]">
          <div className="mb-[var(--sp-3)] flex flex-wrap items-center gap-[var(--sp-2)]">
            <div className="min-w-0 flex-1">
              <h2 className="text-[0.98em] font-medium text-[var(--text-primary)]">用量趋势</h2>
              <p className="text-[0.78em] text-[var(--text-faint)]">各平台逐日 token 消耗</p>
            </div>
            <Segmented<'7' | '14' | '30'>
              value={range}
              onChange={setRange}
              options={[
                { value: '7', label: '7天' },
                { value: '14', label: '14天' },
                { value: '30', label: '30天' },
              ]}
            />
          </div>
          <StackedAreaChart series={series} dates={dates} height={300} />
        </div>
      </LiquidGlass>

      <div className="grid gap-[var(--gap-grid)] md:grid-cols-2 xl:grid-cols-3">
        {PLATFORMS.map((p) => (
          <LiquidGlass key={p.id} radius={9} bezel={20} strength={10} blur={9} tint="rgba(255,255,255,0.38)" tintDark="rgba(26,30,38,0.42)">
            <div className="p-[var(--pad-card)]">
              <div className="mb-[0.5em] flex items-center gap-[var(--sp-1)]">
                <span className="h-[0.55em] w-[0.55em] rounded-full" style={{ background: p.color }} />
                <span className="text-[0.88em] font-medium text-[var(--text-primary)]">{p.name}</span>
                <span className="ml-auto text-[0.76em] tabular-nums text-[var(--text-muted)]">
                  {fmtTokens(p.monthTokens)}
                </span>
              </div>
              <Sparkline values={p.series} color={p.color} width={220} height={44} />
            </div>
          </LiquidGlass>
        ))}
      </div>
    </div>
  );
}

/* ============================================================ 壳 */

function Shell() {
  const readHash = () => {
    const h = window.location.hash.replace('#', '');
    return ['overview', 'platforms', 'models', 'trend', 'providers', 'appearance'].includes(h)
      ? h
      : 'overview';
  };
  const [active, setActive] = useState(readHash);

  // 地址栏 hash ↔ 页面同步（手机可直接跳 #models 等）
  useEffect(() => {
    const onHash = () => setActive(readHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const go = (id: string) => {
    setActive(id);
    // replaceState 不产生历史条目：安卓侧滑返回不会在页面间回退
    try {
      history.replaceState(null, '', `#${id}`);
    } catch {
      window.location.hash = id;
    }
  };

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar active={active} onSelect={go} />
      <div className="flex min-w-0 flex-1 flex-col">
        {/*
          顶部栏放进 main 内部（sticky 仍然固定在顶部）。
          原因：main 是滚动容器，宽屏下它自己带 10px 竖向滚动条。
          顶栏原本在 main 之外，宽度按外层算；内容卡片在 main 之内，
          宽度被滚动条吃掉 10px —— 于是右侧恒定错开 9–10px。
          放进同一个滚动盒后，两者共享同一宽度，偏差归零。
        */}
        {/* lb-scroll: 让滚动条不占布局宽度（见 styles.css）。
            否则 main 的内容盒会比视口窄 8–10px，
            而 fixed 的 dock 按视口算 —— 两者右边缘必然错开一个滚动条宽度。 */}
        <main className="lb-scroll flex-1 overflow-y-auto pb-[var(--dock-h)] md:pb-0">
          <TopBar />
          {active === 'overview' && <Overview />}
          {active === 'platforms' && <PlatformsPage />}
          {active === 'models' && <ModelsPage />}
          {active === 'trend' && <TrendPage />}
          {active === 'providers' && <ProvidersPage />}
          {active === 'appearance' && <SystemSettingsPage />}
        </main>
      </div>
      <BottomDock active={active} onSelect={go} />
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <RefreshProvider>
        <Shell />
      </RefreshProvider>
    </ThemeProvider>
  );
}

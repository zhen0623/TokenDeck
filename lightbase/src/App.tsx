import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Wallet,
  Coins,
  TrendingUp,
  TrendingDown,
  Activity,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  ArrowUpRight,
  Zap,
  CircleDollarSign,
  Settings,
  KeyRound,
} from 'lucide-react';
import { ThemeProvider } from './theme';
import { RefreshProvider, useRefresh, fmtCountdown } from './refresh';
import { LiquidGlass } from './liquid-glass';
import { Segmented, Badge, cx } from './ui';
import { SystemSettingsPage } from './SystemSettingsPage';
import { ProvidersPage } from './ProvidersPage';
import { EmptyBlock, StatSkeleton } from './empty';
import { BillingDetail } from './BillingDetail';
import { APP_VERSION } from './version';
import { loadKeys } from './settings';
import {
  fmtTokens,
  fmtMoney,
  summarize,
  useLive,
  LiveProvider,
  type LiveModel,
  type LivePlatform,
} from './live';
import { compactPrice } from './pricing';

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
      {/*
       * 横向两行：第一行 图标+标签 … 右侧数值；第二行 说明（缩进）+ 可选进度条。
       * 原来是纵向四段（图标行 / 数值行 / 说明行 / 进度条），手机单卡 102.7px。
       * 改成横向后约 47px —— 正好是原来的一半。
       * 数值必须 shrink-0 且不换行：三卡并排时宽度由 StatGrid 决定，
       * 让数值参与换行会把卡片重新撑高，等于白改。
       */}
      <div className="px-[var(--pad-card)] py-[0.5em]">
        <div className="flex items-center gap-[0.5em]">
          <span
            className="flex h-[1.5em] w-[1.5em] shrink-0 items-center justify-center rounded-[0.45em]"
            style={{ background: `${accent}1f`, color: accent }}
          >
            {icon}
          </span>
          <span className="min-w-0 flex-1 truncate text-[0.8em] text-[var(--text-muted)]">
            {label}
          </span>
          <span className="shrink-0 whitespace-nowrap text-[1.1em] font-semibold leading-none tabular-nums text-[var(--text-primary)]">
            {value}
          </span>
          {delta !== undefined && (
            <span
              className={cx(
                'inline-flex shrink-0 items-center gap-[0.2em] rounded-[0.35em] px-[0.3em] py-[0.1em] text-[0.68em] font-medium',
                up
                  ? 'bg-[rgb(250_81_81_/_0.12)] text-[var(--color-danger)]'
                  : 'bg-[var(--brand-green-10)] text-[var(--brand-green-text)]',
              )}
            >
              {up ? <TrendingUp size="0.8em" /> : <TrendingDown size="0.8em" />}
              {fmtDelta(delta)}
            </span>
          )}
        </div>

        <div className="mt-[0.15em] flex items-center gap-[0.5em] pl-[2em]">
          {sub && (
            <span className="min-w-0 flex-1 truncate text-[0.68em] text-[var(--text-faint)]">
              {sub}
            </span>
          )}
          {progress !== undefined && (
            <div className="ml-auto h-[4px] w-[3.2em] shrink-0 overflow-hidden rounded-full bg-[var(--bg-track)]">
              <div
                className="h-full rounded-full transition-[width] duration-500"
                style={{ width: `${Math.min(100, progress)}%`, background: accent }}
              />
            </div>
          )}
        </div>
      </div>
    </LiquidGlass>
  );
}

/* ============================================================ 平台卡片 */

function PlatformCard({ p }: { p: LivePlatform }) {
  const statusMap = {
    ok: { tone: 'success' as const, text: '连接正常', icon: CheckCircle2 },
    auth: { tone: 'danger' as const, text: 'Key 无效', icon: AlertTriangle },
    error: { tone: 'warning' as const, text: '请求异常', icon: AlertTriangle },
  }[p.status];
  const StatusIcon = statusMap.icon;
  const symbol = p.currency === 'CNY' ? '¥' : '$';

  return (
    <LiquidGlass radius={10} bezel={22} strength={12} blur={10} tint="rgba(255,255,255,0.38)" tintDark="rgba(26,30,38,0.42)">
      <div className="p-[var(--pad-card)]">
        {/* 头部 */}
        <div className="mb-[var(--sp-3)] flex items-start gap-[var(--sp-2)]">
          <span
            /*
             * 圆点要和「平台名首行」垂直居中，不是和整块（名称+备注两行）居中。
             * 名称行高 1.5 × 0.98em = 1.47em，圆点 0.7em，
             * 上偏移 = (1.47 - 0.7) / 2 = 0.385em。
             */
            className="mt-[0.385em] h-[0.7em] w-[0.7em] shrink-0 rounded-full"
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

        {/*
         * 只展示真实取到的值。余额留空就写「—」，并说明原因，
         * 不做「看起来有数」的占位。
         */}
        <div className="mb-[0.35em] flex items-baseline justify-between">
          <span className="text-[0.78em] text-[var(--text-muted)]">账户余额</span>
          <span className="text-[1.05em] font-semibold tabular-nums text-[var(--text-primary)]">
            {p.balance !== null ? `${symbol}${fmtMoney(p.balance)}` : '—'}
          </span>
        </div>
        {p.balance === null && (
          <div className="mb-[0.5em] text-[0.72em] text-[var(--text-faint)]">
            {p.balanceSupported ? '余额接口未返回可用金额' : '该厂商未提供余额查询接口'}
          </div>
        )}

        <div className="flex items-baseline justify-between text-[0.8em]">
          <span className="text-[var(--text-muted)]">可用模型</span>
          <span className="tabular-nums text-[var(--text-secondary)]">
            {p.modelCount !== null ? `${p.modelCount} 个` : '—'}
          </span>
        </div>

        {p.message && (
          <div className="mt-[var(--sp-3)] rounded-[var(--radius-sm)] bg-[var(--bg-hover)] px-[var(--sp-2)] py-[var(--sp-1)] text-[0.74em] leading-relaxed text-[var(--text-muted)]">
            {p.message}
          </div>
        )}
      </div>
    </LiquidGlass>
  );
}

/* ============================================================ 模型排行 */

type SortKey = 'name' | 'price' | 'provider';

function ModelTable({ items, sort, onSort }: {
  items: LiveModel[];
  sort: SortKey;
  onSort: (k: SortKey) => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const cols: Array<{ key: SortKey; label: string; className?: string }> = [
    { key: 'name', label: '模型' },
    { key: 'provider', label: '厂商', className: 'hidden sm:table-cell' },
    { key: 'price', label: '单价 / 百万' },
  ];

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[0.86em]">
        <thead>
          <tr className="border-b border-[var(--border-color)]">
            <th className="w-[2.2em] pb-[0.6em] text-left font-medium text-[var(--text-faint)]">#</th>
            {cols.map((c) => (
              <th
                key={c.key}
                onClick={() => onSort(c.key)}
                className={cx(
                  'cursor-pointer select-none pb-[0.6em] font-medium transition-colors duration-150',
                  c.key === 'price' ? 'text-right' : 'text-left',
                  c.className,
                  sort === c.key
                    ? 'text-[var(--brand-green-text)]'
                    : 'text-[var(--text-faint)] hover:text-[var(--text-secondary)]',
                )}
              >
                {c.label}
                {sort === c.key && <span className="ml-[0.2em]">↓</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((m, i) => (
            <Fragment key={`${m.platformId}:${m.id}`}>
              <tr
                onClick={() => setOpenId(openId === `${m.platformId}:${m.id}` ? null : `${m.platformId}:${m.id}`)}
                className={cx(
                  'cursor-pointer border-b border-[var(--border-muted)] transition-colors duration-150 hover:bg-[var(--bg-hover)]',
                  openId === `${m.platformId}:${m.id}` && 'bg-[var(--bg-hover)]',
                )}
              >
                <td className="align-top py-[var(--sp-2)]">
                  <span
                    className={cx(
                      'tabular-nums',
                      i < 3 ? 'font-semibold text-[var(--brand-green-text)]' : 'text-[var(--text-faint)]',
                    )}
                  >
                    {i + 1}
                  </span>
                </td>
                <td className="align-top py-[var(--sp-2)] pr-[0.8em]">
                  <div className="flex items-center gap-[var(--sp-1)]">
                    <span
                      /*
                       * 圆点对齐「模型名首行」中心，不是两行整体中心。
                       * items-center 会按两行居中，实测低 7.4px，看着掉到副行。
                       */
                      className="mt-[0.5em] h-[0.5em] w-[0.5em] shrink-0 self-start rounded-full"
                      style={{ background: m.color }}
                    />
                    <div className="min-w-0">
                      <div className="truncate font-medium text-[var(--text-primary)]">{m.name}</div>
                      <div className="truncate text-[0.78em] text-[var(--text-faint)]">{m.id}</div>
                    </div>
                  </div>
                </td>
                <td className="hidden align-top py-[var(--sp-2)] pr-[0.8em] sm:table-cell">
                  <span className="truncate text-[0.82em] text-[var(--text-muted)]">{m.platformName}</span>
                </td>
                {/*
                 * 单价来自内置参考表（pricing.ts），不是厂商实时返回。
                 * 用 compactPrice 统一格式，未收录的显示「未收录」而不是 0。
                 * whitespace-nowrap：320px 下金额会被拆成三行。
                 */}
                {/*
                 * 单价是「参考价」而非实时账单：聚合网关的 /models 可能带真实单价，
                 * 但在能确认来源之前，不把它当成帐户实际扣费。
                 */}
                <td className="whitespace-nowrap align-top py-[var(--sp-2)] pl-[0.4em] text-right text-[0.82em] tabular-nums text-[var(--text-secondary)]">
                  {compactPrice(m.pricing)}
                </td>
              </tr>
              {openId === `${m.platformId}:${m.id}` && (
                <tr className="border-b border-[var(--border-muted)]">
                  <td colSpan={4} className="pb-[var(--sp-3)] pt-[var(--sp-1)]">
                    <BillingDetail
                      modelId={m.id}
                      providerId={m.platformId}
                      providerName={m.platformName}
                    />
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
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
  const { platforms, models, loading } = useLive();
  const configured = platforms.length > 0;

  return (
    <LiquidGlass
      as="header"
      /* 圆角与内容卡片统一为 10。
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
        {/*
         * 副标题只写真实数量。原来写死「5 个平台 · 12 个模型 · 近 30 天」，
         * 那是假数据的长度；现在按实际拉到的数据算，没配 Key 就直说。
         */}
        <p className="hidden truncate text-[0.76em] text-[var(--text-muted)] sm:block">
          {loading
            ? '正在读取…'
            : configured
              ? `${platforms.length} 个厂商 · ${models.length} 个模型`
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
  const { platforms } = useLive();
  const sum = summarize(platforms);
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

        {/*
         * 余额摘要只统计真实取到的余额。
         *
         * 关键约束：绝不把美元和人民币加在一起 —— 那样得到的数字没有意义。
         * 两个币种分开显示；只有一个币种时就只显示一个。
         */}
        <div className="mt-[var(--sp-5)] rounded-[var(--radius-sm)] bg-[var(--bg-hover)] px-[var(--sp-3)] py-[var(--sp-2)]">
          <div className="text-[0.74em] text-[var(--text-faint)]">余额</div>
          {!hasKeys ? (
            <>
              <div className="text-[1.1em] font-semibold text-[var(--text-faint)]">—</div>
              <div className="mt-[0.35em] text-[0.72em] text-[var(--text-faint)]">
                未配置 Key
              </div>
            </>
          ) : sum.balanceCount === 0 ? (
            <>
              <div className="text-[1.1em] font-semibold text-[var(--text-faint)]">—</div>
              <div className="mt-[0.35em] text-[0.72em] leading-relaxed text-[var(--text-faint)]">
                {sum.balanceFailed > 0 ? '余额接口未返回金额' : '当前厂商不提供余额'}
              </div>
            </>
          ) : (
            <>
              {sum.cnyProviders > 0 && (
                <div className="text-[1.1em] font-semibold tabular-nums text-[var(--text-primary)]">
                  ¥{fmtMoney(sum.cnyTotal)}
                </div>
              )}
              {sum.usdProviders > 0 && (
                <div
                  className={
                    sum.cnyProviders > 0
                      ? 'text-[0.82em] tabular-nums text-[var(--text-muted)]'
                      : 'text-[1.1em] font-semibold tabular-nums text-[var(--text-primary)]'
                  }
                >
                  ${fmtMoney(sum.usdTotal)}
                </div>
              )}
              <div className="mt-[0.35em] text-[0.72em] text-[var(--text-muted)]">
                {sum.balanceCount} 个厂商已接入
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
      /* 宽度策略：手机贴边 2px，平板收到 30em 上限并居中。
         两个数字都必须有，缺一个就会在另一类设备上出问题：

         ① 只用百分比（历史 bug）：w-[55%] 在 390 屏下仅 215px，
            每项 33px，而胶囊本身 32.7px —— 胶囊顶满格子，图标文字被挤出变形。

         ② 只贴边不给上限（也是 bug）：744px 的平板竖屏仍走手机布局
            （md 断点 768），dock 被撑到 740px，每项 123px，
            图标散得太开，读起来是一条通栏而不是悬浮胶囊。

         现在：width = min(视口 - 4px, 30em)，居中。
           320 → 316（每项 52.7）   390 → 386（64.3）   744 → 420（70）
         两边 2px 在手机上满足"贴边"观感，30em 上限保证大屏不散架。
         竖向 py 固定 7.8px（不用 em）：字号档位变化时高度不该跟着涨，
         否则大字号下 dock 会变胖、遮住更多内容。 */
      className="lb-dock fixed bottom-[max(0.5em,env(safe-area-inset-bottom,0px))] left-1/2 w-[calc(100%-4px)] max-w-[30em] -translate-x-1/2 flex items-stretch rounded-full py-[7.8px] md:hidden"
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
  const { platforms, models, loading } = useLive();
  const sum = summarize(platforms);
  const configured = platforms.length > 0;

  /*
   * 余额一行只放得下一个数。两个币种都有时，主值给人民币（国内厂商居多），
   * 美元放副行 —— 绝不相加，相加得到的数字没有意义。
   */
  const balanceValue =
    sum.cnyProviders > 0
      ? `¥${fmtMoney(sum.cnyTotal)}`
      : sum.usdProviders > 0
        ? `$${fmtMoney(sum.usdTotal)}`
        : '—';
  const balanceSub =
    sum.cnyProviders > 0 && sum.usdProviders > 0
      ? `另 $${fmtMoney(sum.usdTotal)}`
      : sum.balanceCount > 0
        ? `${sum.balanceCount} 个厂商已接入`
        : sum.balanceFailed > 0
          ? '余额接口未返回金额'
          : configured
            ? '当前厂商不提供余额接口'
            : '未配置 Key';

  return (
    <div className="lb-enter space-y-[var(--gap-grid)] p-[var(--pad-page)]">
      {/* 未配置 Key 时的醒目入口：避免用户找不到设置页 */}
      {!configured && !loading && (
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
              点这里填入厂商的 Key，可验证有效性并读取真实余额与可用模型。
            </div>
          </div>
          <ArrowUpRight size="0.95em" className="mt-[0.15em] shrink-0 text-[var(--brand-green-text)]" />
        </a>
      )}

      {/*
       * 三张卡全部来自真实接口：
       *   余额   ← 厂商 balance 接口（没有就显示「—」并说明）
       *   厂商数 ← /models 的响应状态
       *   模型数 ← /models 返回的条目数
       * 没有一项是估算或占位。
       */}
      <StatGrid>
        {loading ? (
          <>
            <StatSkeleton icon={<CircleDollarSign size="1em" />} label="账户余额" />
            <StatSkeleton icon={<Wallet size="1em" />} label="已接入厂商" />
            <StatSkeleton icon={<Coins size="1em" />} label="可用模型" />
          </>
        ) : (
          <>
            <StatCard
              icon={<CircleDollarSign size="1em" />}
              label="账户余额"
              value={balanceValue}
              sub={balanceSub}
              accent="#07C160"
            />
            <StatCard
              icon={<Wallet size="1em" />}
              label="已接入厂商"
              value={configured ? `${sum.okCount}/${platforms.length}` : '0'}
              sub={
                sum.badCount > 0 ? `${sum.badCount} 个连接异常` : configured ? '全部连接正常' : '尚未配置'
              }
              accent="#FA9D3B"
            />
            <StatCard
              icon={<Coins size="1em" />}
              label="可用模型"
              value={configured ? String(sum.modelTotal) : '0'}
              sub={configured ? `${platforms.length} 个厂商合计` : '尚未配置'}
              accent="#D97757"
            />
          </>
        )}
      </StatGrid>

      {/* 厂商连接状态：每一行都是刚请求回来的真实结果 */}
      <LiquidGlass radius={10} bezel={22} strength={12} blur={10} tint="rgba(255,255,255,0.4)" tintDark="rgba(26,30,38,0.44)">
        <div className="p-[var(--pad-card)]">
          <div className="mb-[var(--sp-3)] flex items-center justify-between gap-[var(--sp-2)]">
            <div className="min-w-0">
              <h2 className="text-[0.98em] font-medium text-[var(--text-primary)]">厂商连接状态</h2>
              <p className="text-[0.78em] text-[var(--text-faint)]">
                {loading ? '正在请求各厂商接口…' : '每次刷新都会重新请求'}
              </p>
            </div>
            <a href="#platforms" aria-label="查看平台详情">
              <ArrowUpRight size="1.1em" className="text-[var(--text-faint)]" />
            </a>
          </div>

          {!configured && !loading ? (
            <EmptyBlock
              title="暂无已连接厂商"
              desc="配置 Key 后，这里逐行显示每个厂商的真实连接结果。"
              height="10em"
            />
          ) : (
            <div className="space-y-[var(--sp-2)]">
              {platforms.map((p) => {
                const symbol = p.currency === 'CNY' ? '¥' : '$';
                const tone =
                  p.status === 'ok' ? 'success' : p.status === 'auth' ? 'danger' : 'warning';
                const text =
                  p.status === 'ok' ? '正常' : p.status === 'auth' ? 'Key 无效' : '异常';
                return (
                  <div key={p.id} className="flex items-center gap-[var(--sp-2)] text-[0.84em]">
                    <span
                      className="h-[0.5em] w-[0.5em] shrink-0 rounded-full"
                      style={{ background: p.color }}
                    />
                    <span className="min-w-0 flex-1 truncate text-[var(--text-primary)]">{p.name}</span>
                    <span className="shrink-0 tabular-nums text-[var(--text-secondary)]">
                      {p.balance !== null ? `${symbol}${fmtMoney(p.balance)}` : '—'}
                    </span>
                    <span className="w-[3.4em] shrink-0 text-right tabular-nums text-[var(--text-faint)]">
                      {p.modelCount !== null ? `${p.modelCount} 模型` : '—'}
                    </span>
                    <Badge tone={tone}>{text}</Badge>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </LiquidGlass>

      {/*
       * 用量历史：明确写出「未接入」而不是画一条假的曲线。
       * 这一段存在的意义是告诉用户为什么看不到消耗趋势，
       * 以及需要什么才能看到 —— 而不是用动画掩盖数据缺失。
       */}
      <LiquidGlass radius={10} bezel={22} strength={12} blur={10} tint="rgba(255,255,255,0.4)" tintDark="rgba(26,30,38,0.44)">
        <div className="p-[var(--pad-card)]">
          <h2 className="mb-[0.15em] text-[0.98em] font-medium text-[var(--text-primary)]">用量历史</h2>
          <p className="mb-[var(--sp-3)] text-[0.78em] text-[var(--text-faint)]">逐日消耗 · 尚未接入</p>
          <EmptyBlock
            title="没有用量数据源"
            desc="当前只接入了「模型清单」与「余额」两类接口。逐日 token 消耗、调用次数、延迟需要厂商提供用量或账单接口，或由本地代理记账。接入前这里保持为空，不显示估算值。"
            height="9em"
          />
        </div>
      </LiquidGlass>
    </div>
  );
}

/* ============================================================ 平台页 */

function PlatformsPage() {
  const { platforms, loading } = useLive();
  const configured = platforms.length > 0;

  if (!configured && !loading) {
    return (
      <div className="lb-enter flex h-full min-h-[calc(100vh-9em)] items-center justify-center p-[var(--pad-page)]">
        <LiquidGlass radius={10} bezel={22} strength={12} blur={10} tint="rgba(255,255,255,0.4)" tintDark="rgba(26,30,38,0.44)" className="w-full">
          <EmptyBlock
            title="还没有已连接的平台"
            desc="配置厂商 API Key 后，这里会显示每个厂商的真实余额与可用模型数。"
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
        {platforms.map((p) => (
          <PlatformCard key={p.id} p={p} />
        ))}
      </div>
    </div>
  );
}

/* ============================================================ 模型页 */

function ModelsPage() {
  const { platforms, models, loading } = useLive();
  const [sort, setSort] = useState<SortKey>('name');
  const [filter, setFilter] = useState<string>('all');
  const configured = platforms.length > 0;

  const items = useMemo(() => {
    const base = filter === 'all' ? models : models.filter((m) => m.platformId === filter);
    const sorted = [...base];
    sorted.sort((a, b) => {
      if (sort === 'provider') return a.platformName.localeCompare(b.platformName);
      if (sort === 'price') {
        // 按输入价排序；未收录的排最后
        const av = a.pricing.input ?? Number.POSITIVE_INFINITY;
        const bv = b.pricing.input ?? Number.POSITIVE_INFINITY;
        return av - bv;
      }
      return a.name.localeCompare(b.name);
    });
    return sorted;
  }, [models, filter, sort]);

  if (!configured && !loading) {
    return (
      <div className="lb-enter flex h-full min-h-[calc(100vh-9em)] items-center justify-center p-[var(--pad-page)]">
        <LiquidGlass radius={10} bezel={22} strength={12} blur={10} tint="rgba(255,255,255,0.4)" tintDark="rgba(26,30,38,0.44)" className="w-full">
          <EmptyBlock
            title="还没有模型数据"
            desc="配置 Key 后，这里会显示厂商 /models 接口真实返回的可用模型清单。"
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
              <h2 className="text-[0.98em] font-medium text-[var(--text-primary)]">可用模型</h2>
              <p className="text-[0.78em] text-[var(--text-faint)]">
                {loading ? '正在读取…' : `共 ${items.length} 个 · 来自厂商 /models 接口`}
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
              {platforms.map((p) => (
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
          {items.length === 0 ? (
            <EmptyBlock
              title="没有拉到模型"
              desc="厂商返回的模型列表为空，或所有厂商连接均失败。可到「模型厂商」页重新测试连接。"
              height="12em"
            />
          ) : (
            <ModelTable items={items} sort={sort} onSort={setSort} />
          )}
        </div>
      </LiquidGlass>
    </div>
  );
}

/* ============================================================ 趋势页 */

function TrendPage() {
  const { platforms, loading } = useLive();
  const configured = platforms.length > 0;

  if (!configured && !loading) {
    return (
      <div className="lb-enter flex h-full min-h-[calc(100vh-9em)] items-center justify-center p-[var(--pad-page)]">
        <LiquidGlass radius={10} bezel={24} strength={14} blur={10} tint="rgba(255,255,255,0.4)" tintDark="rgba(26,30,38,0.44)" className="w-full">
          <EmptyBlock
            title="还没有用量记录"
            desc="配置 Key 后仍需接入用量接口，才能画出逐日曲线。"
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
          <h2 className="mb-[0.15em] text-[0.98em] font-medium text-[var(--text-primary)]">用量趋势</h2>
          <p className="mb-[var(--sp-3)] text-[0.78em] text-[var(--text-faint)]">逐日 token 消耗 · 尚未接入</p>
          <EmptyBlock
            title="没有可用数据"
            desc="这一页需要厂商的用量或账单接口。当前已接入的只有模型清单与余额，无法推出历史消耗，所以保持空白而不是绘制估算曲线。"
            height="18em"
          />
        </div>
      </LiquidGlass>

      {/* 已连接厂商的当前状态仍然是真的，列在这里供对照 */}
      {configured && (
        <div className="grid gap-[var(--gap-grid)] md:grid-cols-2 xl:grid-cols-3">
          {platforms.map((p) => (
            <LiquidGlass key={p.id} radius={9} bezel={20} strength={10} blur={9} tint="rgba(255,255,255,0.38)" tintDark="rgba(26,30,38,0.42)">
              <div className="p-[var(--pad-card)]">
                <div className="mb-[0.5em] flex items-baseline gap-[var(--sp-1)]">
                  <span className="h-[0.55em] w-[0.55em] shrink-0 self-center rounded-full" style={{ background: p.color }} />
                  <span className="truncate text-[0.88em] font-medium text-[var(--text-primary)]">{p.name}</span>
                  <span className="ml-auto shrink-0 text-[0.76em] tabular-nums text-[var(--text-muted)]">
                    {p.modelCount !== null ? `${p.modelCount} 模型` : '—'}
                  </span>
                </div>
                <p className="text-[0.74em] leading-relaxed text-[var(--text-faint)]">
                  {p.status === 'ok'
                    ? '连接正常；该厂商未提供逐日用量接口。'
                    : p.message ?? '连接异常'}
                </p>
              </div>
            </LiquidGlass>
          ))}
        </div>
      )}
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
      {/*
       * LiveProvider 必须在 RefreshProvider 内层：
       * 它订阅自动刷新的 lastAt，刷新时重新请求真实接口。
       */}
      <RefreshProvider>
        <LiveProvider>
          <Shell />
        </LiveProvider>
      </RefreshProvider>
    </ThemeProvider>
  );
}

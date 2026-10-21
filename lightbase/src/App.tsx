import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Wallet,
  Coins,
  TrendingUp,
  Activity,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  ArrowUpRight,
  ChevronDown,
  Zap,
  Settings,
  KeyRound,
} from 'lucide-react';
import { ThemeProvider } from './theme';
import { RefreshProvider, useRefresh } from './refresh';
import { usePullToRefresh, PullIndicator } from './pull-refresh';
import { LiquidGlass } from './liquid-glass';
import { Segmented, Badge, cx } from './ui';
import { SystemSettingsPage } from './SystemSettingsPage';
import { ProvidersPage } from './ProvidersPage';
import { EmptyBlock } from './empty';
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

/* ============================================================ 平台卡片 */

function PlatformCard({
  p,
  models,
  open,
  onToggle,
}: {
  p: LivePlatform;
  /** 该厂商的模型清单，来自厂商 /models 接口 */
  models: LiveModel[];
  open: boolean;
  onToggle: () => void;
}) {
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

        {/*
         * 展开区：点击卡片头部展开该厂商的全部可用模型。
         * 模型清单本来就在 /models 的返回里，合并进平台页之后
         * 不再需要单独的「模型排行」页面 —— 多一个一级导航只为了展示
         * 同一批数据，反而让用户要在两处对照。
         */}
        <button
          onClick={onToggle}
          aria-expanded={open}
          className="mt-[var(--sp-3)] flex w-full items-center gap-[var(--sp-1)] border-t border-[var(--border-muted)] pt-[var(--sp-2)] text-[0.8em] text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
        >
          <span>{open ? '收起模型' : '查看可用模型'}</span>
          <ChevronDown
            size="0.95em"
            className={cx('ml-auto transition-transform duration-200', open && 'rotate-180')}
          />
        </button>

        {open && (
          <div className="mt-[var(--sp-2)]">
            {models.length === 0 ? (
              <p className="px-[var(--sp-1)] py-[var(--sp-1)] text-[0.74em] text-[var(--text-faint)]">
                {p.status === 'ok' ? '该厂商返回的模型列表为空' : '连接失败，无法读取模型清单'}
              </p>
            ) : (
              <ul className="max-h-[16em] space-y-[0.15em] overflow-y-auto lb-scroll">
                {models.map((m) => (
                  <li
                    key={m.id}
                    className="flex items-baseline gap-[var(--sp-1)] rounded-[var(--radius-sm)] px-[var(--sp-1)] py-[0.28em] hover:bg-[var(--bg-hover)]"
                  >
                    <span
                      className="mt-[0.45em] h-[0.42em] w-[0.42em] shrink-0 self-start rounded-full"
                      style={{ background: m.color }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[0.8em] text-[var(--text-primary)]">{m.name}</div>
                      {m.name !== m.id && (
                        <div className="truncate text-[0.7em] text-[var(--text-faint)]">{m.id}</div>
                      )}
                    </div>
                    <span className="shrink-0 whitespace-nowrap text-[0.72em] tabular-nums text-[var(--text-secondary)]">
                      {compactPrice(m.pricing)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </LiquidGlass>
  );
}

/* ============================================================ 顶栏 */

function TopBar() {
  const { refreshing } = useRefresh();
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
         *
         * 倒计时已移除：每秒重渲染整棵树只为跳一个数字，收益不成立。
         */}
        <p className="truncate text-[0.76em] text-[var(--text-muted)]">
          {loading
            ? '正在读取…'
            : configured
              ? `${platforms.length} 个厂商 · ${models.length} 个模型`
              : '未配置 Key · 不显示任何数据'}
        </p>
      </div>

      {/* 只有「正在刷新」时给一个指示，静止时不占位 */}
      {refreshing && (
        <RefreshCw size="1em" className="shrink-0 animate-spin text-[var(--text-faint)]" />
      )}
    </LiquidGlass>
  );
}

/* ============================================================ 侧边栏 */

/**
 * 导航项。
 * label 用于侧栏/无障碍名称，short 用于底部 dock（5 项等分，390px 下每项约 64px，
 * 三个字就会挤成两行，所以 dock 统一用两个字）。
 */
const NAV = [
  { id: 'overview', label: '总览', short: '总览', icon: Activity },
  { id: 'platforms', label: '平台与模型', short: '平台', icon: Wallet },
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
 *   1. 5 项等分，390px 下每项约 64px —— 文字只能两个字，否则换行撑高。
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
      /* 宽度策略：先按「项数比例」收窄，再给大屏上限并居中。
         两个数字都必须有，缺一个就会在另一类设备上出问题：

         ① 只用百分比（历史 bug）：w-[55%] 在 390 屏下仅 215px，
         每项 33px，而胶囊本身 32.7px —— 胶囊顶满格子，图标文字被挤出变形。

         ② 只贴边不给上限（也是 bug）：744px 的平板竖屏仍走手机布局
         （md 断点 768），dock 被撑到 740px，每项 123px，
         图标散得太开，读起来是一条通栏而不是悬浮胶囊。

         现在：width = min(视口 × 5/6, 25em)，居中。用 vw 而不是 calc(100%-4px)
         是因为 Tailwind 的任意值里 `100%-4px` 这种无空格算式不是合法 CSS，
         编译出来整条 width 会被丢弃，dock 直接塌成内容宽。
         导航从 6 项减到 5 项后，若仍占满宽度，每项会从 64px 撑到 77px：
         图标间距被拉大，读起来像横跨屏幕的一条而不是胶囊。
         乘 5/6 让每项宽度回到减项前的 64px 左右，视觉密度不变。
           320 → 263（每项 52.6）   390 → 321（64.2）   744 → 350（70）
         两边留白在手机上满足“成胶囊”的观感，25em 上限保证大屏不散架。
         竖向 py 固定 7.8px（不用 em）：字号档位变化时高度不该跟着涨，
         否则大字号下 dock 会变胖、遮住更多内容。 */
      className="lb-dock fixed bottom-[max(0.5em,env(safe-area-inset-bottom,0px))] left-1/2 w-[83.33vw] max-w-[25em] -translate-x-1/2 flex items-stretch rounded-full py-[7.8px] md:hidden"
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
              圆角用 999px（真胶囊），因为 5 项等分后每项仅约 64px 宽，
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
  const { platforms, loading } = useLive();
  const configured = platforms.length > 0;

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
       * 厂商用量：左名右进度条。
       *
       * 进度条只在厂商真给了用量数据时才画。实测 GLM / MiMo 的 /usage 系列全是 404
       * （与随手编的路径返回一致），所以这两家只能显示「无用量接口」——
       * 画一根归零的条子等于编造一个"用量很小"的结论。
       */}
      <UsageRanking />
    </div>
  );
}

/* ============================================================ 厂商用量 */

/**
 * 厂商用量排行。
 *
 * 横向进度条的分母取「所有拿到数据的厂商里的最大值」，不是某个假定的总额：
 * 厂商之间的 token 口径未必一致（输入/输出/缓存是否合并、是否含免费额度），
 * 把绝对量直接当"占全站百分比"是错的，所以只做相对长度比较。
 */
function UsageRanking() {
  const { platforms, loading } = useLive();

  const rows = useMemo(() => {
    const withUsage = platforms.map((p) => ({
      p,
      v: p.usage,
      // 统一排序：有数据的按量降序在前，无数据的按名字在后
      sortKey: p.usage ? -p.usage.value : Number.POSITIVE_INFINITY,
    }));
    withUsage.sort((a, b) => {
      if (a.sortKey !== b.sortKey) return a.sortKey - b.sortKey;
      return a.p.name.localeCompare(b.p.name);
    });
    return withUsage;
  }, [platforms]);

  const max = rows.reduce((m, r) => (r.v ? Math.max(m, r.v.value) : m), 0);
  const anyData = rows.some((r) => r.v);

  return (
    <LiquidGlass radius={10} bezel={22} strength={12} blur={10} tint="rgba(255,255,255,0.4)" tintDark="rgba(26,30,38,0.44)">
      <div className="p-[var(--pad-card)]">
        <div className="mb-[var(--sp-3)] flex items-baseline justify-between gap-[var(--sp-2)]">
          <h2 className="text-[0.98em] font-medium text-[var(--text-primary)]">厂商 Token 用量</h2>
          <span className="shrink-0 text-[0.72em] text-[var(--text-faint)]">
            {loading ? '读取中…' : anyData ? '厂商接口返回' : '暂无来源'}
          </span>
        </div>

        {rows.length === 0 ? (
          <EmptyBlock
            title="没有已连接的厂商"
            desc="配置 API Key 后这里会按厂商列出用量。"
            height="8em"
          />
        ) : (
          <div className="space-y-[var(--sp-3)]">
            {rows.map(({ p, v }) => {
              const pct = v && max > 0 ? Math.max(2, (v.value / max) * 100) : 0;
              return (
                <div key={p.id}>
                  <div className="mb-[0.3em] flex items-baseline justify-between gap-[var(--sp-2)]">
                    <div className="flex min-w-0 items-center gap-[var(--sp-1)]">
                      <span
                        className="h-[0.5em] w-[0.5em] shrink-0 rounded-full"
                        style={{ background: p.color }}
                      />
                      <span className="truncate text-[0.86em] font-medium text-[var(--text-primary)]">
                        {p.name}
                      </span>
                    </div>
                    <span className="shrink-0 text-[0.78em] tabular-nums text-[var(--text-secondary)]">
                      {v
                        ? v.unit === 'tokens'
                          ? fmtTokens(v.value)
                          : `${v.currency === 'CNY' ? '¥' : '$'}${fmtMoney(v.value)}`
                        : '—'}
                    </span>
                  </div>
                  {/* 轨道：无数据时只画底槽，不画填充 */}
                  <div className="h-[0.42em] w-full overflow-hidden rounded-full bg-[var(--bg-track)]">
                    {v && (
                      <div
                        className="h-full rounded-full transition-[width] duration-500"
                        style={{ width: `${pct}%`, background: p.color }}
                      />
                    )}
                  </div>
                  {!v && (
                    <div className="mt-[0.25em] text-[0.7em] text-[var(--text-faint)]">
                      {p.usageSupported ? '用量接口未返回数据' : '该厂商未提供用量接口'}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

      </div>
    </LiquidGlass>
  );
}

/* ============================================================ 平台页 */

function PlatformsPage() {
  const { platforms, models, loading } = useLive();
  const configured = platforms.length > 0;
  const [openId, setOpenId] = useState<string | null>(null);

  /* 模型按厂商分组：一次遍历，避免每张卡片各 filter 一遍 */
  const modelsByPlatform = useMemo(() => {
    const map: Record<string, LiveModel[]> = {};
    for (const m of models) (map[m.platformId] ??= []).push(m);
    for (const k of Object.keys(map)) map[k].sort((a, b) => a.name.localeCompare(b.name));
    return map;
  }, [models]);

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
      <div className="grid items-start gap-[var(--gap-grid)] sm:grid-cols-2 xl:grid-cols-3">
        {platforms.map((p) => (
          <PlatformCard
            key={p.id}
            p={p}
            models={modelsByPlatform[p.id] ?? []}
            open={openId === p.id}
            onToggle={() => setOpenId((cur) => (cur === p.id ? null : p.id))}
          />
        ))}
      </div>
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
    /* 'models' 已并入平台页：旧书签不能直接落到空白，重定向到 platforms */
    if (h === 'models') return 'platforms';
    return ['overview', 'platforms', 'trend', 'providers', 'appearance'].includes(h)
      ? h
      : 'overview';
  };
  const [active, setActive] = useState(readHash);
  const scrollRef = useRef<HTMLElement | null>(null);
  const { refresh } = useRefresh();
  /*
   * 第三个返回值是「本次由下拉触发」的落定窗口，和全局 refreshing 分开：
   * 定时自动刷新也会把 refreshing 置 true，若直接传给它，
   * 自动刷新就会在顶部凭空显示一条下拉指示器，看起来像自己拉了一下。
   */
  const { pull, armed, settling } = usePullToRefresh(scrollRef, refresh);

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
        <main ref={scrollRef} className="lb-scroll flex-1 overflow-y-auto pb-[var(--dock-h)] md:pb-0">
          <PullIndicator pull={pull} armed={armed} refreshing={settling} />
          <TopBar />
          {active === 'overview' && <Overview />}
          {active === 'platforms' && <PlatformsPage />}
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

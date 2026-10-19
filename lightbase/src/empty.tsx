import type { ReactNode } from 'react';
import { Inbox } from 'lucide-react';
import { cx } from './ui';

/* ============================================================================
   空状态 / 骨架
   ----------------------------------------------------------------------------
   原则：没有 API Key 就不该出现任何数字。
   假数据会让人误以为监控已经在工作，这是仪表盘类界面最危险的错觉。
   ========================================================================== */

/** 骨架条：呼吸动画，暗示"等待数据"而非"数据为 0" */
export function SkeletonBar({
  w = '100%',
  h = '0.8em',
  className,
}: {
  w?: string;
  h?: string;
  className?: string;
}) {
  return (
    <span
      className={cx('lb-skeleton block rounded-[0.3em] bg-[var(--bg-hover)]', className)}
      style={{ width: w, height: h }}
      aria-hidden="true"
    />
  );
}

/** 指标卡空态：结构与真实卡片完全一致，保证对齐不塌 */
export function StatSkeleton({
  icon,
  label,
  hint,
}: {
  icon: ReactNode;
  label: string;
  hint?: string;
}) {
  return (
    /*
     * 横向排布：图标 + 标签在左，占位值右对齐，说明文字缩进到第二行。
     *
     * 原来是纵向三段（图标行 / 数值行 / 说明行），手机上单卡高 102.7px，
     * 三张叠起来吃掉小半屏。改成横向后约 47px，正好一半。
     *
     * borderRadius 必须显式写：这个组件直接挂 .lb-liquid 类，不走 LiquidGlass，
     * 而 .lb-liquid 自身没有 border-radius 规则（圆角只由组件的内联样式提供）。
     * 漏了这行就是直角，与旁边所有 10px 圆角的卡片不一致。
     */
    <div
      className="lb-liquid px-[var(--pad-card)] py-[0.5em]"
      style={{ borderRadius: 10 }}
      data-glass-tier="1"
    >
      <div className="flex items-center gap-[0.5em]">
        <span className="flex h-[1.5em] w-[1.5em] shrink-0 items-center justify-center rounded-[0.45em] bg-[var(--bg-hover)] text-[var(--text-faint)]">
          {icon}
        </span>
        <span className="min-w-0 flex-1 truncate text-[0.8em] text-[var(--text-muted)]">
          {label}
        </span>
        <span className="shrink-0 text-[1.1em] font-semibold leading-none text-[var(--text-faint)]">
          —
        </span>
      </div>
      <div className="mt-[0.15em] truncate pl-[2em] text-[0.68em] text-[var(--text-faint)]">
        {hint ?? '等待配置'}
      </div>
    </div>
  );
}

/** 通用空态块：图表、列表都套它，保证页面节奏一致 */
export function EmptyBlock({
  title,
  desc,
  height = '12em',
  action,
  icon,
}: {
  title: string;
  desc?: string;
  height?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-[var(--sp-2)] px-[var(--sp-4)] text-center"
      style={{ minHeight: height }}
    >
      <span className="flex h-[2.6em] w-[2.6em] items-center justify-center rounded-full bg-[var(--bg-hover)] text-[var(--text-faint)]">
        {icon ?? <Inbox size="1.2em" />}
      </span>
      <div className="text-[0.92em] font-medium text-[var(--text-secondary)]">{title}</div>
      {desc && (
        <p className="max-w-[22em] text-[0.8em] leading-relaxed text-[var(--text-faint)]">
          {desc}
        </p>
      )}
      {action}
    </div>
  );
}

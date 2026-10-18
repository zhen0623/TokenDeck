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
    <div className="lb-liquid p-[var(--pad-card)]" data-glass-tier="1">
      <div className="mb-[var(--sp-2)] flex items-center gap-[var(--sp-2)]">
        <span className="flex h-[1.75em] w-[1.75em] items-center justify-center rounded-[0.5em] bg-[var(--bg-hover)] text-[var(--text-faint)]">
          {icon}
        </span>
        <span className="text-[0.82em] text-[var(--text-muted)]">{label}</span>
      </div>
      <div className="flex items-end gap-[var(--sp-2)]">
        <span className="text-[1.5em] font-semibold leading-none text-[var(--text-faint)]">—</span>
      </div>
      <div className="mt-[0.3em] text-[0.8em] text-[var(--text-faint)]">
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

import { LiquidGlass } from './liquid-glass';

/** 设置类页面统一的卡片区块 */
export function Section({
  title,
  desc,
  right,
  children,
}: {
  title: string;
  desc?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <LiquidGlass
      radius={10}
      bezel={22}
      strength={12}
      blur={10}
      tint="rgba(255,255,255,0.4)"
      tintDark="rgba(26,30,38,0.44)"
    >
      <div className="p-[var(--pad-card)]">
        <div className="mb-[var(--sp-3)] flex items-start gap-[var(--sp-2)]">
          <div className="min-w-0 flex-1">
            <h2 className="text-[1em] font-medium text-[var(--text-primary)]">{title}</h2>
            {desc && (
              <p className="mt-[var(--sp-1)] text-[0.8em] leading-relaxed text-[var(--text-faint)]">
                {desc}
              </p>
            )}
          </div>
          {right}
        </div>
        {children}
      </div>
    </LiquidGlass>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-[var(--sp-2)] py-[var(--sp-2)] sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="text-[0.92em] text-[var(--text-primary)]">{label}</div>
        {hint && <div className="text-[0.78em] text-[var(--text-faint)]">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export const INPUT_CLS =
  'w-full rounded-[var(--radius-btn)] border border-[var(--border-color)] ' +
  'bg-[var(--bg-input)] px-[var(--sp-2)] py-[var(--sp-2)] text-[0.86em] ' +
  'text-[var(--text-primary)] outline-none transition-colors ' +
  'placeholder:text-[var(--text-faint)] focus:border-[var(--brand-green)]';

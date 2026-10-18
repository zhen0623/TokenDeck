import type { ButtonHTMLAttributes, ReactNode } from 'react';

/* ============================ 工具 ============================ */
export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ');
}

/* ============================ 按钮 ============================ */
type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
}

const BTN_BASE =
  'inline-flex items-center justify-center gap-[0.4em] rounded-[var(--radius-btn)] ' +
  'font-medium whitespace-nowrap transition-all duration-150 ' +
  'disabled:cursor-not-allowed disabled:opacity-45 ' +
  'active:scale-[0.98] select-none';

const BTN_VARIANT: Record<ButtonVariant, string> = {
  primary:
    'bg-[var(--brand-green)] text-white shadow-[var(--shadow-soft)] ' +
    'hover:bg-[var(--brand-green-hover)]',
  secondary:
    'bg-[var(--bg-card)] text-[var(--text-primary)] border border-[var(--border-color)] ' +
    'hover:bg-[var(--bg-hover)]',
  ghost:
    'bg-transparent text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] ' +
    'hover:text-[var(--text-primary)]',
  danger: 'bg-[var(--color-danger)] text-white hover:opacity-90',
};

const BTN_SIZE: Record<ButtonSize, string> = {
  sm: 'h-[2.1em] px-[0.7em] text-[0.9em]',
  md: 'h-[2.6em] px-[1em] text-[0.95em]',
};

export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={cx(BTN_BASE, BTN_VARIANT[variant], BTN_SIZE[size], className)}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
}

/* ============================ 开关 ============================ */
interface SwitchProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  label?: string;
}

export function Switch({ checked, onChange, disabled, label }: SwitchProps) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-[0.6em]">
      <span className="relative inline-flex h-[1.43em] w-[2.57em] shrink-0 items-center">
        <input
          type="checkbox"
          role="switch"
          aria-label={label}
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          className={
            'peer absolute inset-0 m-0 h-full w-full cursor-pointer appearance-none ' +
            'rounded-full border border-[var(--border-color)] bg-[var(--bg-switch)] ' +
            'transition-colors duration-150 ' +
            'checked:border-[var(--brand-green)] checked:bg-[var(--brand-green)] ' +
            'disabled:cursor-not-allowed disabled:opacity-50'
          }
        />
        <span
          aria-hidden="true"
          className={
            'pointer-events-none absolute left-[0.14em] top-[0.14em] ' +
            'h-[1.14em] w-[1.14em] rounded-full bg-white shadow-sm ' +
            'transition-transform duration-150 peer-checked:translate-x-[1.15em]'
          }
        />
      </span>
      {label && (
        <span className="text-[0.95em] text-[var(--text-secondary)]">{label}</span>
      )}
    </label>
  );
}

/* ============================ 卡片 ============================ */
export function Card({
  children,
  className,
  padded = true,
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <div
      className={cx(
        'rounded-[var(--radius-card)] border border-[var(--border-color)]',
        'bg-[var(--bg-card)] transition-colors duration-150',
        padded && 'p-[1.15em]',
        className,
      )}
    >
      {children}
    </div>
  );
}

/* ============================ 徽章 ============================ */
type BadgeTone = 'success' | 'warning' | 'danger' | 'neutral';

export function Badge({
  tone = 'neutral',
  children,
}: {
  tone?: BadgeTone;
  children: ReactNode;
}) {
  const toneCls: Record<BadgeTone, string> = {
    success:
      'bg-[var(--brand-green-10)] text-[var(--brand-green-text)] border-[var(--brand-green-20)]',
    warning:
      'bg-[rgb(250_157_59_/_0.12)] text-[var(--color-warning)] border-[rgb(250_157_59_/_0.22)]',
    danger:
      'bg-[rgb(250_81_81_/_0.12)] text-[var(--color-danger)] border-[rgb(250_81_81_/_0.22)]',
    neutral:
      'bg-[var(--bg-hover)] text-[var(--text-muted)] border-[var(--border-color)]',
  };
  return (
    <span
      className={cx(
        'inline-flex items-center rounded-[0.7em] border px-[0.55em] py-[0.12em]',
        'text-[0.82em] font-medium leading-[1.6]',
        toneCls[tone],
      )}
    >
      {children}
    </span>
  );
}

/* ============================ 进度条 ============================ */
export function Progress({ value, label }: { value: number; label?: string }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="w-full">
      {label && (
        <div className="mb-[0.4em] flex justify-between text-[0.86em] text-[var(--text-muted)]">
          <span>{label}</span>
          <span className="tabular-nums">{pct.toFixed(0)}%</span>
        </div>
      )}
      <div className="h-[6px] w-full overflow-hidden rounded-full bg-[var(--bg-track)]">
        <div
          className="h-full rounded-full bg-[var(--brand-green)] transition-[width] duration-500 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/* ============================ 分段控件 ============================ */
export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex gap-[0.15em] rounded-[var(--radius-btn)] bg-[var(--bg-hover)] p-[0.2em]">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={String(o.value)}
            onClick={() => onChange(o.value)}
            className={cx(
              'rounded-[0.5em] px-[0.75em] py-[0.3em] text-[0.88em] font-medium',
              'transition-all duration-150',
              active
                ? 'bg-[var(--bg-card)] text-[var(--text-primary)] shadow-[var(--shadow-soft)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* ============================ 列表行 ============================ */
export function Row({
  icon,
  title,
  desc,
  right,
}: {
  icon?: ReactNode;
  title: ReactNode;
  desc?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-[0.85em] py-[0.7em]">
      {icon && (
        <span
          className={
            'flex h-[2.2em] w-[2.2em] shrink-0 items-center justify-center ' +
            'rounded-[0.6em] bg-[var(--brand-green-10)] text-[var(--brand-green)]'
          }
        >
          {icon}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[0.95em] font-medium text-[var(--text-primary)]">
          {title}
        </div>
        {desc && (
          <div className="truncate text-[0.86em] text-[var(--text-muted)]">{desc}</div>
        )}
      </div>
      {right}
    </div>
  );
}

import { ArrowDownToLine, ArrowUpFromLine, Database, Info, Sparkles } from 'lucide-react';
import { Badge, cx } from './ui';
import { BILLING_META, money, priceOf, estimateCost, type ModelPricing } from './pricing';

/* ============================================================ 单价行 */

function PriceRow({
  label,
  value,
  currency,
  icon: Icon,
  dim,
}: {
  label: string;
  value?: number;
  currency: 'USD' | 'CNY';
  icon: typeof ArrowDownToLine;
  dim?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-[var(--sp-2)] py-[0.28em]">
      <span className="flex items-center gap-[0.35em] text-[0.8em] text-[var(--text-muted)]">
        <Icon size="0.85em" className="shrink-0 opacity-70" />
        {label}
      </span>
      <span
        className={cx(
          'shrink-0 text-[0.84em] tabular-nums',
          dim ? 'text-[var(--text-faint)]' : 'text-[var(--text-primary)]',
        )}
      >
        {value === undefined ? '—' : money(value, currency)}
        {value !== undefined && <span className="text-[0.82em] text-[var(--text-faint)]"> / 百万</span>}
      </span>
    </div>
  );
}

/* ============================================================ 计费详情 */

/**
 * 模型计费规则详情。
 * 设计要点：
 * - 先给「计费方式」，因为订阅制根本没有单价，直接甩数字是错的
 * - 输入/输出分开，这是唯一能解释成本差异的两个数
 * - 缓存价单独一行且降级显示，只在厂商支持时才出现
 * - 末尾给一个具体示例，把单价翻译成人能感知的量级
 */
export function BillingDetail({
  modelId,
  providerId,
  providerName,
}: {
  modelId: string;
  providerId?: string;
  providerName?: string;
}) {
  const p: ModelPricing = priceOf(modelId, providerId);
  const meta = BILLING_META[p.mode];

  // 示例：100 万输入 + 10 万输出，换算成「一次典型请求要多少钱」
  const exampleIn = 1_000_000;
  const exampleOut = 100_000;
  const example = estimateCost(p, exampleIn, exampleOut);

  return (
    <div className="rounded-[var(--radius-btn)] bg-[var(--bg-hover)] p-[var(--sp-3)]">
      {/* 头：计费方式 + 数据来源 */}
      <div className="mb-[var(--sp-2)] flex flex-wrap items-center gap-[var(--sp-2)]">
        <Badge tone={meta.tone}>{meta.label}</Badge>
        {providerName && (
          <span className="text-[0.78em] text-[var(--text-faint)]">{providerName}</span>
        )}
        <span className="ml-auto inline-flex items-center gap-[0.25em] text-[0.72em] text-[var(--text-faint)]">
          <Database size="0.8em" />
          {p.source === 'live' ? '厂商接口实时价' : '内置参考价'}
        </span>
      </div>

      {p.mode === 'per-token' && (
        <>
          <div className="divide-y divide-[var(--border-muted)]">
            <PriceRow label="输入" value={p.input} currency={p.currency} icon={ArrowDownToLine} />
            <PriceRow label="输出" value={p.output} currency={p.currency} icon={ArrowUpFromLine} />
            {p.cacheRead !== undefined && (
              <PriceRow label="缓存读取" value={p.cacheRead} currency={p.currency} icon={Database} dim />
            )}
            {p.cacheWrite !== undefined && (
              <PriceRow label="缓存写入" value={p.cacheWrite} currency={p.currency} icon={Database} dim />
            )}
          </div>

          {example !== null && (
            <div className="mt-[var(--sp-2)] flex items-start gap-[0.35em] rounded-[0.4em] border border-[var(--border-muted)] px-[var(--sp-2)] py-[0.4em]">
              <Sparkles size="0.85em" className="mt-[0.15em] shrink-0 text-[var(--brand-green-text)]" />
              <span className="text-[0.78em] leading-relaxed text-[var(--text-muted)]">
                示例：100 万输入 + 10 万输出 ≈{' '}
                <strong className="tabular-nums text-[var(--text-primary)]">
                  {money(example, p.currency)}
                </strong>
              </span>
            </div>
          )}
        </>
      )}

      {p.mode === 'subscription' && (
        <div className="flex items-start gap-[0.4em]">
          <Info size="0.9em" className="mt-[0.15em] shrink-0 text-[var(--color-warning)]" />
          <p className="text-[0.8em] leading-relaxed text-[var(--text-muted)]">
            该端点按订阅套餐扣 <strong className="text-[var(--text-primary)]">Credits</strong>，
            没有逐 token 美元单价。额度用完需升级套餐，不会产生按量账单。
          </p>
        </div>
      )}

      {p.mode === 'unknown' && (
        <div className="flex items-start gap-[0.4em]">
          <Info size="0.9em" className="mt-[0.15em] shrink-0 text-[var(--color-warning)]" />
          <p className="text-[0.8em] leading-relaxed text-[var(--text-muted)]">
            未收录该模型的单价。接入厂商接口或聚合网关后会自动读取实时价格。
          </p>
        </div>
      )}

      {p.mode === 'free' && (
        <p className="text-[0.8em] leading-relaxed text-[var(--text-muted)]">
          该模型当前免费，不计费。
        </p>
      )}

      {p.note && (
        <p className="mt-[var(--sp-2)] border-t border-[var(--border-muted)] pt-[var(--sp-2)] text-[0.76em] leading-relaxed text-[var(--text-faint)]">
          {p.note}
        </p>
      )}
    </div>
  );
}

/** 表格里那一行小字：按量 $1.25/$10 · 订阅 · 未知 */
export function PriceHint({ modelId, providerId }: { modelId: string; providerId?: string }) {
  const p = priceOf(modelId, providerId);
  const meta = BILLING_META[p.mode];
  if (p.mode !== 'per-token') {
    return (
      <span
        className={cx(
          'text-[0.72em]',
          p.mode === 'subscription' ? 'text-[var(--text-faint)]' : 'text-[var(--color-warning)]',
        )}
      >
        {meta.short}
      </span>
    );
  }
  return (
    <span className="text-[0.72em] tabular-nums text-[var(--text-faint)]">
      {money(p.input, p.currency)} / {money(p.output, p.currency)}
    </span>
  );
}

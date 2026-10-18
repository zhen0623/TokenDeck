import { useMemo, useState } from 'react';
import { fmtTokens, fmtDate } from './data';

/* ============================================================================
   手写 SVG 图表 —— 不引入图表库，保持产物轻量
   ========================================================================== */

/* ------------------------------------------------------------ 堆叠面积图 */

export interface StackSeries {
  id: string;
  name: string;
  color: string;
  values: number[];
}

export function StackedAreaChart({
  series,
  dates,
  height = 220,
}: {
  series: StackSeries[];
  dates: number[];
  height?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 1000; // viewBox 宽，靠 preserveAspectRatio 自适应
  const H = height;
  const padL = 44;
  const padR = 8;
  const padT = 12;
  const padB = 24;

  const n = dates.length;

  // 每天合计
  const totals = useMemo(
    () =>
      Array.from({ length: n }, (_, i) =>
        series.reduce((a, s) => a + (s.values[i] ?? 0), 0),
      ),
    [series, n],
  );

  const max = Math.max(...totals) * 1.12 || 1;

  const x = (i: number) => padL + (i / Math.max(1, n - 1)) * (W - padL - padR);
  const y = (v: number) => padT + (1 - v / max) * (H - padT - padB);

  // 逐条累加成堆叠路径
  const layers = useMemo(() => {
    const acc = new Array(n).fill(0);
    return series.map((s) => {
      const lower = [...acc];
      for (let i = 0; i < n; i++) acc[i] += s.values[i] ?? 0;
      const upper = [...acc];
      const up = upper.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`);
      const down = lower
        .map((v, i) => `L${x(i).toFixed(1)},${y(v).toFixed(1)}`)
        .reverse();
      return {
        d: [...up, ...down, 'Z'].join(' '),
        color: s.color,
        name: s.name,
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    });
  }, [series, n, max, H]);

  // 网格线（4 档）
  const gridVals = [0, 0.25, 0.5, 0.75, 1].map((t) => max * t);

  return (
    <div className="relative w-full">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ height }}
        preserveAspectRatio="none"
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          {series.map((s) => (
            <linearGradient key={s.id} id={`grad-${s.id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity="0.95" />
              <stop offset="100%" stopColor={s.color} stopOpacity="0.55" />
            </linearGradient>
          ))}
        </defs>

        {/* 网格 */}
        {gridVals.map((v, i) => (
          <g key={i}>
            <line
              x1={padL}
              x2={W - padR}
              y1={y(v)}
              y2={y(v)}
              stroke="var(--border-color)"
              strokeWidth="1"
              strokeDasharray={i === 0 ? '0' : '3 5'}
            />
            <text
              x={padL - 8}
              y={y(v) + 4}
              textAnchor="end"
              className="fill-[var(--text-faint)]"
              style={{ fontSize: 11 }}
            >
              {fmtTokens(v, 0)}
            </text>
          </g>
        ))}

        {/* 堆叠层 */}
        {layers.map((l, i) => (
          <path key={i} d={l.d} fill={`url(#grad-${series[i].id})`} />
        ))}

        {/* 悬停指示 */}
        {hover !== null && (
          <g>
            <line
              x1={x(hover)}
              x2={x(hover)}
              y1={padT}
              y2={H - padB}
              stroke="var(--brand-green)"
              strokeWidth="1.5"
              strokeDasharray="4 4"
            />
            <circle cx={x(hover)} cy={y(totals[hover])} r="5" fill="var(--brand-green)" />
            <circle cx={x(hover)} cy={y(totals[hover])} r="9" fill="var(--brand-green)" opacity="0.22" />
          </g>
        )}

        {/* 命中区 */}
        {Array.from({ length: n }, (_, i) => (
          <rect
            key={i}
            x={x(i) - (W - padL - padR) / (n - 1) / 2}
            y={padT}
            width={(W - padL - padR) / (n - 1)}
            height={H - padT - padB}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
          />
        ))}

        {/* x 轴标签（每 5 天） */}
        {dates.map((d, i) =>
          i % 5 === 0 || i === n - 1 ? (
            <text
              key={i}
              x={x(i)}
              y={H - 6}
              textAnchor="middle"
              className="fill-[var(--text-faint)]"
              style={{ fontSize: 11 }}
            >
              {fmtDate(d)}
            </text>
          ) : null,
        )}
      </svg>

      {/* 悬停浮层（HTML，避免 SVG text 排版问题） */}
      {hover !== null && (
        <div
          className="pointer-events-none absolute top-2 z-10 rounded-[0.5em] border border-[var(--border-color)] bg-[var(--bg-elevated)] px-[0.6em] py-[0.4em] text-[0.78em] shadow-[var(--shadow-float)]"
          style={{
            left: `${(x(hover) / W) * 100}%`,
            transform:
              x(hover) / W > 0.75
                ? 'translateX(-105%)'
                : x(hover) / W < 0.15
                  ? 'translateX(5%)'
                  : 'translateX(-50%)',
          }}
        >
          <div className="mb-[0.2em] font-medium text-[var(--text-primary)]">
            {fmtDate(dates[hover])} · 合计 {fmtTokens(totals[hover])}
          </div>
          {series
            .slice()
            .reverse()
            .map((s) => (
              <div key={s.id} className="flex items-center gap-[0.35em] whitespace-nowrap">
                <span
                  className="h-[0.5em] w-[0.5em] shrink-0 rounded-full"
                  style={{ background: s.color }}
                />
                <span className="text-[var(--text-muted)]">{s.name}</span>
                <span className="ml-auto tabular-nums text-[var(--text-secondary)]">
                  {fmtTokens(s.values[hover] ?? 0)}
                </span>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- 迷你线 */

export function Sparkline({
  values,
  color = 'var(--brand-green)',
  width = 72,
  height = 24,
}: {
  values: number[];
  color?: string;
  width?: number;
  height?: number;
}) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => {
    const x = (i / Math.max(1, values.length - 1)) * (width - 2) + 1;
    const y = height - 2 - ((v - min) / span) * (height - 4);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return (
    <svg width={width} height={height} className="overflow-visible">
      <polyline
        points={pts.join(' ')}
        fill="none"
        stroke={color}
        strokeWidth="1.6"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle
        cx={pts[pts.length - 1].split(',')[0]}
        cy={pts[pts.length - 1].split(',')[1]}
        r="2.2"
        fill={color}
      />
    </svg>
  );
}

/* ---------------------------------------------------------------- 环形图 */

export function Donut({
  segments,
  size = 132,
  thickness = 13,
  centerLabel,
  centerValue,
}: {
  segments: Array<{ value: number; color: string; name: string }>;
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerValue?: string;
}) {
  const total = segments.reduce((a, s) => a + s.value, 0) || 1;
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--bg-track)" strokeWidth={thickness} />
        {segments.map((s, i) => {
          const len = (s.value / total) * c;
          const el = (
            <circle
              key={i}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={thickness}
              strokeDasharray={`${len} ${c - len}`}
              strokeDashoffset={-offset}
              strokeLinecap="butt"
            />
          );
          offset += len;
          return el;
        })}
      </svg>
      {(centerValue || centerLabel) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {centerValue && (
            <span className="text-[1.25em] font-semibold tabular-nums text-[var(--text-primary)]">
              {centerValue}
            </span>
          )}
          {centerLabel && (
            <span className="text-[0.72em] text-[var(--text-faint)]">{centerLabel}</span>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ 横向排行条 */

export function RankBar({
  value,
  max,
  color,
}: {
  value: number;
  max: number;
  color: string;
}) {
  const pct = Math.max(2, (value / (max || 1)) * 100);
  return (
    <div className="h-[6px] w-full overflow-hidden rounded-full bg-[var(--bg-track)]">
      <div
        className="h-full rounded-full transition-[width] duration-500 ease-out"
        style={{ width: `${pct}%`, background: color }}
      />
    </div>
  );
}

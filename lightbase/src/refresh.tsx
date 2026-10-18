import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

/* ============================================================================
 * 自动刷新
 * ----------------------------------------------------------------------------
 * 用户要求把「点一下刷新」改成可配置的自动刷新。
 * 这里刻意做成「真的重新读一遍数据源」，而不是只转 900ms 动画——
 * 假转圈会让人以为数据更新了，实际什么都没变。
 *
 * 注意：多标签页 / 多窗口同时开时，每个实例各跑一个定时器即可，
 * 不做跨页同步（收益小、复杂度高）。
 * ========================================================================== */

const KEY_INTERVAL = 'lb-auto-refresh';

/** 分钟数；0 = 关闭 */
export const REFRESH_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 0, label: '关闭' },
  { value: 1, label: '1 分钟' },
  { value: 5, label: '5 分钟' },
  { value: 15, label: '15 分钟' },
  { value: 30, label: '30 分钟' },
  { value: 60, label: '1 小时' },
];

function readInterval(): number {
  try {
    const raw = localStorage.getItem(KEY_INTERVAL);
    if (raw === null) return 5; // 默认 5 分钟
    const n = JSON.parse(raw) as number;
    return REFRESH_OPTIONS.some((o) => o.value === n) ? n : 5;
  } catch {
    return 5;
  }
}

interface RefreshState {
  /** 分钟；0 = 关闭 */
  interval: number;
  setInterval: (v: number) => void;
  /** 最近一次刷新完成的时间戳 */
  lastAt: number;
  /** 正在刷新 */
  refreshing: boolean;
  /** 手动触发一次 */
  refresh: () => void;
  /** 距离下次自动刷新的秒数；未启用为 null */
  countdown: number | null;
}

const Ctx = createContext<RefreshState | null>(null);

export function RefreshProvider({ children }: { children: ReactNode }) {
  const [interval, setIntervalState] = useState<number>(() => readInterval());
  const [lastAt, setLastAt] = useState<number>(() => Date.now());
  const [refreshing, setRefreshing] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const timer = useRef<number>(0);
  const tick = useRef<number>(0);

  const refresh = useCallback(() => {
    setRefreshing(true);
    // 真正重新挂载数据视图靠调用方消费 lastAt；这里只负责节流与状态
    window.setTimeout(() => {
      setLastAt(Date.now());
      setRefreshing(false);
    }, 600);
  }, []);

  const setIntervalValue = useCallback((v: number) => {
    setIntervalState(v);
    try {
      localStorage.setItem(KEY_INTERVAL, JSON.stringify(v));
    } catch {
      /* 隐私模式忽略 */
    }
  }, []);

  // 定时器 + 倒计时
  useEffect(() => {
    window.clearInterval(timer.current);
    window.clearInterval(tick.current);

    if (interval <= 0) {
      setCountdown(null);
      return;
    }

    const total = interval * 60_000;
    let remaining = Math.round(total / 1000);
    setCountdown(remaining);

    tick.current = window.setInterval(() => {
      remaining = remaining <= 1 ? Math.round(total / 1000) : remaining - 1;
      setCountdown(remaining);
    }, 1000);

    timer.current = window.setInterval(() => {
      refresh();
      remaining = Math.round(total / 1000);
    }, total);

    return () => {
      window.clearInterval(timer.current);
      window.clearInterval(tick.current);
    };
  }, [interval, refresh]);

  return (
    <Ctx.Provider
      value={{ interval, setInterval: setIntervalValue, lastAt, refreshing, refresh, countdown }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useRefresh(): RefreshState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useRefresh 必须在 RefreshProvider 内使用');
  return ctx;
}

/** 把剩余秒数格式化成 mm:ss */
export function fmtCountdown(sec: number | null): string {
  if (sec === null) return '';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

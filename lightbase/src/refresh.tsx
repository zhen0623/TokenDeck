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
 * 两种触发方式：
 *   1. 定时器：按设置的间隔自动重新读一遍数据源
 *   2. 下拉：在任意页面从顶部往下拉即刷新（移动端最常见的手势）
 *
 * 刻意做成「真的重新读一遍数据源」，而不是只转 900ms 动画——
 * 假转圈会让人以为数据更新了，实际什么都没变。
 *
 * 顶部不再显示倒计时：每秒重渲染整棵树只为跳一个数字，代价和收益不成比例，
 * 且倒计时本身不提供任何可操作信息。需要知道"上次什么时候刷的"看设置页。
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
  /** 最近一次刷新触发的时间戳 */
  lastAt: number;
  /** 正在刷新（含下拉触发的短反馈窗口） */
  refreshing: boolean;
  /** 手动 / 下拉触发一次 */
  refresh: () => void;
}

const Ctx = createContext<RefreshState | null>(null);

export function RefreshProvider({ children }: { children: ReactNode }) {
  const [interval, setIntervalState] = useState<number>(() => readInterval());
  const [lastAt, setLastAt] = useState<number>(() => Date.now());
  const [refreshing, setRefreshing] = useState(false);
  const timer = useRef<number>(0);
  const spin = useRef<number>(0);

  const refresh = useCallback(() => {
    /*
     * 先推进 lastAt 让 LiveProvider 立刻重新请求，
     * 再用 900ms 的 refreshing 窗口撑住指示器 —— 否则用户在数据回来之前
     * 看不到任何反馈，会以为手势没生效。
     */
    setRefreshing(true);
    setLastAt(Date.now());
    window.clearTimeout(spin.current);
    spin.current = window.setTimeout(() => setRefreshing(false), 900);
  }, []);

  const setIntervalValue = useCallback((v: number) => {
    setIntervalState(v);
    try {
      localStorage.setItem(KEY_INTERVAL, JSON.stringify(v));
    } catch {
      /* 隐私模式忽略 */
    }
  }, []);

  useEffect(() => {
    window.clearInterval(timer.current);
    if (interval <= 0) return;
    timer.current = window.setInterval(refresh, interval * 60_000);
    return () => window.clearInterval(timer.current);
  }, [interval, refresh]);

  useEffect(() => () => window.clearTimeout(spin.current), []);

  return (
    <Ctx.Provider value={{ interval, setInterval: setIntervalValue, lastAt, refreshing, refresh }}>
      {children}
    </Ctx.Provider>
  );
}

export function useRefresh(): RefreshState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useRefresh 必须在 RefreshProvider 内使用');
  return ctx;
}

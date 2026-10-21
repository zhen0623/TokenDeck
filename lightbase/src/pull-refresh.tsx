import { useEffect, useRef, useState, type RefObject } from 'react';
import { RefreshCw } from 'lucide-react';
import { cx } from './ui';

/* ============================================================================
 * 下拉刷新
 * ----------------------------------------------------------------------------
 * 需求：任意页面从顶部往下一拉就刷新。
 *
 * 三条实现约束（都是踩过的坑）：
 *   1. 只在滚动容器 scrollTop === 0 时才接管纵向手势，
 *      否则页面里正常的下滑滚动会被吃掉。
 *   2. touchmove 必须 passive: false 才能 preventDefault，
 *      否则浏览器原生 overscroll 会先一步把页面弹走。
 *   3. 位移要加阻尼（×0.45）并封顶，手指拉 200px 不该把内容推 200px。
 *
 * 松手判定用「超过阈值」而不是「拉的速度」：速度判定在不同触屏采样率下不稳定，
 * 阈值判定用户可预期，也便于自动化测试。
 *
 * 指示器只服务于手势本身：settling 由「松手触发」置位，定时器自动刷新
 * 不经过这里，所以自动刷新不会凭空冒出一个"正在刷新"的下拉条。
 * ========================================================================== */

const THRESHOLD = 62; // px，达到即触发
const MAX_PULL = 96; // px，视觉上限
const SETTLE_MS = 900; // 松手后指示器停留时长

export function usePullToRefresh(
  scrollRef: RefObject<HTMLElement | null>,
  onRefresh: () => void,
) {
  const [pull, setPull] = useState(0);
  const [armed, setArmed] = useState(false);
  const [settling, setSettling] = useState(false);
  /* 手势过程中的位移同时存在 ref 里：监听器只注册一次，
     不随每帧位移重注册（否则一次下拉会重建几十次 touchmove 监听）。 */
  const pullRef = useRef(0);
  const startY = useRef(0);
  const active = useRef(false);
  const settleTimer = useRef(0);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const writePull = (v: number) => {
      pullRef.current = v;
      setPull(v);
    };

    const onStart = (e: TouchEvent) => {
      if (el.scrollTop > 0) return;
      if (e.touches.length !== 1) return;
      startY.current = e.touches[0].clientY;
      active.current = true;
    };

    const onMove = (e: TouchEvent) => {
      if (!active.current) return;
      if (el.scrollTop > 0) {
        active.current = false;
        writePull(0);
        setArmed(false);
        return;
      }
      const dy = e.touches[0].clientY - startY.current;
      if (dy <= 0) {
        writePull(0);
        setArmed(false);
        return;
      }
      // 有位移就阻止原生滚动，避免橡皮筋效果叠加
      if (e.cancelable) e.preventDefault();
      const eased = Math.min(MAX_PULL, dy * 0.45);
      writePull(eased);
      setArmed(eased >= THRESHOLD);
    };

    const onEnd = () => {
      if (!active.current) return;
      active.current = false;
      const triggered = pullRef.current >= THRESHOLD;
      writePull(0);
      setArmed(false);
      if (!triggered) return;
      onRefresh();
      setSettling(true);
      window.clearTimeout(settleTimer.current);
      settleTimer.current = window.setTimeout(() => setSettling(false), SETTLE_MS);
    };

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd, { passive: true });
    el.addEventListener('touchcancel', onEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
    };
  }, [scrollRef, onRefresh]);

  useEffect(() => () => window.clearTimeout(settleTimer.current), []);

  return { pull, armed, settling };
}

/**
 * 下拉指示器。放在滚动容器内、内容之上，随手指位移平移。
 * 静止时高度为 0，完全不占位。
 *
 * refreshing 只接受「本次是下拉触发」的落定窗口，不接受全局刷新状态：
 * 定时自动刷新时它必须为 false，否则每次自动刷新都会伪装成一次下拉。
 */
export function PullIndicator({
  pull,
  armed,
  refreshing,
}: {
  pull: number;
  armed: boolean;
  refreshing: boolean;
}) {
  const visible = pull > 0 || refreshing;
  const progress = Math.min(1, pull / THRESHOLD);

  return (
    <div
      aria-hidden={!visible}
      className={cx(
        'pointer-events-none sticky top-0 z-30 flex items-end justify-center overflow-hidden transition-[height,opacity] duration-150',
        visible ? 'opacity-100' : 'opacity-0',
      )}
      style={{ height: refreshing && pull === 0 ? 34 : pull }}
    >
      <div
        className={cx(
          'mb-[0.4em] flex items-center gap-[0.4em] rounded-full px-[0.7em] py-[0.28em] text-[0.74em] shadow-sm',
          'bg-[var(--bg-card)] text-[var(--text-muted)]',
        )}
      >
        <RefreshCw
          size="0.9em"
          className={refreshing ? 'animate-spin' : ''}
          style={
            refreshing
              ? undefined
              : { transform: `rotate(${Math.round(progress * 270)}deg)`, opacity: 0.35 + progress * 0.65 }
          }
        />
        <span>{refreshing ? '正在刷新…' : armed ? '松开刷新' : '下拉刷新'}</span>
      </div>
    </div>
  );
}

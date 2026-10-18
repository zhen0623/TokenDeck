import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

/* ============================================================================
 * 液态玻璃（Liquid Glass）
 *
 * 真正的液态玻璃 = 三层叠加：
 *   1. 折射（refraction）—— 边缘把背后画面弯折，靠 SVG feDisplacementMap 实现
 *   2. 镜面高光（specular）—— 边缘一圈亮线 + 左上斜向柔光
 *   3. 动态着色（tint）—— 半透明底 + saturate 让背后颜色渗上来
 *
 * 只有 1 是"液态玻璃"区别于普通毛玻璃的地方，而它只有 Chromium 系支持
 * （backdrop-filter: url(#filter)，Safari/Firefox 不支持，WebKit bug 245510）。
 * 所以这里做三级降级：
 *   tier 3 = 折射 + 模糊 + 高光   （Chromium）
 *   tier 2 = 模糊 + 高光          （Safari / Firefox / 老内核）
 *   tier 1 = 纯半透明 + 高光      （极老环境 / 降级开关）
 * ========================================================================== */

/** 圆角矩形有符号距离场：负值在内部，绝对值 = 到边缘的距离 */
function sdRoundRect(px: number, py: number, w: number, h: number, r: number) {
  const qx = Math.abs(px - w / 2) - (w / 2 - r);
  const qy = Math.abs(py - h / 2) - (h / 2 - r);
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
  return Math.min(Math.max(qx, qy), 0) + outside - r;
}

/**
 * 生成折射位移图。
 * R 通道 = X 位移，G 通道 = Y 位移，128 为不位移。
 * feDisplacementMap 的 scale 设为 255 时，图中 1 个单位 ≈ 1px 实际位移。
 */
function buildDisplacementMap(
  w: number,
  h: number,
  radius: number,
  bezel: number,
  strength: number,
): string {
  const scaleDown = 2; // 半分辨率生成，feImage 拉伸回原尺寸，省一半计算
  const cw = Math.max(2, Math.round(w / scaleDown));
  const ch = Math.max(2, Math.round(h / scaleDown));
  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const img = ctx.createImageData(cw, ch);
  const data = img.data;
  const bez = Math.max(1, Math.min(bezel, Math.min(w, h) / 3));
  const r = Math.min(radius, Math.min(w, h) / 2);

  for (let y = 0; y < ch; y++) {
    const py = (y + 0.5) * scaleDown;
    for (let x = 0; x < cw; x++) {
      const px = (x + 0.5) * scaleDown;
      const d = sdRoundRect(px, py, w, h, r);

      let nx = 0;
      let ny = 0;
      let disp = 0;

      if (d > -bez) {
        // SDF 梯度 = 外法线
        const e = 1;
        const gx =
          sdRoundRect(px + e, py, w, h, r) - sdRoundRect(px - e, py, w, h, r);
        const gy =
          sdRoundRect(px, py + e, w, h, r) - sdRoundRect(px, py - e, w, h, r);
        const len = Math.hypot(gx, gy) || 1;
        nx = gx / len;
        ny = gy / len;

        // t: 0 = 贴边，1 = 折边带内沿
        const t = Math.max(0, Math.min(1, -d / bez));
        // 二次衰减：边缘最强，向中心迅速归零
        const profile = (1 - t) * (1 - t);
        disp = profile * strength;
      }

      const i = (y * cw + x) * 4;
      data[i] = Math.max(0, Math.min(255, Math.round(128 + nx * disp)));
      data[i + 1] = Math.max(0, Math.min(255, Math.round(128 + ny * disp)));
      data[i + 2] = 128;
      data[i + 3] = 255;
    }
  }

  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL('image/png');
}

/* ---------------------------------------------------------------- 能力探测 */

export type GlassTier = 3 | 2 | 1;

let cachedTier: GlassTier | null = null;

/** 是否移动端（窄屏 + 触控）。移动端折射开销大，默认降强度。 */
export function isMobileLike(): boolean {
  if (typeof window === 'undefined') return false;
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  const narrow = Math.min(window.innerWidth, window.innerHeight) <= 820;
  return coarse && narrow;
}

/**
 * 设备是否真的弱到跑不动折射。
 *
 * ⚠️ 这里曾经写 `cores <= 4`，结果 4 核台式机被误判为低端、
 * 折射被静默关闭，表现为"液态和毛玻璃像素完全一致"。
 * 修正为：只在移动端形态下判断，且阈值压到真正的低端（≤2 核 / ≤2GB）。
 */
export function isLowEndDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  if (!isMobileLike()) return false; // 桌面一律不降级
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  const cores = navigator.hardwareConcurrency ?? 8;
  if (typeof mem === 'number' && mem > 0 && mem <= 2) return true;
  return cores <= 2;
}

/**
 * 探测折射能力。
 * 注意：CSS.supports('backdrop-filter','url(#x)') 会撒谎 —— Firefox 解析通过但不渲染。
 * 所以改用 Chromium 品牌嗅探 + backdrop-filter 基础能力双重判断。
 */
export function detectGlassTier(): GlassTier {
  if (cachedTier !== null) return cachedTier;
  if (typeof window === 'undefined') return (cachedTier = 2);

  const hasBackdrop =
    CSS.supports('backdrop-filter', 'blur(1px)') ||
    CSS.supports('-webkit-backdrop-filter', 'blur(1px)');
  if (!hasBackdrop) return (cachedTier = 1);

  const ua = navigator.userAgent;
  // Chromium 系：Chrome / Edge / Samsung Internet / Android WebView / Opera
  const isChromium =
    /Chrome\/|Chromium\/|Edg\/|SamsungBrowser\/|OPR\//.test(ua) &&
    !/Firefox\/|FxiOS\//.test(ua);
  // iOS 上所有浏览器都是 WebKit，即便 UA 带 Chrome 字样（CriOS）
  const isWebKitOnly =
    /iPhone|iPad|iPod/.test(ua) || (/Safari\//.test(ua) && !/Chrome\//.test(ua));

  if (isChromium && !isWebKitOnly) {
    // 低端机即使支持，也不跑折射 —— 一帧一帧重算位移图会直接拖到 30fps 以下
    if (isLowEndDevice()) return (cachedTier = 2);
    return (cachedTier = 3);
  }
  return (cachedTier = 2);
}

/* ------------------------------------------------------------ 过滤器容器 */

const FILTER_PREFIX = 'lb-lg';

/**
 * 液态玻璃面板。
 * 会测量自身尺寸、生成位移图、注入 SVG filter，然后把 backdrop-filter 指过去。
 */
export function LiquidGlass({
  children,
  className,
  radius = 16,
  bezel = 22,
  strength = 18,
  blur = 12,
  tint = 'rgba(255,255,255,0.14)',
  tintDark = 'rgba(255,255,255,0.08)',
  // specular 保留兼容；高光已改为元素自身背景，恒开启
  specular: _specular = true,
  enabled = true,
  as: Tag = 'div',
  ...rest
}: {
  children?: ReactNode;
  className?: string;
  radius?: number;
  bezel?: number;
  strength?: number;
  blur?: number;
  tint?: string;
  tintDark?: string;
  specular?: boolean;
  enabled?: boolean;
  as?: 'div' | 'section' | 'aside' | 'header' | 'article';
} & React.HTMLAttributes<HTMLElement>) {
  const ref = useRef<HTMLDivElement>(null);
  const [id] = useState(
    () => `${FILTER_PREFIX}-${Math.random().toString(36).slice(2, 9)}`,
  );
  const [mapUrl, setMapUrl] = useState('');
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [tier, setTier] = useState<GlassTier>(2);

  useEffect(() => {
    setTier(enabled ? detectGlassTier() : 1);
  }, [enabled]);

  // 测量 + 生成位移图（尺寸变化时重算，带防抖）
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || tier !== 3) return;

    let timer = 0;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      const w = Math.round(rect.width);
      const h = Math.round(rect.height);
      if (w < 4 || h < 4) return;
      if (w === size.w && h === size.h) return;
      setSize({ w, h });
      setMapUrl(buildDisplacementMap(w, h, radius, bezel, strength));
    };

    const ro = new ResizeObserver(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(measure, 120);
    });
    ro.observe(el);
    measure();

    return () => {
      ro.disconnect();
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tier, radius, bezel, strength]);

  const useRefraction = tier === 3 && mapUrl && size.w > 0;

  const style: React.CSSProperties & Record<string, string> = {
    borderRadius: `${radius}px`,
    '--lb-tint': tint,
    '--lb-tint-dark': tintDark,
    ...(useRefraction
      ? {
          // ⚠️ 顺序必须是 blur → url(...)。
          // 写成 url(...) → blur 会把位移结果再模糊一遍，折射被完全抹平（实测与纯毛玻璃像素完全一致）。
          backdropFilter: `blur(${blur}px) url(#${id}) saturate(180%)`,
          WebkitBackdropFilter: `blur(${blur}px) saturate(180%)`,
        }
      : tier === 2
        ? {
            backdropFilter: `blur(${blur}px) saturate(180%)`,
            WebkitBackdropFilter: `blur(${blur}px) saturate(180%)`,
          }
        : {}),
  };

  return (
    <>
      {useRefraction && (
        <svg
          aria-hidden="true"
          width="0"
          height="0"
          style={{ position: 'absolute', pointerEvents: 'none' }}
        >
          <defs>
            <filter
              id={id}
              x="0"
              y="0"
              width={size.w}
              height={size.h}
              filterUnits="userSpaceOnUse"
              primitiveUnits="userSpaceOnUse"
              colorInterpolationFilters="sRGB"
            >
              <feImage
                href={mapUrl}
                x="0"
                y="0"
                width={size.w}
                height={size.h}
                preserveAspectRatio="none"
                result="map"
              />
              <feDisplacementMap
                in="SourceGraphic"
                in2="map"
                scale={255}
                xChannelSelector="R"
                yChannelSelector="G"
              />
            </filter>
          </defs>
        </svg>
      )}

      <Tag
        ref={ref as never}
        data-glass-tier={tier}
        className={['lb-liquid', className ?? ''].filter(Boolean).join(' ')}
        style={style}
        {...(rest as object)}
      >
        {children}
      </Tag>
    </>
  );
}

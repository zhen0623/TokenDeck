import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

export type ThemeMode = 'light' | 'dark' | 'system';
export type FontScale = 0 | 1 | 2;
export type GlassMode = 'off' | 'frosted' | 'liquid';

interface ThemeState {
  theme: ThemeMode;
  resolved: 'light' | 'dark';
  /** @deprecated 兼容旧调用，等价于 glassMode !== 'off' */
  glass: boolean;
  glassMode: GlassMode;
  fontScale: FontScale;
  setTheme: (t: ThemeMode) => void;
  setGlass: (v: boolean) => void;
  setGlassMode: (v: GlassMode) => void;
  setFontScale: (v: FontScale) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeState | null>(null);

const KEY_THEME = 'lb-theme';
const KEY_GLASS_MODE = 'lb-glass-mode';
const KEY_GLASS = 'lb-glass'; // 旧键，仅用于迁移
const KEY_FS = 'lb-fs';

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

function apply(theme: ThemeMode, glassMode: GlassMode, fontScale: FontScale) {
  const el = document.documentElement;
  const dark =
    theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  el.classList.toggle('dark', dark);
  el.classList.toggle('glass', glassMode !== 'off');
  el.classList.toggle('liquid', glassMode === 'liquid');
  el.style.setProperty('--font-size-offset', `${fontScale}px`);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>(() => read(KEY_THEME, 'system'));
  const [glassMode, setGlassModeState] = useState<GlassMode>(() => {
    const stored = read<string | null>(KEY_GLASS_MODE, null);
    if (stored === 'off' || stored === 'frosted' || stored === 'liquid') return stored;
    // 旧键迁移：老版本只存过 on/off
    if (read(KEY_GLASS, false)) return 'frosted';
    // 新装默认开液态玻璃 —— detectGlassTier 会按设备能力自动降级，
    // 所以默认 liquid 在弱机上不会掉帧，只会退到 frosted / 纯半透明。
    return 'liquid';
  });
  const [fontScale, setFontScaleState] = useState<FontScale>(() => read(KEY_FS, 0));
  const [resolved, setResolved] = useState<'light' | 'dark'>('light');

  const syncResolved = () => {
    const dark =
      theme === 'dark' ||
      (theme === 'system' &&
        window.matchMedia('(prefers-color-scheme: dark)').matches);
    setResolved(dark ? 'dark' : 'light');
  };

  useEffect(() => {
    apply(theme, glassMode, fontScale);
    syncResolved();
    localStorage.setItem(KEY_THEME, JSON.stringify(theme));
    localStorage.setItem(KEY_GLASS_MODE, JSON.stringify(glassMode));
    localStorage.setItem(KEY_FS, JSON.stringify(fontScale));
  }, [theme, glassMode, fontScale]);

  // 跟随系统主题变化
  useEffect(() => {
    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      apply(theme, glassMode, fontScale);
      syncResolved();
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [theme, glassMode, fontScale]);

  const value: ThemeState = {
    theme,
    resolved,
    glass: glassMode !== 'off',
    glassMode,
    fontScale,
    setTheme: setThemeState,
    setGlass: (v: boolean) => setGlassModeState(v ? 'frosted' : 'off'),
    setGlassMode: setGlassModeState,
    setFontScale: setFontScaleState,
    toggleTheme: () => setThemeState(resolved === 'dark' ? 'light' : 'dark'),
  };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme 必须在 ThemeProvider 内使用');
  return ctx;
}

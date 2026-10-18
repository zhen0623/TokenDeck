import { useRef, useState } from 'react';
import {
  Download,
  Upload,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  ShieldAlert,
  RotateCcw,
} from 'lucide-react';
import { useTheme, type FontScale, type GlassMode, type ThemeMode } from './theme';
import { Button, Segmented, cx } from './ui';
import { Section, Field } from './settings-ui';
import { detectGlassTier } from './liquid-glass';
import { APP_VERSION } from './version';
import { hasNativeBridge, saveTextFile, pickTextFile } from './native';
import { useRefresh, REFRESH_OPTIONS, fmtCountdown } from './refresh';
import {
  buildConfig,
  configFileName,
  parseConfig,
  applyConfig,
  type ConfigFile,
} from './config';

type IoState =
  | { kind: 'idle' }
  | { kind: 'busy'; what: 'export' | 'import' }
  | { kind: 'ok'; message: string }
  | { kind: 'fail'; message: string };

export function SystemSettingsPage() {
  const { theme, setTheme, glassMode, setGlassMode, fontScale, setFontScale } = useTheme();
  const { interval, setInterval: setIntervalValue, countdown, lastAt } = useRefresh();
  const tier = detectGlassTier();

  const [includeKeys, setIncludeKeys] = useState(true);
  const [includeSettings, setIncludeSettings] = useState(true);
  const [io, setIo] = useState<IoState>({ kind: 'idle' });
  const [pendingImport, setPendingImport] = useState<ConfigFile | null>(null);
  const [replaceKeys, setReplaceKeys] = useState(false);
  const backupRef = useRef<ConfigFile | null>(null);

  /* ------------------------------------------------------------ 导出 */

  const doExport = async () => {
    setIo({ kind: 'busy', what: 'export' });
    const cfg = buildConfig({ includeKeys, includeSettings, appVersion: APP_VERSION });
    const name = configFileName(APP_VERSION);
    const res = await saveTextFile(name, JSON.stringify(cfg, null, 2));
    setIo({ kind: res.ok ? 'ok' : 'fail', message: res.ok ? res.message : res.message });
  };

  /* ------------------------------------------------------------ 导入 */

  const doPick = async () => {
    setIo({ kind: 'busy', what: 'import' });
    const { text, cancelled } = await pickTextFile();
    if (cancelled || text === null) {
      setIo({ kind: 'idle' });
      return;
    }
    const parsed = parseConfig(text);
    if (!parsed.ok) {
      setIo({ kind: 'fail', message: parsed.error });
      return;
    }
    setPendingImport(parsed.cfg);
    setIo({ kind: 'idle' });
  };

  const doApply = () => {
    if (!pendingImport) return;
    const result = applyConfig(pendingImport, APP_VERSION, { replaceKeys });
    backupRef.current = result.backup ?? null;
    setPendingImport(null);
    setIo({ kind: 'ok', message: result.message });
    // 外观/刷新设置需要重新读，最简单可靠的方式是刷新页面
    window.setTimeout(() => window.location.reload(), 1200);
  };

  /* ------------------------------------------------------------ 渲染 */

  return (
    <div className="lb-enter space-y-[var(--gap-grid)] p-[var(--pad-page)]">
      <Section title="外观" desc="主题、材质与字号。设置立即生效并保存在本机。">
        <div className="divide-y divide-[var(--border-muted)]">
          <Field label="主题" hint="暗色 / 亮色 / 跟随系统">
            <Segmented<ThemeMode>
              value={theme}
              onChange={setTheme}
              options={[
                { value: 'light', label: '亮色' },
                { value: 'dark', label: '暗色' },
                { value: 'system', label: '系统' },
              ]}
            />
          </Field>
          <Field
            label="材质"
            hint={tier === 3 ? '液态：折射 + 高光（本机支持）' : '本机不支持折射，液态退化为毛玻璃'}
          >
            <Segmented<GlassMode>
              value={glassMode}
              onChange={setGlassMode}
              options={[
                { value: 'off', label: '纯色' },
                { value: 'frosted', label: '毛玻璃' },
                { value: 'liquid', label: '液态' },
              ]}
            />
          </Field>
          <Field label="字号" hint="全站 em 基准">
            <Segmented<FontScale>
              value={fontScale}
              onChange={setFontScale}
              options={[
                { value: 0, label: '标准' },
                { value: 1, label: '中' },
                { value: 2, label: '大' },
              ]}
            />
          </Field>
        </div>
      </Section>

      {/* ---------------------------------------------------- 自动刷新 */}
      <Section
        title="自动刷新"
        desc="按固定间隔重新读取数据，避免看到过期数字。"
        right={
          interval > 0 && countdown !== null ? (
            <span className="shrink-0 text-[0.76em] tabular-nums text-[var(--text-faint)]">
              {fmtCountdown(countdown)} 后
            </span>
          ) : undefined
        }
      >
        <div className="flex flex-wrap gap-[var(--sp-1)]">
          {REFRESH_OPTIONS.map((o) => (
            <button
              key={o.value}
              onClick={() => setIntervalValue(o.value)}
              className={cx(
                'rounded-[var(--radius-btn)] px-[var(--sp-2)] py-[0.32em] text-[0.84em] transition-colors',
                interval === o.value
                  ? 'bg-[var(--brand-green-10)] font-medium text-[var(--brand-green-text)]'
                  : 'text-[var(--text-muted)] hover:bg-[var(--bg-hover)]',
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
        <p className="mt-[var(--sp-2)] text-[0.76em] leading-relaxed text-[var(--text-faint)]">
          {interval > 0
            ? `每 ${interval} 分钟自动刷新一次，顶部标题旁显示倒计时。`
            : '已关闭自动刷新，只能手动点右上角刷新。'}
          <span className="ml-[0.4em]">
            上次刷新 {new Date(lastAt).toLocaleTimeString('zh-CN', { hour12: false })}
          </span>
        </p>
      </Section>

      {/* ------------------------------------------------ 配置导入导出 */}
      <Section
        title="配置导入导出"
        desc="把厂商 Key 与自定义端点打包成 JSON，在另一台设备导入。"
      >
        <div className="space-y-[var(--sp-2)]">
          {/* 导出 */}
          <div className="rounded-[var(--radius-btn)] bg-[var(--bg-hover)] p-[var(--sp-3)]">
            <div className="mb-[var(--sp-2)] text-[0.88em] font-medium text-[var(--text-primary)]">
              导出配置
            </div>
            <div className="space-y-[var(--sp-1)]">
              <label className="flex cursor-pointer items-center gap-[var(--sp-2)] text-[0.84em] text-[var(--text-secondary)]">
                <input
                  type="checkbox"
                  checked={includeKeys}
                  onChange={(e) => setIncludeKeys(e.target.checked)}
                  className="h-[1em] w-[1em] accent-[var(--brand-green)]"
                />
                包含 API Key（导出文件为明文）
              </label>
              <label className="flex cursor-pointer items-center gap-[var(--sp-2)] text-[0.84em] text-[var(--text-secondary)]">
                <input
                  type="checkbox"
                  checked={includeSettings}
                  onChange={(e) => setIncludeSettings(e.target.checked)}
                  className="h-[1em] w-[1em] accent-[var(--brand-green)]"
                />
                包含外观与刷新设置
              </label>
            </div>

            {includeKeys && (
              <div className="mt-[var(--sp-2)] flex items-start gap-[0.35em] rounded-[0.4em] border border-[var(--color-warning)] px-[var(--sp-2)] py-[0.4em]">
                <ShieldAlert size="0.9em" className="mt-[0.15em] shrink-0 text-[var(--color-warning)]" />
                <span className="text-[0.76em] leading-relaxed text-[var(--text-muted)]">
                  导出的 JSON 含明文 Key。请勿分享到聊天或云盘，导入完成后建议删除该文件。
                </span>
              </div>
            )}

            <div className="mt-[var(--sp-2)]">
              <Button
                variant="primary"
                size="sm"
                disabled={io.kind === 'busy'}
                onClick={doExport}
                icon={
                  io.kind === 'busy' && io.what === 'export' ? (
                    <Loader2 size="0.9em" className="animate-spin" />
                  ) : (
                    <Download size="0.9em" />
                  )
                }
              >
                导出 JSON
              </Button>
            </div>
          </div>

          {/* 导入 */}
          <div className="rounded-[var(--radius-btn)] bg-[var(--bg-hover)] p-[var(--sp-3)]">
            <div className="mb-[var(--sp-2)] text-[0.88em] font-medium text-[var(--text-primary)]">
              导入配置
            </div>

            {!pendingImport ? (
              <Button
                variant="secondary"
                size="sm"
                disabled={io.kind === 'busy'}
                onClick={doPick}
                icon={
                  io.kind === 'busy' && io.what === 'import' ? (
                    <Loader2 size="0.9em" className="animate-spin" />
                  ) : (
                    <Upload size="0.9em" />
                  )
                }
              >
                选择 JSON 文件
              </Button>
            ) : (
              <div className="space-y-[var(--sp-2)]">
                <div className="rounded-[0.4em] border border-[var(--border-color)] px-[var(--sp-2)] py-[var(--sp-2)] text-[0.82em] leading-relaxed text-[var(--text-secondary)]">
                  <div>
                    文件含 <strong className="text-[var(--text-primary)]">{Object.keys(pendingImport.keys).length}</strong> 个 Key、
                    <strong className="text-[var(--text-primary)]">{pendingImport.customProviders.length}</strong> 个自定义厂商
                    {pendingImport.settings ? '，以及外观与刷新设置' : ''}。
                  </div>
                  {pendingImport.exportedAt && (
                    <div className="mt-[0.2em] text-[0.92em] text-[var(--text-faint)]">
                      导出于 {new Date(pendingImport.exportedAt).toLocaleString('zh-CN')}
                      {pendingImport.appVersion ? ` · v${pendingImport.appVersion}` : ''}
                    </div>
                  )}
                </div>

                <label className="flex cursor-pointer items-center gap-[var(--sp-2)] text-[0.84em] text-[var(--text-secondary)]">
                  <input
                    type="checkbox"
                    checked={replaceKeys}
                    onChange={(e) => setReplaceKeys(e.target.checked)}
                    className="h-[1em] w-[1em] accent-[var(--brand-green)]"
                  />
                  清空本机已有 Key，只用文件里的
                </label>

                <div className="flex flex-wrap gap-[var(--sp-1)]">
                  <Button variant="primary" size="sm" onClick={doApply}>
                    确认导入
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => setPendingImport(null)}>
                    取消
                  </Button>
                </div>
              </div>
            )}

            <p className="mt-[var(--sp-2)] text-[0.74em] leading-relaxed text-[var(--text-faint)]">
              {replaceKeys
                ? '将用文件内容替换本机 Key。'
                : '默认合并：同名厂商以文件为准，本机独有的配置保留。'}
            </p>
          </div>

          {/* 结果 */}
          {io.kind === 'ok' && (
            <div className="flex items-start gap-[0.35em] text-[0.82em] leading-relaxed text-[var(--brand-green-text)]">
              <CheckCircle2 size="0.9em" className="mt-[0.15em] shrink-0" />
              <span>{io.message}</span>
            </div>
          )}
          {io.kind === 'fail' && (
            <div className="flex items-start gap-[0.35em] text-[0.82em] leading-relaxed text-[var(--color-danger)]">
              <AlertTriangle size="0.9em" className="mt-[0.15em] shrink-0" />
              <span>{io.message}</span>
            </div>
          )}
          {backupRef.current && (
            <button
              onClick={() => {
                const b = backupRef.current;
                if (!b) return;
                applyConfig(b, APP_VERSION, { replaceKeys: true });
                setIo({ kind: 'ok', message: '已恢复导入前的配置' });
                window.setTimeout(() => window.location.reload(), 900);
              }}
              className="inline-flex items-center gap-[0.25em] text-[0.78em] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            >
              <RotateCcw size="0.85em" />
              撤销本次导入
            </button>
          )}
        </div>
      </Section>

      <Section title="关于">
        <div className="divide-y divide-[var(--border-muted)]">
          <Field label="版本" hint="覆盖安装不会丢失已配置的 Key">
            <span className="text-[0.86em] tabular-nums text-[var(--text-secondary)]">
              v{APP_VERSION}
            </span>
          </Field>
          <Field label="运行环境" hint="Key 请求经原生通道发出，避开浏览器 CORS">
            <span className="text-[0.86em] text-[var(--text-secondary)]">
              {hasNativeBridge() ? 'Android App · 原生通道已连接' : '浏览器模式'}
            </span>
          </Field>
          <Field label="玻璃层级" hint="决定材质退化到哪一级">
            <span className="text-[0.86em] tabular-nums text-[var(--text-secondary)]">
              tier {tier}
            </span>
          </Field>
        </div>
      </Section>
    </div>
  );
}

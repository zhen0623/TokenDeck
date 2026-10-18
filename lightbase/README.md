# LightBase · 前端模板

一套**纯前端**的 React 模板，视觉规范完整移植自 [Chunyu33/light-c](https://github.com/Chunyu33/light-c)。
**不含 Rust / Tauri，纯浏览器运行**，拿去直接往里填业务功能即可。

---

## 快速开始

```bash
cd ~/.openclaw/workspace/apps/lightbase
npm run dev
# 打开 http://127.0.0.1:5299/
```

首次使用需要装依赖（已装好，跳过）：

```bash
npm install
```

## 构建产物

```bash
npm run build      # 输出到 dist/
npm run preview    # 本地预览构建结果
```

`dist/` 是纯静态文件，扔到任何静态服务器 / Nginx / GitHub Pages 都能跑。

---

## 技术栈

| 项 | 版本 |
|---|---|
| React | 19 |
| TypeScript | 5.x |
| Vite | 7 |
| Tailwind CSS | 4（`@tailwindcss/vite` 插件，无需 config 文件）|
| lucide-react | 图标 |

> 注意：`@vitejs/plugin-react` 必须用 **v5**，v6 要求 Vite 8，会和 Vite 7 冲突。

---

## 文件结构

```
apps/lightbase/
├── index.html          首帧主题注入（防闪白）+ URL 参数
├── vite.config.ts
├── src/
│   ├── main.tsx        入口
│   ├── styles.css      ★ 全部设计 token + 玻璃态 + 动效
│   ├── theme.tsx       主题/玻璃/字号 状态管理（localStorage 持久化）
│   ├── ui.tsx          ★ 基础组件：Button/Switch/Card/Badge/Progress/Segmented/Row
│   └── App.tsx         示例界面：侧边栏 + 顶栏 + 仪表盘
├── audit.mjs           WCAG 对比度自动审计脚本
└── public/logo.svg
```

---

## 三种可切换能力（右上角）

| 能力 | 说明 |
|---|---|
| **主题** | 亮色 / 暗色 / 跟随系统，自动持久化 |
| **玻璃态** | 毛玻璃 + 极光背景，可与亮暗任意组合 |
| **字号** | 标准 / 中 / 大 三档，`--font-size-offset: 0/1/2px` |

### URL 直接预览（开发用）

```
http://127.0.0.1:5299/?theme=dark
http://127.0.0.1:5299/?theme=light&glass=1
http://127.0.0.1:5299/?theme=dark&glass=1&fs=2
```

---

## 核心机制：em 驱动尺寸

这是整套设计最值得学的地方。

```css
html { font-size: calc(14px + var(--font-size-offset)); }
```

所有圆角、间距、控件尺寸全部用 `em`：

```css
--radius-sm:   0.6em;
--radius-btn:  0.65em;
--radius-card: 0.8em;
```

**效果**：字号切到"大"档，圆角、开关、内边距**同步等比放大**，不用改任何组件代码。

⚠️ 唯一的例外：`Progress` 进度条高度用了固定 `6px`，因为细条在 em 缩放下会变粗得很奇怪。

---

## 配色速查

| 用途 | 亮色 | 暗色 |
|---|---|---|
| 品牌绿（背景/按钮） | `#07C160` | `#06AD56` |
| **品牌绿（文字用）** | `#067A3E` | `#3DDC84` |
| 主背景 | `#F5F5F5` | `#111111` |
| 卡片 | `#FFFFFF` | `#191919` |
| 主文字 | `#1A1A1A` | `#E8E8E8` |
| 次要文字 | `#3D3D3D` | `#C2C2C2` |
| 辅助文字 | `#6B6B6B` | `#A0A0A0` |
| 最淡文字 | `#6E6E73` | `#858585` |
| 边框 | `#EDEDED` | `#2C2C2C` |
| 进度条轨道 | `#E6E6E6` | `#333333` |
| 成功 / 警告 / 危险 | `#07C160` / `#FA9D3B` / `#FA5151` | `#06AD56` / `#E08A30` / `#E04545` |

### ⚠️ 一个关键坑：品牌绿分两种

`#07C160` 在白色背景上对比度只有 **2.0:1**，远低于 WCAG AA 的 4.5:1 —— **不能直接当正文文字色**。

所以分成两个 token：

- `--brand-green` → **背景、按钮填充、进度条**（白字压在上面没问题）
- `--brand-green-text` → **文字、图标、选中态**（亮色 `#067A3E` / 暗色 `#3DDC84`）

原版 light-c 没分这个，直接拿 `--brand-green` 当文字色，实测对比度不达标。这里做了修正。

---

## 对比度审计

```bash
# 需要先起一个带调试端口的 Chrome
chrome --headless=new --no-sandbox \
  --remote-debugging-port=9223 \
  --user-data-dir=/tmp/cp about:blank &

WS=$(curl -s http://127.0.0.1:9223/json/version | python3 -c "import json,sys;print(json.load(sys.stdin)['webSocketDebuggerUrl'])")
node audit.mjs "$WS"
```

**当前状态：40 项检查全部 PASS**（4 种主题组合 × 10 个文字层级）。

审计会真实计算半透明层叠加后的有效背景色，再套 WCAG 公式 —— 不是靠肉眼。

---

## 怎么往里加功能

### 加一个页面

在 `App.tsx` 的 `NAV` 数组里加一项，再在 `<main>` 里加分支：

```tsx
const NAV = [
  { id: 'dashboard', label: '仪表盘', icon: LayoutDashboard },
  { id: 'myfeature', label: '我的功能', icon: Star },   // ← 新增
];
```

### 用现成组件

```tsx
import { Button, Switch, Card, Badge, Progress, Segmented, Row } from './ui';

<Card>
  <Button variant="primary" icon={<Zap size="1em" />}>一键执行</Button>
  <Switch checked={on} onChange={setOn} label="开关" />
  <Progress value={62} label="进度" />
  <Badge tone="success">已完成</Badge>
</Card>
```

### 加调色

只改 `src/styles.css` 里的 token，组件里写 `bg-[var(--xxx)]`，主题切换自动生效，**不要硬编码颜色**。

---

## 已内置

- ✅ 亮/暗/跟随系统 三态主题，localStorage 持久化，首帧注入防闪白
- ✅ 玻璃态（毛玻璃 + 极光背景），可独立开关
- ✅ 三档字号，全站 em 等比缩放
- ✅ 完整基础组件库（7 个）
- ✅ `prefers-reduced-motion` 无障碍支持
- ✅ 统一 `focus-visible` 焦点环
- ✅ 自定义滚动条（亮暗双套）
- ✅ 示例仪表盘（健康环 SVG、模块卡、进度列表）

## 未包含

- ❌ 路由（需要的话装 `react-router`，或直接像 `App.tsx` 那样用 state 切换）
- ❌ 数据请求层（按你的后端自己接）
- ❌ 国际化（原版用 i18next，需要可加）

---

## 截图

`~/.openclaw/workspace/tmp/shots/` 下：
- `final-light.png` / `final-dark.png`
- `final-glass.png` / `final-glass-dark.png`
- `final-big.png`（大字号）

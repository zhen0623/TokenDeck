# TokenDeck

用量看板：一份 React 前端 + 一个 Android WebView 外壳。

```
apps/
├── lightbase/           前端（React 19 + Vite 7 + Tailwind 4）
└── tokendeck-android/   Android 壳（Kotlin，WebView + 原生桥）
```

前端不依赖原生：`dist/` 可直接扔到任意静态服务器；安卓壳把同一份 `dist/`
打进 `assets/`，用 `WebViewAssetLoader` 以 https 源提供，保证 localStorage
与同源策略行为跟真实站点一致。

---

## 快速开始

### 前端

```bash
cd lightbase
npm install
npm run dev        # http://127.0.0.1:5299/
npm run build      # 输出 dist/
```

### 安卓

构建前需要 JDK 17 与 Android SDK（compileSdk 34）。`build.sh` 会从
`tools/` 下取便携工具链：

```bash
cd tokendeck-android
ln -s /path/to/your/jdk-and-sdk tools    # 指向自己的工具链目录
./build.sh :app:assembleRelease
# 产物 app/build/outputs/apk/release/app-release.apk
```

`local.properties` 与 `tools/` 都是本机路径，**不入库**，换机器需自行重建：

```properties
# local.properties
sdk.dir=/absolute/path/to/android-sdk
```

### 把前端放进安卓壳

```bash
cd lightbase && npm run build
rm -rf ../tokendeck-android/app/src/main/assets/*
cp -r dist/* ../tokendeck-android/app/src/main/assets/
```

---

## 发版约定

版本号有两处，必须同时改，且 `versionCode` 只能递增（覆盖安装才会保留数据）：

| 位置 | 字段 |
|---|---|
| `lightbase/src/version.ts` | `APP_VERSION` |
| `tokendeck-android/app/build.gradle` | `versionCode` / `versionName` |

当前 `0.8.8` / `versionCode 22`。

release 复用 debug 签名（侧载场景，不管理私钥）；开启
`minifyEnabled` + `shrinkResources`，把体积压到 5M 以下以便通过聊天软件传输。

---

## 数据与隐私

- API Key 只存本机 `localStorage`（键名 `lb-api-keys`），不上传任何服务器。
- 仓库内不含密钥、签名私钥、`.env`；`local.properties` 与调试脚本已忽略。
- 界面文案必须与实际状态一致：未配置 Key 就显示"未配置"，不摆假数据。

---

## 视觉规范

组件不硬编码颜色，只用 `src/styles.css` 里的 token；间距走 8pt 网格
（`--sp-1..6` = 4/8/12/16/20/24px）。

手机端底部 dock 的几个约束，改动时别破坏：

- 宽度是视口的 `55%`，居中；用百分比而非 em 内缩，才能在各档屏宽下保持同一比例。
- 两端必须是半圆：`rounded-full` 的 999px 会被浏览器夹到高度的一半。
- `env(safe-area-inset-bottom)` **全项目只允许出现一次**。定位时消费过就不要再写进
  `padding`，否则真机上安全区被算两遍，dock 会莫名变高。
- 改完 dock 的 `py`，必须同步 `--dock-h`（现值 `4.92em` = dock 高 61.8 + 离底 7），
  否则底部会空出一条白条，或反过来遮住最后一屏。
- 不要在 `.lb-dock` 上写 `padding-bottom`：会覆盖 Tailwind 的 `py`，导致上下留白
  不对称（历史 bug：上 11.48 / 下 5.19，内容整体下沉）。

---

## 目录

```
lightbase/src/
├── App.tsx             路由与外壳、TopBar / Sidebar / BottomDock
├── data.ts             用量数据结构
├── config.ts           provider 配置与校验
├── settings.ts         设置项与持久化
├── native.ts           原生桥封装（网页单独运行时自动降级）
├── liquid-glass.tsx    液态玻璃材质
├── charts.tsx          图表
├── ProvidersPage.tsx   平台页
├── BillingDetail.tsx   账单明细
├── SystemSettingsPage.tsx
└── styles.css          全部设计 token
```

# 译伴 BuddyTrans

> 一款灰黑白单色、圆润极简的浏览器翻译扩展。支持整页双语对照、划词浮层、输入框翻译与侧边栏工作台，内置本地模型 / 免费通道 / BYOK 三条翻译链路。

基于 Manifest V3，适用于 Chrome 与 Edge（Chromium 110+）。

---

## 特性

- **整页翻译**：视口懒加载翻译，批量合并请求，支持「双语对照 / 仅译文 / 仅原文」三种展示模式。
- **划词浮层**：选中网页文字即出现克制的胶囊触发器，展开为圆角翻译卡片，支持复制与重试。
- **输入框翻译**：Popup 内直接输入文本翻译，带字数统计、清空、Ctrl/⌘ + Enter 快捷提交。
- **侧边栏工作台**：Chrome Side Panel 内长文本对照阅读，与 Popup 共享同一套设计系统。
- **三条翻译通道**：本地模型（Ollama / LM Studio）→ 免费中继通道 → BYOK 自定义 API，自动降级。
- **术语表与上下文**：支持 `原文=>译文` 术语强制映射，可携带上下文提升长文连贯性。
- **历史记录**：本地保存最近 100 条翻译，支持回填、复制、单条删除与清空。
- **深色模式**：跟随系统，或手动切换浅色 / 深色，三端主题实时同步。
- **完全本地**：无遥测、无账号、无数据上报，设置与历史仅存于浏览器本地存储。

## 界面

| 界面 | 说明 |
| --- | --- |
| Popup 弹窗 | 360×520，语言栏 + 输入区 + 唯一主按钮 + 结果区 + 整页翻译快捷条 |
| 侧边栏 | 自适应宽度，适合长文对照阅读与历史浏览 |
| 网页内浮层 | 划词胶囊、翻译卡片、内联译文、状态提示，全部 Shadow DOM 隔离 |

所有界面遵循同一套设计 token：页面底 `#F7F7F7`、卡片 `#FFFFFF`、主文字 `#111111`、边框 `#E5E5E5`；深色模式底 `#0F0F0F`、卡片 `#1A1A1A`、文字 `#F5F5F5`。**不使用任何彩色强调色**，层级完全由灰度、透明度与 1px 细边框表达。

字体：英文与数字使用 [Quicksand](https://fonts.google.com/specimen/Quicksand)，中文使用 [Resource Han Rounded CN](https://github.com/CyanoHao/Resource-Han-Rounded)，均已子集化并本地打包，无需联网加载。

## 安装

本项目未上架应用商店，通过开发者模式加载：

1. 下载仓库并解压（或直接克隆）。
2. Chrome 打开 `chrome://extensions`，Edge 打开 `edge://extensions`。
3. 打开「开发者模式 / 开发人员模式」。
4. 点击「加载已解压的扩展程序」，选择 **`chrome-mv3`** 目录（能看到 `manifest.json` 的那一层）。
5. 首次使用整页翻译时，允许扩展「访问所有网站」的权限。

也可以直接使用 `chrome-mv3` 目录，无需构建。

## 使用

| 操作 | 方式 |
| --- | --- |
| 打开翻译面板 | 点击工具栏扩展图标 |
| 打开侧边栏 | 右键扩展图标 →「在边栏中显示」，或 Popup 内点击侧边栏按钮 |
| 划词翻译 | 在网页中选中文字 |
| 开关整页翻译 | `Alt + T` |
| 切换展示模式 | `Alt + M`（双语 / 仅译文 / 仅原文） |
| 快捷提交翻译 | `Ctrl + Enter` / `⌘ + Enter` |

快捷键如未生效，可在 `chrome://extensions/shortcuts` 中查看或重新绑定。

## 翻译通道配置

打开 Popup 右上角设置，任选一条通道并「测试连接」：

1. **本地模型**：默认 `http://127.0.0.1:11434/v1`，适用于 Ollama、LM Studio 等兼容 OpenAI 接口的本地服务，可一键拉取模型列表。
2. **免费通道**：默认为占位地址，需自行替换为可用的 OpenAI 兼容端点。
3. **BYOK**：填入任意 OpenAI 兼容服务的 `Base URL`、`API Key` 与模型名，例如 DeepSeek、Moonshot、OpenAI 等。

三条通道按「本地 → 免费 → BYOK」顺序自动降级，可在设置中关闭自动回退。

## 从源码构建

源码位于 `chrome-mv3-src/`，使用 React + Tailwind CSS + esbuild，无打包器配置负担。

```bash
cd chrome-mv3-src
npm install

# 构建 Popup 与侧边栏脚本
npx esbuild src/popup.jsx --bundle --outfile=../chrome-mv3/chunks/popup-app.js \
  --loader:.jsx=jsx --jsx=automatic --minify --target=chrome110
npx esbuild src/sidepanel.jsx --bundle --outfile=../chrome-mv3/chunks/sidepanel-app.js \
  --loader:.jsx=jsx --jsx=automatic --minify --target=chrome110

# 生成 Tailwind 样式
npx tailwindcss -c tailwind.config.js -i src/app.css -o ../chrome-mv3/app.css --minify
```

构建完成后回到扩展管理页点击刷新按钮即可生效。

本地预览（带 `chrome` API 桩，无需加载扩展）：

```bash
# 在仓库根目录
python -m http.server 8931
# 浏览器打开 http://127.0.0.1:8931/chrome-mv3-src/preview.html
# 深色模式加参数：?theme=dark
```

## 目录结构

```
.
├── chrome-mv3/               # 构建产物，可直接加载到浏览器
│   ├── manifest.json         # MV3 清单
│   ├── popup.html            # 弹窗入口
│   ├── sidepanel.html        # 侧边栏入口
│   ├── background.js         # Service Worker：翻译管线、缓存、历史、主题
│   ├── injector.js           # 内容脚本：整页翻译、划词浮层、内联译文
│   ├── app.css               # Tailwind 产物 + @font-face
│   ├── chunks/               # React 打包产物
│   └── fonts/                # 本地圆体（Quicksand + Resource Han Rounded CN）
└── chrome-mv3-src/           # 源码
    ├── src/shared.jsx        # 共享设计系统与全部视图组件
    ├── src/popup.jsx         # Popup 入口
    ├── src/sidepanel.jsx     # 侧边栏入口
    ├── src/app.css           # Tailwind 源样式与字体声明
    ├── tailwind.config.js    # 设计 token 配置
    └── preview.html          # 离线预览页
```

## 设计说明

- **圆角**：卡片 16px，按钮与输入框 10–12px。
- **间距**：4/8px 网格，常用 8 / 12 / 16 / 24px。
- **阴影**：`0 1px 2px rgba(0,0,0,.04)`，浮层 `0 8px 24px rgba(0,0,0,.08)`。
- **状态**：错误态不使用红色，改用单色警示图标 + 灰底细边框卡片 + 下划线重试按钮。
- **内联译文**：2px 灰阶左导引线 + 极淡灰底衬，在「仅译文」模式下自动融入原文排版。
- **可访问性**：全局 `:focus-visible` 2px 单色焦点环，正文对比度超过 WCAG AA，交互元素均带 `aria-label`。

## 字体授权

- Quicksand — SIL Open Font License 1.1
- Resource Han Rounded CN（源泉圆体）— SIL Open Font License 1.1

字体文件已按 GB2312 常用字集子集化，仅供本扩展界面渲染使用。

## 隐私

扩展不收集任何用户数据。翻译文本仅发送至用户自行配置的模型服务端点；设置、历史记录、缓存均保存在 `chrome.storage.local`，不会上传到任何第三方服务器。

## 许可证

[MIT](LICENSE)

# 本地访问与运行入口

本文档记录排产模型 demo / 正式版开发框架的本地入口，避免目录移动或本地端口失效后找不到访问方法。

## 当前项目位置

```text
/Users/lijiajun/Documents/GitHub/Li-Jiajun/capa. calculation/排产模型
```

关键文件：

- Demo 页面：`index.html`
- 正式版入口：`formal.html`
- 双击启动文件：`启动排产产能工具.command`（macOS）
- 开发计划：`docs/04-development-roadmap.md`
- 领域模型：`docs/01-domain-model.md`
- TypeScript 核心：`src/`
- 当前工程计划：`docs/04-development-roadmap.md`
- 历史 Cursor 任务包：`docs/08-cursor-task-packages.md`

## 推荐打开方式

Demo 页面可以直接打开 HTML 文件：

```text
/Users/lijiajun/Documents/GitHub/Li-Jiajun/capa. calculation/排产模型/index.html
```

这个 demo 当前是单文件静态页面，不依赖后台服务。直接用浏览器打开最稳定。

正式版 `formal.html` 依赖 `dist/` 下的 ES module。macOS 可双击 `启动排产产能工具.command`，由脚本构建并打开页面；关闭其终端窗口即停止服务。不要直接用 `file://` 打开正式版，否则 ES module 可能不会正常加载。

## 需要本地服务时

如果浏览器因为本地文件权限、缓存或后续模块化开发需要 HTTP 服务，可以在项目根目录运行：

```bash
cd "/Users/lijiajun/Documents/GitHub/Li-Jiajun/capa. calculation/排产模型"
npm run build
npm run serve
```

然后打开正式版：

```text
http://127.0.0.1:8785/formal.html
```

也可以打开 demo：

```text
http://127.0.0.1:8785/index.html
```

端口号不是固定业务配置。如果 `8785` 被占用，可以换成 `8786`、`8787` 等。换端口时需要手动运行 `python3 -m http.server <port> --bind 127.0.0.1`，因为 `npm run serve` 当前固定使用 `8785`。

## 端口打不开时

有时 macOS 上旧的 `python3 -m http.server` 进程还在监听端口，但浏览器访问会返回空响应。此时不要继续使用旧端口，可以停止旧进程后重新运行 `npm run serve`，也可以直接换新端口启动。

检查某个端口是否被占用：

```bash
lsof -nP -iTCP:8785 -sTCP:LISTEN
```

停止旧服务示例：

```bash
kill <PID>
```

换端口启动示例：

```bash
cd "/Users/lijiajun/Documents/GitHub/Li-Jiajun/capa. calculation/排产模型"
python3 -m http.server 8786 --bind 127.0.0.1
```

访问正式版：

```text
http://127.0.0.1:8786/formal.html
```

## 正式版开发入口

正式版优先从文档和 TypeScript 核心开始：

1. `docs/04-development-roadmap.md`
2. `docs/01-domain-model.md`
3. `docs/02-calculation-engine.md`
4. `src/domain/types.ts`
5. `src/engine/`

Demo 的 `index.html` 只用于验证早期界面和业务交互，不作为长期工程结构。正式版网页从 `formal.html` 开始，读取 `dist/` 中由 TypeScript 核心编译出的模块。

如果正式版页面出现空下拉框、route status 停在 `checking`，或页面显示“正在加载正式版脚本”，说明 `dist/ui/formal-app.js` 没有成功加载或没有从当前项目目录启动服务。处理顺序：

1. 回到项目根目录。
2. 运行 `npm run build`。
3. 确认端口没有被旧服务占用。
4. 运行 `npm run serve`。
5. 打开或强制刷新 `http://127.0.0.1:8785/formal.html`。

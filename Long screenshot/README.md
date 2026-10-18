# Long Screenshot — Phase 1 原型

本仓库当前提供 macOS 命令行拼接原型及 Phase 0 设计文档。尚无 iOS App；已测试 3 段真实 iPhone 录屏，3 段都能输出长图，仍不足以完成 Phase 1 全部验收。

## 运行

需要 Swift 5.9+、macOS 14+。合成夹具另需 Python 3、Pillow 和 ffmpeg；产品核心不依赖这两项。

```sh
swift test
python3 scripts/generate_fixture.py --output-dir /private/tmp/longshot-fixtures
swift run longshot /private/tmp/longshot-fixtures/normal-scroll.mp4 \
  --output /private/tmp/longshot-fixtures/normal-output.png \
  --report /private/tmp/longshot-fixtures/normal-report.json
# 默认宽度最多 720 px；如需保留原始分辨率，附加 --max-width 0
# 构建后也可一次运行全部端到端夹具：
python3 scripts/verify_fixtures.py --binary .build/debug/longshot
# 列出成功长图中值得优先人工核对的接缝位置（需要 Pillow）：
python3 scripts/audit_seams.py artifacts/2-诊断.json --image artifacts/2-长图.png --limit 5
# 查看器缩略显示时，生成不缩放的分页审查图：
python3 scripts/export_review_pages.py artifacts/3-动态加载实验.png \
  --output-dir artifacts/3-原像素分页
# 仅供比较的轻度锐化预览，保留原长图：
python3 scripts/enhance_review_image.py artifacts/3-动态加载实验.png \
  --output artifacts/3-清晰度增强实验.png
```

输入需为 AVFoundation 可解码的竖屏视频。宽于 720 px 的输入默认在逐帧读取后等比缩小，原视频不改动、不额外生成压缩视频；`--max-width 0` 可关闭缩小。诊断 JSON 同时记录原始与处理尺寸。缩小会损失细字和细节，且 AVFoundation 仍需解码原始帧；它主要减少后续匹配和长图画布的开销。原型逐帧做轻量变化检查，在短时间内画面变化较大时立即匹配，其他时候约每 0.2 秒匹配一次，并处理末尾帧；固定顶栏和底栏从滚动帧自动估计。支持停顿和短距离回滚。匹配不可靠时退出码为 1，并仍写出诊断 JSON；参数错误退出码为 2。输出上限暂为 20,000 px 高且画布不超过约 200 MB。

## 当前已验证

2026-10-13 在 Apple Swift 6.4 / macOS 26 的命令行环境：`swift test` 的 7 个测试通过；端到端脚本通过普通滚动、停顿回滚、30 fps 快速滚动、30 fps 慢速滚动、无固定栏、单帧遮挡和视口内图片加载 7 个成功夹具。大跳跃、大块动画、跳页、横屏、90° 旋转元数据、完全重复列表行、永久缩放和图片加载导致页面重排 8 个夹具明确拒绝。96 对位移估计的绝对误差中位数与 95 分位均为 0 px；960→720 和全尺寸处理也通过。运行环境的沙箱会使 AVFoundation 解码返回 `Cannot Decode`，端到端结果在获准的沙箱外执行。

用户提供的 41 秒、592 × 1280、30 fps HEVC 竖屏录屏已输出 592 × 8500 PNG；视觉抽查未见明显缺行或重复，诊断中 328 段匹配均通过。最终 Release 复测耗时 6.21 秒、峰值常驻内存约 94 MiB。以同一视频前 30 秒缩放制作的 1080 × 2336、30 fps 负载样本输出 1080 × 9378 PNG，耗时 12.29 秒、峰值常驻内存约 190 MiB。缩放样本只验证资源负载，不代表原生高分辨率录屏的画质验证。

同一 1080 px 负载用默认内部缩小处理后输出 720 × 6246 PNG，耗时 8.29 秒、峰值常驻内存约 86 MiB；把视频预先转码为 720 px 后处理为 5.78 秒、约 97 MiB，但额外转码时间和磁盘占用未计入，因此当前不采用导入时转码。新增 960→720 合成端到端夹具通过。缩小后的细字可读性尚需原生高分辨率实录验证。

随后在 M1 Pro、16 GB 的 Mac 上对同一 1080 px 负载重复运行 3 次，默认 720 px 模式耗时中位数为 7.80 秒、最大常驻内存中位数约 90.3 MiB。跳页、横屏及完全重复列表行也已纳入预期拒绝夹具；重复行因无法证明位移而拒绝。

原始实录的结果保存在 `artifacts/微信录屏-长图.png`，诊断保存在 `artifacts/微信录屏-诊断.json`；该目录被 Git 忽略，避免意外提交用户内容。尚未覆盖足够多的应用类型、较小或复杂的动态内容、极长视频、iOS 编译与导出。固定栏自动检测仍可能误裁，少量实录样本不能证明通用可靠性。

聊天录屏先前输出 592 × 6942 PNG，用户烟测确认顺序正确、未见漏重；新算法回归输出 592 × 6943，仍有右边缘滚动指示条残影。无缩放网页录屏 `3.mp4` 在图片加载时经局部配准与回填，现输出本地 `artifacts/3-动态加载实验.png`，尺寸 592 × 12805；固定内容区域为 94–1128 px，3 次动态回填经后续帧确认。用户对照视频确认顺序和图片内容正确，但反馈图文模糊。源视频、长图和诊断仅存本地并由 Git 忽略。

`audit_seams.py` 会从成功报告重建每处新增内容接缝，先核对重建高度与输出高度，再按低置信度、高重叠误差和可选的相邻行差异提示人工审查位置。行差异容易把文字或卡片边界标为异常，不能替代对照原录屏的人工判断。

动态加载路径会暂缓局部变化帧，下一帧确认后按内容坐标覆盖旧占位图；图片导致页面重排的合成样本被拒绝。若图片离开视口后才加载且再也没有出现在录屏中，视频没有相应像素，无法凭空还原或可靠察觉。

`3.mp4` 源视频仅 592 px 宽、约 0.70 Mb/s，输出没有降采样。首帧原像素对照没有发现拼接额外造成的模糊。`artifacts/3-原像素分页/` 可排除超长图缩略显示影响；`artifacts/3-清晰度增强实验.png` 是轻度锐化与 1.5 倍插值的预览，不能恢复源视频已失去的文字细节。1080 px/30 秒派生负载默认 720 px 模式单次复测为 11.63 秒、最大常驻内存约 90.4 MiB（Mac 测试）。

详见 [实施计划](docs/ImplementationPlan.md) 与 [风险](docs/Risks.md)。

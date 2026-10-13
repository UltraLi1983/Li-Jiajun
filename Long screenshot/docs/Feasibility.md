# Phase 0 — 可行性研究

状态：2026-10-12，方案研究完成；算法和真机效果尚未验证。

## 结论与边界

采用“用户录屏 → 导入视频 → 本地逐帧分析 → 输出长图”是可行的工程路线。可行性指系统 API 能读取视频帧、对齐图像并写出图片；**不代表任意应用的录屏都能无损拼接**。源视频若跳过了中间内容、显示受保护内容、内容在滚动中变化，算法无法从缺失的像素恢复原文。产品必须在证据不足时拒绝或标出断点。

MVP 限定竖屏、单一纵向滚动区域、同一分辨率、无明显内容重排的视频。用户通过 iOS 系统录屏后手动导入。第三方应用的滚动由用户完成，项目不承诺跨应用自动操控。

## 系统能力调查

| 需求 | 候选 API | 结论 |
| --- | --- | --- |
| 读取视频帧 | AVFoundation `AVAssetReader` / `AVAssetReaderTrackOutput`，Core Video | 可逐帧解码并读取时间戳；使用有界缓冲，避免一次性加载整段视频。[Apple AVAssetReader](https://developer.apple.com/documentation/avfoundation/avassetreader) |
| 方向和分辨率 | `AVAssetTrack.preferredTransform`、视频轨道元数据 | 必须先按显示方向规范化，再进行位移估计；不能假设编码像素已竖直。[Apple preferredTransform](https://developer.apple.com/documentation/avfoundation/avassettrack/preferredtransform) |
| 图像平移初值 | Vision `VNTranslationalImageRegistrationRequest` | 可作为对照算法；其全图结果可能受固定栏、动画影响，不直接作为唯一判据。[Apple Vision](https://developer.apple.com/documentation/vision/vntranslationalimageregistrationrequest) |
| 导入相册视频 | SwiftUI `PhotosPicker` | 支持用户选择视频；选中的资源仍需取得可持续读取的本地文件副本。iCloud 资源可能需要下载，纯离线模式应提示用户先确保本地可用。[Apple PhotosPicker](https://developer.apple.com/documentation/photosui/photospicker) |
| 导出 PNG | Image I/O `CGImageDestination`；Photos `PHAssetChangeRequest` | 能写文件并保存相册；超长单张图片的峰值内存和接收端兼容性必须实测。[Apple Image I/O](https://developer.apple.com/documentation/imageio/cgimagedestination)、[Apple Photos](https://developer.apple.com/documentation/photos/phassetchangerequest/creationrequestforassetfromimage(atfileurl:)) |
| 后续入口 | Share Extension、App Intents | 可减少导入步骤，但属于 Phase 3；运行空间与文件交接需单独验证。[Apple App Intents](https://developer.apple.com/documentation/appintents/getting-started-with-the-app-intents-framework) |

Apple 已发布 iOS 上 ScreenCaptureKit 的全屏录制示例，但该示例注明需要 iOS 27 或更新版本，且相关文档标为预发布；本项目不把它作为当前 MVP 前提。[Apple iOS capture sample](https://developer.apple.com/documentation/screencapturekit/capturing-screen-content-on-ios)

## 算法选择

主路线：**局部、多带、单轴平移匹配**。在已排除固定栏的内容区域，对连续候选帧的多个水平带计算纵向位移，使用纹理强度和一致性过滤弱证据；再在候选位移附近计算重叠区域的鲁棒误差。只裁切、复制原像素，不做透视变形或拉伸。选择此路线是因为手机列表通常由二维平面内容产生纵向平移，且能明确输出每段匹配证据。

对照路线：Vision 平移配准；必要时再测试特征点匹配。OpenCV 暂不引入：它会增加构建、体积和维护成本，只有原生方案在代表性样本上达不到指标时才评估。模板/相关性匹配容易受重复列表项影响，必须同时检查第二最佳位移、前后帧一致性和非重叠区是否出现新内容。

## 关键假设与验证

1. 录屏持续捕捉到足够多的重叠内容；快速滚动造成零重叠时必须报告缺口。
2. 主内容区域在相邻帧间近似纯纵向平移；固定顶部、底部控件可通过时间稳定性检测与区域屏蔽处理。
3. 图像内容在连续数帧内基本稳定；广告、视频、加载占位和聊天新消息可能破坏该假设。
4. PNG 高度、解码器和 Photos 导出的实际限制未在本机验证；Phase 1/2 应实测最大尺寸，并准备分段导出退路。

## 当前开发环境

- 本目录原为空；上级目录是现有 Git 仓库，存在与本项目无关的未提交变更，不应触碰。
- `swift --version`：Apple Swift 6.4，arm64 macOS 26；`ffmpeg` 已安装，可仅用于生成或检查测试素材，产品运行时不依赖它。
- `xcodebuild -version` 失败：当前 `xcode-select` 指向 `/Library/Developer/CommandLineTools`，未找到可用 Xcode。macOS 命令行原型可先实现；iOS 工程编译及真机验证需 Xcode 环境。
- 仓库没有真实录屏或授权测试素材。因此尚无性能、正确率或兼容率实测结果。

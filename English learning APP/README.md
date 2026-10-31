# English Coach · AI 对话版

围绕真实工作语境的英语对话原型。AI 扮演供应商、跨团队同事或客户，你可以用语音或文字回应。结束时先核对语音转写，再获取最多三条有原话依据的重点反馈。

## 启动

需要 Node.js 22+、可访问 OpenAI API 的网络、具有 Realtime 模型权限的 API 密钥。在本目录的 zsh 终端执行：

```zsh
read -s "OPENAI_API_KEY?OpenAI API key: "
export OPENAI_API_KEY
npm start
```

打开 <http://localhost:4174>。密钥仅由本地 Node 服务读取，不会写进浏览器代码。不要把密钥写入仓库或聊天消息。可用 `PORT=其他端口 npm start` 更改端口。

未配置密钥时，界面仍可打开，但不能连接真实 AI。当前环境没有配置 API 密钥，因此尚未做真实账户的语音联通测试；已用模拟上游接口测试服务端请求与反馈校验。

## 使用

1. 选择预设场景，或写下你自己的工作情境。
2. 点击“开始语音对话”，允许麦克风，点击麦克风按钮开始说话，再点一次发送；也可选择文字体验。
3. AI 自行创建具体情节并扮演对方。它会用合成语音回应，同时在页面显示转写文本。
4. 点击“结束并复盘”，修正语音识别错误后生成反馈。反馈只检查确认后的文字，不评价发音或口音。

本应用不保存录音或对话记录。语音、对话文本和复盘请求会发送到 OpenAI API；请勿输入真实客户的机密信息。使用 API 会产生费用，具体取决于账户和用量。

## 技术边界

- 浏览器使用 WebRTC 连接 Realtime API；本地 Node 服务在 `/api/session` 为它建立会话，不向浏览器暴露标准 API 密钥。
- 会话结束后，`/api/feedback` 用 Responses API 生成结构化反馈；服务端会过滤无法在用户原话中找到的“错误引用”。
- AI 生成的场景和反馈可能不准确。语音转写只是参考，需要本人确认。
- 如果浏览器无法播放 AI 音频，可阅读页面中的 AI 回复文本；实时语音体验仍需可用的音频设备。

## 测试与旧版

`npm test` 运行无密钥、会话配置和反馈证据校验的本地测试。之前的预设对话版仍可用 `python3 -m http.server 4173` 启动，说明见 [README_v1.md](README_v1.md)。

实现依据：[OpenAI WebRTC 文档](https://developers.openai.com/api/docs/guides/realtime-webrtc)、[Realtime 对话文档](https://developers.openai.com/api/docs/guides/realtime-conversations)、[Structured Outputs 文档](https://developers.openai.com/api/docs/guides/structured-outputs)。

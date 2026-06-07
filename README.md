# LINGUA // AI 同声传译助手

LINGUA 是一个面向英语视频、演讲、网课和技术分享的 AI 同声传译网页工具。用户点击开始翻译后，选择正在播放英文内容的浏览器标签页或窗口，并勾选共享音频，系统会实时识别英文音频流、翻译成中文，并在主页面与悬浮字幕窗口中显示。

## 演示入口

- 在线演示: https://ai-simultaneous-interpreter.up.railway.app/
- Demo 视频: 提交前将公开视频链接放到这里
- Demo 视频脚本: [docs/demo-video-script.md](docs/demo-video-script.md)
- 部署说明: [docs/deployment.md](docs/deployment.md)

## 核心能力

| 能力 | 当前实现 |
| --- | --- |
| 单向音频流采集 | 前端通过 `getDisplayMedia` 捕获浏览器标签页/窗口音频，并转换为 16kHz PCM |
| 实时语音识别 | 后端使用讯飞流式 ASR WebSocket，持续接收音频帧并返回中间/最终识别结果 |
| 实时中文翻译 | 后端调用 DeepSeek 翻译英文识别文本，前端通过 WebSocket 实时刷新字幕 |
| 悬浮字幕 | 支持独立字幕窗口和 Document Picture-in-Picture，便于覆盖在视频页面旁边观看 |
| 自动修正 | 支持讯飞 `wpgs` 动态修正，按 `sn/rg` 片段合并，避免快语速时覆盖前文 |
| 快语速优化 | 中间结果翻译节流降至 220ms，ASR 静音断句阈值降至 500ms，减少等待和漏句 |
| 术语表 | 前端可配置 `英文 => 中文/保留词`，后端翻译时优先遵守技术术语 |
| 实时指标 | 展示 ASR、翻译、总延迟和修正状态，便于评估同传体验 |
| 历史与导出 | 保存最终字幕记录，支持导出 SRT 字幕文件 |
| 健康检查 | `/health` 返回服务状态与关键依赖配置状态 |

## 使用方式

1. 运行服务后打开 `http://localhost:3000/`。
2. 点击“开始翻译”。
3. 在浏览器弹出的共享选择器里选择正在播放英文内容的标签页或窗口。
4. 勾选“共享音频”。
5. 播放英文朗读、演讲或网课，中文翻译会出现在主页面和悬浮字幕窗口。
6. 可在术语表中添加技术词，例如 `Kubernetes => Kubernetes`，再重新开始翻译。

> 注意：不要直接打开 `public/index.html`。如果误用本地文件方式打开，页面会尝试自动跳转到 `http://localhost:3000/`。

## 本地启动

### 环境要求

- Node.js 18+
- DeepSeek API Key
- 讯飞语音识别 AppID、API Key、API Secret

### 安装依赖

```bash
npm install
```

### 配置环境变量

复制 `.env.example` 为 `.env`，填写云端服务密钥：

```env
DEEPSEEK_API_KEY=sk-xxxxx

XFYUN_APPID=xxxxx
XFYUN_API_KEY=xxxxx
XFYUN_API_SECRET=xxxxx

PORT=3000
```

### 启动服务

```bash
npm start
```

访问：

```text
http://localhost:3000/
```

健康检查：

```text
http://localhost:3000/health
```

## 部署方案

本项目的完整后端需要长期运行 WebSocket 音频流服务，推荐部署到 Railway。

Vercel 可用于部署静态前端，并通过环境变量 `LINGUA_BACKEND_ORIGIN` 指向 Railway 后端地址。详细步骤见 [docs/deployment.md](docs/deployment.md)。

## 项目结构

```text
ai-simultaneous-interpreter/
├─ src/
│  ├─ app.js                    # Express 服务、WebSocket、音频流处理与字幕推送
│  └─ services/
│     ├─ stream-asr.js           # 讯飞流式 ASR、动态修正片段合并
│     └─ translate.js            # DeepSeek 翻译、术语表提示词、Mock fallback
├─ public/
│  ├─ index.html                 # 同传工作台页面
│  ├─ style.css                  # 工作台样式
│  ├─ app.js                     # 前端音频采集、WebSocket、字幕渲染
│  └─ subtitle.html              # 普通弹窗字幕页面
├─ package.json
├─ .env.example
└─ README.md
```

## 技术实现

### 音频流链路

前端从共享标签页/窗口中拿到音频轨道，通过 `AudioContext` 和 `ScriptProcessorNode` 获取 PCM 数据，降采样到 16kHz 后每约 100ms 发送一次 WebSocket 音频包。

### ASR 修正链路

讯飞流式 ASR 开启 `dwa: 'wpgs'` 后会返回动态修正片段。项目在 `stream-asr.js` 中维护 `resultTextMap`，按 `sn` 保存片段，遇到 `pgs: 'rpl'` 与 `rg` 范围时只替换对应片段，再按序拼接完整文本。这能避免快语速场景下“后一个修正片段覆盖前面句子”的漏句问题。

### 翻译链路

后端将 ASR 中间结果与最终结果送入 DeepSeek 翻译。中间结果用于尽快显示，最终结果用于确认和写入历史记录。术语表会作为提示词附加给翻译服务，提升技术演讲、网课中的专有词一致性。

### 字幕呈现

主页面、页面内浮层、独立字幕窗口和 Picture-in-Picture 字幕都按 `segmentId` 更新同一条字幕，因此修正结果会原地刷新，而不是不断新增重复字幕。

## 验证方式

```bash
node --check src/app.js
node --check src/services/stream-asr.js
node --check src/services/translate.js
node --check public/app.js
```

手动验证：

- 打开 `http://localhost:3000/`，点击开始翻译。
- 选择英文视频标签页并勾选共享音频。
- 播放语速较快的英文朗读，观察字幕是否持续更新且不丢前文。
- 点击“演示模式”，观察自动修正、延迟指标和术语表效果。
- 打开 `/health`，确认服务依赖配置状态。

## 第三方依赖与原创部分

第三方依赖：

| 依赖 | 用途 |
| --- | --- |
| express | Web 服务 |
| ws | WebSocket 通信 |
| cors | 跨域处理 |
| dotenv | 环境变量 |
| node-fetch | 调用 DeepSeek API |
| multer | 保留的文件处理中间件 |

原创实现：

- 浏览器标签页音频采集与 PCM 降采样发送
- WebSocket 音频流接入与字幕推送
- 讯飞 `wpgs` 动态修正片段合并
- DeepSeek 翻译提示词与术语表保护
- 悬浮字幕窗口、Picture-in-Picture 字幕和主页面工作台
- 快语速场景下的字幕连续性优化

## 已知限制

- 浏览器共享音频能力依赖浏览器实现，建议使用 Chrome 或 Edge。
- 评审体验需要后端已配置可用的 DeepSeek 与讯飞密钥。
- 当前聚焦单向英语音频到中文字幕，不包含中文语音播报。
- Demo 视频链接需要在最终提交前补充到 README 顶部。

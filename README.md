# LINGUA - AI 同声传译字幕助手

LINGUA 是一个面向英语朗读、公开视频和在线课程的 Web 端实时字幕工具。用户在网页中点击“开始翻译”，选择正在播放英文内容的窗口或标签页并共享音频后，系统会实时识别英文语音、翻译成中文，并在置顶字幕小窗中显示结果。

## 在线体验与 Demo

- 在线访问：https://ai-simultaneous-interpreter.up.railway.app/
- Demo 视频：提交前请替换为可公开访问的视频链接，例如 Bilibili 或云盘链接。

> 评审时请优先使用在线访问地址体验完整流程。本项目已集成后端能力，部署环境中配置好 ASR 与翻译服务后，无需评委手动配置密钥即可体验。

## 核心功能

- 屏幕/标签页音频捕获：通过浏览器共享音频获取英文朗读或视频声音。
- 流式语音识别：前端按短音频块发送，后端通过 WebSocket 接入讯飞流式 ASR。
- 实时翻译：识别中间结果会节流翻译，最终结果会再次确认并固定显示。
- 置顶字幕小窗：优先使用 Document Picture-in-Picture，避免普通弹窗被视频页面遮挡。
- 测试字幕模式：不依赖真实音频，可快速验证字幕窗口显示和实时更新效果。
- 历史记录与导出：保存最近翻译记录，并支持字幕导出。

## 功能与代码对应关系

| 功能 | 主要代码位置 | 说明 |
| --- | --- | --- |
| 页面控制与音频捕获 | `public/app.js` | 处理开始/暂停/停止、屏幕共享音频采集、PCM 下采样与 WebSocket 发送。 |
| 字幕小窗显示 | `public/app.js`, `public/subtitle.html` | 主逻辑优先使用 Document Picture-in-Picture；`subtitle.html` 作为普通弹窗兜底。 |
| WebSocket 服务 | `src/app.js` | 接收前端音频块，转发识别/翻译结果，并支持测试字幕消息。 |
| 流式语音识别 | `src/services/stream-asr.js` | 接入讯飞流式 ASR，处理首帧、音频帧、VAD 与识别结果回调。 |
| 翻译服务 | `src/services/translate.js` | 调用 DeepSeek 翻译接口，提供英文到中文翻译能力。 |
| 非流式 ASR 兼容 | `src/services/asr.js` | 保留旧的分段识别服务，作为兼容和调试入口。 |

## 使用方式

1. 打开在线页面或本地 `http://localhost:3000`。
2. 点击“开始翻译”。
3. 在浏览器弹出的共享选择中选择正在播放英文内容的窗口或标签页。
4. 勾选或选择“共享音频”。
5. 播放英文朗读，查看置顶字幕窗口中的中文翻译。

如果只想验证字幕窗口效果，可以点击“测试字幕”按钮。

## 本地运行

### 环境要求

- Node.js 18 或更高版本
- 可用的 DeepSeek API Key
- 可用的讯飞语音识别 APPID、API Key、API Secret

### 安装依赖

```bash
npm install
```

### 配置环境变量

复制 `.env.example` 为 `.env`，并填写云服务密钥：

```env
DEEPSEEK_API_KEY=your_deepseek_api_key
XFYUN_APPID=your_xfyun_appid
XFYUN_API_KEY=your_xfyun_api_key
XFYUN_API_SECRET=your_xfyun_api_secret
PORT=3000
```

### 启动

```bash
npm start
```

访问：

```text
http://localhost:3000
```

## 技术栈与依赖说明

| 类型 | 技术 / 依赖 | 用途 |
| --- | --- | --- |
| 后端 | Node.js, Express | 静态页面服务与 API 服务 |
| 实时通信 | ws | 浏览器与后端之间传输音频块和字幕结果 |
| 语音识别 | 讯飞语音识别 API | 英文语音流式识别 |
| 翻译 | DeepSeek API | 英文到中文翻译 |
| 前端 | HTML, CSS, JavaScript | 页面交互、音频捕获、字幕窗口渲染 |
| 配置 | dotenv | 读取本地环境变量 |
| 网络请求 | node-fetch | 调用云端翻译接口 |
| 跨域 | cors | 后端跨域配置 |

第三方库均列在 `package.json` 中。项目核心交互、音频采集、字幕渲染和服务编排为本项目实现。

## 项目结构

```text
ai-simultaneous-interpreter/
├── public/
│   ├── index.html        # Web 主页面
│   ├── app.js            # 前端交互、音频捕获、字幕窗口逻辑
│   ├── style.css         # 页面样式
│   └── subtitle.html     # 普通弹窗字幕页兜底
├── src/
│   ├── app.js            # Express + WebSocket 后端入口
│   └── services/
│       ├── asr.js        # 非流式 ASR 兼容服务
│       ├── stream-asr.js # 讯飞流式 ASR 服务
│       └── translate.js  # DeepSeek 翻译服务
├── uploads/              # 上传文件目录
├── .env.example          # 环境变量模板
├── package.json
└── README.md
```

## PR 与持续交付记录

本项目按功能拆分 PR，避免最后一次性导入全部代码。每个 PR 应包含：

- 标题：一句话说明新增或修改内容。
- 功能描述：说明功能作用与使用方式。
- 实现思路：说明核心实现逻辑。
- 测试方式：说明如何验证功能可用。

建议 PR 粒度：

- 流式 ASR 接入。
- 前端音频捕获优化。
- 置顶字幕窗口。
- 测试字幕模式。
- README 与提交材料完善。

## 部署说明

项目可部署到 Railway、Render、Vercel Serverless 以外的 Node.js 服务平台，或任意支持长连接 WebSocket 的云服务器。

注意：

- 部署环境必须配置 DeepSeek 与讯飞语音识别相关环境变量。
- 部署平台需要支持 WebSocket 长连接。
- 在线演示地址应在提交截止后保持可公开访问。

## 学术诚信与原创说明

本项目使用公开第三方服务和 npm 依赖完成基础能力接入。项目的产品流程、前端音频捕获、WebSocket 音频传输、字幕窗口渲染、流式结果处理和翻译节流逻辑为本项目实现。

如后续复用个人历史代码片段，应在对应 PR 描述中注明来源。

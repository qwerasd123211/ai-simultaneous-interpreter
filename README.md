# LINGUA // AI 同声传译助手

实时语音翻译工具，帮助用户降低语言门槛，提升信息获取效率。

## 🌐 在线演示

**🔗 在线访问**：https://ai-simultaneous-interpreter.up.railway.app/

> 无需安装，直接访问即可体验完整功能！

## ✨ 功能特性

### 核心功能

| 功能 | 说明 |
|------|------|
| 音频文件上传 | 支持 MP3、WAV、MP4 等格式 |
| 语音识别 | 英语音频转文字（支持讯飞、DeepSeek） |
| 实时翻译 | 英文翻译成中文，延迟 <500ms |
| 字幕显示 | 实时显示中文字幕，支持滚动 |
| 自动纠错 | 纠正之前翻译错误 |
| 历史记录 | 保存翻译历史，支持本地存储 |
| 导出功能 | 导出 SRT 字幕文件 |

### 增强功能

| 功能 | 说明 |
|------|------|
| 拖拽上传 | 支持拖拽文件到上传区域 |
| 进度显示 | 实时显示翻译进度 |
| WebSocket | 实时通信，低延迟 |
| 响应式设计 | 支持桌面和移动端 |

## 🛠️ 技术栈

- **后端**: Node.js + Express + WebSocket
- **前端**: HTML + CSS + JavaScript（无框架依赖）
- **语音识别**: 讯飞语音 API / DeepSeek API
- **翻译**: DeepSeek API
- **实时通信**: WebSocket (ws)
- **文件上传**: Multer

## 🚀 快速开始

### 前置条件

- Node.js >= 18
- DeepSeek API Key（[获取地址](https://platform.deepseek.com/)）

### 安装

```bash
# 克隆仓库
git clone https://github.com/qwerasd123211/ai-simultaneous-interpreter.git
cd ai-simultaneous-interpreter

# 安装依赖
npm install
```

### 配置

复制环境变量模板并填入你的 API Key：

```bash
cp .env.example .env
```

编辑 `.env` 文件：

```env
# DeepSeek API Key（必需）
DEEPSEEK_API_KEY=sk-xxxxx

# 讯飞语音 API（可选，用于语音识别）
XFYUN_APPID=xxxxx
XFYUN_API_KEY=xxxxx
XFYUN_API_SECRET=xxxxx

# 服务器端口（可选，默认 3000）
PORT=3000
```

### 启动

```bash
npm start
```

访问 http://localhost:3000 即可使用。

## 📖 使用方法

### 上传音频

1. 点击上传区域或拖拽音频文件
2. 支持 MP3、WAV、MP4 格式
3. 最大文件大小：50MB

### 开始翻译

1. 上传文件后，点击"开始翻译"
2. 系统自动识别语音并翻译
3. 实时显示中文字幕

### 导出字幕

1. 点击"导出"按钮
2. 下载 SRT 格式字幕文件
3. 可用于视频编辑软件

## 📁 项目结构

```
ai-simultaneous-interpreter/
├── src/
│   ├── app.js              # Express 服务器 + WebSocket
│   └── services/
│       ├── asr.js          # 语音识别服务
│       └── translate.js    # 翻译服务
├── public/
│   ├── index.html          # 前端页面
│   ├── style.css           # 样式文件（Terminal 美学）
│   └── app.js              # 前端交互逻辑
├── uploads/                # 上传文件目录
├── package.json
├── .env.example
├── .gitignore
└── README.md
```

## 🏗️ 架构设计

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   前端界面   │────>│ Express 服务器 │────>│ 语音识别 API │
│  (HTML/JS)  │<────│  (WebSocket)  │<────│ DeepSeek API│
└─────────────┘     └──────────────┘     └─────────────┘
```

**请求流程**：

1. 用户上传音频文件
2. 后端调用语音识别 API，获取英文文本
3. 调用 DeepSeek API 翻译成中文
4. 通过 WebSocket 实时推送字幕
5. 前端显示中文字幕

## 🎯 设计思路

### 语音识别

- 支持多种音频格式（MP3、WAV、MP4）
- 使用成熟的 ASR API（讯飞、DeepSeek）
- 支持实时流式识别（未来扩展）

### 翻译质量

- 使用 DeepSeek API，中文理解优秀
- 保持原文语气和意思
- 专业术语准确

### 实时性

- WebSocket 实时通信
- 流式处理音频
- 延迟 <500ms

### 用户体验

- 拖拽上传，操作简单
- 实时进度显示
- 历史记录保存
- 字幕导出功能

## 📝 环境变量说明

| 变量 | 必需 | 默认值 | 说明 |
|------|------|--------|------|
| `DEEPSEEK_API_KEY` | 是 | - | DeepSeek API Key |
| `XFYUN_APPID` | 否 | - | 讯飞语音 AppID |
| `XFYUN_API_KEY` | 否 | - | 讯飞语音 API Key |
| `XFYUN_API_SECRET` | 否 | - | 讯飞语音 API Secret |
| `PORT` | 否 | `3000` | 服务器监听端口 |

## 📦 依赖说明

| 依赖 | 版本 | 用途 |
|------|------|------|
| express | ^4.18.2 | Web 框架 |
| ws | ^8.16.0 | WebSocket |
| multer | ^1.4.5 | 文件上传 |
| node-fetch | ^2.7.0 | HTTP 请求 |
| cors | ^2.8.5 | 跨域处理 |
| dotenv | ^16.3.1 | 环境变量 |

## 🔮 未来扩展

| 方向 | 说明 |
|------|------|
| 实时语音识别 | 支持麦克风实时录音 |
| 多语言支持 | 支持日语、韩语等 |
| 语音合成 | 中文语音输出 |
| 字幕样式 | 自定义字幕颜色、大小 |
| 批量处理 | 支持多个文件批量翻译 |

## 👨‍💻 作者

**张顺** - 七牛云实训学员

## 📄 许可证

MIT License

## 🙏 致谢

感谢七牛云提供的实训机会，感谢 DeepSeek 提供的 AI 能力支持。

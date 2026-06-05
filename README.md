# AI 同声传译助手

实时语音翻译工具，帮助用户降低语言门槛，提升信息获取效率。

## ✨ 功能特性

| 功能 | 说明 |
|------|------|
| 音频文件上传 | 支持 MP3、WAV、MP4 等格式 |
| 语音识别 | 英语音频转文字 |
| 实时翻译 | 英文翻译成中文 |
| 字幕显示 | 实时显示中文字幕 |
| 自动纠错 | 纠正之前翻译错误 |
| 历史记录 | 保存翻译历史 |
| 导出功能 | 导出 SRT 字幕文件 |

## 🛠️ 技术栈

- **后端**: Node.js + Express + WebSocket
- **前端**: HTML + CSS + JavaScript
- **语音识别**: 讯飞语音 API / DeepSeek API
- **翻译**: DeepSeek API
- **实时通信**: WebSocket

## 🚀 快速开始

### 前置条件

- Node.js >= 18
- DeepSeek API Key

### 安装

```bash
# 克隆仓库
git clone https://github.com/qwerasd123211/ai-simultaneous-interpreter.git
cd ai-simultaneous-interpreter

# 安装依赖
npm install
```

### 配置

```bash
# 复制环境变量模板
cp .env.example .env

# 编辑 .env 文件，填入 API Key
```

### 启动

```bash
npm start
```

访问 http://localhost:3000

## 📖 使用方法

1. 上传音频文件（MP3、WAV、MP4）
2. 点击"开始翻译"
3. 实时查看中文字幕
4. 导出字幕文件

## 📁 项目结构

```
ai-simultaneous-interpreter/
├── src/
│   ├── app.js              # Express 服务器
│   └── services/
│       ├── asr.js          # 语音识别服务
│       └── translate.js    # 翻译服务
├── public/
│   ├── index.html          # 前端页面
│   ├── style.css           # 样式文件
│   └── app.js              # 前端逻辑
├── package.json
├── .env.example
├── .gitignore
└── README.md
```

## 🎯 设计思路

### 语音识别

- 支持多种音频格式
- 使用成熟的 ASR API
- 支持实时流式识别

### 翻译质量

- 使用 DeepSeek API
- 保持原文语气和意思
- 专业术语准确

### 实时性

- WebSocket 实时通信
- 流式处理音频
- 即时显示字幕

## 📝 依赖说明

| 依赖 | 版本 | 用途 |
|------|------|------|
| express | ^4.18.2 | Web 框架 |
| ws | ^8.16.0 | WebSocket |
| multer | ^1.4.5 | 文件上传 |
| node-fetch | ^2.7.0 | HTTP 请求 |
| cors | ^2.8.5 | 跨域处理 |
| dotenv | ^16.3.1 | 环境变量 |

## 👨‍💻 作者

**张顺** - 七牛云实训学员

## 📄 许可证

MIT License

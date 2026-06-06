# LINGUA // AI 同声传译助手

实时语音翻译工具，帮助用户降低语言门槛，提升信息获取效率。

## 🌐 在线演示

**🔗 在线访问**：https://ai-simultaneous-interpreter.up.railway.app/

> 无需安装，直接访问即可体验完整功能！

**🎥 Demo 视频**：[点击观看](https://www.bilibili.com/video/xxx)

> 视频展示了实时语音识别、翻译和字幕显示的完整流程

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
- npm >= 9
- DeepSeek API Key（[获取地址](https://platform.deepseek.com/)）
- 讯飞语音 API（[获取地址](https://www.xfyun.cn/)，可选，用于语音识别）

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
# DeepSeek API Key（必需，用于翻译）
DEEPSEEK_API_KEY=sk-xxxxx

# 讯飞语音 API（可选，用于语音识别；不配置则使用模拟数据）
XFYUN_APPID=xxxxx
XFYUN_API_KEY=xxxxx
XFYUN_API_SECRET=xxxxx

# 服务器端口（可选，默认 3000）
PORT=3000
```

### 启动

```bash
# 开发模式
npm start

# 或
node src/app.js
```

访问 http://localhost:3000 即可使用。

## 🚢 部署指南

### Railway 部署（推荐）

1. Fork 本仓库到你的 GitHub 账号
2. 登录 [Railway](https://railway.app/) 并连接 GitHub
3. 选择本仓库创建新项目
4. 在 Variables 中添加环境变量（DEEPSEEK_API_KEY 等）
5. 自动部署完成，获取公网访问地址

### Docker 部署

```bash
# 构建镜像
docker build -t ai-simultaneous-interpreter .

# 运行容器
docker run -p 3000:3000 \
  -e DEEPSEEK_API_KEY=sk-xxxxx \
  -e XFYUN_APPID=xxxxx \
  -e XFYUN_API_KEY=xxxxx \
  -e XFYUN_API_SECRET=xxxxx \
  ai-simultaneous-interpreter
```

### 本地生产部署

```bash
# 使用 PM2 进程管理
npm install -g pm2
pm2 start src/app.js --name "ai-interpreter"
pm2 save
pm2 startup
```

## 📖 使用方法

### 屏幕共享翻译（实时）

1. 打开网页，点击"开始翻译"按钮
2. 选择要共享的屏幕或窗口（**必须勾选"共享音频"**）
3. 播放英文视频或音频
4. 系统自动识别语音并实时翻译
5. 字幕会显示在独立弹窗和页面底部

### 测试模式（无需 API Key）

1. 点击"测试字幕"按钮
2. 系统自动发送模拟字幕数据
3. 用于验证字幕显示功能是否正常

### 字幕弹窗操作

- **置顶**：点击"置顶"按钮，字幕窗口保持在最前面
- **清空**：点击"清空"按钮，清除所有字幕
- **导出**：点击"导出"按钮，下载 SRT 格式字幕文件
- **关闭**：点击"关闭"按钮或主页面"停止"按钮

### 历史记录

- 自动保存最近 100 条翻译记录
- 刷新页面后历史记录仍然保留
- 点击"清空"可删除所有历史

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
│   前端界面   │────>│ Express 服务器 │────>│ 讯飞语音 API │
│  (HTML/JS)  │<────│  (WebSocket)  │<────│ DeepSeek API│
└─────────────┘     └──────────────┘     └─────────────┘
         │                    │
         └────── 音频流 ──────┘
```

**实时翻译流程**：

1. 用户点击"开始翻译"，选择屏幕共享（勾选音频）
2. 前端通过 `getDisplayMedia` 捕获系统音频
3. 使用 `AudioContext` 将音频转为 PCM 格式
4. 通过 WebSocket 实时发送音频流到后端
5. 后端调用讯飞语音 API 进行流式识别
6. 识别结果调用 DeepSeek API 翻译成中文
7. 通过 WebSocket 实时推送翻译结果到前端
8. 前端显示字幕在独立弹窗和页面底部

**测试模式流程**：

1. 用户点击"测试字幕"
2. 后端直接发送模拟字幕数据
3. 前端显示字幕，无需 API Key

## 🎯 设计思路

### 语音识别

- 使用 `AudioContext` + `ScriptProcessorNode` 捕获原始 PCM 音频
- 音频下采样到 16kHz，符合讯飞 API 要求
- 使用 WebSocket 流式传输，减少延迟
- 支持讯飞语音 API 和模拟数据两种模式

### 翻译质量

- 使用 DeepSeek API，中文理解优秀
- 保持原文语气和意思
- 专业术语准确
- 支持上下文理解，翻译更连贯

### 实时性

- WebSocket 实时通信，双向数据流
- 音频流式传输，识别结果实时返回
- 翻译结果立即推送到前端
- 端到端延迟约 1-3 秒

### 用户体验

- 屏幕共享一键启动，无需上传文件
- 独立字幕弹窗，支持置顶和拖拽
- 实时进度显示和状态提示
- 历史记录自动保存，支持导出 SRT
- 测试模式无需配置即可验证功能

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
| 麦克风输入 | 支持直接录制麦克风音频进行翻译 |
| 多语言支持 | 支持日语、韩语、法语等多种语言互译 |
| 语音合成 | 中文语音输出，实现真正的同声传译 |
| 字幕样式 | 自定义字幕颜色、大小、字体、位置 |
| 批量处理 | 支持多个文件批量翻译和导出 |
| 离线模式 | 集成本地语音识别模型，无需联网 |
| 移动端适配 | 优化手机端使用体验 |

## 🐛 常见问题

### Q: 字幕不显示怎么办？

1. 检查是否勾选了"共享音频"
2. 检查 API Key 是否配置正确
3. 尝试点击"测试字幕"验证显示功能
4. 检查浏览器控制台是否有错误信息

### Q: 识别延迟很高？

1. 检查网络连接是否稳定
2. 讯飞 API 的响应速度受网络影响
3. 可以尝试使用测试模式验证前端显示速度

### Q: 如何部署到公网？

1. 使用 Railway 一键部署（推荐）
2. 或使用 Docker 部署到自己的服务器
3. 配置好环境变量即可访问

## 🤝 贡献指南

欢迎提交 Issue 和 PR！

1. Fork 本仓库
2. 创建功能分支：`git checkout -b feature/xxx`
3. 提交更改：`git commit -m "feat: xxx"`
4. 推送分支：`git push origin feature/xxx`
5. 创建 Pull Request

## 👨‍💻 作者

**张顺** - 七牛云实训学员

## 📄 许可证

MIT License

## 🙏 致谢

感谢七牛云提供的实训机会，感谢 DeepSeek 提供的 AI 能力支持。

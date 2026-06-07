# 部署说明

本项目包含长连接 WebSocket 音频流服务，因此推荐：

- Railway：部署完整 Node.js 后端与静态页面，承载 ASR、翻译和 WebSocket。
- Vercel：部署静态前端，通过 `LINGUA_BACKEND_ORIGIN` 连接 Railway 后端。

Vercel Functions 不适合作为本项目的完整后端，因为同声传译需要持续 WebSocket 连接来传输音频帧和字幕结果。

## Railway 部署

### 需要配置的环境变量

```env
DEEPSEEK_API_KEY=sk-xxxxx
XFYUN_APPID=xxxxx
XFYUN_API_KEY=xxxxx
XFYUN_API_SECRET=xxxxx
PORT=3000
```

### 部署方式

方式一：连接 GitHub 仓库。

1. 在 Railway 创建新项目。
2. 选择 GitHub 仓库 `qwerasd123211/ai-simultaneous-interpreter`。
3. 设置上面的环境变量。
4. Railway 会读取 `railway.json`，使用 `npm start` 启动服务。
5. 部署完成后访问 Railway 分配的域名。
6. 打开 `/health`，确认返回 `status: ok`。

方式二：使用 Railway CLI。

```bash
npx @railway/cli login
npx @railway/cli link
npx @railway/cli up
```

## Vercel 部署

Vercel 侧只部署前端页面和一个轻量配置函数。

### 需要配置的环境变量

```env
LINGUA_BACKEND_ORIGIN=https://你的-railway-域名
```

示例：

```env
LINGUA_BACKEND_ORIGIN=https://ai-simultaneous-interpreter.up.railway.app
```

### 部署方式

方式一：连接 GitHub 仓库。

1. 在 Vercel 创建新项目。
2. 选择同一个 GitHub 仓库。
3. 设置环境变量 `LINGUA_BACKEND_ORIGIN` 为 Railway 后端地址。
4. 使用仓库中的 `vercel.json` 部署。
5. 打开 Vercel 页面，点击开始翻译，前端会连接 Railway WebSocket 后端。

方式二：使用 Vercel CLI。

```bash
npx vercel login
npx vercel --prod
```

部署后在 Vercel 项目环境变量中设置 `LINGUA_BACKEND_ORIGIN`，再重新部署一次。

## 验证清单

- Railway `/health` 返回 200。
- Vercel 页面能正常加载。
- Vercel 页面请求 `/api/config.js` 后包含 Railway 后端地址。
- 点击“开始翻译”后，浏览器能打开共享选择器。
- 勾选共享音频后，悬浮字幕窗口出现。
- 播放英文视频后，字幕持续更新。

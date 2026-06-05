require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const WebSocket = require('ws');
const http = require('http');

const asrService = require('./services/asr');
const translateService = require('./services/translate');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;

// 文件上传配置
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['audio/mpeg', 'audio/wav', 'audio/mp3', 'audio/ogg', 'video/mp4'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('不支持的文件格式'), false);
    }
  }
});

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// 创建上传目录
const fs = require('fs');
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}

// 路由
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// 上传音频文件
app.post('/api/upload', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '请上传音频文件' });
    }

    const filePath = req.file.path;
    const fileName = req.file.originalname;

    res.json({
      success: true,
      filePath: filePath,
      fileName: fileName,
      message: '文件上传成功'
    });
  } catch (error) {
    console.error('上传错误:', error);
    // 不暴露详细错误信息，返回通用错误消息
    res.status(500).json({ error: '服务器内部错误，请稍后重试' });
  }
});

// 语音识别
app.post('/api/transcribe', async (req, res) => {
  try {
    const { filePath } = req.body;

    if (!filePath) {
      return res.status(400).json({ error: '请提供文件路径' });
    }

    // 调用语音识别服务
    const result = await asrService.transcribe(filePath);

    res.json({
      success: true,
      text: result.text,
      segments: result.segments
    });
  } catch (error) {
    console.error('语音识别错误:', error);
    res.status(500).json({ error: '语音识别失败，请稍后重试' });
  }
});

// 翻译文本
app.post('/api/translate', async (req, res) => {
  try {
    const { text } = req.body;

    if (!text) {
      return res.status(400).json({ error: '请提供要翻译的文本' });
    }

    // 调用翻译服务
    const result = await translateService.translate(text);

    res.json({
      success: true,
      original: text,
      translated: result.translated,
      detectedLanguage: result.detectedLanguage
    });
  } catch (error) {
    console.error('翻译错误:', error);
    res.status(500).json({ error: '翻译失败，请稍后重试' });
  }
});

// WebSocket 连接处理
wss.on('connection', (ws) => {
  console.log('客户端已连接');

  ws.on('message', async (message) => {
    try {
      // 解析消息
      let data;
      try {
        data = JSON.parse(message);
      } catch (e) {
        throw new Error('消息格式错误：无法解析 JSON');
      }

      // 验证消息类型
      if (!data.type) {
        throw new Error('消息格式错误：缺少 type 字段');
      }

      switch (data.type) {
        case 'transcribe':
          // 实时语音识别
          const transcribeResult = await asrService.transcribe(data.filePath);
          ws.send(JSON.stringify({
            type: 'transcribeResult',
            text: transcribeResult.text,
            segments: transcribeResult.segments
          }));
          break;

        case 'translate':
          // 实时翻译
          const translateResult = await translateService.translate(data.text);
          ws.send(JSON.stringify({
            type: 'translateResult',
            original: data.text,
            translated: translateResult.translated
          }));
          break;

        case 'ping':
          ws.send(JSON.stringify({ type: 'pong' }));
          break;
      }
    } catch (error) {
      console.error('WebSocket 消息处理错误:', error);
      ws.send(JSON.stringify({
        type: 'error',
        message: error.message
      }));
    }
  });

  ws.on('close', () => {
    console.log('客户端已断开');
  });
});

// 启动服务器
server.listen(PORT, () => {
  console.log(`🚀 AI 同声传译助手运行在 http://localhost:${PORT}`);
  console.log(`📡 WebSocket 服务已启动`);
});

module.exports = app;

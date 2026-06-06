require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const WebSocket = require('ws');
const http = require('http');

const asrService = require('./services/asr');
const translateService = require('./services/translate');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// 路由
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// WebSocket 连接处理
wss.on('connection', (ws) => {
  console.log('客户端已连接');

  let audioBuffer = [];
  let isProcessing = false;

  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);

      switch (data.type) {
        case 'audio':
          // 接收音频数据
          if (data.data && data.data.length > 0) {
            const audioChunk = Buffer.from(data.data);
            audioBuffer.push(audioChunk);

            // 每积累 3 秒的音频数据进行一次识别
            if (audioBuffer.length >= 3 && !isProcessing) {
              isProcessing = true;

              try {
                // 合并音频数据
                const combinedAudio = Buffer.concat(audioBuffer);
                audioBuffer = [];

                // 语音识别
                const transcribeResult = await asrService.transcribe(combinedAudio);

                if (transcribeResult.text && transcribeResult.text.trim()) {
                  // 发送识别结果
                  ws.send(JSON.stringify({
                    type: 'transcribeResult',
                    text: transcribeResult.text,
                    segments: transcribeResult.segments
                  }));

                  // 翻译
                  const translateResult = await translateService.translate(transcribeResult.text);

                  // 发送翻译结果
                  ws.send(JSON.stringify({
                    type: 'translateResult',
                    original: transcribeResult.text,
                    translated: translateResult.translated
                  }));
                }
              } catch (error) {
                console.error('处理音频错误:', error);
                ws.send(JSON.stringify({
                  type: 'error',
                  message: error.message
                }));
              } finally {
                isProcessing = false;
              }
            }
          }
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
    audioBuffer = [];
  });
});

// 启动服务器
server.listen(PORT, () => {
  console.log(`🚀 AI 同声传译助手运行在 http://localhost:${PORT}`);
  console.log(`📡 WebSocket 服务已启动`);
});

module.exports = app;

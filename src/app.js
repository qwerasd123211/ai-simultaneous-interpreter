require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const WebSocket = require('ws');
const http = require('http');

const translateService = require('./services/translate');
const StreamAsrService = require('./services/stream-asr');

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

  let streamAsr = null;
  let testMode = false;
  let lastTranscribedText = '';
  let translateQueue = [];
  let isTranslating = false;

  // 处理翻译队列
  async function processTranslateQueue() {
    if (isTranslating || translateQueue.length === 0) return;

    isTranslating = true;
    const item = translateQueue.shift();

    try {
      const translateResult = await translateService.translate(item.text);
      console.log('[app] 翻译结果:', translateResult.translated);

      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'translateResult',
          original: item.text,
          translated: translateResult.translated,
          isFinal: item.isFinal
        }));
      }
    } catch (error) {
      console.error('[app] 翻译错误:', error);
    } finally {
      isTranslating = false;
      setImmediate(processTranslateQueue);
    }
  }

  // 初始化 ASR
  function initAsr() {
    if (streamAsr) return;

    streamAsr = new StreamAsrService();

    streamAsr.start(
      // onResult
      (text, isFinal) => {
        if (text !== lastTranscribedText) {
          lastTranscribedText = text;
          console.log(`[app] 识别结果${isFinal ? '(最终)' : '(中间)'}:`, text);

          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              type: 'transcribeResult',
              text: text,
              isFinal: isFinal
            }));
          }

          translateQueue.push({ text: text, isFinal: isFinal });
          processTranslateQueue();
        }
      },
      // onError
      (error) => {
        console.error('[app] ASR 错误:', error.message);
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'error',
            message: '语音识别错误: ' + error.message
          }));
        }
      },
      // onClose
      () => {
        console.log('[app] ASR 连接已关闭');
        streamAsr = null;
      }
    ).catch(err => {
      console.error('[app] 启动 ASR 失败:', err.message);
      streamAsr = null;
    });
  }

  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);

      switch (data.type) {
        case 'audio':
          if (data.data && data.data.length > 0) {
            const audioChunk = Buffer.from(data.data);

            // 确保 ASR 已初始化
            if (!streamAsr) {
              initAsr();
            }

            // 发送音频
            if (streamAsr) {
              streamAsr.sendAudio(audioChunk, false);
            }
          }
          break;

        case 'audioEnd':
          if (streamAsr) {
            streamAsr.sendAudio(Buffer.alloc(0), true);
          }
          break;

        case 'test':
          if (data.enabled) {
            testMode = true;
            const testPhrases = [
              { original: 'Hello, welcome to the show!', translated: '你好，欢迎来到这个节目！' },
              { original: 'This is a beautiful song.', translated: '这是一首美妙的歌曲。' },
              { original: 'I hope you enjoy it.', translated: '希望你能喜欢。' },
              { original: 'The music makes me feel alive.', translated: '音乐让我感到充满活力。' },
              { original: 'Let the rhythm take you away.', translated: '让节奏带你飞。' }
            ];
            let idx = 0;
            const testInterval = setInterval(() => {
              if (!testMode || ws.readyState !== WebSocket.OPEN) {
                clearInterval(testInterval);
                return;
              }
              const phrase = testPhrases[idx % testPhrases.length];
              ws.send(JSON.stringify({
                type: 'translateResult',
                original: phrase.original,
                translated: phrase.translated
              }));
              idx++;
            }, 3000);
            ws.send(JSON.stringify({ type: 'testStarted' }));
          } else {
            testMode = false;
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
    testMode = false;
    if (streamAsr) {
      streamAsr.close();
      streamAsr = null;
    }
    translateQueue = [];
  });
});

// 启动服务器
server.listen(PORT, () => {
  console.log(`🚀 AI 同声传译助手运行在 http://localhost:${PORT}`);
  console.log(`📡 WebSocket 服务已启动`);
});

module.exports = app;

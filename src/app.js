require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const WebSocket = require('ws');
const http = require('http');

const StreamAsrService = require('./services/stream-asr');
const translateService = require('./services/translate');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

wss.on('connection', (ws) => {
  console.log('Client connected');

  const streamAsr = new StreamAsrService();
  let isAsrStarted = false;
  let latestTranslateSeq = 0;
  let partialTranslateTimer = null;
  let lastPartialText = '';
  let isPartialTranslating = false;
  let testTimer = null;

  const sendJson = (payload) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    }
  };

  const translateAndSend = async (text, isFinal, seq) => {
    if (!text || !text.trim()) return;

    try {
      const translateResult = await translateService.translate(text);

      if (!isFinal && seq < latestTranslateSeq) {
        return;
      }

      sendJson({
        type: 'translateResult',
        original: text,
        translated: translateResult.translated,
        isFinal
      });
    } catch (error) {
      console.error('Translate error:', error);
      sendJson({
        type: 'error',
        message: error.message
      });
    }
  };

  const schedulePartialTranslate = (text) => {
    lastPartialText = text;

    if (partialTranslateTimer || isPartialTranslating) {
      return;
    }

    partialTranslateTimer = setTimeout(async () => {
      partialTranslateTimer = null;
      isPartialTranslating = true;

      const seq = ++latestTranslateSeq;
      const textToTranslate = lastPartialText;

      try {
        await translateAndSend(textToTranslate, false, seq);
      } finally {
        isPartialTranslating = false;

        if (lastPartialText !== textToTranslate) {
          schedulePartialTranslate(lastPartialText);
        }
      }
    }, 500);
  };

  const startStreamAsr = async () => {
    if (isAsrStarted) return;
    isAsrStarted = true;

    try {
      await streamAsr.start(
        async (text, isFinal) => {
          if (!text || !text.trim()) return;

          sendJson({
            type: 'transcribeResult',
            text,
            isFinal
          });

          if (isFinal) {
            latestTranslateSeq++;
            lastPartialText = '';

            if (partialTranslateTimer) {
              clearTimeout(partialTranslateTimer);
              partialTranslateTimer = null;
            }

            await translateAndSend(text, true, latestTranslateSeq);
          } else {
            schedulePartialTranslate(text);
          }
        },
        (error) => {
          console.error('Stream ASR error:', error);
          sendJson({
            type: 'error',
            message: error.message
          });
        },
        () => {
          isAsrStarted = false;
        }
      );
    } catch (error) {
      isAsrStarted = false;
      throw error;
    }
  };

  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);

      switch (data.type) {
        case 'audio': {
          if (data.data && data.data.length > 0) {
            const audioChunk = Buffer.from(data.data);
            await startStreamAsr();
            streamAsr.sendAudio(audioChunk, false);
          }
          break;
        }

        case 'ping':
          sendJson({ type: 'pong' });
          break;

        case 'stop':
          streamAsr.finish();
          break;

        case 'test':
          if (testTimer) {
            clearInterval(testTimer);
            testTimer = null;
          }

          if (data.enabled) {
            const samples = [
              { original: 'Welcome to the live translation test.', translated: '欢迎使用实时翻译测试。', isFinal: false },
              { original: 'Welcome to the live translation test.', translated: '欢迎使用实时翻译测试。', isFinal: true },
              { original: 'The subtitle window should update immediately.', translated: '字幕窗口应该会立即更新。', isFinal: false },
              { original: 'The subtitle window should update immediately.', translated: '字幕窗口应该会立即更新。', isFinal: true }
            ];
            let index = 0;

            testTimer = setInterval(() => {
              sendJson({ type: 'translateResult', ...samples[index] });
              index = (index + 1) % samples.length;
            }, 900);
          }
          break;

        default:
          break;
      }
    } catch (error) {
      console.error('WebSocket message error:', error);
      sendJson({
        type: 'error',
        message: error.message
      });
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected');

    if (partialTranslateTimer) {
      clearTimeout(partialTranslateTimer);
      partialTranslateTimer = null;
    }
    if (testTimer) {
      clearInterval(testTimer);
      testTimer = null;
    }

    streamAsr.close();
  });
});

server.listen(PORT, () => {
  console.log(`AI simultaneous interpreter running at http://localhost:${PORT}`);
  console.log('WebSocket server started');
});

module.exports = app;

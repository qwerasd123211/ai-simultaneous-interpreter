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

app.get('/api/config.js', (req, res) => {
  const backendOrigin = process.env.LINGUA_BACKEND_ORIGIN || '';

  res.type('application/javascript');
  res.send(`window.LINGUA_BACKEND_ORIGIN = ${JSON.stringify(backendOrigin)};`);
});

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'ai-simultaneous-interpreter',
    timestamp: new Date().toISOString(),
    dependencies: {
      deepseek: Boolean(process.env.DEEPSEEK_API_KEY),
      xfyun: Boolean(
        process.env.XFYUN_APPID &&
        process.env.XFYUN_API_KEY &&
        process.env.XFYUN_API_SECRET
      )
    }
  });
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
  let glossary = [];

  let currentSegmentId = 1;
  let currentRevision = 0;
  let currentSegmentStartAt = Date.now();
  let currentSegmentFirstAudioSentAt = null;
  let lastSegmentText = '';

  const sendJson = (payload) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    }
  };

  const createSegmentMeta = (text, isFinal) => {
    currentRevision += 1;
    const asrAt = Date.now();
    const corrected = Boolean(lastSegmentText && lastSegmentText !== text);
    lastSegmentText = text;

    return {
      segmentId: currentSegmentId,
      revision: currentRevision,
      status: isFinal ? (corrected ? 'corrected' : 'confirmed') : (corrected ? 'correcting' : 'recognizing'),
      corrected,
      segmentStartedAt: currentSegmentStartAt,
      firstAudioSentAt: currentSegmentFirstAudioSentAt,
      asrAt
    };
  };

  const finishCurrentSegment = () => {
    currentSegmentId += 1;
    currentRevision = 0;
    currentSegmentStartAt = Date.now();
    currentSegmentFirstAudioSentAt = null;
    lastSegmentText = '';
  };

  const translateAndSend = async (text, isFinal, seq, meta = {}) => {
    if (!text || !text.trim()) return;

    const translateStartedAt = Date.now();

    try {
      const translateResult = await translateService.translate(text, 'zh', { glossary });

      if (!isFinal && seq < latestTranslateSeq) {
        return;
      }

      const translatedAt = Date.now();
      const latency = {
        asrMs: meta.firstAudioSentAt ? Math.max(0, meta.asrAt - meta.firstAudioSentAt) : null,
        translateMs: translatedAt - translateStartedAt,
        totalMs: meta.firstAudioSentAt ? Math.max(0, translatedAt - meta.firstAudioSentAt) : null
      };

      sendJson({
        type: 'translateResult',
        original: text,
        translated: translateResult.translated,
        isFinal,
        segmentId: meta.segmentId,
        revision: meta.revision,
        status: meta.status,
        corrected: meta.corrected,
        latency,
        glossaryUsed: glossary
      });
    } catch (error) {
      console.error('Translate error:', error);
      sendJson({
        type: 'error',
        message: error.message
      });
    }
  };

  const schedulePartialTranslate = (text, meta) => {
    lastPartialText = text;
    schedulePartialTranslate.latestMeta = meta;

    if (partialTranslateTimer || isPartialTranslating) {
      return;
    }

    partialTranslateTimer = setTimeout(async () => {
      partialTranslateTimer = null;
      isPartialTranslating = true;

      const seq = ++latestTranslateSeq;
      const textToTranslate = lastPartialText;
      const metaToTranslate = schedulePartialTranslate.latestMeta;

      try {
        await translateAndSend(textToTranslate, false, seq, metaToTranslate);
      } finally {
        isPartialTranslating = false;

        if (lastPartialText !== textToTranslate) {
          schedulePartialTranslate(lastPartialText, schedulePartialTranslate.latestMeta);
        }
      }
    }, 220);
  };

  const startStreamAsr = async () => {
    if (isAsrStarted) return;
    isAsrStarted = true;

    try {
      await streamAsr.start(
        async (text, isFinal) => {
          if (!text || !text.trim()) return;

          const meta = createSegmentMeta(text, isFinal);

          sendJson({
            type: 'transcribeResult',
            text,
            isFinal,
            segmentId: meta.segmentId,
            revision: meta.revision,
            status: meta.status,
            corrected: meta.corrected
          });

          if (isFinal) {
            latestTranslateSeq += 1;
            lastPartialText = '';

            if (partialTranslateTimer) {
              clearTimeout(partialTranslateTimer);
              partialTranslateTimer = null;
            }

            await translateAndSend(text, true, latestTranslateSeq, meta);
            finishCurrentSegment();
          } else {
            schedulePartialTranslate(text, meta);
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
            if (!currentSegmentFirstAudioSentAt) {
              currentSegmentFirstAudioSentAt = Number(data.sentAt) || Date.now();
              currentSegmentStartAt = Date.now();
            }

            const audioChunk = Buffer.from(data.data);
            await startStreamAsr();
            streamAsr.sendAudio(audioChunk, false);
          }
          break;
        }

        case 'config':
          glossary = Array.isArray(data.glossary) ? data.glossary.slice(0, 30) : [];
          sendJson({ type: 'configAck', glossary });
          break;

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
              {
                segmentId: 'demo-1',
                revision: 1,
                original: 'Kuber net ease can schedule containers.',
                translated: 'Kuber net ease 可以调度容器。',
                isFinal: false,
                status: 'recognizing',
                corrected: false,
                latency: { asrMs: 680, translateMs: 240, totalMs: 920 }
              },
              {
                segmentId: 'demo-1',
                revision: 2,
                original: 'Kubernetes can schedule containers.',
                translated: 'Kubernetes 可以调度容器。',
                isFinal: false,
                status: 'correcting',
                corrected: true,
                latency: { asrMs: 760, translateMs: 250, totalMs: 1010 }
              },
              {
                segmentId: 'demo-1',
                revision: 3,
                original: 'Kubernetes can schedule containers.',
                translated: 'Kubernetes 可以调度容器。',
                isFinal: true,
                status: 'corrected',
                corrected: true,
                latency: { asrMs: 940, translateMs: 270, totalMs: 1210 }
              },
              {
                segmentId: 'demo-2',
                revision: 1,
                original: 'The API gateway reduces latency.',
                translated: 'API 网关可以降低延迟。',
                isFinal: false,
                status: 'recognizing',
                corrected: false,
                latency: { asrMs: 640, translateMs: 230, totalMs: 870 }
              },
              {
                segmentId: 'demo-2',
                revision: 2,
                original: 'The API gateway reduces latency.',
                translated: 'API 网关可以降低延迟。',
                isFinal: true,
                status: 'confirmed',
                corrected: false,
                latency: { asrMs: 830, translateMs: 220, totalMs: 1050 }
              }
            ];
            let index = 0;

            testTimer = setInterval(() => {
              sendJson({
                type: 'translateResult',
                glossaryUsed: glossary,
                ...samples[index]
              });
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

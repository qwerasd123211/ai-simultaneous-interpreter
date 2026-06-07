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

// ============================================
// WebSocket 连接处理（流式 ASR）
// ============================================

wss.on('connection', (ws, req) => {
  const clientId = Date.now() + '-' + Math.random().toString(36).substr(2, 6);
  console.log(`[${clientId}] 客户端已连接`);

  // 流式识别会话状态
  let asrSession = null;          // ASR 流式会话
  let asrPendingAudio = [];       // 等待 ASR 就绪时的缓存音频
  let isAsrReady = false;         // ASR 是否就绪
  let currentAsrText = '';        // 当前识别的中间结果
  let lastFinalText = '';         // 上一次最终结果，避免重复
  let isTestMode = false;         // 测试模式
  let asrReconnectTimer = null;   // 重连定时器

  // 判断是否使用讯飞 API
  const hasXfyun = !!(process.env.XFYUN_APPID && process.env.XFYUN_API_KEY && process.env.XFYUN_API_SECRET);

  /**
   * 初始化或重置 ASR 会话
   */
  function initAsrSession() {
    // 关闭旧会话
    if (asrSession) {
      asrService.closeStreamSession(clientId);
      asrSession = null;
    }
    isAsrReady = false;
    asrPendingAudio = [];
    currentAsrText = '';

    // 创建新会话
    if (hasXfyun) {
      asrSession = asrService.createStreamSession(
        clientId,
        onAsrResult,
        onAsrError,
        onAsrEnd
      );
    } else {
      // 没有讯飞 API Key，使用模拟会话
      console.log(`[${clientId}] 使用模拟 ASR 会话`);
      asrSession = asrService.createMockSession(
        clientId,
        onAsrResult,
        onAsrError,
        onAsrEnd
      );
      isAsrReady = true; // 模拟会话立即可用
    }
  }

  /**
   * ASR 识别结果回调
   */
  function onAsrResult(text, isFinal) {
    console.log(`[${clientId}] ASR ${isFinal ? '最终' : '中间'}: "${text.substring(0, 60)}"`);

    currentAsrText = text;

    // 发送识别结果到前端
    ws.send(JSON.stringify({
      type: 'transcribeResult',
      text: text,
      isFinal: isFinal
    }));

    if (isFinal) {
      // 避免重复发送相同的最终结果
      if (text && text !== lastFinalText) {
        lastFinalText = text;

        // 翻译最终结果
        translateAndSend(text);
      }
    } else {
      // 中间结果也翻译（低优先级，显示给用户看）
      translateAndSend(text, true);
    }
  }

  /**
   * ASR 错误回调
   */
  function onAsrError(error) {
    console.error(`[${clientId}] ASR 错误:`, error.message);

    ws.send(JSON.stringify({
      type: 'error',
      message: '语音识别错误: ' + error.message
    }));

    // 5 秒后尝试重连
    if (asrReconnectTimer) clearTimeout(asrReconnectTimer);
    asrReconnectTimer = setTimeout(() => {
      console.log(`[${clientId}] 尝试重连 ASR...`);
      initAsrSession();
    }, 5000);
  }

  /**
   * ASR 结束回调（一句话识别完成）
   */
  function onAsrEnd() {
    console.log(`[${clientId}] ASR 一句话识别完成`);

    // 重置状态，准备接收下一句
    // 不关闭会话，讯飞会等待新的音频
    asrService.resetStreamSession(clientId);

    // 通知前端一句话结束了
    ws.send(JSON.stringify({
      type: 'sentenceEnd',
      text: currentAsrText
    }));
  }

  /**
   * 翻译并发送结果
   */
  async function translateAndSend(text, isIntermediate = false) {
    try {
      const translateResult = await translateService.translate(text);
      if (translateResult.translated) {
        ws.send(JSON.stringify({
          type: 'translateResult',
          original: text,
          translated: translateResult.translated,
          isFinal: !isIntermediate
        }));
      }
    } catch (error) {
      console.error(`[${clientId}] 翻译错误:`, error.message);
    }
  }

  /**
   * 发送音频到 ASR
   */
  function processAudioChunk(audioData) {
    if (!asrSession) {
      // 尚未创建会话，先创建
      initAsrSession();
      asrPendingAudio.push(audioData);
      return;
    }

    if (!isAsrReady) {
      // ASR 未就绪，缓存音频
      asrPendingAudio.push(audioData);
      return;
    }

    // 发送到讯飞
    asrService.sendAudioChunk(clientId, audioData, false);
  }

  // ============================================
  // 消息处理
  // ============================================

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);

      switch (data.type) {
        case 'audio':
          // 接收音频数据 - 流式处理
          if (data.data && data.data.length > 0) {
            const audioChunk = Buffer.from(data.data);
            processAudioChunk(audioChunk);
          }
          break;

        case 'test':
          // 测试模式
          isTestMode = data.enabled;
          if (data.enabled) {
            console.log(`[${clientId}] 开启测试模式`);
            initAsrSession();
            // 模拟会话会自动发送数据
          } else {
            console.log(`[${clientId}] 关闭测试模式`);
            if (asrSession) {
              asrService.closeStreamSession(clientId);
              asrSession = null;
            }
          }
          break;

        case 'ping':
          ws.send(JSON.stringify({ type: 'pong' }));
          break;
      }
    } catch (error) {
      console.error(`[${clientId}] 消息处理错误:`, error.message);
      ws.send(JSON.stringify({
        type: 'error',
        message: error.message
      }));
    }
  });

  // 监听 ASR 就绪
  // 对于讯飞，需要等待 WebSocket 握手完成
  // 我们通过轮询检测
  const readyCheck = setInterval(() => {
    if (asrSession && asrSession.isOpen && !isAsrReady) {
      isAsrReady = true;

      // 发送缓存的音频
      if (asrPendingAudio.length > 0) {
        console.log(`[${clientId}] 发送 ${asrPendingAudio.length} 个缓存音频块`);
        for (const chunk of asrPendingAudio) {
          asrService.sendAudioChunk(clientId, chunk, false);
        }
        asrPendingAudio = [];
      }
    }
  }, 200);

  // 10 秒后停止检查
  setTimeout(() => clearInterval(readyCheck), 10000);

  // 初始化 ASR 会话
  initAsrSession();

  // ============================================
  // 断开连接
  // ============================================

  ws.on('close', () => {
    console.log(`[${clientId}] 客户端已断开`);
    clearInterval(readyCheck);
    if (asrReconnectTimer) clearTimeout(asrReconnectTimer);
    if (asrSession) {
      asrService.closeStreamSession(clientId);
      asrSession = null;
    }
  });
});

// 启动服务器
server.listen(PORT, () => {
  console.log(`🚀 AI 同声传译助手运行在 http://localhost:${PORT}`);
  console.log(`📡 WebSocket 服务已启动`);
  console.log(`🔊 讯飞 ASR: ${process.env.XFYUN_APPID ? '已配置' : '未配置（使用模拟数据）'}`);
  console.log(`🌍 DeepSeek: ${process.env.DEEPSEEK_API_KEY ? '已配置' : '未配置（使用模拟翻译）'}`);
});

module.exports = app;
/**
 * 语音识别服务 (ASR)
 * 支持讯飞语音流式识别 API（真正的实时流式）
 */

const crypto = require('crypto');
const WebSocket = require('ws');

// 讯飞语音 API 配置
const XFYUN_APPID = process.env.XFYUN_APPID;
const XFYUN_API_KEY = process.env.XFYUN_API_KEY;
const XFYUN_API_SECRET = process.env.XFYUN_API_SECRET;

/**
 * 生成讯飞签名 URL
 */
function createXfyunUrl() {
  const url = 'wss://iat-api.xfyun.cn/v2/iat';
  const date = new Date().toUTCString();

  // 生成签名
  const signatureOrigin = `host: iat-api.xfyun.cn\ndate: ${date}\nGET /v2/iat HTTP/1.1`;
  const signatureSha = crypto.createHmac('sha256', XFYUN_API_SECRET)
    .update(signatureOrigin)
    .digest('base64');

  const authorizationOrigin = `api_key="${XFYUN_API_KEY}", algorithm="hmac-sha256", headers="host date request-line", signature="${signatureSha}"`;
  const authorization = Buffer.from(authorizationOrigin).toString('base64');

  const params = new URLSearchParams({
    authorization: authorization,
    date: date,
    host: 'iat-api.xfyun.cn'
  });

  return `${url}?${params.toString()}`;
}

// ============================================
// 流式识别会话管理
// ============================================

const streamSessions = new Map();

/**
 * 创建流式识别会话
 * @param {string} sessionId - 会话标识
 * @param {Function} onResult - 收到识别结果回调 (text, isFinal)
 * @param {Function} onError - 错误回调
 * @param {Function} onEnd - 识别结束回调
 * @returns {Object} 会话对象
 */
function createStreamSession(sessionId, onResult, onError, onEnd) {
  // 如果已有会话，先关闭
  if (streamSessions.has(sessionId)) {
    closeStreamSession(sessionId);
  }

  try {
    const url = createXfyunUrl();
    const xfyunWs = new WebSocket(url);

    const session = {
      xfyunWs,
      isOpen: false,
      result: '',
      lastResult: '',
      silenceTimer: null,
      isEnding: false
    };

    xfyunWs.on('open', () => {
      console.log(`[ASR] 讯飞连接已建立, session: ${sessionId}`);

      // 发送开始帧
      const startFrame = {
        common: { app_id: XFYUN_APPID },
        business: {
          language: 'en_us',
          domain: 'iat',
          accent: 'mandarin',
          vad_eos: 5000,
          dwa: 'wpgs' // 动态拼接模式，支持实时返回
        },
        data: {
          status: 0,
          format: 'audio/L16;rate=16000',
          encoding: 'raw'
        }
      };

      xfyunWs.send(JSON.stringify(startFrame));
      session.isOpen = true;
      console.log(`[ASR] 会话 ${sessionId} 已就绪`);
    });

    xfyunWs.on('message', (rawData) => {
      try {
        const response = JSON.parse(rawData);

        if (response.code !== 0) {
          console.error(`[ASR] 讯飞错误: ${response.message}`);
          onError(new Error(`讯飞 API 错误: ${response.message}`));
          return;
        }

        if (response.data && response.data.result) {
          const rd = response.data.result;

          // 提取识别文本
          if (rd.ws) {
            let text = '';
            rd.ws.forEach(ws => {
              ws.cw.forEach(cw => {
                text += cw.w;
              });
            });

            if (text) {
              // pgs: rpl=替换模式(中间结果), apl=追加模式(最终结果)
              const isFinal = rd.pgs === 'apl' || response.data.status === 2;

              if (rd.pgs === 'rpl') {
                // 中间结果：替换之前的文本
                session.lastResult = text;
                onResult(text, false);
              } else if (rd.pgs === 'apl') {
                // 追加结果：在之前的结果上追加
                session.result += text;
                session.lastResult = session.result;
                onResult(session.result, isFinal);
              }
            }
          }
        }

        // 识别结束
        if (response.data && response.data.status === 2) {
          console.log(`[ASR] 讯飞识别结束, session: ${sessionId}`);
          if (session.lastResult) {
            onResult(session.lastResult, true);
          }
          onEnd();
          // 不立即关闭，等待后续音频可能重新开始
        }
      } catch (e) {
        console.error('[ASR] 解析讯飞响应错误:', e);
      }
    });

    xfyunWs.on('error', (error) => {
      console.error(`[ASR] WebSocket错误, session: ${sessionId}:`, error.message);
      onError(error);
    });

    xfyunWs.on('close', () => {
      console.log(`[ASR] 讯飞连接关闭, session: ${sessionId}`);
      session.isOpen = false;
      streamSessions.delete(sessionId);
    });

    const sessionObj = { ...session };
    streamSessions.set(sessionId, sessionObj);
    return sessionObj;
  } catch (error) {
    console.error(`[ASR] 创建会话失败:`, error.message);
    onError(error);
    return null;
  }
}

/**
 * 发送音频数据块到流式会话
 * @param {string} sessionId - 会话标识
 * @param {Buffer} audioChunk - PCM 16bit 16kHz 音频数据
 * @param {boolean} isLast - 是否为最后一帧
 */
function sendAudioChunk(sessionId, audioChunk, isLast = false) {
  const session = streamSessions.get(sessionId);
  if (!session) {
    console.warn(`[ASR] 会话 ${sessionId} 不存在，无法发送音频`);
    return false;
  }

  if (!session.isOpen) {
    console.warn(`[ASR] 会话 ${sessionId} 未就绪，缓存音频`);
    return false;
  }

  try {
    const frame = {
      data: {
        status: isLast ? 2 : 1,
        format: 'audio/L16;rate=16000',
        encoding: 'raw',
        audio: audioChunk.toString('base64')
      }
    };

    session.xfyunWs.send(JSON.stringify(frame));

    if (isLast) {
      console.log(`[ASR] 已发送结束帧, session: ${sessionId}`);
    }

    return true;
  } catch (error) {
    console.error(`[ASR] 发送音频失败:`, error.message);
    return false;
  }
}

/**
 * 关闭流式识别会话
 */
function closeStreamSession(sessionId) {
  const session = streamSessions.get(sessionId);
  if (session) {
    try {
      // 发送结束帧（如果还未发送）
      if (session.isOpen && !session.isEnding) {
        session.isEnding = true;
        const endFrame = {
          data: {
            status: 2
          }
        };
        session.xfyunWs.send(JSON.stringify(endFrame));
      }
      // 延迟关闭，等待讯飞返回最终结果
      setTimeout(() => {
        try {
          session.xfyunWs.close();
        } catch (e) { /* ignore */ }
        streamSessions.delete(sessionId);
      }, 3000);
    } catch (e) {
      try { session.xfyunWs.close(); } catch (e2) { /* ignore */ }
      streamSessions.delete(sessionId);
    }
    console.log(`[ASR] 会话 ${sessionId} 已关闭`);
  }
}

/**
 * 重置流式会话（用于新一段语音）
 */
function resetStreamSession(sessionId) {
  const session = streamSessions.get(sessionId);
  if (session) {
    session.result = '';
    session.lastResult = '';
  }
}

// ============================================
// 非流式识别（兼容旧的批量模式）
// ============================================

async function transcribe(input) {
  // 不再支持非流式识别，全部走流式
  throw new Error('请使用流式识别接口 - createStreamSession / sendAudioChunk');
}

/**
 * 模拟识别（开发测试用流式版本）
 */
let mockIndex = 0;
const mockPhrases = [
  { text: 'Hello, welcome to the AI simultaneous interpreter.', segments: [] },
  { text: 'This tool will help you understand English content in real-time.', segments: [] },
  { text: 'It provides Chinese subtitles for videos, podcasts, and live streams.', segments: [] },
  { text: 'The recognition accuracy is continuously improving with AI technology.', segments: [] },
  { text: 'You can use it for learning English, watching movies, or attending online meetings.', segments: [] }
];

/**
 * 创建模拟流式识别会话
 */
function createMockSession(sessionId, onResult, onError, onEnd) {
  console.log(`[ASR] 创建模拟会话: ${sessionId}`);

  let timeoutId = null;
  let isRunning = true;

  const session = {
    isOpen: true,
    mockTimeout: null,
    mockIndex: 0,
    close: () => {
      isRunning = false;
      if (timeoutId) clearTimeout(timeoutId);
    }
  };

  // 模拟流式返回结果
  const phrase = mockPhrases[mockIndex % mockPhrases.length];
  mockIndex++;

  const words = phrase.text.split(' ');
  let accumulated = '';
  let wordIndex = 0;

  function sendNextWord() {
    if (!isRunning) return;

    if (wordIndex < words.length) {
      accumulated += (accumulated ? ' ' : '') + words[wordIndex];
      wordIndex++;

      // 作为中间结果发送
      onResult(accumulated, false);

      // 随机间隔 200-500ms 模拟流式返回
      const delay = 200 + Math.random() * 300;
      timeoutId = setTimeout(sendNextWord, delay);
    } else {
      // 发送最终结果
      onResult(accumulated, true);
      onEnd();
    }
  }

  // 立即开始发送
  sendNextWord();

  return session;
}

module.exports = {
  transcribe,
  createStreamSession,
  createMockSession,
  sendAudioChunk,
  closeStreamSession,
  resetStreamSession
};
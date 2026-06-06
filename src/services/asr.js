/**
 * 语音识别服务 (ASR)
 * 支持讯飞语音识别 API
 */

const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const WebSocket = require('ws');

// 讯飞语音 API 配置
const XFYUN_APPID = process.env.XFYUN_APPID;
const XFYUN_API_KEY = process.env.XFYUN_API_KEY;
const XFYUN_API_SECRET = process.env.XFYUN_API_SECRET;

/**
 * 语音识别
 * @param {string|Buffer} input - 音频文件路径或 Buffer 数据
 * @returns {Object} 识别结果
 */
async function transcribe(input) {
  let audioData;
  let fileName = 'audio-chunk';

  if (Buffer.isBuffer(input)) {
    // 直接使用 Buffer 数据
    audioData = input;
  } else if (typeof input === 'string') {
    // 读取文件
    if (!fs.existsSync(input)) {
      throw new Error('音频文件不存在');
    }
    audioData = fs.readFileSync(input);
    fileName = path.basename(input);
  } else {
    throw new Error('无效的输入类型');
  }

  // 根据配置选择识别服务
  if (XFYUN_APPID && XFYUN_API_KEY && XFYUN_API_SECRET) {
    return await transcribeWithXfyun(audioData, fileName);
  } else {
    // 使用模拟数据（开发测试用）
    return await transcribeMock(audioData, fileName);
  }
}

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

/**
 * 使用讯飞语音 API 识别
 */
async function transcribeWithXfyun(audioData, fileName) {
  console.log('[ASR] 使用讯飞语音识别:', fileName);

  return new Promise((resolve, reject) => {
    const url = createXfyunUrl();
    const ws = new WebSocket(url);

    let result = '';
    let segments = [];

    ws.on('open', () => {
      console.log('[ASR] WebSocket 连接成功');

      // 发送开始帧
      const startFrame = {
        common: { app_id: XFYUN_APPID },
        business: {
          language: 'en_us',
          domain: 'iat',
          accent: 'mandarin',
          vad_eos: 3000,
          dwa: 'wpgs'
        },
        data: {
          status: 0,
          format: 'audio/L16;rate=16000',
          encoding: 'raw'
        }
      };

      ws.send(JSON.stringify(startFrame));

      // 分片发送音频数据
      const chunkSize = 1280; // 每次发送 1280 字节
      let offset = 0;

      const sendChunk = () => {
        if (offset < audioData.length) {
          const chunk = audioData.slice(offset, offset + chunkSize);
          offset += chunkSize;

          const frame = {
            data: {
              status: 1,
              audio: chunk.toString('base64')
            }
          };

          ws.send(JSON.stringify(frame));
          setTimeout(sendChunk, 40); // 模拟实时发送
        } else {
          // 发送结束帧
          const endFrame = {
            data: {
              status: 2
            }
          };
          ws.send(JSON.stringify(endFrame));
        }
      };

      sendChunk();
    });

    ws.on('message', (data) => {
      try {
        const response = JSON.parse(data);

        if (response.code !== 0) {
          reject(new Error(`讯飞 API 错误: ${response.message}`));
          return;
        }

        if (response.data && response.data.result) {
          const resultData = response.data.result;

          // 提取识别结果
          if (resultData.ws) {
            let text = '';
            resultData.ws.forEach(ws => {
              ws.cw.forEach(cw => {
                text += cw.w;
              });
            });

            if (text) {
              result += text;
              segments.push({
                start: segments.length * 2,
                end: (segments.length + 1) * 2,
                text: text
              });
            }
          }

          // 检查是否识别完成
          if (resultData.pgs === 'rpl') {
            // 替换模式，更新结果
            result = '';
            segments = [];
          }
        }

        // 检查是否结束
        if (response.data && response.data.status === 2) {
          ws.close();
          resolve({
            text: result || '未能识别语音内容',
            segments: segments.length > 0 ? segments : [
              { start: 0, end: 2, text: result || '未能识别语音内容' }
            ]
          });
        }
      } catch (e) {
        console.error('[ASR] 解析响应错误:', e);
      }
    });

    ws.on('error', (error) => {
      console.error('[ASR] WebSocket 错误:', error);
      reject(error);
    });

    ws.on('close', () => {
      console.log('[ASR] WebSocket 连接关闭');
    });

    // 超时处理
    setTimeout(() => {
      ws.close();
      if (result) {
        resolve({
          text: result,
          segments: segments
        });
      } else {
        reject(new Error('语音识别超时'));
      }
    }, 30000);
  });
}

/**
 * 模拟识别（开发测试用）
 * 提供多样化的测试数据，覆盖不同场景
 */
const mockPhrases = [
  {
    text: 'Hello, welcome to the AI simultaneous interpreter.',
    segments: [
      { start: 0, end: 2.5, text: 'Hello, welcome to' },
      { start: 2.5, end: 5.0, text: 'the AI simultaneous interpreter.' }
    ]
  },
  {
    text: 'This tool will help you understand English content in real-time.',
    segments: [
      { start: 0, end: 3.0, text: 'This tool will help you' },
      { start: 3.0, end: 6.0, text: 'understand English content' },
      { start: 6.0, end: 8.0, text: 'in real-time.' }
    ]
  },
  {
    text: 'It provides Chinese subtitles for videos, podcasts, and live streams.',
    segments: [
      { start: 0, end: 2.5, text: 'It provides Chinese subtitles' },
      { start: 2.5, end: 5.0, text: 'for videos, podcasts,' },
      { start: 5.0, end: 7.5, text: 'and live streams.' }
    ]
  },
  {
    text: 'The recognition accuracy is continuously improving with AI technology.',
    segments: [
      { start: 0, end: 3.0, text: 'The recognition accuracy' },
      { start: 3.0, end: 5.5, text: 'is continuously improving' },
      { start: 5.5, end: 8.0, text: 'with AI technology.' }
    ]
  },
  {
    text: 'You can use it for learning English, watching movies, or attending online meetings.',
    segments: [
      { start: 0, end: 3.0, text: 'You can use it for' },
      { start: 3.0, end: 5.5, text: 'learning English,' },
      { start: 5.5, end: 8.0, text: 'watching movies,' },
      { start: 8.0, end: 11.0, text: 'or attending online meetings.' }
    ]
  }
];

let mockIndex = 0;

async function transcribeMock(audioData, fileName) {
  console.log('[ASR] 使用模拟识别:', fileName);

  // 模拟处理时间（随机 800-1500ms）
  const delay = 800 + Math.random() * 700;
  await new Promise(resolve => setTimeout(resolve, delay));

  // 循环使用测试数据
  const phrase = mockPhrases[mockIndex % mockPhrases.length];
  mockIndex++;

  return {
    text: phrase.text,
    segments: phrase.segments
  };
}

/**
 * 实时语音识别（流式）
 * @param {WebSocket} ws - WebSocket 连接
 * @param {Buffer} audioChunk - 音频数据块
 */
async function transcribeStream(ws, audioChunk) {
  // 实时流式识别
  // 用于实时音频流处理
  console.log('[ASR] 收到音频数据块:', audioChunk.length, '字节');

  // TODO: 实现实时流式识别
  // 1. 将音频数据块发送到识别 API
  // 2. 接收部分识别结果
  // 3. 通过 WebSocket 返回结果
}

module.exports = {
  transcribe,
  transcribeStream
};

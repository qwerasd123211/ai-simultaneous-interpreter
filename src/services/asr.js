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
 * 使用讯飞语音 API 识别
 */
async function transcribeWithXfyun(audioData, fileName) {
  console.log('[ASR] 使用讯飞语音识别:', fileName, '数据大小:', audioData.length, '字节');

  return new Promise((resolve, reject) => {
    // 生成签名 URL
    const url = createXfyunUrl();

    // 建立 WebSocket 连接
    const ws = new WebSocket(url);

    let result = {
      text: '',
      segments: []
    };

    ws.on('open', () => {
      console.log('[ASR] WebSocket 连接已建立');

      // 发送音频数据
      const frameSize = 1280; // 每帧大小
      const interval = 40; // 发送间隔（毫秒）

      // 分帧发送音频数据
      for (let i = 0; i < audioData.length; i += frameSize) {
        const frame = audioData.slice(i, i + frameSize);
        const isLast = i + frameSize >= audioData.length;

        setTimeout(() => {
          const message = {
            common: {
              app_id: XFYUN_APPID
            },
            business: {
              language: 'en_us', // 英语
              domain: 'iat',
              accent: 'mandarin',
              vad_eos: 3000,
              dwa: 'wpgs'
            },
            data: {
              status: isLast ? 2 : (i === 0 ? 0 : 1),
              format: 'audio/L16;rate=16000',
              encoding: 'raw',
              audio: frame.toString('base64')
            }
          };

          ws.send(JSON.stringify(message));
        }, Math.floor(i / frameSize) * interval);
      }
    });

    ws.on('message', (data) => {
      try {
        const response = JSON.parse(data);

        if (response.code !== 0) {
          console.error('[ASR] 讯飞 API 错误:', response.code, response.message);
          reject(new Error(`讯飞 API 错误: ${response.message}`));
          return;
        }

        // 解析识别结果
        if (response.data && response.data.result) {
          const resultData = response.data.result;
          if (resultData.ws) {
            let text = '';
            resultData.ws.forEach(ws => {
              ws.cw.forEach(cw => {
                text += cw.w;
              });
            });

            if (resultData.pgs === 'apd') {
              // 追加模式
              result.text += text;
            } else {
              // 替换模式
              result.text = text;
            }

            // 添加分段信息
            result.segments.push({
              start: result.segments.length * 2,
              end: (result.segments.length + 1) * 2,
              text: text
            });
          }
        }

        // 检查是否完成
        if (response.data && response.data.status === 2) {
          ws.close();
          resolve(result);
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
      console.log('[ASR] WebSocket 连接已关闭');
      // 如果没有收到完成状态，返回当前结果
      if (result.text) {
        resolve(result);
      }
    });

    // 超时处理
    setTimeout(() => {
      ws.close();
      if (result.text) {
        resolve(result);
      } else {
        reject(new Error('语音识别超时'));
      }
    }, 30000);
  });
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
 * 模拟识别（开发测试用）
 */
async function transcribeMock(audioData, fileName) {
  console.log('[ASR] 使用模拟识别:', fileName);

  // 模拟处理时间
  await new Promise(resolve => setTimeout(resolve, 1000));

  return {
    text: 'Hello, welcome to the AI simultaneous interpreter. This tool will help you understand English content in real-time by providing Chinese subtitles.',
    segments: [
      { start: 0, end: 2.5, text: 'Hello, welcome to' },
      { start: 2.5, end: 5.0, text: 'the AI simultaneous interpreter.' },
      { start: 5.0, end: 8.0, text: 'This tool will help you understand' },
      { start: 8.0, end: 10.5, text: 'English content in real-time' },
      { start: 10.5, end: 13.0, text: 'by providing Chinese subtitles.' }
    ]
  };
}

module.exports = {
  transcribe
};

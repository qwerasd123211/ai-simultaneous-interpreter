/**
 * 流式语音识别服务
 * 保持与讯飞的长连接，实时返回中间识别结果
 */

const WebSocket = require('ws');
const crypto = require('crypto');

// 讯飞语音 API 配置
const XFYUN_APPID = process.env.XFYUN_APPID;
const XFYUN_API_KEY = process.env.XFYUN_API_KEY;
const XFYUN_API_SECRET = process.env.XFYUN_API_SECRET;

class StreamAsrService {
  constructor() {
    this.ws = null;
    this.isConnected = false;
    this.isConnecting = false;
    this.isFirstFrame = true;
    this.resultText = '';
    this.onResult = null;
    this.onError = null;
    this.onClose = null;
    this.status = 0; // 0=未开始, 1=进行中, 2=结束
    this.pendingAudio = []; // 连接前的待发送音频
    this.lastActivityTime = Date.now();
    this.silenceTimer = null;
  }

  /**
   * 开始流式识别
   */
  async start(onResult, onError, onClose) {
    if (this.isConnected || this.isConnecting) {
      return; // 已经在连接中或已连接
    }

    this.onResult = onResult;
    this.onError = onError;
    this.onClose = onClose;
    this.isFirstFrame = true;
    this.resultText = '';
    this.status = 0;
    this.pendingAudio = [];
    this.lastActivityTime = Date.now();

    this.isConnecting = true;

    return new Promise((resolve, reject) => {
      try {
        const url = this.createXfyunUrl();
        console.log('[StreamASR] 正在连接讯飞...');
        this.ws = new WebSocket(url);

        this.ws.on('open', () => {
          console.log('[StreamASR] 讯飞 WebSocket 连接已建立');
          this.isConnected = true;
          this.isConnecting = false;
          this.status = 1;

          // 发送所有待发送的音频
          if (this.pendingAudio.length > 0) {
            const combined = Buffer.concat(this.pendingAudio);
            this.pendingAudio = [];
            console.log(`[StreamASR] 发送缓存音频: ${combined.length} 字节`);
            this._sendAudioInternal(combined, false);
          }

          resolve();
        });

        this.ws.on('message', (data) => {
          this.handleMessage(data);
        });

        this.ws.on('error', (error) => {
          console.error('[StreamASR] WebSocket 错误:', error.message);
          this.isConnected = false;
          this.isConnecting = false;
          if (this.onError) this.onError(error);
          reject(error);
        });

        this.ws.on('close', () => {
          console.log('[StreamASR] WebSocket 连接已关闭');
          this.isConnected = false;
          this.isConnecting = false;
          if (this.onClose) this.onClose();
        });

        // 连接超时
        setTimeout(() => {
          if (!this.isConnected && this.isConnecting) {
            this.isConnecting = false;
            reject(new Error('连接讯飞超时'));
          }
        }, 5000);

      } catch (error) {
        this.isConnecting = false;
        reject(error);
      }
    });
  }

  /**
   * 发送音频数据
   */
  sendAudio(audioData, isLast = false) {
    this.lastActivityTime = Date.now();

    if (this.isConnected && this.ws) {
      this._sendAudioInternal(audioData, isLast);
    } else {
      // 缓存音频，等连接成功后发送
      this.pendingAudio.push(audioData);
      console.log(`[StreamASR] 音频已缓存，等待连接... (${this.pendingAudio.length} 块)`);

      // 如果还没在连接，启动连接
      if (!this.isConnecting) {
        this.start(this.onResult, this.onError, this.onClose).catch(err => {
          console.error('[StreamASR] 自动启动失败:', err.message);
        });
      }
    }

    if (isLast) {
      this.status = 2;
    }
  }

  /**
   * 内部发送音频
   */
  _sendAudioInternal(audioData, isLast) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    // 讯飞要求每帧 1280 字节（40ms @ 16kHz 16bit mono）
    const frameSize = 1280;

    for (let i = 0; i < audioData.length; i += frameSize) {
      const frame = audioData.slice(i, i + frameSize);
      const frameIsLast = isLast && (i + frameSize >= audioData.length);

      const message = {};

      // 只在第一帧发送 common 和 business
      if (this.isFirstFrame) {
        message.common = { app_id: XFYUN_APPID };
        message.business = {
          language: 'en_us',
          domain: 'iat',
          accent: 'mandarin',
          vad_eos: 5000,  // VAD 静音检测 5 秒
          dwa: 'wpgs'
        };
        this.isFirstFrame = false;
      }

      message.data = {
        status: frameIsLast ? 2 : (this.status === 0 ? 0 : 1),
        format: 'audio/L16;rate=16000',
        encoding: 'raw',
        audio: frame.toString('base64')
      };

      this.ws.send(JSON.stringify(message));
    }
  }

  /**
   * 处理讯飞返回的消息
   */
  handleMessage(data) {
    try {
      const response = JSON.parse(data);

      if (response.code !== 0) {
        console.error('[StreamASR] 讯飞 API 错误:', response.code, response.message);
        if (this.onError) this.onError(new Error(`讯飞 API 错误: ${response.message}`));
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
            this.resultText += text;
          } else {
            this.resultText = text;
          }

          const isFinal = response.data.status === 2;
          console.log(`[StreamASR] 识别结果${isFinal ? '(最终)' : '(中间)'}:`, this.resultText);

          if (this.onResult) {
            this.onResult(this.resultText, isFinal);
          }
        }
      }

      // 检查是否完成
      if (response.data && response.data.status === 2) {
        console.log('[StreamASR] 识别完成');
        // 识别完成后重置，准备下一段
        setTimeout(() => {
          this.resetForNextSegment();
        }, 100);
      }
    } catch (e) {
      console.error('[StreamASR] 解析响应错误:', e);
    }
  }

  /**
   * 重置以开始下一段识别
   */
  resetForNextSegment() {
    console.log('[StreamASR] 重置以开始下一段识别');
    this.isFirstFrame = true;
    this.resultText = '';
    this.status = 0;
    // 保持连接，只重置状态
  }

  /**
   * 关闭连接
   */
  close() {
    if (this.silenceTimer) {
      clearInterval(this.silenceTimer);
      this.silenceTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
    this.isConnecting = false;
    this.status = 2;
    this.pendingAudio = [];
  }

  /**
   * 生成讯飞签名 URL
   */
  createXfyunUrl() {
    const url = 'wss://iat-api.xfyun.cn/v2/iat';
    const date = new Date().toUTCString();

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
}

module.exports = StreamAsrService;

/**
 * LINGUA // AI 同声传译助手
 * 前端交互逻辑 - 浮动字幕版本
 */

// 全局状态
let isTranslating = false;
let isPaused = false;
let ws = null;
let mediaRecorder = null;
let audioStream = null;
let subtitles = [];
let history = [];

// DOM 元素
const elements = {
  startBtn: null,
  pauseBtn: null,
  stopBtn: null,
  progressFill: null,
  progressPercent: null,
  status: null,
  subtitleContainer: null,
  historyList: null
};

// ============================================
// 初始化
// ============================================

document.addEventListener('DOMContentLoaded', () => {
  initElements();
  initTypingEffect();
  loadHistory();
  createFloatingSubtitle();
});

function initElements() {
  elements.startBtn = document.getElementById('startBtn');
  elements.pauseBtn = document.getElementById('pauseBtn');
  elements.stopBtn = document.getElementById('stopBtn');
  elements.progressFill = document.getElementById('progressFill');
  elements.progressPercent = document.getElementById('progressPercent');
  elements.status = document.getElementById('status');
  elements.subtitleContainer = document.getElementById('subtitleContainer');
  elements.historyList = document.getElementById('historyList');
}

function initTypingEffect() {
  const tagline = document.querySelector('.tagline-text');
  if (!tagline) return;

  const text = tagline.textContent;
  tagline.textContent = '';

  let i = 0;
  const typeInterval = setInterval(() => {
    if (i < text.length) {
      tagline.textContent += text.charAt(i);
      i++;
    } else {
      clearInterval(typeInterval);
    }
  }, 50);
}

// 创建浮动字幕层
function createFloatingSubtitle() {
  // 检查是否已存在
  if (document.getElementById('floatingSubtitle')) {
    return;
  }

  // 创建浮动字幕容器
  const floatingDiv = document.createElement('div');
  floatingDiv.id = 'floatingSubtitle';
  floatingDiv.style.cssText = `
    position: fixed;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    width: 80%;
    max-width: 800px;
    max-height: 200px;
    overflow-y: auto;
    background: rgba(0, 0, 0, 0.85);
    border: 1px solid rgba(0, 212, 255, 0.3);
    border-radius: 12px;
    padding: 15px;
    z-index: 999999;
    display: none;
    backdrop-filter: blur(10px);
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
    font-family: 'Noto Sans SC', -apple-system, BlinkMacSystemFont, sans-serif;
  `;

  // 创建字幕列表
  const subtitleList = document.createElement('div');
  subtitleList.id = 'floatingSubtitleList';
  subtitleList.style.cssText = `
    display: flex;
    flex-direction: column;
    gap: 10px;
  `;

  floatingDiv.appendChild(subtitleList);
  document.body.appendChild(floatingDiv);

  // 添加样式
  const style = document.createElement('style');
  style.textContent = `
    .floating-subtitle-item {
      padding: 10px;
      background: rgba(255, 255, 255, 0.05);
      border-radius: 8px;
      border-left: 3px solid #00d4ff;
      animation: fadeIn 0.3s ease;
    }

    .floating-subtitle-original {
      font-size: 12px;
      color: rgba(255, 255, 255, 0.6);
      margin-bottom: 5px;
      font-style: italic;
    }

    .floating-subtitle-translated {
      font-size: 18px;
      color: white;
      font-weight: 500;
      line-height: 1.4;
    }

    .floating-subtitle-time {
      font-size: 10px;
      color: rgba(255, 255, 255, 0.4);
      margin-top: 5px;
      font-family: 'JetBrains Mono', monospace;
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }

    /* 滚动条样式 */
    #floatingSubtitle::-webkit-scrollbar {
      width: 6px;
    }
    #floatingSubtitle::-webkit-scrollbar-track {
      background: rgba(255, 255, 255, 0.05);
    }
    #floatingSubtitle::-webkit-scrollbar-thumb {
      background: rgba(255, 255, 255, 0.2);
      border-radius: 3px;
    }
  `;
  document.head.appendChild(style);
}

// 显示浮动字幕
function showFloatingSubtitle() {
  const floatingDiv = document.getElementById('floatingSubtitle');
  if (floatingDiv) {
    floatingDiv.style.display = 'block';
  }
}

// 隐藏浮动字幕
function hideFloatingSubtitle() {
  const floatingDiv = document.getElementById('floatingSubtitle');
  if (floatingDiv) {
    floatingDiv.style.display = 'none';
  }
}

// 添加浮动字幕
function addFloatingSubtitle(original, translated) {
  const subtitleList = document.getElementById('floatingSubtitleList');
  if (!subtitleList) return;

  const subtitle = {
    original: original,
    translated: translated,
    time: new Date().toLocaleTimeString()
  };

  subtitles.push(subtitle);

  const subtitleElement = document.createElement('div');
  subtitleElement.className = 'floating-subtitle-item';
  subtitleElement.innerHTML = `
    <div class="floating-subtitle-original">${escapeHtml(original)}</div>
    <div class="floating-subtitle-translated">${escapeHtml(translated)}</div>
    <div class="floating-subtitle-time">${subtitle.time}</div>
  `;

  subtitleList.appendChild(subtitleElement);

  // 滚动到底部
  const floatingDiv = document.getElementById('floatingSubtitle');
  if (floatingDiv) {
    floatingDiv.scrollTop = floatingDiv.scrollHeight;
  }

  // 限制显示数量（保留最近 10 条）
  const items = subtitleList.children;
  if (items.length > 10) {
    subtitleList.removeChild(items[0]);
  }
}

// 清空浮动字幕
function clearFloatingSubtitle() {
  const subtitleList = document.getElementById('floatingSubtitleList');
  if (subtitleList) {
    subtitleList.innerHTML = '';
  }
  subtitles = [];
}

// ============================================
// 翻译控制
// ============================================

async function startTranslation() {
  try {
    // 请求屏幕共享权限
    updateStatus('正在请求屏幕共享权限...');

    audioStream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: true
    });

    // 检查是否获取到音频轨道
    const audioTracks = audioStream.getAudioTracks();
    if (audioTracks.length === 0) {
      showError('未检测到音频，请确保选择了"共享音频"选项');
      audioStream.getTracks().forEach(track => track.stop());
      audioStream = null;
      return;
    }

    updateStatus('屏幕共享已开始，正在连接服务器...');

    // 显示浮动字幕
    showFloatingSubtitle();

    // 建立 WebSocket 连接
    connectWebSocket();

    // 更新按钮状态
    isTranslating = true;
    isPaused = false;
    elements.startBtn.disabled = true;
    elements.pauseBtn.disabled = false;
    elements.stopBtn.disabled = false;

    // 监听屏幕共享结束
    audioStream.getVideoTracks()[0].onended = () => {
      stopTranslation();
    };

  } catch (error) {
    console.error('屏幕共享错误:', error);
    if (error.name === 'NotAllowedError') {
      showError('用户取消了屏幕共享');
    } else {
      showError('屏幕共享失败: ' + error.message);
    }
  }
}

function pauseTranslation() {
  if (isPaused) {
    // 继续
    isPaused = false;
    elements.pauseBtn.querySelector('span:last-child').textContent = '暂停';
    updateStatus('翻译已继续');
  } else {
    // 暂停
    isPaused = true;
    elements.pauseBtn.querySelector('span:last-child').textContent = '继续';
    updateStatus('翻译已暂停');
  }
}

function stopTranslation() {
  isTranslating = false;
  isPaused = false;

  // 停止媒体录制
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }

  // 停止音频流
  if (audioStream) {
    audioStream.getTracks().forEach(track => track.stop());
    audioStream = null;
  }

  // 关闭 WebSocket 连接
  if (ws) {
    ws.close();
    ws = null;
  }

  // 隐藏浮动字幕
  hideFloatingSubtitle();

  // 更新按钮状态
  elements.startBtn.disabled = false;
  elements.pauseBtn.disabled = true;
  elements.stopBtn.disabled = true;
  elements.pauseBtn.querySelector('span:last-child').textContent = '暂停';

  updateStatus('翻译已停止');
}

// ============================================
// WebSocket 连接
// ============================================

function connectWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}`;

  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    console.log('WebSocket 已连接');
    updateStatus('正在识别语音...');

    // 开始录制音频
    startAudioCapture();
  };

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);

    switch (data.type) {
      case 'transcribeResult':
        handleTranscribeResult(data);
        break;
      case 'translateResult':
        handleTranslateResult(data);
        break;
      case 'error':
        showError(data.message);
        break;
    }
  };

  ws.onerror = (error) => {
    console.error('WebSocket 错误:', error);
    showError('连接错误');
    stopTranslation();
  };

  ws.onclose = () => {
    console.log('WebSocket 已关闭');
    if (isTranslating) {
      stopTranslation();
    }
  };
}

// ============================================
// 音频捕获
// ============================================

function startAudioCapture() {
  if (!audioStream) return;

  // 创建 MediaRecorder
  const options = { mimeType: 'audio/webm;codecs=opus' };

  try {
    mediaRecorder = new MediaRecorder(audioStream, options);
  } catch (e) {
    // 如果不支持 webm，尝试其他格式
    try {
      mediaRecorder = new MediaRecorder(audioStream);
    } catch (e2) {
      showError('浏览器不支持音频录制');
      return;
    }
  }

  // 每秒发送一次音频数据
  mediaRecorder.ondataavailable = (event) => {
    if (event.data.size > 0 && ws && ws.readyState === WebSocket.OPEN && !isPaused) {
      // 将音频数据转换为 ArrayBuffer 并发送
      event.data.arrayBuffer().then(buffer => {
        ws.send(JSON.stringify({
          type: 'audio',
          data: Array.from(new Uint8Array(buffer))
        }));
      });
    }
  };

  // 每秒触发一次数据
  mediaRecorder.start(1000);

  updateStatus('正在实时翻译...');
}

// ============================================
// 结果处理
// ============================================

function handleTranscribeResult(data) {
  console.log('识别结果:', data);
}

function handleTranslateResult(data) {
  console.log('翻译结果:', data);

  // 添加浮动字幕
  addFloatingSubtitle(data.original, data.translated);

  // 添加到历史记录
  addToHistory(data.original, data.translated);
}

// ============================================
// 历史记录
// ============================================

function addToHistory(original, translated) {
  const record = {
    original: original,
    translated: translated,
    time: new Date().toLocaleTimeString()
  };

  history.unshift(record);

  // 限制历史记录数量
  if (history.length > 100) {
    history = history.slice(0, 100);
  }

  // 保存到本地存储
  localStorage.setItem('translationHistory', JSON.stringify(history));

  // 更新显示
  updateHistoryDisplay();
}

function loadHistory() {
  const saved = localStorage.getItem('translationHistory');
  if (saved) {
    history = JSON.parse(saved);
    updateHistoryDisplay();
  }
}

function updateHistoryDisplay() {
  if (history.length === 0) {
    elements.historyList.innerHTML = `
      <div class="history-placeholder">
        <p>暂无翻译记录</p>
      </div>
    `;
    return;
  }

  elements.historyList.innerHTML = history.map(record => `
    <div class="history-item">
      <div class="history-text">${escapeHtml(record.original)}</div>
      <div class="history-translation">${escapeHtml(record.translated)}</div>
      <div class="history-time">${record.time}</div>
    </div>
  `).join('');
}

function clearHistory() {
  history = [];
  localStorage.removeItem('translationHistory');
  updateHistoryDisplay();
}

// ============================================
// UI 更新
// ============================================

function updateStatus(message) {
  elements.status.textContent = message;
}

function updateProgress(percent) {
  elements.progressFill.style.width = `${percent}%`;
  elements.progressPercent.textContent = `${Math.round(percent)}%`;
}

function showError(message) {
  updateStatus('错误: ' + message);
  console.error(message);
}

// ============================================
// 工具函数
// ============================================

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

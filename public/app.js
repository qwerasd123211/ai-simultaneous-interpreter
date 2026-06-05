/**
 * LINGUA // AI 同声传译助手
 * 前端交互逻辑 - 实时音频捕获版本
 */

// 全局状态
let isTranslating = false;
let isPaused = false;
let ws = null;
let mediaRecorder = null;
let audioStream = null;
let subtitles = [];
let history = [];
let subtitleWindow = null;

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

    // 打开字幕窗口
    openSubtitleWindow();

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

// 打开字幕窗口
function openSubtitleWindow() {
  // 关闭已存在的窗口
  if (subtitleWindow && !subtitleWindow.closed) {
    subtitleWindow.close();
  }

  // 打开新窗口
  subtitleWindow = window.open(
    '/subtitle.html',
    'LINGUA字幕',
    'width=400,height=600,top=100,right=100,toolbar=no,menubar=no,scrollbars=yes,resizable=yes'
  );

  // 检查窗口是否成功打开
  if (!subtitleWindow) {
    showError('无法打开字幕窗口，请允许弹出窗口');
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

  // 关闭字幕窗口
  if (subtitleWindow && !subtitleWindow.closed) {
    subtitleWindow.close();
    subtitleWindow = null;
  }

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

  // 添加字幕
  addSubtitle(data.original, data.translated);

  // 添加到历史记录
  addToHistory(data.original, data.translated);
}

// ============================================
// 字幕管理
// ============================================

function addSubtitle(original, translated) {
  // 清空占位符
  if (subtitles.length === 0) {
    elements.subtitleContainer.innerHTML = '';
  }

  const subtitle = {
    original: original,
    translated: translated,
    time: new Date().toLocaleTimeString()
  };

  subtitles.push(subtitle);

  // 创建字幕元素
  const subtitleElement = document.createElement('div');
  subtitleElement.className = 'subtitle-item';
  subtitleElement.innerHTML = `
    <div class="subtitle-original">${escapeHtml(original)}</div>
    <div class="subtitle-translated">${escapeHtml(translated)}</div>
    <div class="subtitle-time">${subtitle.time}</div>
  `;

  elements.subtitleContainer.appendChild(subtitleElement);

  // 滚动到底部
  elements.subtitleContainer.scrollTop = elements.subtitleContainer.scrollHeight;
}

function clearSubtitles() {
  subtitles = [];
  elements.subtitleContainer.innerHTML = `
    <div class="subtitle-placeholder">
      <div class="placeholder-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
          <line x1="8" y1="21" x2="16" y2="21"/>
          <line x1="12" y1="17" x2="12" y2="21"/>
        </svg>
      </div>
      <p>等待翻译开始...</p>
      <p class="placeholder-hint">点击"开始翻译"并选择要翻译的窗口</p>
    </div>
  `;
}

function exportSubtitles() {
  if (subtitles.length === 0) {
    showError('没有可导出的字幕');
    return;
  }

  // 生成 SRT 格式
  let srt = '';
  subtitles.forEach((subtitle, index) => {
    srt += `${index + 1}\n`;
    srt += `00:00:${String(index * 2).padStart(2, '0')},000 --> 00:00:${String((index + 1) * 2).padStart(2, '0')},000\n`;
    srt += `${subtitle.translated}\n\n`;
  });

  // 下载文件
  const blob = new Blob([srt], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'subtitles.srt';
  a.click();
  URL.revokeObjectURL(url);
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

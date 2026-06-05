/**
 * AI 同声传译助手 - 前端逻辑
 */

// 全局状态
let isTranslating = false;
let isPaused = false;
let currentFile = null;
let ws = null;
let subtitles = [];
let history = [];

// DOM 元素
const elements = {
  fileInput: null,
  uploadArea: null,
  fileInfo: null,
  fileName: null,
  fileSize: null,
  startBtn: null,
  pauseBtn: null,
  stopBtn: null,
  progressFill: null,
  status: null,
  subtitleContainer: null,
  historyList: null
};

// ============================================
// 初始化
// ============================================

document.addEventListener('DOMContentLoaded', () => {
  initElements();
  initEventListeners();
  loadHistory();
});

function initElements() {
  elements.fileInput = document.getElementById('fileInput');
  elements.uploadArea = document.getElementById('uploadArea');
  elements.fileInfo = document.getElementById('fileInfo');
  elements.fileName = document.getElementById('fileName');
  elements.fileSize = document.getElementById('fileSize');
  elements.startBtn = document.getElementById('startBtn');
  elements.pauseBtn = document.getElementById('pauseBtn');
  elements.stopBtn = document.getElementById('stopBtn');
  elements.progressFill = document.getElementById('progressFill');
  elements.status = document.getElementById('status');
  elements.subtitleContainer = document.getElementById('subtitleContainer');
  elements.historyList = document.getElementById('historyList');
}

function initEventListeners() {
  // 文件选择事件
  elements.fileInput.addEventListener('change', handleFileSelect);

  // 拖拽事件
  elements.uploadArea.addEventListener('dragover', handleDragOver);
  elements.uploadArea.addEventListener('dragleave', handleDragLeave);
  elements.uploadArea.addEventListener('drop', handleDrop);
  elements.uploadArea.addEventListener('click', () => {
    elements.fileInput.click();
  });
}

// ============================================
// 文件处理
// ============================================

function handleFileSelect(event) {
  const file = event.target.files[0];
  if (file) {
    processFile(file);
  }
}

function handleDragOver(event) {
  event.preventDefault();
  event.stopPropagation();
  elements.uploadArea.classList.add('dragover');
}

function handleDragLeave(event) {
  event.preventDefault();
  event.stopPropagation();
  elements.uploadArea.classList.remove('dragover');
}

function handleDrop(event) {
  event.preventDefault();
  event.stopPropagation();
  elements.uploadArea.classList.remove('dragover');

  const file = event.dataTransfer.files[0];
  if (file) {
    processFile(file);
  }
}

function processFile(file) {
  // 检查文件类型
  const allowedTypes = ['audio/mpeg', 'audio/wav', 'audio/mp3', 'audio/ogg', 'video/mp4'];
  if (!allowedTypes.includes(file.type)) {
    showError('不支持的文件格式，请上传 MP3、WAV、MP4 等格式');
    return;
  }

  // 检查文件大小（50MB）
  if (file.size > 50 * 1024 * 1024) {
    showError('文件大小不能超过 50MB');
    return;
  }

  currentFile = file;

  // 显示文件信息
  elements.fileName.textContent = file.name;
  elements.fileSize.textContent = formatFileSize(file.size);
  elements.fileInfo.style.display = 'flex';

  // 启用开始按钮
  elements.startBtn.disabled = false;

  // 上传文件
  uploadFile(file);
}

async function uploadFile(file) {
  const formData = new FormData();
  formData.append('audio', file);

  try {
    updateStatus('正在上传文件...');

    const response = await fetch('/api/upload', {
      method: 'POST',
      body: formData
    });

    const data = await response.json();

    if (data.success) {
      currentFile.path = data.filePath;
      updateStatus('文件上传成功，可以开始翻译');
    } else {
      showError(data.error || '上传失败');
    }
  } catch (error) {
    showError('上传失败: ' + error.message);
  }
}

// ============================================
// 翻译控制
// ============================================

async function startTranslation() {
  if (!currentFile || !currentFile.path) {
    showError('请先上传音频文件');
    return;
  }

  isTranslating = true;
  isPaused = false;

  // 更新按钮状态
  elements.startBtn.disabled = true;
  elements.pauseBtn.disabled = false;
  elements.stopBtn.disabled = false;

  // 清空字幕
  clearSubtitles();

  updateStatus('正在连接服务器...');

  // 建立 WebSocket 连接
  connectWebSocket();
}

function pauseTranslation() {
  if (isPaused) {
    // 继续
    isPaused = false;
    elements.pauseBtn.textContent = '⏸️ 暂停';
    updateStatus('翻译已继续');
  } else {
    // 暂停
    isPaused = true;
    elements.pauseBtn.textContent = '▶️ 继续';
    updateStatus('翻译已暂停');
  }
}

function stopTranslation() {
  isTranslating = false;
  isPaused = false;

  // 更新按钮状态
  elements.startBtn.disabled = false;
  elements.pauseBtn.disabled = true;
  elements.stopBtn.disabled = true;
  elements.pauseBtn.textContent = '⏸️ 暂停';

  // 关闭 WebSocket 连接
  if (ws) {
    ws.close();
    ws = null;
  }

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

    // 发送文件路径进行识别
    ws.send(JSON.stringify({
      type: 'transcribe',
      filePath: currentFile.path
    }));
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
// 结果处理
// ============================================

function handleTranscribeResult(data) {
  console.log('识别结果:', data);

  // 逐段翻译
  if (data.segments && data.segments.length > 0) {
    data.segments.forEach((segment, index) => {
      setTimeout(() => {
        if (!isTranslating || isPaused) return;

        // 发送翻译请求
        ws.send(JSON.stringify({
          type: 'translate',
          text: segment.text
        }));

        // 更新进度
        const progress = ((index + 1) / data.segments.length) * 100;
        updateProgress(progress);
      }, index * 1000);
    });
  }
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
      等待翻译开始...
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
        暂无翻译记录
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
}

function showError(message) {
  updateStatus('错误: ' + message);
  console.error(message);
}

// ============================================
// 工具函数
// ============================================

function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

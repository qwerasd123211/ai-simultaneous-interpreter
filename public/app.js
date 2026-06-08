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
let subtitleWindow = null;
let subtitleWindowMode = 'popup';
let pipSubtitleList = null;
let pipSubtitleRecords = [];
let keepWindowOnTopInterval = null;
let pipAnimationId = null;
let currentSubtitleOriginal = '';
let currentSubtitleTranslated = '';
let subtitleItemsBySegment = new Map();

// DOM 元素
const elements = {
  startBtn: null,
  pauseBtn: null,
  stopBtn: null,
  progressFill: null,
  progressPercent: null,
  status: null,
  subtitleContainer: null,
  historyList: null,
  asrLatency: null,
  translateLatency: null,
  totalLatency: null,
  revisionStatus: null,
  glossaryInput: null
};

// ============================================
// 初始化
// ============================================

document.addEventListener('DOMContentLoaded', () => {
  initElements();
  redirectFileProtocolToServer();
  initTypingEffect();
  loadHistory();
  createFloatingSubtitle();
});

function getConfiguredBackendOrigin() {
  const origin = window.LINGUA_BACKEND_ORIGIN;
  if (!origin || typeof origin !== 'string') return '';

  return origin.trim().replace(/\/$/, '');
}

function getServerOrigin() {
  const configuredOrigin = getConfiguredBackendOrigin();
  if (configuredOrigin) {
    return configuredOrigin;
  }

  if (window.location.protocol === 'file:') {
    return 'http://localhost:3000';
  }

  return window.location.origin;
}

function getWebSocketUrl() {
  const serverOrigin = getServerOrigin();

  return serverOrigin.replace(/^https:/, 'wss:').replace(/^http:/, 'ws:');
}

async function redirectFileProtocolToServer() {
  if (window.location.protocol !== 'file:') return;

  const serverOrigin = getServerOrigin();
  updateStatus(`请通过 ${serverOrigin} 使用实时翻译，正在尝试切换...`);

  try {
    await fetch(`${serverOrigin}/health`, { cache: 'no-store' });
    setTimeout(() => {
      window.location.replace(`${serverOrigin}/`);
    }, 600);
  } catch (error) {
    showError(`当前是本地文件模式，无法连接后端。请先运行 npm start，然后打开 ${serverOrigin}`);
  }
}

function initElements() {
  elements.startBtn = document.getElementById('startBtn');
  elements.pauseBtn = document.getElementById('pauseBtn');
  elements.stopBtn = document.getElementById('stopBtn');
  elements.testBtn = document.getElementById('testBtn');
  elements.progressFill = document.getElementById('progressFill');
  elements.progressPercent = document.getElementById('progressPercent');
  elements.status = document.getElementById('status');
  elements.subtitleContainer = document.getElementById('subtitleContainer');
  elements.historyList = document.getElementById('historyList');
  elements.asrLatency = document.getElementById('asrLatency');
  elements.translateLatency = document.getElementById('translateLatency');
  elements.totalLatency = document.getElementById('totalLatency');
  elements.revisionStatus = document.getElementById('revisionStatus');
  elements.glossaryInput = document.getElementById('glossaryInput');
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

    .floating-subtitle-meta {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 6px;
      flex-wrap: wrap;
    }

    .subtitle-status-badge {
      padding: 2px 7px;
      border-radius: 999px;
      font-size: 10px;
      border: 1px solid rgba(255, 255, 255, 0.18);
      color: rgba(255, 255, 255, 0.78);
    }

    .subtitle-status-badge.correcting,
    .subtitle-status-badge.corrected {
      color: #fbbf24;
      border-color: rgba(251, 191, 36, 0.5);
      background: rgba(251, 191, 36, 0.08);
    }

    .subtitle-status-badge.confirmed {
      color: #34d399;
      border-color: rgba(52, 211, 153, 0.5);
      background: rgba(52, 211, 153, 0.08);
    }

    .subtitle-latency {
      color: rgba(255, 255, 255, 0.45);
      font-size: 10px;
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
  subtitleItemsBySegment.clear();
}

function parseGlossary() {
  if (!elements.glossaryInput) return [];

  return elements.glossaryInput.value
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const parts = line.split('=>').map(part => part.trim());
      return {
        source: parts[0],
        target: parts[1] || parts[0]
      };
    })
    .filter(item => item.source)
    .slice(0, 30);
}

function getStatusLabel(status, isFinal) {
  const labels = {
    recognizing: '识别中',
    correcting: '修正中',
    confirmed: '已确认',
    corrected: '已修正'
  };

  return labels[status] || (isFinal ? '已确认' : '识别中');
}

function formatLatency(value) {
  return typeof value === 'number' ? `${Math.round(value)} ms` : '-- ms';
}

function updateLiveMetrics(data) {
  const latency = data.latency || {};

  if (elements.asrLatency) elements.asrLatency.textContent = formatLatency(latency.asrMs);
  if (elements.translateLatency) elements.translateLatency.textContent = formatLatency(latency.translateMs);
  if (elements.totalLatency) elements.totalLatency.textContent = formatLatency(latency.totalMs);
  if (elements.revisionStatus) {
    elements.revisionStatus.textContent = getStatusLabel(data.status, data.isFinal !== false);
  }
}

// ============================================
// 翻译控制
// ============================================

async function startTranslation() {
  try {
    await openSubtitleWindow();

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

    // 显示页面浮动字幕层（备用）
    showFloatingSubtitle();
    clearFloatingSubtitle();

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
    closeSubtitleWindow();
    if (error.name === 'NotAllowedError') {
      showError('用户取消了屏幕共享');
    } else {
      showError('屏幕共享失败: ' + error.message);
    }
  }
}

function closeSubtitleWindow() {
  if (subtitleWindow && !subtitleWindow.closed) {
    subtitleWindow.close();
  }
  subtitleWindow = null;
  subtitleWindowMode = 'popup';
  pipSubtitleList = null;
  pipSubtitleRecords = [];

  if (keepWindowOnTopInterval) {
    clearInterval(keepWindowOnTopInterval);
    keepWindowOnTopInterval = null;
  }
}

function buildPipSubtitleWindow(pipWindow) {
  const doc = pipWindow.document;
  doc.title = 'LINGUA 字幕';
  doc.body.innerHTML = `
    <div class="subtitle-container">
      <div class="subtitle-header">
        <h3>LINGUA 字幕</h3>
        <div class="subtitle-controls">
          <button id="clearBtn">清空</button>
          <button id="closeBtn">关闭</button>
        </div>
      </div>
      <div class="subtitle-list" id="pipSubtitleList">
        <div class="subtitle-placeholder">
          <div class="placeholder-text">等待翻译开始...</div>
          <div class="placeholder-hint">播放英文朗读后字幕会显示在这里</div>
        </div>
      </div>
    </div>
  `;

  const style = doc.createElement('style');
  style.textContent = `
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      overflow: hidden;
      background: rgba(10, 10, 15, 0.96);
      color: #fff;
      font-family: 'Noto Sans SC', -apple-system, BlinkMacSystemFont, sans-serif;
    }
    .subtitle-container {
      height: 100vh;
      padding: 14px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .subtitle-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 11px 12px;
      background: rgba(0, 212, 255, 0.11);
      border: 1px solid rgba(0, 212, 255, 0.34);
      border-radius: 8px;
      flex: 0 0 auto;
    }
    .subtitle-header h3 {
      margin: 0;
      color: #00d4ff;
      font-size: 14px;
      letter-spacing: 2px;
      font-family: 'JetBrains Mono', monospace;
    }
    .subtitle-controls { display: flex; gap: 8px; }
    .subtitle-controls button {
      padding: 6px 12px;
      background: rgba(0, 212, 255, 0.1);
      color: #00d4ff;
      border: 1px solid rgba(0, 212, 255, 0.35);
      border-radius: 4px;
      font-size: 12px;
      cursor: pointer;
    }
    .subtitle-list {
      min-height: 0;
      flex: 1;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .subtitle-item {
      padding: 12px;
      background: rgba(255, 255, 255, 0.06);
      border-left: 3px solid #00d4ff;
      border-radius: 8px;
    }
    .subtitle-original {
      margin-bottom: 6px;
      color: rgba(255, 255, 255, 0.62);
      font-size: 12px;
      font-style: italic;
      line-height: 1.4;
    }
    .subtitle-translated {
      color: #fff;
      font-size: 20px;
      font-weight: 650;
      line-height: 1.5;
    }
    .subtitle-time {
      margin-top: 6px;
      color: rgba(255, 255, 255, 0.34);
      font-size: 10px;
      font-family: 'JetBrains Mono', monospace;
    }
    .floating-subtitle-meta {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 6px;
      flex-wrap: wrap;
    }
    .subtitle-status-badge {
      padding: 2px 7px;
      border-radius: 999px;
      font-size: 10px;
      border: 1px solid rgba(255, 255, 255, 0.18);
      color: rgba(255, 255, 255, 0.78);
    }
    .subtitle-status-badge.correcting,
    .subtitle-status-badge.corrected {
      color: #fbbf24;
      border-color: rgba(251, 191, 36, 0.5);
      background: rgba(251, 191, 36, 0.08);
    }
    .subtitle-status-badge.confirmed {
      color: #34d399;
      border-color: rgba(52, 211, 153, 0.5);
      background: rgba(52, 211, 153, 0.08);
    }
    .subtitle-latency {
      color: rgba(255, 255, 255, 0.45);
      font-size: 10px;
      font-family: 'JetBrains Mono', monospace;
    }
    .subtitle-placeholder {
      height: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 8px;
      color: rgba(255, 255, 255, 0.45);
      text-align: center;
    }
    .placeholder-text { font-size: 16px; color: rgba(255,255,255,0.72); }
    .placeholder-hint { font-size: 12px; }
  `;
  doc.head.appendChild(style);

  pipSubtitleList = doc.getElementById('pipSubtitleList');
  doc.getElementById('clearBtn').addEventListener('click', clearPipSubtitles);
  doc.getElementById('closeBtn').addEventListener('click', () => {
    closeSubtitleWindow();
  });

  pipWindow.addEventListener('pagehide', () => {
    if (subtitleWindow === pipWindow) {
      subtitleWindow = null;
      pipSubtitleList = null;
      subtitleWindowMode = 'popup';
    }
  });
}

async function openPipSubtitleWindow() {
  if (!('documentPictureInPicture' in window)) {
    return false;
  }

  const pipWindow = await window.documentPictureInPicture.requestWindow({
    width: 520,
    height: 360
  });

  subtitleWindow = pipWindow;
  subtitleWindowMode = 'pip';
  pipSubtitleRecords = [];
  buildPipSubtitleWindow(pipWindow);
  return true;
}

// 打开独立字幕窗口（优先画中画置顶窗口，失败时使用普通弹窗）
async function openSubtitleWindow() {
  closeSubtitleWindow();

  try {
    if (await openPipSubtitleWindow()) {
      console.log('字幕画中画窗口已打开');
      return;
    }

    // 使用 window.open 打开字幕页面弹窗
    const subtitleUrl = `${getServerOrigin()}/subtitle.html`;
    subtitleWindow = window.open(
      subtitleUrl,
      'LINGUA_Subtitle',
      'width=480,height=360,menubar=no,toolbar=no,location=no,status=no,resizable=yes'
    );

    if (!subtitleWindow) {
      // 弹窗被浏览器拦截，提示用户
      showError('字幕窗口被拦截，请允许弹窗后再试');
      return;
    }

    // 等窗口加载完成后发送初始消息
    const checkLoaded = setInterval(() => {
      if (subtitleWindow && !subtitleWindow.closed) {
        try {
          subtitleWindow.postMessage({ type: 'init' }, '*');
          clearInterval(checkLoaded);
        } catch (e) {
          // 窗口还没准备好，继续等待
        }
      } else {
        clearInterval(checkLoaded);
      }
    }, 200);

    // 10 秒后停止检查
    setTimeout(() => clearInterval(checkLoaded), 10000);

    // 置顶字幕窗口：定时重新聚焦（用户在与主页面交互时保持字幕窗口在前）
    keepWindowOnTopInterval = setInterval(() => {
      if (subtitleWindow && !subtitleWindow.closed && !document.hidden) {
        try {
          // 不要强制聚焦，只尝试一次，避免打扰用户
          // 这里仅做保活，不强制置顶（浏览器安全策略限制）
        } catch (e) {}
      }
    }, 3000);

    console.log('字幕窗口已打开');
  } catch (error) {
    console.warn('打开画中画字幕窗口失败，回退到普通弹窗:', error);

    const subtitleUrl = `${getServerOrigin()}/subtitle.html`;
    subtitleWindow = window.open(
      subtitleUrl,
      'LINGUA_Subtitle',
      'width=520,height=360,menubar=no,toolbar=no,location=no,status=no,resizable=yes'
    );

    if (!subtitleWindow) {
      showError('字幕窗口被拦截，请允许弹窗后再试');
    }
  }
}

// 绘制字幕到 canvas（供画中画循环调用）
function drawSubtitleCanvas(original, translated) {
  const canvas = document.getElementById('subtitleCanvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');

  // 清空 canvas
  ctx.fillStyle = 'rgba(10, 10, 15, 0.95)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 绘制边框
  ctx.strokeStyle = 'rgba(0, 212, 255, 0.5)';
  ctx.lineWidth = 2;
  ctx.strokeRect(5, 5, canvas.width - 10, canvas.height - 10);

  // 绘制标题
  ctx.fillStyle = '#00d4ff';
  ctx.font = '16px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  ctx.fillText('LINGUA 字幕', canvas.width / 2, 35);

  // 绘制分隔线
  ctx.strokeStyle = 'rgba(0, 212, 255, 0.3)';
  ctx.beginPath();
  ctx.moveTo(20, 50);
  ctx.lineTo(canvas.width - 20, 50);
  ctx.stroke();

  // 绘制原文
  if (original) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.font = '14px "Noto Sans SC", sans-serif';
    ctx.textAlign = 'left';

    // 自动换行
    const words = original.split(' ');
    let line = '';
    let y = 80;

    for (const word of words) {
      const testLine = line + word + ' ';
      const metrics = ctx.measureText(testLine);
      if (metrics.width > canvas.width - 40 && line !== '') {
        ctx.fillText(line, 20, y);
        line = word + ' ';
        y += 20;
      } else {
        line = testLine;
      }
    }
    ctx.fillText(line, 20, y);
  }

  // 绘制译文
  if (translated) {
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 18px "Noto Sans SC", sans-serif';
    ctx.textAlign = 'left';

    // 自动换行
    const words = translated.split('');
    let line = '';
    let y = 160;

    for (const char of words) {
      const testLine = line + char;
      const metrics = ctx.measureText(testLine);
      if (metrics.width > canvas.width - 40 && line !== '') {
        ctx.fillText(line, 20, y);
        line = char;
        y += 25;
      } else {
        line = testLine;
      }
    }
    ctx.fillText(line, 20, y);
  }

  // 绘制时间
  ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.font = '12px "JetBrains Mono", monospace';
  ctx.textAlign = 'right';
  ctx.fillText(new Date().toLocaleTimeString(), canvas.width - 20, canvas.height - 15);
}

// 更新字幕（更新状态变量，由绘制循环读取）
function updateSubtitleCanvas(original, translated) {
  currentSubtitleOriginal = original || '';
  currentSubtitleTranslated = translated || '';
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

// 测试模式：不依赖语音识别，直接发送模拟字幕验证显示
let isTestMode = false;
async function toggleTestMode() {
  if (!isTestMode) {
    // 开启测试模式
    isTestMode = true;
    elements.testBtn.classList.add('active');
    elements.testBtn.querySelector('span:last-child').textContent = '停止演示';
    updateStatus('演示模式已开启，正在展示自动修正和延迟指标...');

    // 打开字幕窗口
    await openSubtitleWindow();
    showFloatingSubtitle();
    clearFloatingSubtitle();

    // 连接 WebSocket 并发送测试指令
    connectWebSocket();

    // 等 WebSocket 连接成功后发送测试指令
    const checkWs = setInterval(() => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'test', enabled: true }));
        clearInterval(checkWs);
      }
    }, 200);
    setTimeout(() => clearInterval(checkWs), 10000);
  } else {
    // 关闭测试模式
    isTestMode = false;
    elements.testBtn.classList.remove('active');
    elements.testBtn.querySelector('span:last-child').textContent = '演示模式';
    updateStatus('演示模式已关闭');
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'test', enabled: false }));
    }
    stopTranslation();
  }
}

function stopTranslation() {
  isTranslating = false;
  isPaused = false;

  // 停止媒体录制（旧 MediaRecorder 方式，兼容清理）
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }

  // 停止 AudioContext 音频捕获
  if (processorRef) {
    processorRef.disconnect();
    processorRef = null;
  }
  if (sourceRef) {
    sourceRef.disconnect();
    sourceRef = null;
  }
  if (audioContextRef) {
    audioContextRef.close().catch(() => {});
    audioContextRef = null;
  }
  if (silenceGainRef) {
    silenceGainRef.disconnect();
    silenceGainRef = null;
  }
  pcmBufferQueue = [];

  // 停止音频流
  if (audioStream) {
    audioStream.getTracks().forEach(track => track.stop());
    audioStream = null;
  }

  // 关闭 WebSocket 连接
  if (ws) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'stop' }));
    }
    ws.close();
    ws = null;
  }

  closeSubtitleWindow();

  // 隐藏页面浮动字幕层
  hideFloatingSubtitle();
  clearFloatingSubtitle();

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
  const wsUrl = getWebSocketUrl();

  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    console.log('WebSocket 已连接');
    updateStatus('正在识别语音...');
    ws.send(JSON.stringify({
      type: 'config',
      glossary: parseGlossary()
    }));

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
        renderTranslateResult(data);
        break;
      case 'error':
        showError(data.message);
        break;
      case 'configAck':
        console.log('术语表已同步:', data.glossary);
        break;
    }
  };

  // 流式显示状态
  let currentSubtitleElement = null;
  let currentSubtitleData = null;

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
// 音频捕获（使用 AudioContext 获取原始 PCM）
// ============================================

let audioContextRef = null;
let processorRef = null;
let sourceRef = null;
let silenceGainRef = null;
let pcmBufferQueue = [];

// 流式识别状态
let streamAsrWs = null;  // 与后端的流式识别 WebSocket
let isStreamAsrOpen = false;
let streamAudioBuffer = [];
let lastTranscribedText = '';
let lastSubtitleId = 0;

function startAudioCapture() {
  if (!audioStream) return;

  try {
    // 创建 AudioContext（使用系统默认采样率）
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    audioContextRef = audioContext;

    // 创建媒体源
    const source = audioContext.createMediaStreamSource(audioStream);
    sourceRef = source;

    // 创建 ScriptProcessorNode 获取原始 PCM 数据
    const bufferSize = 4096;
    const processor = audioContext.createScriptProcessor(bufferSize, 1, 1);
    processorRef = processor;

    // 音频缓冲区：积累一小段后发送（保持连续流）
    let pcmAccumulator = [];
    let lastSendTime = 0;

    processor.onaudioprocess = (event) => {
      if (isPaused) return;

      // 获取输入音频数据（Float32 格式，范围 -1 到 1）
      const inputData = event.inputBuffer.getChannelData(0);

      // 将 Float32 转换为 Int16 (PCM 16-bit)
      const pcmFrame = new Int16Array(inputData.length);
      for (let i = 0; i < inputData.length; i++) {
        const sample = Math.max(-1, Math.min(1, inputData[i]));
        pcmFrame[i] = Math.round(sample * 32767);
      }

      pcmAccumulator.push(pcmFrame);

      // 每 100ms 发送一次音频（约 10 帧），保持连续流
      const now = Date.now();
      const totalSamples = pcmAccumulator.reduce((sum, buf) => sum + buf.length, 0);
      const targetSamples = Math.floor(audioContext.sampleRate * 0.1); // 0.1 秒 = 100ms

      if (totalSamples >= targetSamples || (now - lastSendTime > 100 && totalSamples > 0)) {
        lastSendTime = now;

        // 合并所有 PCM 数据
        let mergedLength = 0;
        pcmAccumulator.forEach(buf => mergedLength += buf.length);
        const mergedPcm = new Int16Array(mergedLength);
        let offset = 0;
        pcmAccumulator.forEach(buf => {
          mergedPcm.set(buf, offset);
          offset += buf.length;
        });
        pcmAccumulator = [];

        // 下采样到 16kHz
        const sourceRate = audioContext.sampleRate;
        const targetRate = 16000;
        let downsampled;

        if (sourceRate === targetRate) {
          downsampled = mergedPcm;
        } else {
          const ratio = sourceRate / targetRate;
          const outputLength = Math.floor(mergedPcm.length / ratio);
          downsampled = new Int16Array(outputLength);
          for (let i = 0; i < outputLength; i++) {
            const srcIndex = Math.floor(i * ratio);
            if (srcIndex < mergedPcm.length) {
              downsampled[i] = mergedPcm[srcIndex];
            }
          }
        }

        // 发送到 WebSocket
        if (ws && ws.readyState === WebSocket.OPEN) {
          const bytes = new Uint8Array(downsampled.buffer);
          ws.send(JSON.stringify({
            type: 'audio',
            data: Array.from(bytes),
            sentAt: Date.now()
          }));
        }
      }
    };

    // 连接音频图
    source.connect(processor);
    const silenceGain = audioContext.createGain();
    silenceGain.gain.value = 0;
    silenceGainRef = silenceGain;
    processor.connect(silenceGain);
    silenceGain.connect(audioContext.destination);

    updateStatus('正在实时翻译...');
    console.log('[音频] AudioContext PCM 捕获已启动，采样率:', audioContext.sampleRate, '发送间隔: 100ms');
  } catch (error) {
    console.error('音频捕获错误:', error);
    showError('音频捕获失败: ' + error.message);
  }
}

// ============================================
// 结果处理
// ============================================

// 当前正在显示的字幕元素（用于流式更新）
let activeSubtitleItem = null;

function handleTranscribeResult(data) {
  console.log('识别结果:', data.text, data.isFinal ? '(最终)' : '(中间)');
}

function sendSubtitleToWindow(data) {
  if (!subtitleWindow || subtitleWindow.closed) return;

  if (subtitleWindowMode === 'pip') {
    if (!pipSubtitleList) return;
    renderPipSubtitle(data);
    return;
  }

  try {
    subtitleWindow.postMessage({
      type: 'subtitle',
      original: data.original,
      translated: data.translated,
      isFinal: data.isFinal !== false,
      segmentId: data.segmentId,
      revision: data.revision,
      status: data.status,
      corrected: data.corrected,
      latency: data.latency,
      time: new Date().toLocaleTimeString()
    }, '*');
  } catch (e) {
    console.error('鍙戦€佸瓧骞曞埌绐楀彛澶辫触:', e);
  }
}

function clearPipSubtitles() {
  pipSubtitleRecords = [];
  if (!pipSubtitleList) return;

  pipSubtitleList.innerHTML = `
    <div class="subtitle-placeholder">
      <div class="placeholder-text">等待翻译开始...</div>
      <div class="placeholder-hint">播放英文朗读后字幕会显示在这里</div>
    </div>
  `;
}

function renderPipSubtitle(data) {
  if (!pipSubtitleList) return;

  if (pipSubtitleRecords.length === 0) {
    pipSubtitleList.innerHTML = '';
  }

  const isFinal = data.isFinal !== false;
  const segmentId = data.segmentId || 'active';
  const time = new Date().toLocaleTimeString();
  let item = pipSubtitleList.querySelector(`[data-segment-id="${String(segmentId)}"]`);

  if (!item) {
    item = subtitleWindow.document.createElement('div');
    item.className = 'subtitle-item';
    item.dataset.segmentId = segmentId;
    item.innerHTML = `
      <div class="subtitle-original"></div>
      <div class="subtitle-translated"></div>
      <div class="floating-subtitle-meta">
        <span class="subtitle-status-badge"></span>
        <span class="subtitle-latency"></span>
        <span class="subtitle-time"></span>
      </div>
    `;
    pipSubtitleList.appendChild(item);
  }

  item.dataset.isStreaming = isFinal ? 'false' : 'true';
  item.querySelector('.subtitle-original').textContent = data.original || '';
  item.querySelector('.subtitle-translated').textContent = data.translated || '';
  item.querySelector('.subtitle-time').textContent = time;

  const badge = item.querySelector('.subtitle-status-badge');
  badge.className = `subtitle-status-badge ${data.status || ''}`;
  badge.textContent = getStatusLabel(data.status, isFinal);

  const latency = item.querySelector('.subtitle-latency');
  latency.textContent = data.latency && typeof data.latency.totalMs === 'number'
    ? `总延迟 ${Math.round(data.latency.totalMs)} ms`
    : '';

  if (isFinal) {
    pipSubtitleRecords.push({
      original: data.original,
      translated: data.translated,
      time
    });
  }

  while (pipSubtitleList.children.length > 20) {
    pipSubtitleList.removeChild(pipSubtitleList.firstElementChild);
  }

  pipSubtitleList.scrollTop = pipSubtitleList.scrollHeight;
}

function renderTranslateResult(data) {
  const isFinal = data.isFinal !== false;
  updateLiveMetrics(data);

  activeSubtitleItem = addOrUpdateFloatingSubtitle(data);
  sendSubtitleToWindow(data);

  if (isFinal && activeSubtitleItem) {
    activeSubtitleItem.dataset.isStreaming = 'false';
  }

  if (isFinal) {
    addToHistory(data.original, data.translated);
    activeSubtitleItem = null;
  }
}

function handleTranslateResult(data) {
  renderTranslateResult(data);
}

// 更新字幕显示（流式）
function updateSubtitleDisplay(element, data) {
  if (!element) return;

  const originalEl = element.querySelector('.floating-subtitle-original');
  const translatedEl = element.querySelector('.floating-subtitle-translated');
  const timeEl = element.querySelector('.floating-subtitle-time');
  const badgeEl = element.querySelector('.subtitle-status-badge');
  const latencyEl = element.querySelector('.subtitle-latency');
  const isFinal = data.isFinal !== false;

  if (originalEl) originalEl.textContent = data.original || '';
  if (translatedEl) translatedEl.textContent = data.translated || '';
  if (timeEl) timeEl.textContent = new Date().toLocaleTimeString();
  if (badgeEl) {
    badgeEl.className = `subtitle-status-badge ${data.status || ''}`;
    badgeEl.textContent = getStatusLabel(data.status, isFinal);
  }
  if (latencyEl) {
    latencyEl.textContent = data.latency && typeof data.latency.totalMs === 'number'
      ? `总延迟 ${Math.round(data.latency.totalMs)} ms`
      : '';
  }
}

// 添加或更新浮动字幕（返回元素引用）
function addOrUpdateFloatingSubtitle(data) {
  const subtitleList = document.getElementById('floatingSubtitleList');
  if (!subtitleList) return null;

  const segmentId = data.segmentId || 'active';
  let subtitleElement = subtitleItemsBySegment.get(segmentId);

  if (subtitleElement) {
    updateSubtitleDisplay(subtitleElement, data);
    return subtitleElement;
  }

  // 创建新字幕元素
  subtitleElement = document.createElement('div');
  subtitleElement.className = 'floating-subtitle-item';
  subtitleElement.dataset.isStreaming = data.isFinal === false ? 'true' : 'false';
  subtitleElement.dataset.segmentId = segmentId;
  subtitleElement.innerHTML = `
    <div class="floating-subtitle-original"></div>
    <div class="floating-subtitle-translated"></div>
    <div class="floating-subtitle-meta">
      <span class="subtitle-status-badge"></span>
      <span class="subtitle-latency"></span>
      <span class="floating-subtitle-time"></span>
    </div>
  `;
  updateSubtitleDisplay(subtitleElement, data);

  subtitleList.appendChild(subtitleElement);
  subtitleItemsBySegment.set(segmentId, subtitleElement);

  // 滚动到底部
  const floatingDiv = document.getElementById('floatingSubtitle');
  if (floatingDiv) {
    floatingDiv.scrollTop = floatingDiv.scrollHeight;
  }

  // 限制显示数量
  const items = subtitleList.children;
  if (items.length > 10) {
    const removed = items[0];
    subtitleItemsBySegment.delete(removed.dataset.segmentId);
    subtitleList.removeChild(removed);
  }

  return subtitleElement;
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

function clearSubtitles() {
  clearFloatingSubtitle();
  if (elements.subtitleContainer) {
    elements.subtitleContainer.innerHTML = `
      <div class="subtitle-placeholder">
        <p>等待翻译开始...</p>
        <p class="placeholder-hint">点击"开始翻译"并选择要翻译的窗口</p>
      </div>
    `;
  }
}

function exportSubtitles() {
  const records = history.slice().reverse();
  if (records.length === 0) {
    alert('没有可导出的字幕');
    return;
  }

  let srt = '';
  records.forEach((record, index) => {
    const start = String(index * 2).padStart(2, '0');
    const end = String((index + 1) * 2).padStart(2, '0');
    srt += `${index + 1}\n`;
    srt += `00:00:${start},000 --> 00:00:${end},000\n`;
    srt += `${record.translated}\n\n`;
  });

  const blob = new Blob([srt], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'lingua-subtitles.srt';
  link.click();
  URL.revokeObjectURL(url);
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

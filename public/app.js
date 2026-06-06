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
let keepWindowOnTopInterval = null;
let pipAnimationId = null;
let currentSubtitleOriginal = '';
let currentSubtitleTranslated = '';

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
  elements.testBtn = document.getElementById('testBtn');
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

    // 打开独立字幕窗口
    openSubtitleWindow();

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
    if (error.name === 'NotAllowedError') {
      showError('用户取消了屏幕共享');
    } else {
      showError('屏幕共享失败: ' + error.message);
    }
  }
}

// 打开独立字幕窗口（弹窗模式）
async function openSubtitleWindow() {
  // 先关闭已有窗口
  if (subtitleWindow && !subtitleWindow.closed) {
    subtitleWindow.close();
    subtitleWindow = null;
  }
  if (keepWindowOnTopInterval) {
    clearInterval(keepWindowOnTopInterval);
    keepWindowOnTopInterval = null;
  }

  try {
    // 使用 window.open 打开字幕页面弹窗
    const subtitleUrl = `${window.location.origin}/subtitle.html`;
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
    console.error('打开字幕窗口错误:', error);
    showError('打开字幕窗口失败: ' + error.message);
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
function toggleTestMode() {
  if (!isTestMode) {
    // 开启测试模式
    isTestMode = true;
    elements.testBtn.classList.add('active');
    elements.testBtn.querySelector('span:last-child').textContent = '停止测试';
    updateStatus('测试模式已开启，正在发送模拟字幕...');

    // 打开字幕窗口
    openSubtitleWindow();
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
    elements.testBtn.querySelector('span:last-child').textContent = '测试字幕';
    updateStatus('测试模式已关闭');
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
  pcmBufferQueue = [];

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

  // 清除置顶定时器
  if (keepWindowOnTopInterval) {
    clearInterval(keepWindowOnTopInterval);
    keepWindowOnTopInterval = null;
  }

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
            data: Array.from(bytes)
          }));
        }
      }
    };

    // 连接音频图
    source.connect(processor);
    processor.connect(audioContext.destination);

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

function handleTranslateResult(data) {
  console.log('翻译结果:', data.translated, data.isFinal ? '(最终)' : '(中间)');

  const isFinal = data.isFinal !== false;

  // 如果是中间结果，更新当前字幕；如果是最终结果，创建新字幕
  if (!isFinal && activeSubtitleItem) {
    // 更新现有字幕（流式更新）
    updateSubtitleDisplay(activeSubtitleItem, data.original, data.translated);
  } else {
    // 最终结果：添加到历史并创建新字幕
    addToHistory(data.original, data.translated);

    // 页面浮动字幕
    if (isFinal) {
      addFloatingSubtitle(data.original, data.translated);
    } else {
      activeSubtitleItem = addOrUpdateFloatingSubtitle(data.original, data.translated);
    }

    // 独立字幕弹窗
    if (subtitleWindow && !subtitleWindow.closed) {
      try {
        subtitleWindow.postMessage({
          type: 'subtitle',
          original: data.original,
          translated: data.translated,
          isFinal: isFinal,
          time: new Date().toLocaleTimeString()
        }, '*');
      } catch (e) {
        console.error('发送字幕到窗口失败:', e);
      }
    }

    // 如果是最终结果，清空活跃字幕
    if (isFinal) {
      activeSubtitleItem = null;
    }
  }
}

// 更新字幕显示（流式）
function updateSubtitleDisplay(element, original, translated) {
  if (!element) return;

  const originalEl = element.querySelector('.floating-subtitle-original');
  const translatedEl = element.querySelector('.floating-subtitle-translated');

  if (originalEl) originalEl.textContent = original;
  if (translatedEl) translatedEl.textContent = translated;
}

// 添加或更新浮动字幕（返回元素引用）
function addOrUpdateFloatingSubtitle(original, translated) {
  const subtitleList = document.getElementById('floatingSubtitleList');
  if (!subtitleList) return null;

  // 查找最后一个字幕元素
  const lastItem = subtitleList.lastElementChild;

  if (lastItem && lastItem.dataset.isStreaming === 'true') {
    // 更新最后一个字幕
    updateSubtitleDisplay(lastItem, original, translated);
    return lastItem;
  }

  // 创建新字幕元素
  const subtitleElement = document.createElement('div');
  subtitleElement.className = 'floating-subtitle-item';
  subtitleElement.dataset.isStreaming = 'true';
  subtitleElement.innerHTML = `
    <div class="floating-subtitle-original">${escapeHtml(original)}</div>
    <div class="floating-subtitle-translated">${escapeHtml(translated)}</div>
    <div class="floating-subtitle-time">${new Date().toLocaleTimeString()}</div>
  `;

  subtitleList.appendChild(subtitleElement);

  // 滚动到底部
  const floatingDiv = document.getElementById('floatingSubtitle');
  if (floatingDiv) {
    floatingDiv.scrollTop = floatingDiv.scrollHeight;
  }

  // 限制显示数量
  const items = subtitleList.children;
  if (items.length > 10) {
    subtitleList.removeChild(items[0]);
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

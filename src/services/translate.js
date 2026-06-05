/**
 * 翻译服务
 * 支持多种翻译 API
 */

const fetch = require('node-fetch');

// DeepSeek API 配置
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';

/**
 * 翻译文本
 * @param {string} text - 要翻译的文本
 * @param {string} targetLang - 目标语言（默认中文）
 * @returns {Object} 翻译结果
 */
async function translate(text, targetLang = 'zh') {
  if (!text || text.trim() === '') {
    return {
      translated: '',
      detectedLanguage: 'en'
    };
  }

  // 根据配置选择翻译服务
  if (DEEPSEEK_API_KEY) {
    return await translateWithDeepSeek(text, targetLang);
  } else {
    // 使用模拟数据（开发测试用）
    return await translateMock(text, targetLang);
  }
}

/**
 * 使用 DeepSeek API 翻译
 */
async function translateWithDeepSeek(text, targetLang) {
  console.log('[Translate] 使用 DeepSeek 翻译:', text.substring(0, 50) + '...');

  try {
    const response = await fetch(DEEPSEEK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        max_tokens: 1000,
        temperature: 0.3,
        messages: [
          {
            role: 'system',
            content: `你是一个专业的翻译助手。请将用户输入的英文翻译成中文。
翻译要求：
1. 保持原文的意思和语气
2. 翻译要自然流畅
3. 专业术语要准确
4. 只返回翻译结果，不要添加其他内容`
          },
          {
            role: 'user',
            content: text
          }
        ]
      })
    });

    if (!response.ok) {
      throw new Error(`DeepSeek API 错误: ${response.status}`);
    }

    const data = await response.json();
    const translated = data.choices[0].message.content.trim();

    return {
      translated: translated,
      detectedLanguage: 'en'
    };
  } catch (error) {
    console.error('[Translate] DeepSeek 翻译错误:', error);
    throw error;
  }
}

/**
 * 模拟翻译（开发测试用）
 */
async function translateMock(text, targetLang) {
  console.log('[Translate] 使用模拟翻译:', text.substring(0, 50) + '...');

  // 模拟处理时间
  await new Promise(resolve => setTimeout(resolve, 500));

  // 简单的模拟翻译
  const mockTranslations = {
    'Hello': '你好',
    'welcome': '欢迎',
    'to': '到',
    'the': '这个',
    'AI': '人工智能',
    'simultaneous': '同声',
    'interpreter': '传译',
    'This': '这个',
    'tool': '工具',
    'will': '会',
    'help': '帮助',
    'you': '你',
    'understand': '理解',
    'English': '英语',
    'content': '内容',
    'in': '在',
    'real-time': '实时',
    'by': '通过',
    'providing': '提供',
    'Chinese': '中文',
    'subtitles': '字幕'
  };

  // 简单词替换
  let translated = text;
  for (const [en, zh] of Object.entries(mockTranslations)) {
    translated = translated.replace(new RegExp(en, 'gi'), zh);
  }

  return {
    translated: translated,
    detectedLanguage: 'en'
  };
}

/**
 * 批量翻译
 * @param {Array} texts - 要翻译的文本数组
 * @returns {Array} 翻译结果数组
 */
async function translateBatch(texts) {
  const results = [];

  for (const text of texts) {
    const result = await translate(text);
    results.push(result);
  }

  return results;
}

/**
 * 检测语言
 * @param {string} text - 要检测的文本
 * @returns {string} 语言代码
 */
async function detectLanguage(text) {
  // 简单的语言检测
  const hasChinese = /[一-龥]/.test(text);
  const hasEnglish = /[a-zA-Z]/.test(text);

  if (hasChinese) {
    return 'zh';
  } else if (hasEnglish) {
    return 'en';
  } else {
    return 'unknown';
  }
}

module.exports = {
  translate,
  translateBatch,
  detectLanguage
};

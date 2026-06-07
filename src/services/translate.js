/**
 * Translation service.
 * Supports DeepSeek translation and a local mock fallback for development.
 */

const fetch = require('node-fetch');

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';

function normalizeGlossary(glossary = []) {
  if (!Array.isArray(glossary)) return [];

  return glossary
    .map((item) => {
      if (typeof item === 'string') {
        const [source, target] = item.split('=>').map(part => part && part.trim());
        return source ? { source, target: target || source } : null;
      }

      if (item && typeof item === 'object' && item.source) {
        return {
          source: String(item.source).trim(),
          target: String(item.target || item.source).trim()
        };
      }

      return null;
    })
    .filter(Boolean)
    .slice(0, 30);
}

function buildGlossaryPrompt(glossary) {
  const normalized = normalizeGlossary(glossary);
  if (normalized.length === 0) return '';

  const terms = normalized
    .map(item => `- ${item.source} => ${item.target}`)
    .join('\n');

  return `\n\n术语表：\n${terms}\n翻译时必须优先遵守术语表。英文专有名词、产品名、API 名称和代码相关词不要误译。`;
}

async function translate(text, targetLang = 'zh', options = {}) {
  if (!text || text.trim() === '') {
    return {
      translated: '',
      detectedLanguage: 'en'
    };
  }

  if (DEEPSEEK_API_KEY) {
    return await translateWithDeepSeek(text, targetLang, options);
  }

  return await translateMock(text, targetLang, options);
}

async function translateWithDeepSeek(text, targetLang, options = {}) {
  console.log('[Translate] DeepSeek:', text.substring(0, 80));

  const glossaryPrompt = buildGlossaryPrompt(options.glossary);

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
        temperature: 0.2,
        messages: [
          {
            role: 'system',
            content: `你是一个同声传译字幕助手。请把用户输入的英文实时翻译成自然、简洁、适合字幕阅读的中文。

要求：
1. 保留原文意思和语气。
2. 技术词、专有名词和缩写要准确。
3. 字幕要短句化，便于用户跟上语速。
4. 只返回译文，不要解释。${glossaryPrompt}`
          },
          {
            role: 'user',
            content: text
          }
        ]
      })
    });

    if (!response.ok) {
      throw new Error(`DeepSeek API error: ${response.status}`);
    }

    const data = await response.json();
    const translated = data && data.choices && data.choices[0] &&
      data.choices[0].message && data.choices[0].message.content;

    if (!translated) {
      throw new Error('DeepSeek response missing translated content');
    }

    return {
      translated: translated.trim(),
      detectedLanguage: 'en'
    };
  } catch (error) {
    console.error('[Translate] DeepSeek error:', error);
    throw error;
  }
}

async function translateMock(text, targetLang, options = {}) {
  await new Promise(resolve => setTimeout(resolve, 220));

  const glossary = normalizeGlossary(options.glossary);
  let translated = text;

  for (const item of glossary) {
    const escaped = item.source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    translated = translated.replace(new RegExp(escaped, 'gi'), item.target);
  }

  const translations = {
    'Kubernetes can schedule containers.': 'Kubernetes 可以调度容器。',
    'Kuber net ease can schedule containers.': 'Kuber net ease 可以调度容器。',
    'The API gateway reduces latency.': 'API 网关可以降低延迟。',
    'Welcome to the live translation test.': '欢迎使用实时翻译测试。',
    'The subtitle window should update immediately.': '字幕窗口应该会立即更新。',
    'API gateway': 'API 网关',
    'latency': '延迟',
    'containers': '容器',
    'schedule': '调度',
    'speech recognition': '语音识别',
    'translation': '翻译',
    'subtitle': '字幕',
    'real-time': '实时',
    'live': '实时'
  };

  const exact = translations[text.trim()];
  if (exact) {
    translated = exact;
  } else {
    const sortedKeys = Object.keys(translations).sort((a, b) => b.length - a.length);
    for (const en of sortedKeys) {
      const escaped = en.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      translated = translated.replace(new RegExp(`\\b${escaped}\\b`, 'gi'), translations[en]);
    }
  }

  return {
    translated,
    detectedLanguage: 'en'
  };
}

async function translateBatch(texts, options = {}) {
  const results = [];

  for (const text of texts) {
    const result = await translate(text, 'zh', options);
    results.push(result);
  }

  return results;
}

async function detectLanguage(text) {
  const hasChinese = /[\u4e00-\u9fa5]/.test(text);
  const hasEnglish = /[a-zA-Z]/.test(text);

  if (hasChinese) return 'zh';
  if (hasEnglish) return 'en';
  return 'unknown';
}

module.exports = {
  translate,
  translateBatch,
  detectLanguage,
  normalizeGlossary
};

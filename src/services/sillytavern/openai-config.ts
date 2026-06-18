import { chat_completion_sources, proxies } from '@sillytavern/scripts/openai';

/** 代理预设项(来自 ST 的 proxies 数组) */
export interface ProxyPresetOption {
  name: string;
  url: string;
  password: string;
}

/**
 * 读取 ST 当前已配置的代理预设列表
 * 直接复用 SillyTavern openai.js 的 proxies(live binding)
 */
export function getProxyPresets(): ProxyPresetOption[] {
  if (!Array.isArray(proxies)) return [];
  return proxies.map(p => ({ name: p.name, url: p.url, password: p.password ?? '' }));
}

/**
 * 按 name 查找单个代理预设
 * 'None' 与空串视为未选,返回 null
 */
export function findProxyPreset(name: string): ProxyPresetOption | null {
  if (!name || name === 'None') return null;
  return getProxyPresets().find(p => p.name === name) ?? null;
}

/** 来源标识下拉选项(value/label) */
export interface ChatCompletionSourceOption {
  value: string;
  label: string;
}

/** 来源 value → 中文友好标签 */
const SOURCE_LABELS: Record<string, string> = {
  openai: 'OpenAI',
  windowai: 'Window AI',
  claude: 'Claude',
  scale: 'Scale',
  openrouter: 'OpenRouter',
  ai21: 'AI21',
  makersuite: 'Google AI Studio',
  mistralai: 'Mistral',
  custom: '自定义(兼容 OpenAI)',
  cohere: 'Cohere',
  perplexity: 'Perplexity',
  groq: 'Groq',
  '01ai': '01.AI',
  nanogpt: 'NanoGPT',
  deepseek: 'DeepSeek',
  xai: 'xAI',
};

/**
 * 来源标识下拉选项(基于 ST chat_completion_sources 枚举)
 */
export const CHAT_COMPLETION_SOURCE_OPTIONS: ChatCompletionSourceOption[] = Object.values(
  chat_completion_sources as Record<string, string>,
).map(value => ({
  value,
  label: SOURCE_LABELS[value] ?? value,
}));

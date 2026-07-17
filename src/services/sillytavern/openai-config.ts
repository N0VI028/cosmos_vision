import { proxies } from '@sillytavern/scripts/openai';

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

/**
 * generateRaw custom_api 实际可用的来源
 * 依据 JS-Slash-Runner applyCustomApiOverrides：apiurl 写入 reverse_proxy；
 * ST proxySupportedSources 会透传 reverse_proxy 的源，外加 source==='custom' 走 custom_url
 */
const GENERATE_RAW_SOURCE_OPTIONS: ChatCompletionSourceOption[] = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'claude', label: 'Claude' },
  { value: 'mistralai', label: 'Mistral' },
  { value: 'makersuite', label: 'Google AI Studio' },
  { value: 'vertexai', label: 'Google Vertex AI' },
  { value: 'deepseek', label: 'DeepSeek' },
  { value: 'xai', label: 'xAI' },
  { value: 'zai', label: 'Z.AI' },
  { value: 'moonshot', label: 'Moonshot' },
  { value: 'custom', label: '自定义(兼容 OpenAI)' },
];

/**
 * 来源标识下拉选项(仅 generateRaw custom_api 可用源)
 */
export const CHAT_COMPLETION_SOURCE_OPTIONS: ChatCompletionSourceOption[] = GENERATE_RAW_SOURCE_OPTIONS;

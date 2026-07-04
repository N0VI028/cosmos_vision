import {
  DEFAULT_PROMPT_LLM_MESSAGE_TRIGGER_KEYWORDS,
  DEFAULT_PROMPT_LLM_MESSAGE_TRIGGER_MODE,
} from '@/constants/default-settings';
import type { PromptLlmMessage, PromptLlmMessageTriggerMode } from '@/constants/novelai';

/** LLM 条目触发字段 */
export type PromptLlmMessageTriggerFields = Pick<PromptLlmMessage, 'triggerMode' | 'triggerKeywords'>;

/**
 * 规范化 LLM 条目触发词
 * @param keywords 原始触发词列表
 * @returns 去空去重后的触发词列表
 */
export function normalizePromptLlmMessageKeywords(keywords: readonly string[] = []): string[] {
  const seen = new Set<string>();
  return keywords.flatMap(keyword => readUniqueKeyword(keyword, seen));
}

/**
 * 读取可用触发模式
 * @param mode 原始触发模式
 * @returns 可用触发模式
 */
export function normalizePromptLlmMessageTriggerMode(
  mode: PromptLlmMessageTriggerMode | undefined,
): PromptLlmMessageTriggerMode {
  return mode ?? DEFAULT_PROMPT_LLM_MESSAGE_TRIGGER_MODE;
}

/**
 * 为 LLM 条目补齐触发字段
 * @param message 原始条目
 * @returns 带触发字段的条目
 */
export function withPromptLlmMessageTriggerDefaults<T extends PromptLlmMessage>(message: T): T {
  return {
    ...message,
    triggerMode: normalizePromptLlmMessageTriggerMode(message.triggerMode),
    triggerKeywords: normalizePromptLlmMessageKeywords(message.triggerKeywords ?? DEFAULT_PROMPT_LLM_MESSAGE_TRIGGER_KEYWORDS),
  };
}

/**
 * 判断消息是否通过运行时触发
 * @param message LLM 条目
 * @param historyContent 本次历史上下文
 * @returns 是否应发送
 */
export function shouldSendPromptLlmMessage(message: PromptLlmMessageTriggerFields, historyContent: string): boolean {
  if (normalizePromptLlmMessageTriggerMode(message.triggerMode) === 'always') return true;
  return includesPromptLlmKeyword(historyContent, message.triggerKeywords);
}

/**
 * 判断历史文本是否命中任一触发词
 * @param historyContent 历史上下文
 * @param keywords 触发词列表
 * @returns 是否命中
 */
function includesPromptLlmKeyword(historyContent: string, keywords: readonly string[] = []): boolean {
  const normalizedHistory = historyContent.toLowerCase();
  return keywords.some(keyword => matchesPromptLlmKeyword(normalizedHistory, keyword));
}

/**
 * 判断单个触发词是否命中历史文本
 * @param normalizedHistory 已小写的历史上下文
 * @param keyword 原始触发词
 * @returns 是否命中
 */
function matchesPromptLlmKeyword(normalizedHistory: string, keyword: string): boolean {
  const normalizedKeyword = keyword.trim().toLowerCase();
  return Boolean(normalizedKeyword) && normalizedHistory.includes(normalizedKeyword);
}

/**
 * 读取唯一非空关键词
 * @param keyword 原始关键词
 * @param seen 已见关键词集合
 * @returns 可插入关键词列表
 */
function readUniqueKeyword(keyword: string, seen: Set<string>): string[] {
  const normalized = keyword.trim();
  const key = normalized.toLowerCase();
  if (!normalized || seen.has(key)) return [];
  seen.add(key);
  return [normalized];
}

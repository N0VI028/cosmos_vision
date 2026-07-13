import {
  DEFAULT_PROMPT_LLM_MESSAGE_TRIGGER_IMAGE_SOURCES,
  DEFAULT_PROMPT_LLM_MESSAGE_TRIGGER_KEYWORD_GROUPS,
  DEFAULT_PROMPT_LLM_MESSAGE_TRIGGER_MATCH_MODE,
  DEFAULT_PROMPT_LLM_MESSAGE_TRIGGER_MODELS,
} from '@/constants/default-settings';
import type { ImageSource } from '@/constants/comfyui';
import type {
  PromptLlmMessage,
  PromptLlmMessageTriggerImageSource,
  PromptLlmMessageTriggerMatchMode,
} from '@/constants/novelai';
import {
  PROMPT_LLM_MESSAGE_TRIGGER_IMAGE_SOURCES,
  PROMPT_LLM_MESSAGE_TRIGGER_MATCH_MODES,
} from '@/constants/novelai';

/** LLM 条目触发字段 */
export type PromptLlmMessageTriggerFields = Pick<
  PromptLlmMessage,
  'triggerMatchMode' | 'triggerKeywordGroups' | 'triggerModels' | 'triggerImageSources'
>;

/** 运行时触发评估上下文 */
export interface PromptLlmTriggerContext {
  historyContent: string;
  imageSource: ImageSource;
  modelId: string;
}

/**
 * 规范化单组关键词（组内去空去重）
 * @param keywords 原始关键词
 * @returns 规范化关键词
 */
export function normalizePromptLlmMessageKeywords(keywords: readonly string[] = []): string[] {
  return normalizeUniqueTrimmedStrings(keywords);
}

/**
 * 规范化关键词组列表；空组丢弃，各组独立保留
 * @param groups 原始关键词组
 * @returns 规范化关键词组
 */
export function normalizePromptLlmMessageKeywordGroups(groups: readonly (readonly string[])[] = []): string[][] {
  return groups
    .map(group => normalizePromptLlmMessageKeywords(group))
    .filter(group => group.length > 0);
}

/**
 * 规范化 LLM 条目触发模型 ID
 * @param models 原始模型列表
 * @returns 去空去重后的模型列表
 */
export function normalizePromptLlmMessageModels(models: readonly string[] = []): string[] {
  return normalizeUniqueTrimmedStrings(models);
}

/**
 * 规范化 LLM 条目触发生图来源
 * @param sources 原始来源列表
 * @returns 合法且去重的来源列表
 */
export function normalizePromptLlmMessageImageSources(
  sources: readonly string[] = [],
): PromptLlmMessageTriggerImageSource[] {
  const seen = new Set<PromptLlmMessageTriggerImageSource>();
  return sources.flatMap(source => {
    if (!isPromptLlmMessageTriggerImageSource(source) || seen.has(source)) return [];
    seen.add(source);
    return [source];
  });
}

/**
 * 读取可用触发匹配模式
 * @param mode 原始匹配模式
 * @returns 可用匹配模式
 */
export function normalizePromptLlmMessageTriggerMatchMode(
  mode: PromptLlmMessageTriggerMatchMode | undefined,
): PromptLlmMessageTriggerMatchMode {
  return mode && isPromptLlmMessageTriggerMatchMode(mode) ? mode : DEFAULT_PROMPT_LLM_MESSAGE_TRIGGER_MATCH_MODE;
}

/**
 * 为 LLM 条目补齐触发字段
 * @param message 原始条目
 * @returns 带触发默认值的条目
 */
export function withPromptLlmMessageTriggerDefaults<T extends PromptLlmMessage>(message: T): T {
  return {
    ...message,
    triggerMatchMode: normalizePromptLlmMessageTriggerMatchMode(message.triggerMatchMode),
    triggerKeywordGroups: normalizePromptLlmMessageKeywordGroups(
      message.triggerKeywordGroups ?? DEFAULT_PROMPT_LLM_MESSAGE_TRIGGER_KEYWORD_GROUPS,
    ),
    triggerModels: normalizePromptLlmMessageModels(
      message.triggerModels ?? DEFAULT_PROMPT_LLM_MESSAGE_TRIGGER_MODELS,
    ),
    triggerImageSources: normalizePromptLlmMessageImageSources(
      message.triggerImageSources ?? DEFAULT_PROMPT_LLM_MESSAGE_TRIGGER_IMAGE_SOURCES,
    ),
  };
}

/**
 * 判断消息是否通过运行时触发
 * @param message LLM 条目
 * @param context 本次触发上下文
 * @returns 是否应发送
 */
export function shouldSendPromptLlmMessage(
  message: PromptLlmMessageTriggerFields,
  context: PromptLlmTriggerContext,
): boolean {
  const matchMode = resolvePromptLlmMessageTriggerMatchMode(message);
  if (matchMode === 'always') return true;
  const hits = collectEnabledConditionHits(message, context);
  if (!hits.length) return false;
  if (matchMode === 'all_match') return hits.every(Boolean);
  if (matchMode === 'any_match') return hits.some(Boolean);
  if (matchMode === 'all_mismatch') return hits.every(value => !value);
  return hits.some(value => !value);
}

/**
 * 解析条目触发匹配模式
 * @param message LLM 条目触发字段
 * @returns 匹配模式
 */
export function resolvePromptLlmMessageTriggerMatchMode(
  message: PromptLlmMessageTriggerFields,
): PromptLlmMessageTriggerMatchMode {
  return normalizePromptLlmMessageTriggerMatchMode(message.triggerMatchMode);
}

/**
 * 收集已启用条件的命中布尔值
 * 每个关键词组各算一条；模型列表与生图源列表各算一个维度（列表内任一命中）
 * @param message 条目触发字段
 * @param context 运行时上下文
 * @returns 命中列表
 */
function collectEnabledConditionHits(
  message: PromptLlmMessageTriggerFields,
  context: PromptLlmTriggerContext,
): boolean[] {
  const groups = normalizePromptLlmMessageKeywordGroups(message.triggerKeywordGroups);
  const models = normalizePromptLlmMessageModels(message.triggerModels);
  const sources = normalizePromptLlmMessageImageSources(message.triggerImageSources);
  const hits: boolean[] = [];
  for (const group of groups) hits.push(includesPromptLlmKeyword(context.historyContent, group));
  if (models.length) hits.push(models.includes(context.modelId.trim()));
  if (sources.length) hits.push(sources.includes(context.imageSource));
  return hits;
}

/**
 * 判断历史文本是否命中组内任一触发词
 * @param historyContent 历史上下文
 * @param keywords 触发词列表
 * @returns 是否命中
 */
function includesPromptLlmKeyword(historyContent: string, keywords: readonly string[]): boolean {
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
 * 规范化字符串列表:去空白、按小写去重、保留首次原文
 * @param values 原始字符串
 * @returns 规范化列表
 */
function normalizeUniqueTrimmedStrings(values: readonly string[]): string[] {
  const seen = new Set<string>();
  return values.flatMap(value => readUniqueTrimmedString(value, seen));
}

/**
 * 读取唯一非空字符串
 * @param value 原始值
 * @param seen 已见小写集合
 * @returns 可插入值列表
 */
function readUniqueTrimmedString(value: string, seen: Set<string>): string[] {
  const normalized = value.trim();
  const key = normalized.toLowerCase();
  if (!normalized || seen.has(key)) return [];
  seen.add(key);
  return [normalized];
}

/**
 * 判断是否为合法匹配模式
 * @param value 原始值
 * @returns 是否合法
 */
function isPromptLlmMessageTriggerMatchMode(value: string): value is PromptLlmMessageTriggerMatchMode {
  return (PROMPT_LLM_MESSAGE_TRIGGER_MATCH_MODES as readonly string[]).includes(value);
}

/**
 * 判断是否为合法生图来源触发值
 * @param value 原始值
 * @returns 是否合法
 */
function isPromptLlmMessageTriggerImageSource(value: string): value is PromptLlmMessageTriggerImageSource {
  return (PROMPT_LLM_MESSAGE_TRIGGER_IMAGE_SOURCES as readonly string[]).includes(value);
}

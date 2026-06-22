import {
  DEFAULT_PROMPT_LLM_PRESET_ID,
  DEFAULT_PROMPT_LLM_SPECIAL_REQUEST_MESSAGE_ID,
} from '@/constants/default-prompt-llm-preset';
import {
  DEFAULT_PROMPT_LLM_MESSAGE_ENABLED,
  PROMPT_LLM_CONTENT_CLOSE_MESSAGE_ID,
  PROMPT_LLM_CONTENT_OPEN_MESSAGE_ID,
  PROMPT_LLM_FOCUS_PARAGRAPH_TOKEN,
  PROMPT_LLM_HISTORY_MESSAGE_ID,
  PROMPT_LLM_HISTORY_MESSAGE_TITLE,
  PROMPT_LLM_HISTORY_PREVIEW_TEXT,
  PROMPT_LLM_PARTICIPANT_MESSAGE_ID,
  PROMPT_LLM_PARTICIPANT_MESSAGE_TITLE,
  PROMPT_LLM_PARTICIPANT_PREVIEW_TEXT,
  PROMPT_LLM_SPECIAL_REQUEST_TOKEN,
} from '@/constants/default-settings';
import type { PromptLlmMessage, PromptLlmMessagePreset, PromptLlmMessagePresetSettings } from '@/constants/novelai';

/** LLM 运行时替换内容 */
export interface PromptLlmRuntimeContent {
  historyContent: string;
  participantContent: string;
  focusParagraphContent: string;
  specialRequestContent: string;
}

/** 保留消息条目配置 */
interface PromptLlmReservedMessageConfig {
  id: string;
  title: string;
  role: PromptLlmMessage['role'];
  previewText: string;
}

/** 内容锚点配置 */
interface PromptLlmAnchorMessageConfig {
  id: string;
}

const RESERVED_MESSAGE_CONFIGS = {
  history: {
    id: PROMPT_LLM_HISTORY_MESSAGE_ID,
    title: PROMPT_LLM_HISTORY_MESSAGE_TITLE,
    role: 'user',
    previewText: PROMPT_LLM_HISTORY_PREVIEW_TEXT,
  },
  participant: {
    id: PROMPT_LLM_PARTICIPANT_MESSAGE_ID,
    title: PROMPT_LLM_PARTICIPANT_MESSAGE_TITLE,
    role: 'system',
    previewText: PROMPT_LLM_PARTICIPANT_PREVIEW_TEXT,
  },
} as const satisfies Record<string, PromptLlmReservedMessageConfig>;

const ANCHOR_MESSAGE_CONFIGS = {
  open: {
    id: PROMPT_LLM_CONTENT_OPEN_MESSAGE_ID,
  },
  close: {
    id: PROMPT_LLM_CONTENT_CLOSE_MESSAGE_ID,
  },
} as const satisfies Record<string, PromptLlmAnchorMessageConfig>;

/**
 * 读取当前激活的提示词预设
 * @param presetSettings 消息预设集合
 * @returns 激活预设
 */
export function getActivePromptLlmPreset(presetSettings: PromptLlmMessagePresetSettings): PromptLlmMessagePreset {
  const preset =
    presetSettings.presets.find(item => item.id === presetSettings.activePresetId) ?? presetSettings.presets[0];
  if (!preset) {
    throw new Error('未找到当前激活的提示词预设');
  }
  return preset;
}

/**
 * 判断条目是否为历史消息
 * @param message 消息条目
 * @returns 是否为历史消息
 */
export function isPromptLlmHistoryMessage(message: Pick<PromptLlmMessage, 'id'>): boolean {
  return matchesReservedMessage(message, RESERVED_MESSAGE_CONFIGS.history);
}

/**
 * 判断条目是否为人物总体信息
 * @param message 消息条目
 * @returns 是否为人物总体信息
 */
export function isPromptLlmParticipantMessage(message: Pick<PromptLlmMessage, 'id'>): boolean {
  return matchesReservedMessage(message, RESERVED_MESSAGE_CONFIGS.participant);
}

/**
 * 判断条目是否为保留消息
 * @param message 消息条目
 * @returns 是否为保留消息
 */
export function isPromptLlmReservedMessage(message: Pick<PromptLlmMessage, 'id'>): boolean {
  return isPromptLlmHistoryMessage(message) || isPromptLlmParticipantMessage(message);
}

/**
 * 获取保留条目预览文本
 * @param message 消息条目
 * @returns 预览占位文本
 */
export function getPromptLlmReservedPreviewText(message: Pick<PromptLlmMessage, 'id'>): string {
  if (isPromptLlmHistoryMessage(message)) return RESERVED_MESSAGE_CONFIGS.history.previewText;
  if (isPromptLlmParticipantMessage(message)) return RESERVED_MESSAGE_CONFIGS.participant.previewText;
  return '';
}

/**
 * 创建历史消息保留条目
 * @returns 历史消息条目
 */
export function createPromptLlmHistoryMessage(): PromptLlmMessage {
  return createReservedMessage(RESERVED_MESSAGE_CONFIGS.history);
}

/**
 * 创建人物总体信息保留条目
 * @returns 人物总体信息条目
 */
export function createPromptLlmParticipantMessage(): PromptLlmMessage {
  return createReservedMessage(RESERVED_MESSAGE_CONFIGS.participant);
}

/**
 * 规范化单条保留条目固定字段
 * @param message 待规范化条目
 */
export function normalizePromptLlmReservedMessage(message: PromptLlmMessage): void {
  if (isPromptLlmHistoryMessage(message)) {
    applyReservedMessageConfig(message, RESERVED_MESSAGE_CONFIGS.history);
    return;
  }
  if (isPromptLlmParticipantMessage(message)) {
    applyReservedMessageConfig(message, RESERVED_MESSAGE_CONFIGS.participant);
  }
}

/**
 * 确保预设包含保留条目
 * @param presetSettings 预设集合
 * @returns 修正后的预设集合
 */
export function ensurePromptLlmReservedMessages(
  presetSettings: PromptLlmMessagePresetSettings,
): PromptLlmMessagePresetSettings {
  return {
    ...presetSettings,
    presets: presetSettings.presets.map(ensurePromptLlmPresetMessages),
  };
}

/**
 * 构建条目运行时文本
 * @param message 消息条目
 * @param runtimeContent 运行时内容
 * @returns 实际发送文本
 */
export function resolvePromptLlmMessageContent(
  message: Pick<PromptLlmMessage, 'id' | 'content'>,
  runtimeContent: PromptLlmRuntimeContent,
): string {
  if (isPromptLlmHistoryMessage(message)) return runtimeContent.historyContent;
  if (isPromptLlmParticipantMessage(message)) return runtimeContent.participantContent;
  return replacePromptLlmContentTokens(message.content, runtimeContent);
}

/**
 * 替换自定义消息中的动态宏
 * @param content 原始消息内容
 * @param runtimeContent 运行时内容
 * @returns 宏替换后的消息内容
 */
function replacePromptLlmContentTokens(content: string, runtimeContent: PromptLlmRuntimeContent): string {
  return content
    .replaceAll(PROMPT_LLM_FOCUS_PARAGRAPH_TOKEN, runtimeContent.focusParagraphContent)
    .replaceAll(PROMPT_LLM_SPECIAL_REQUEST_TOKEN, runtimeContent.specialRequestContent);
}

/**
 * 规范化单个预设中的保留消息与默认内置消息
 * @param preset 原始消息预设
 * @returns 已补齐的消息预设
 */
function ensurePromptLlmPresetMessages(preset: PromptLlmMessagePreset): PromptLlmMessagePreset {
  return {
    ...preset,
    messages: ensureDefaultSpecialRequestMessage(preset.id, ensureReservedMessagesOrder(preset.messages)),
  };
}

/**
 * 为默认内置预设补齐本次特别要求消息
 * 仅在缺失时追加，避免覆盖用户对默认预设的自定义内容
 * @param presetId 预设 ID
 * @param messages 当前消息列表
 * @returns 补齐后的消息列表
 */
function ensureDefaultSpecialRequestMessage(presetId: string, messages: PromptLlmMessage[]): PromptLlmMessage[] {
  if (presetId !== DEFAULT_PROMPT_LLM_PRESET_ID) return messages;
  if (messages.some(message => message.id === DEFAULT_PROMPT_LLM_SPECIAL_REQUEST_MESSAGE_ID)) return messages;
  return [...messages, createSpecialRequestMessage()];
}

/**
 * 判断条目是否匹配指定保留配置
 * @param message 消息条目
 * @param config 保留配置
 * @returns 是否匹配
 */
function matchesReservedMessage(
  message: Pick<PromptLlmMessage, 'id'>,
  config: PromptLlmReservedMessageConfig,
): boolean {
  return message.id === config.id;
}

/**
 * 判断条目是否匹配内容锚点
 * @param message 消息条目
 * @param config 锚点配置
 * @returns 是否匹配
 */
function matchesAnchorMessage(
  message: Pick<PromptLlmMessage, 'id'>,
  config: PromptLlmAnchorMessageConfig,
): boolean {
  return message.id === config.id;
}

/**
 * 判断是否为内容开始锚点
 * @param message 消息条目
 * @returns 是否为开始锚点
 */
function isPromptLlmContentOpenMessage(message: Pick<PromptLlmMessage, 'id'>): boolean {
  return matchesAnchorMessage(message, ANCHOR_MESSAGE_CONFIGS.open);
}

/**
 * 判断是否为内容结束锚点
 * @param message 消息条目
 * @returns 是否为结束锚点
 */
function isPromptLlmContentCloseMessage(message: Pick<PromptLlmMessage, 'id'>): boolean {
  return matchesAnchorMessage(message, ANCHOR_MESSAGE_CONFIGS.close);
}

/**
 * 创建保留条目
 * @param config 保留配置
 * @returns 保留消息条目
 */
function createReservedMessage(config: PromptLlmReservedMessageConfig): PromptLlmMessage {
  return {
    id: config.id,
    title: config.title,
    role: config.role,
    content: '',
    enabled: DEFAULT_PROMPT_LLM_MESSAGE_ENABLED,
  };
}

/**
 * 创建默认预设中的本次特别要求消息
 * @returns 特别要求消息条目
 */
function createSpecialRequestMessage(): PromptLlmMessage {
  return {
    id: DEFAULT_PROMPT_LLM_SPECIAL_REQUEST_MESSAGE_ID,
    title: '本次临时追加要求',
    role: 'user',
    content: ['', '<special_request>',`    ${PROMPT_LLM_SPECIAL_REQUEST_TOKEN}`, '</special_request>', ''].join('\n'),
    enabled: DEFAULT_PROMPT_LLM_MESSAGE_ENABLED,
  };
}

/**
 * 规范化单条内容锚点
 * @param message 待规范化条目
 */
function normalizePromptLlmAnchorMessage(message: PromptLlmMessage): void {
  if (isPromptLlmContentOpenMessage(message)) {
    applyAnchorMessageConfig(message, ANCHOR_MESSAGE_CONFIGS.open);
    return;
  }
  if (isPromptLlmContentCloseMessage(message)) {
    applyAnchorMessageConfig(message, ANCHOR_MESSAGE_CONFIGS.close);
  }
}

/**
 * 应用内容锚点固定字段
 * @param message 待更新条目
 * @param config 锚点配置
 */
function applyAnchorMessageConfig(message: PromptLlmMessage, config: PromptLlmAnchorMessageConfig): void {
  message.id = config.id;
  if (message.enabled === undefined) {
    message.enabled = DEFAULT_PROMPT_LLM_MESSAGE_ENABLED;
  }
}

/**
 * 应用保留条目固定字段
 * @param message 待更新条目
 * @param config 保留配置
 */
function applyReservedMessageConfig(message: PromptLlmMessage, config: PromptLlmReservedMessageConfig): void {
  message.id = config.id;
  message.title = config.title;
  message.content = '';
  if (message.enabled === undefined) {
    message.enabled = DEFAULT_PROMPT_LLM_MESSAGE_ENABLED;
  }
}

/**
 * 确保消息列表包含并保持保留条目顺序
 * @param messages 原始消息列表
 * @returns 已修正消息列表
 */
function ensureReservedMessagesOrder(messages: PromptLlmMessage[]): PromptLlmMessage[] {
  const normalizedMessages = messages.map(normalizePromptLlmMessage);
  const historyMessage = findOrCreateReservedMessage(normalizedMessages, isPromptLlmHistoryMessage, createPromptLlmHistoryMessage);
  const participantMessage = findOrCreateReservedMessage(normalizedMessages, isPromptLlmParticipantMessage, createPromptLlmParticipantMessage);
  const uniqueMessages = keepFirstReservedMessages(normalizedMessages, historyMessage, participantMessage);
  return insertMissingReservedMessages(uniqueMessages, participantMessage, historyMessage);
}

/**
 * 规范化单条消息中的锚点与保留字段
 * @param message 原始消息
 * @returns 规范化后的消息
 */
function normalizePromptLlmMessage(message: PromptLlmMessage): PromptLlmMessage {
  const copy = { ...message };
  normalizePromptLlmAnchorMessage(copy);
  normalizePromptLlmReservedMessage(copy);
  return copy;
}

/**
 * 查找已有保留消息或创建新的
 * @param messages 消息列表
 * @param predicate 判断函数
 * @param factory 创建函数
 * @returns 规范化后的保留消息
 */
function findOrCreateReservedMessage(
  messages: PromptLlmMessage[],
  predicate: (msg: Pick<PromptLlmMessage, 'id'>) => boolean,
  factory: () => PromptLlmMessage,
): PromptLlmMessage {
  const found = messages.find(predicate) ?? factory();
  normalizePromptLlmReservedMessage(found);
  return found;
}

/**
 * 保留首个有效保留条目并维持原始位置
 * @param messages 原始消息列表
 * @param historyMessage 规范化后的历史消息
 * @param participantMessage 规范化后的人物消息
 * @returns 去重后的消息顺序
 */
function keepFirstReservedMessages(
  messages: PromptLlmMessage[],
  historyMessage: PromptLlmMessage,
  participantMessage: PromptLlmMessage,
): PromptLlmMessage[] {
  const ordered: PromptLlmMessage[] = [];
  let hasHistory = false;
  let hasParticipant = false;

  for (const message of messages) {
    if (isPromptLlmHistoryMessage(message)) {
      if (hasHistory) continue;
      ordered.push(historyMessage);
      hasHistory = true;
      continue;
    }
    if (isPromptLlmParticipantMessage(message)) {
      if (hasParticipant) continue;
      ordered.push(participantMessage);
      hasParticipant = true;
      continue;
    }
    ordered.push(message);
  }

  return ordered;
}

/**
 * 把缺失的保留条目补回消息列表
 * @param messages 已去重消息列表
 * @param participantMessage 人物总体信息条目
 * @param historyMessage 历史消息条目
 * @returns 最终消息顺序
 */
function insertMissingReservedMessages(
  messages: PromptLlmMessage[],
  participantMessage: PromptLlmMessage,
  historyMessage: PromptLlmMessage,
): PromptLlmMessage[] {
  const hasParticipant = messages.some(isPromptLlmParticipantMessage);
  const hasHistory = messages.some(isPromptLlmHistoryMessage);

  if (hasParticipant && hasHistory) return messages;

  if (!hasParticipant && !hasHistory) {
    return insertBeforeContentClose(messages, [participantMessage, historyMessage]);
  }

  return hasParticipant
    ? insertAroundSibling(messages, historyMessage, participantMessage, 'after')
    : insertAroundSibling(messages, participantMessage, historyMessage, 'before');
}

/**
 * 围绕现有保留条目插入缺失消息
 * @param messages 已去重消息列表
 * @param missingMessage 缺失的消息
 * @param siblingMessage 已存在的相邻消息
 * @param mode 插入方向
 * @returns 插入后的消息顺序
 */
function insertAroundSibling(
  messages: PromptLlmMessage[],
  missingMessage: PromptLlmMessage,
  siblingMessage: PromptLlmMessage,
  mode: 'before' | 'after',
): PromptLlmMessage[] {
  const siblingIndex = messages.findIndex(message => message.id === siblingMessage.id);
  if (siblingIndex === -1) {
    return insertBeforeContentClose(messages, [missingMessage]);
  }
  const insertIndex = mode === 'before' ? siblingIndex : siblingIndex + 1;
  return [...messages.slice(0, insertIndex), missingMessage, ...messages.slice(insertIndex)];
}

/**
 * 优先在内容结束锚点前插入消息
 * @param messages 已去重消息列表
 * @param insertedMessages 待插入消息
 * @returns 插入后的消息顺序
 */
function insertBeforeContentClose(
  messages: PromptLlmMessage[],
  insertedMessages: PromptLlmMessage[],
): PromptLlmMessage[] {
  const closeIndex = getContentCloseInsertIndex(messages);
  if (closeIndex === -1) return [...messages, ...insertedMessages];
  return [...messages.slice(0, closeIndex), ...insertedMessages, ...messages.slice(closeIndex)];
}

/**
 * 获取内容结束锚点可插入位置
 * @param messages 已去重消息列表
 * @returns 锚点索引,不存在时返回 -1
 */
function getContentCloseInsertIndex(messages: PromptLlmMessage[]): number {
  const openIndex = messages.findIndex(isPromptLlmContentOpenMessage);
  const closeIndex = messages.findIndex(isPromptLlmContentCloseMessage);
  if (openIndex === -1 || closeIndex <= openIndex) return -1;
  return closeIndex;
}

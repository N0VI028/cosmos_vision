import { getTavernHelper } from '@/services/tavern-helper/availability';

type PromptLlmHistoryRole = 'system' | 'assistant' | 'user';
type PromptLlmHistoryReadRole = PromptLlmHistoryRole | 'all';
type PromptLlmChatMessage = {
  message_id?: number | string;
  mesid?: number | string;
  role?: unknown;
  is_user?: unknown;
  is_system?: unknown;
  message?: unknown;
  mes?: unknown;
};

interface PromptLlmHistoryOptions {
  historyFloorCount: number;
  ignoreUserMessages: boolean;
}

interface PromptLlmHistoryMessage {
  messageId: number;
  role: PromptLlmHistoryRole;
  content: string;
}

interface PromptLlmChatHistoryReader {
  getChatMessages(
    range: string | number,
    options?: { role?: PromptLlmHistoryReadRole; hide_state?: 'all' | 'hidden' | 'unhidden' },
  ): PromptLlmChatMessage[];
}

/**
 * 读取焦点楼层之前的历史消息原文
 * @param currentMessageId 当前焦点楼层 ID
 * @param options 历史读取选项
 * @returns 按楼层顺序排列的历史消息
 */
export function readPromptLlmHistoryMessages(
  currentMessageId: string | number | null | undefined,
  options: PromptLlmHistoryOptions,
): string[] {
  const historyFloorCount = normalizeHistoryFloorCount(options.historyFloorCount);
  const currentIndex = normalizeMessageIndex(currentMessageId);
  if (currentIndex === null || currentIndex <= 0 || historyFloorCount <= 0) return [];
  const tavernHelper = getPromptLlmChatHistoryReader();
  if (!tavernHelper) return [];
  const selectedMessages = readPromptLlmHistoryBatches(
    tavernHelper,
    currentIndex,
    historyFloorCount,
    options.ignoreUserMessages,
  );
  return selectedMessages.map(message => message.content);
}

/**
 * 按用户填写数量从焦点楼层向前分批读取历史
 * @param tavernHelper TavernHelper 读取器
 * @param currentIndex 当前焦点楼层索引
 * @param historyFloorCount 目标历史楼层数与单批大小
 * @param ignoreUserMessages 是否忽略 user 楼层
 * @returns 按楼层顺序排列的目标历史消息
 */
function readPromptLlmHistoryBatches(
  tavernHelper: PromptLlmChatHistoryReader,
  currentIndex: number,
  historyFloorCount: number,
  ignoreUserMessages: boolean,
): PromptLlmHistoryMessage[] {
  const selectedMessages: PromptLlmHistoryMessage[] = [];
  let rangeEnd = currentIndex - 1;
  while (rangeEnd >= 0 && selectedMessages.length < historyFloorCount) {
    const rangeStart = Math.max(0, rangeEnd - historyFloorCount + 1);
    const range = `${rangeStart}-${rangeEnd}`;
    const rawMessages = tavernHelper.getChatMessages(range, { role: 'all', hide_state: 'all' });
    const matchedMessages = filterPromptLlmHistoryMessages(rawMessages, ignoreUserMessages);
    selectedMessages.unshift(...matchedMessages);
    rangeEnd = rangeStart - 1;
  }
  return selectedMessages.slice(-historyFloorCount);
}

/**
 * 本地过滤用户楼层
 * @param messages 原始历史消息数组
 * @param ignoreUserMessages 是否忽略 user 楼层
 * @returns 按楼层顺序排列的有效历史消息
 */
function filterPromptLlmHistoryMessages(
  messages: unknown[],
  ignoreUserMessages: boolean,
): PromptLlmHistoryMessage[] {
  return messages
    .map(normalizePromptLlmHistoryMessage)
    .filter(isPromptLlmHistoryMessage)
    .filter(message => !ignoreUserMessages || message.role !== 'user')
    .sort((a, b) => a.messageId - b.messageId);
}

/**
 * 规范化单条历史消息
 * @param value 原始消息值
 * @returns 标准化后的历史消息或 null
 */
function normalizePromptLlmHistoryMessage(value: unknown): PromptLlmHistoryMessage | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const messageId = normalizePromptLlmMessageId(record.message_id ?? record.mesid);
  const role = normalizePromptLlmHistoryRole(record);
  const content = normalizePromptLlmMessageContent(record.message ?? record.mes);
  if (!Number.isInteger(messageId) || messageId < 0 || !role || !content) return null;
  return { messageId, role, content };
}

/**
 * 规范化历史消息角色
 * @param record 原始消息记录
 * @returns 受支持的角色或 null
 */
function normalizePromptLlmHistoryRole(record: Record<string, unknown>): PromptLlmHistoryRole | null {
  return readPromptLlmDirectRole(record.role) ?? readPromptLlmLegacyRole(record);
}

/**
 * 读取酒馆助手标准 role 字段
 * @param value 原始 role 字段
 * @returns 标准角色或 null
 */
function readPromptLlmDirectRole(value: unknown): PromptLlmHistoryRole | null {
  return value === 'system' || value === 'assistant' || value === 'user' ? value : null;
}

/**
 * 从 ST 原始布尔字段推导 role
 * @param record 原始消息记录
 * @returns 推导出的角色或 null
 */
function readPromptLlmLegacyRole(record: Record<string, unknown>): PromptLlmHistoryRole | null {
  if (record.is_system === true) return 'system';
  if (record.is_user === true) return 'user';
  return record.is_user === false ? 'assistant' : null;
}

/**
 * 规范化历史消息楼层 ID
 * @param value 原始楼层字段
 * @returns 数字楼层 ID
 */
function normalizePromptLlmMessageId(value: unknown): number {
  return typeof value === 'number' ? value : Number(value);
}

/**
 * 规范化历史消息正文
 * @param value 原始正文字段
 * @returns 去首尾空白后的正文
 */
function normalizePromptLlmMessageContent(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * 判断值是否为有效历史消息
 * @param value 规范化结果
 * @returns 是否为有效消息
 */
function isPromptLlmHistoryMessage(value: PromptLlmHistoryMessage | null): value is PromptLlmHistoryMessage {
  return value !== null;
}

/**
 * 规范化 ST 消息楼层索引
 * @param messageId 原始楼层 ID
 * @returns 可用于历史读取的楼层索引
 */
function normalizeMessageIndex(messageId: string | number | null | undefined): number | null {
  if (typeof messageId === 'string' && !messageId.trim()) return null;
  const index = typeof messageId === 'number' ? messageId : Number(messageId);
  return Number.isInteger(index) && index >= 0 ? index : null;
}

/**
 * 规范化历史楼层数
 * @param value 原始楼层数输入
 * @returns 可安全使用的非负整数
 */
function normalizeHistoryFloorCount(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

/**
 * 读取可安全调用的聊天历史读取器
 * @returns 带 getChatMessages 的 TavernHelper 实例或 null
 */
function getPromptLlmChatHistoryReader(): PromptLlmChatHistoryReader | null {
  const tavernHelper = getTavernHelper({ silent: true });
  if (!tavernHelper || !hasPromptLlmChatHistoryReader(TavernHelper)) return null;
  return TavernHelper;
}

/**
 * 判断 TavernHelper 是否暴露聊天历史读取方法
 * @param value TavernHelper 原始实例
 * @returns 是否可读取聊天历史
 */
function hasPromptLlmChatHistoryReader(value: unknown): value is PromptLlmChatHistoryReader {
  return Boolean(value && typeof value === 'object' && 'getChatMessages' in value);
}

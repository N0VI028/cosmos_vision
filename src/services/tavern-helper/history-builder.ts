import { MAX_HISTORY_FLOOR_COUNT } from '@/constants/limits';
import { getOptionalTavernHelper } from '@/services/tavern-helper/availability';

/**
 * 酒馆助手返回的单条聊天消息（最小契约）
 */
interface TavernChatMessage {
  message_id: number;
  role: 'system' | 'assistant' | 'user' | 'unknown';
  is_hidden: boolean;
  message: string;
}

/**
 * 历史消息构建统计信息
 */
export interface HistoryBuildStats {
  /** 从 TavernHelper 读取的消息数 */
  totalRead: number;
  /** 被筛选排除的消息数 */
  filtered: number;
  /** 实际执行正则的消息数 */
  processed: number;
  /** 总输入字符数 */
  rawChars: number;
  /** 总输出字符数 */
  outputChars: number;
}

/**
 * 历史消息构建选项
 */
export interface BuildHistoryOptions {
  /** 当前焦点消息在完整 chat[] 中的索引 */
  currentMessageIndex: number;
  /** depth 计算基准：完整聊天的最后一条消息索引（默认取 currentMessageIndex） */
  depthBaseline?: number;
  /** 历史楼层数量上限（调用前已 clamp） */
  historyFloorCount: number;
  /** 是否排除用户消息 */
  ignoreUserMessages: boolean;
  /** 是否反转最终顺序 */
  reverseOrder: boolean;
}

/**
 * 单条历史消息的正则处理结果
 */
export interface RegexedHistoryMessage {
  /** 消息在完整 chat[] 中的索引 */
  messageId: number;
  /** 正则处理后的文本（处理失败时为原文） */
  text: string;
}

/**
 * 历史消息构建结果
 */
export interface HistoryResult {
  success: boolean;
  text: string;
  /** 每条入选消息的正则处理结果（按最终顺序） */
  messages: RegexedHistoryMessage[];
  stats: HistoryBuildStats;
  error?: 'TAVERN_HELPER_UNAVAILABLE' | 'UNKNOWN';
}

type RegexFormatter = (
  text: string,
  source: 'user_input' | 'ai_output',
  destination: 'prompt',
  options: { depth: number },
) => string;

type ChatMessageReader = (range: string, filters: { role: 'all'; hide_state: 'all' }) => TavernChatMessage[];

/**
 * 使用 ST 正则处理后的聊天历史构建 history 文本
 *
 * 从 TavernHelper 读取历史消息，筛选并逐条调用 formatAsTavernRegexedString
 * 执行 prompt-only 正则处理，最终拼接为 {{history}} 宏内容
 *
 * @param options 历史消息构建选项
 * @returns 处理后的历史文本、逐条结果和统计信息
 */
export async function buildRegexedHistory(options: BuildHistoryOptions): Promise<HistoryResult> {
  const stats = createEmptyStats();
  const tavernHelper = resolveTavernHelper();
  if (!tavernHelper) {
    return createErrorResult(stats, 'TAVERN_HELPER_UNAVAILABLE');
  }

  try {
    const messages = readAndFilterMessages(tavernHelper.getChatMessages, options, stats);
    const regexed = processMessagesWithRegex(tavernHelper.formatAsTavernRegexedString, messages, options, stats);
    const finalText = finalizeHistoryText(regexed, options.reverseOrder);

    return { success: true, text: finalText, messages: regexed, stats };
  } catch (error) {
    console.error('[history-builder] Unexpected error:', error);
    return createErrorResult(stats, 'UNKNOWN');
  }
}

/**
 * 创建空统计对象
 * @returns 零值统计对象
 */
function createEmptyStats(): HistoryBuildStats {
  return { totalRead: 0, filtered: 0, processed: 0, rawChars: 0, outputChars: 0 };
}

/**
 * 创建错误结果
 * @param stats 已累积的统计信息
 * @param error 错误类型
 * @returns 失败结果
 */
function createErrorResult(stats: HistoryBuildStats, error: HistoryResult['error']): HistoryResult {
  return { success: false, text: '', messages: [], stats, error };
}

/**
 * 通过可用性封装层解析 TavernHelper 正则与读取接口
 * @returns 所需接口收窄后的实例，缺失任一接口时返回 null
 */
function resolveTavernHelper(): { getChatMessages: ChatMessageReader; formatAsTavernRegexedString: RegexFormatter } | null {
  const tavernHelper = getOptionalTavernHelper();
  if (!tavernHelper) {
    console.warn('[history-builder] TavernHelper not available');
    return null;
  }
  if (typeof tavernHelper.formatAsTavernRegexedString !== 'function') {
    console.warn('[history-builder] TavernHelper.formatAsTavernRegexedString not available');
    return null;
  }
  if (typeof tavernHelper.getChatMessages !== 'function') {
    console.warn('[history-builder] TavernHelper.getChatMessages not available');
    return null;
  }
  return {
    getChatMessages: tavernHelper.getChatMessages,
    formatAsTavernRegexedString: tavernHelper.formatAsTavernRegexedString,
  };
}

/**
 * 读取并筛选消息
 * @param getChatMessages 酒馆助手消息读取接口
 * @param options 构建选项
 * @param stats 统计信息（就地更新）
 * @returns 入选的最近 N 条消息（时间正序）
 */
function readAndFilterMessages(
  getChatMessages: ChatMessageReader,
  options: BuildHistoryOptions,
  stats: HistoryBuildStats,
): TavernChatMessage[] {
  const rangeEnd = options.currentMessageIndex;
  const effectiveCount = Math.min(options.historyFloorCount, MAX_HISTORY_FLOOR_COUNT);
  const rangeStart = Math.max(0, rangeEnd - effectiveCount);

  const rawMessages = getChatMessages(`${rangeStart}-${rangeEnd}`, { role: 'all', hide_state: 'all' });
  stats.totalRead = rawMessages.length;

  const filtered = filterMessages(rawMessages, options.ignoreUserMessages);
  stats.filtered = stats.totalRead - filtered.length;

  // 修复 slice(-0) 陷阱：effectiveCount=0 时应返回空数组而非全部
  return effectiveCount > 0 ? filtered.slice(-effectiveCount) : [];
}

/**
 * 完成历史文本：可选反转并拼接
 * @param messages 每条消息的正则处理结果（就地反转）
 * @param reverseOrder 是否反转顺序
 * @returns 拼接后的历史文本
 */
function finalizeHistoryText(messages: RegexedHistoryMessage[], reverseOrder: boolean): string {
  if (reverseOrder) {
    messages.reverse();
  }
  return messages.map(msg => msg.text).join('\n');
}

/**
 * 筛选消息：排除隐藏系统消息，可选排除用户消息
 * @param messages 原始消息列表
 * @param ignoreUserMessages 是否排除用户消息
 * @returns 筛选后的消息列表
 */
function filterMessages(messages: TavernChatMessage[], ignoreUserMessages: boolean): TavernChatMessage[] {
  return messages.filter(msg => {
    // 排除隐藏系统消息
    if (msg.is_hidden) {
      return false;
    }
    // 可选排除用户消息
    if (ignoreUserMessages && msg.role === 'user') {
      return false;
    }
    return true;
  });
}

/**
 * 逐条执行正则处理
 * @param formatAsTavernRegexedString 酒馆助手正则处理接口
 * @param messages 待处理消息（时间正序）
 * @param options 构建选项
 * @param stats 统计信息（就地更新）
 * @returns 每条消息的正则处理结果数组
 */
function processMessagesWithRegex(
  formatAsTavernRegexedString: RegexFormatter,
  messages: TavernChatMessage[],
  options: BuildHistoryOptions,
  stats: HistoryBuildStats,
): RegexedHistoryMessage[] {
  // ST 正则 depth 语义：0 = 最后一条消息，1 = 倒数第二条
  // depth = chat.length - 1 - message_id
  const depthBaseline = options.depthBaseline ?? options.currentMessageIndex;

  return messages.map(msg => {
    const raw = msg.message || '';
    stats.rawChars += raw.length;
    // user -> user_input，Narrator/system/assistant 均按 ST 主链映射为 ai_output
    const source = msg.role === 'user' ? 'user_input' : 'ai_output';
    const depth = depthBaseline - msg.message_id;
    const text = applyRegexSafely(formatAsTavernRegexedString, raw, source, depth, msg.message_id);
    stats.outputChars += text.length;
    stats.processed++;
    return { messageId: msg.message_id, text };
  });
}

/**
 * 安全执行单条消息正则处理，失败时降级为原始文本
 * @param formatAsTavernRegexedString 酒馆助手正则处理接口
 * @param raw 原始消息文本
 * @param source 消息来源
 * @param depth 消息深度
 * @param messageId 消息楼层 ID（用于日志）
 * @returns 正则处理后的文本，异常时返回原文
 */
function applyRegexSafely(
  formatAsTavernRegexedString: RegexFormatter,
  raw: string,
  source: 'user_input' | 'ai_output',
  depth: number,
  messageId: number,
): string {
  try {
    return formatAsTavernRegexedString(raw, source, 'prompt', { depth });
  } catch (error) {
    console.error(`[history-builder] Regex processing failed for message ${messageId}:`, error);
    return raw;
  }
}

import { uuidv4 } from '@sillytavern/scripts/utils';

import {
  DEFAULT_PROMPT_LLM_MESSAGE_ENABLED,
  DEFAULT_PROMPT_LLM_MESSAGE_TITLE,
} from '@/constants/default-settings';
import {
  getPromptLlmMessageEntryKind,
  normalizePromptLlmMessageId,
  type PromptLlmMessage,
  type PromptLlmMessageRole,
  type PromptWorldbookSourceReference,
} from '@/constants/novelai';
import {
  resolvePromptWorldbookSourceEntry,
  type ResolvedPromptSourceEntry,
} from '@/services/tavern-helper/worldbook-sources';

/**
 * 创建自定义 LLM 条目
 * @param role 消息角色
 * @param title 条目标题
 * @param content 条目内容
 * @param id 条目 id
 * @returns LLM 条目
 */
export function createCustomPromptLlmMessage(
  role: PromptLlmMessageRole,
  title = DEFAULT_PROMPT_LLM_MESSAGE_TITLE,
  content = '',
  id = uuidv4(),
): PromptLlmMessage {
  return {
    id: normalizePromptLlmMessageId(id, 'custom'),
    title,
    role,
    content,
    enabled: DEFAULT_PROMPT_LLM_MESSAGE_ENABLED,
  };
}

/**
 * 创建世界书引用 LLM 条目
 * @param role 消息角色
 * @param reference 世界书引用
 * @param title 条目标题
 * @param id 条目 id
 * @returns LLM 条目
 */
export function createPromptLlmWorldbookMessage(
  role: PromptLlmMessageRole,
  reference: PromptWorldbookSourceReference,
  title = '世界书条目',
  id = uuidv4(),
): PromptLlmMessage {
  return {
    id: normalizePromptLlmMessageId(id, 'worldbook_entry'),
    title: title.trim() || '世界书条目',
    role,
    content: '',
    enabled: DEFAULT_PROMPT_LLM_MESSAGE_ENABLED,
    reference: { ...reference },
  };
}

/**
 * 克隆普通 LLM 条目
 * @param message 原始条目
 * @returns 克隆后的条目
 */
export function clonePromptLlmMessage(message: PromptLlmMessage): PromptLlmMessage {
  const copy = buildClonedPromptLlmMessage(message);
  copy.enabled = message.enabled !== false;
  return copy;
}

/**
 * 解析 LLM 世界书来源条目
 * @param message LLM 条目
 * @returns 世界书解析结果或 null
 */
export async function resolvePromptLlmSourceMessage(
  message: Pick<PromptLlmMessage, 'id' | 'title' | 'reference'>,
): Promise<ResolvedPromptSourceEntry | null> {
  if (getPromptLlmMessageEntryKind(message) !== 'worldbook_entry') return null;
  return resolvePromptWorldbookSourceEntry(message.title, message.reference ?? {});
}

/**
 * 构建克隆后的 LLM 条目
 * @param message 原始条目
 * @returns 克隆后的条目
 */
function buildClonedPromptLlmMessage(message: PromptLlmMessage): PromptLlmMessage {
  if (getPromptLlmMessageEntryKind(message) === 'worldbook_entry') {
    return createPromptLlmWorldbookMessage(message.role, { ...(message.reference ?? {}) }, message.title);
  }
  return createCustomPromptLlmMessage(message.role, message.title, message.content);
}

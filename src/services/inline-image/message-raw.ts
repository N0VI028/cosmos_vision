import { getOptionalTavernHelper } from '@/services/tavern-helper/availability';

type ChatMessageReader = {
  getChatMessages: (
    range: string | number,
    options?: { role?: string; hide_state?: string; include_swipes?: boolean },
  ) => Array<{ message_id?: number; message?: string }>;
};

type ChatMessageWriter = {
  setChatMessages: (
    messages: Array<{ message_id: number; message?: string }>,
    options?: { refresh?: 'none' | 'affected' | 'all' },
  ) => Promise<void>;
};

/**
 * 读取指定楼层当前激活页 raw 正文
 * @param messageId 楼层 ID
 * @returns raw 正文或 null
 */
export function readChatMessageRaw(messageId: string | number): string | null {
  const helper = getChatMessageHelper();
  if (!helper) return null;
  const id = normalizeMessageId(messageId);
  if (id === null) return null;
  const message = helper.getChatMessages(id)[0];
  return typeof message?.message === 'string' ? message.message : null;
}

/**
 * 写回指定楼层 raw 正文（默认不触发页面重绘，避免丢掉临时画廊）
 * @param messageId 楼层 ID
 * @param message 新 raw
 * @param refresh 刷新策略
 */
export async function writeChatMessageRaw(
  messageId: string | number,
  message: string,
  refresh: 'none' | 'affected' | 'all' = 'none',
): Promise<void> {
  const helper = getChatMessageHelper();
  if (!helper) throw new Error('酒馆助手不可用，无法写入消息短码');
  const id = normalizeMessageId(messageId);
  if (id === null) throw new Error('消息楼层 ID 无效');
  await helper.setChatMessages([{ message_id: id, message }], { refresh });
}
/**
 * 读取可调用消息读写 API 的 TavernHelper
 * @returns helper 或 null
 */
function getChatMessageHelper(): (ChatMessageReader & ChatMessageWriter) | null {
  const helper = getOptionalTavernHelper();
  if (!helper || !hasChatMessageApi(helper)) return null;
  return helper;
}

/**
 * 判断 TavernHelper 是否暴露消息读写方法
 * @param value helper 实例
 * @returns 是否可用
 */
function hasChatMessageApi(value: object): value is ChatMessageReader & ChatMessageWriter {
  return 'getChatMessages' in value && 'setChatMessages' in value;
}

/**
 * 规范化楼层 ID
 * @param messageId 原始 ID
 * @returns 数字 ID 或 null
 */
function normalizeMessageId(messageId: string | number): number | null {
  const id = typeof messageId === 'number' ? messageId : Number(messageId);
  return Number.isInteger(id) && id >= 0 ? id : null;
}

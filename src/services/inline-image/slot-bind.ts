import { extractCleanParagraphText, findMessageId, getMessageChatParagraphs } from '@/services/sillytavern/chat-dom';
import { locateHostEndInRaw } from '@/services/inline-image/host-locate';
import { readChatMessageRaw, writeChatMessageRaw } from '@/services/inline-image/message-raw';
import {
  appendSlotShortcodeAt,
  hasSlotShortcode,
  parseFirstSlotId,
  parseSlotMarkerLine,
  removeSlotShortcode,
  stripSlotShortcodes,
} from '@/services/inline-image/slot-shortcode';

/**
 * 从段落 DOM 解析已绑定的 slotId（优先短码）
 * @param paragraph 段落元素
 * @returns slotId 或 null
 */
export function resolveParagraphSlotId(paragraph: HTMLElement): string | null {
  const fromDom = parseFirstSlotId(paragraph.textContent ?? '');
  console.log('[CosmosVision Debug] [SlotBind] resolveParagraphSlotId:', {
    paragraph,
    paragraphText: paragraph.textContent,
    fromDom,
  });
  if (fromDom) return fromDom;
  const messageId = findMessageId(paragraph);
  if (!messageId) return null;
  const raw = readChatMessageRaw(messageId);
  if (!raw) return null;
  const fromRaw = findSlotIdForParagraphHost(raw, paragraph);
  console.log('[CosmosVision Debug] [SlotBind] resolveParagraphSlotId fromRaw:', fromRaw);
  return fromRaw;
}

/**
 * 确保 raw 上该位点仅一枚短码；已有则跳过写入
 * @param paragraph 宿主段落
 * @param slotId 位点 id
 */
export async function ensureSlotShortcodeOnParagraph(paragraph: HTMLElement, slotId: string): Promise<void> {
  const messageId = findMessageId(paragraph);
  console.log('[CosmosVision Debug] [SlotBind] ensureSlotShortcodeOnParagraph start:', {
    paragraph,
    slotId,
    messageId,
  });
  if (!messageId) throw new Error('未找到消息楼层，无法绑定短码');
  const raw = readChatMessageRaw(messageId);
  if (raw === null) throw new Error('读取消息原文失败，无法绑定短码');
  if (hasSlotShortcode(raw, slotId)) {
    console.log('[CosmosVision Debug] [SlotBind] raw already has slotId:', slotId);
    return;
  }
  const at = locateParagraphHostEnd(raw, paragraph);
  console.log('[CosmosVision Debug] [SlotBind] locateParagraphHostEnd offset:', at, 'rawLength:', raw.length);
  if (at === null) {
    console.error('[CosmosVision Debug] [SlotBind] Failed to find insertion offset in raw!', {
      paragraph,
      paragraphHtml: paragraph.outerHTML,
      paragraphText: paragraph.textContent,
      raw,
    });
    throw new Error('raw 中找不到宿主段落，无法绑定短码');
  }
  const next = appendSlotShortcodeAt(raw, at, slotId);
  console.log('[CosmosVision Debug] [SlotBind] Resulting raw after appendSlotShortcodeAt:', {
    at,
    snippetBefore: raw.slice(Math.max(0, at - 50), at),
    snippetAfter: raw.slice(at, Math.min(raw.length, at + 50)),
    nextSnippet: next.slice(Math.max(0, at - 50), Math.min(next.length, at + 80)),
  });
  if (next === raw) return;
  await writeChatMessageRaw(messageId, next, 'none');
}

/**
 * 定点移除 raw 上指定 slot 短码
 * @param paragraphOrMessageId 段落或楼层 ID
 * @param slotId 位点 id
 */
export async function removeSlotShortcodeFromMessage(
  paragraphOrMessageId: HTMLElement | string | number,
  slotId: string,
): Promise<void> {
  const messageId =
    typeof paragraphOrMessageId === 'string' || typeof paragraphOrMessageId === 'number'
      ? paragraphOrMessageId
      : findMessageId(paragraphOrMessageId);
  if (!messageId) throw new Error('未找到消息楼层，无法移除短码');
  const raw = readChatMessageRaw(messageId);
  if (raw === null) throw new Error('读取消息原文失败，无法移除短码');
  if (!hasSlotShortcode(raw, slotId)) return;
  await writeChatMessageRaw(messageId, removeSlotShortcode(raw, slotId), 'none');
}

/**
 * 按宿主在 raw 中的尾部偏移解析已有 slot
 * @param raw 消息 raw
 * @param paragraph 段落
 * @returns slotId 或 null
 */
function findSlotIdForParagraphHost(raw: string, paragraph: HTMLElement): string | null {
  const at = locateParagraphHostEnd(raw, paragraph);
  if (at === null) return null;
  return findFollowingMarker(raw.slice(at));
}

/**
 * 解析宿主后紧邻的独立短码行
 * @param tail 宿主后的 raw
 * @returns slotId 或 null
 */
function findFollowingMarker(tail: string): string | null {
  const lines = tail.split(/\r?\n/);
  const marker = lines.find(line => line.trim());
  return marker ? parseSlotMarkerLine(marker) : null;
}

/**
 * 定位段落 host 在 raw 中的尾部插入点
 * @param raw 消息原文
 * @param paragraph 宿主段落
 * @returns 尾部偏移或 null
 */
function locateParagraphHostEnd(raw: string, paragraph: HTMLElement): number | null {
  const siblings = getMessageChatParagraphs(paragraph);
  const siblingHosts = siblings.map(el => stripSlotShortcodes(extractCleanParagraphText(el)));
  const paragraphIndex = siblings.indexOf(paragraph);
  const host = paragraphIndex >= 0
    ? siblingHosts[paragraphIndex]!
    : stripSlotShortcodes(extractCleanParagraphText(paragraph));
  console.log('[CosmosVision Debug] [SlotBind] locateParagraphHostEnd details:', {
    paragraph,
    paragraphIndex,
    siblingsCount: siblings.length,
    host,
    siblingHosts,
  });
  if (!host) return null;
  return locateHostEndInRaw(raw, {
    host,
    occurrence: countHostOccurrenceBefore(siblingHosts, paragraphIndex, host),
    paragraphIndex,
    siblingHosts,
  });
}

/**
 * 统计目标段之前相同 host 文本出现次数
 * @param siblingHosts 同消息段文本
 * @param paragraphIndex 目标索引
 * @param host 宿主正文
 * @returns 0-based occurrence
 */
function countHostOccurrenceBefore(siblingHosts: string[], paragraphIndex: number, host: string): number {
  let count = 0;
  const end = paragraphIndex >= 0 ? paragraphIndex : siblingHosts.length;
  for (let i = 0; i < end; i += 1) {
    if (siblingHosts[i] === host) count += 1;
  }
  return count;
}

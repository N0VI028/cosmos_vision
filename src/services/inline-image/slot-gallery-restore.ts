import {
  listInlineImageFavoritesBySlot,
  type InlineImageFavoriteListItem,
} from '@/services/inline-image/favorites-cache';
import { removeSlotShortcodeFromMessage } from '@/services/inline-image/slot-bind';
import {
  encodeSlotShortcode,
  parseSlotIds,
} from '@/services/inline-image/slot-shortcode';
import { getCurrentInlineFavoriteScope } from '@/services/sillytavern/chat-context';
import {
  createInlineFavoriteAnchor,
  findMessageId,
  getGlobalParagraphIndex,
  getVisibleChatParagraphElements,
  type InlineFavoriteAnchor,
} from '@/services/sillytavern/chat-dom';

export interface SlotGalleryMountSpec {
  slotId: string;
  index: number;
  anchor: InlineFavoriteAnchor;
  records: InlineImageFavoriteListItem[];
}

/**
 * 扫描可见聊天段落中的短码并聚合可挂载的收藏画廊
 * @returns 一段位点一个挂载规格
 */
export async function collectVisibleSlotGalleryMounts(): Promise<SlotGalleryMountSpec[]> {
  return collectSlotGalleryMounts(getVisibleChatParagraphElements());
}

/**
 * 扫描指定楼层内可见段落的短码挂载规格
 * @param messageIds 目标消息楼层
 * @returns 挂载规格
 */
export async function collectMessageSlotGalleryMounts(messageIds: string[]): Promise<SlotGalleryMountSpec[]> {
  const targetIds = new Set(messageIds);
  const paragraphs = getVisibleChatParagraphElements().filter(paragraph => {
    const messageId = findMessageId(paragraph);
    return Boolean(messageId && targetIds.has(messageId));
  });
  return collectSlotGalleryMounts(paragraphs);
}

/**
 * 从段落列表扫描短码并加载各自收藏图
 * @param paragraphs 候选段落
 * @returns 有图规格；无图短码会摘除
 */
async function collectSlotGalleryMounts(paragraphs: HTMLElement[]): Promise<SlotGalleryMountSpec[]> {
  const mounts: SlotGalleryMountSpec[] = [];
  const seen = new Set<string>();
  for (const paragraph of paragraphs) {
    const slotId = parseSlotIds(paragraph.textContent ?? '')[0];
    if (!slotId || seen.has(slotId)) continue;
    seen.add(slotId);
    const records = await listInlineImageFavoritesBySlot(slotId, getCurrentInlineFavoriteScope());
    if (!records.length) {
      await pruneBareSlotShortcode(paragraph, slotId);
      continue;
    }
    // 有码有图：DOM 摘码防裸露；raw 仍保留短码供下次恢复
    stripShortcodeTextFromElement(paragraph, encodeSlotShortcode(slotId));
    const index = getGlobalParagraphIndex(paragraph);
    if (index < 0) continue;
    mounts.push({
      slotId,
      index,
      anchor: createInlineFavoriteAnchor(paragraph),
      records,
    });
  }
  return mounts;
}

/**
 * 有短码无图时从 DOM 摘码，并尝试定点清理 raw
 * @param paragraph 宿主段落
 * @param slotId 位点 id
 */
async function pruneBareSlotShortcode(paragraph: HTMLElement, slotId: string): Promise<void> {
  stripShortcodeTextFromElement(paragraph, encodeSlotShortcode(slotId));
  try {
    await removeSlotShortcodeFromMessage(paragraph, slotId);
  } catch (error) {
    console.warn('[CosmosVision] 清理空位短码 raw 失败', error);
  }
}

/**
 * 从元素文本节点中移除给定短码字面量
 * @param root 根元素
 * @param shortcode 短码全文
 */
function stripShortcodeTextFromElement(root: HTMLElement, shortcode: string): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const targets: Text[] = [];
  let node = walker.nextNode();
  while (node) {
    if (node instanceof Text && node.nodeValue?.includes(shortcode)) targets.push(node);
    node = walker.nextNode();
  }
  for (const text of targets) {
    text.nodeValue = (text.nodeValue ?? '').split(shortcode).join('');
  }
}

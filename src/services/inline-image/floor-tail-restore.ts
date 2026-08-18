import { buildSlotSessionKey, listSlotSessionItems } from '@/composables/inlineGallerySession';
import { ensureFloorTailSlotContainer } from '@/services/inline-image/floor-tail-host';
import { deleteFloorTailSlot, listFloorTailSlotsBySwipe } from '@/services/inline-image/floor-tail-slot';
import type { GalleryMountSpec } from '@/services/inline-image/slot-gallery-pick';
import { getMessageSwipeId, type InlineFavoriteAnchor } from '@/services/sillytavern/chat-dom';

/**
 * 扫描指定楼层的楼层尾 slot 并构造画廊挂载规格
 * 恢复期惰性清理 imageRefs 全部失效的 slot（IDB blob 已被数量限制淘汰）
 * @param messageId 消息楼层 ID
 * @param seen 全局已处理 key 集合
 * @returns 挂载规格列表
 */
export function pickFloorTailMountsForMessage(messageId: number, seen: Set<string>): GalleryMountSpec[] {
  const swipeId = getMessageSwipeId(messageId) ?? 0;
  const slots = listFloorTailSlotsBySwipe(messageId, swipeId);
  const mounts: GalleryMountSpec[] = [];

  for (const slot of slots) {
    // 惰性清理：imageRefs 全部不在内存会话（IDB 已淘汰）时丢弃 slot
    if (!hasAnyLiveImageRef(slot)) {
      deleteFloorTailSlot(slot.slotId);
      continue;
    }
    const key = buildSlotSessionKey(slot.slotId);
    if (seen.has(key)) continue;
    seen.add(key);

    const element = ensureFloorTailSlotContainer(messageId, swipeId, slot.slotId);
    mounts.push({
      key,
      messageId,
      element,
      mountKey: { kind: 'slot', slotId: slot.slotId },
      anchor: createFloorTailAnchor(element, messageId, swipeId),
    });
  }
  return mounts;
}

/**
 * 检查 slot 的 imageRefs 是否至少有一项存在于内存会话（IDB 已恢复）
 * @param slot 楼层尾 slot
 * @returns 是否有存活的图片引用
 */
function hasAnyLiveImageRef(slot: { slotId: string; imageRefs: string[] }): boolean {
  if (!slot.imageRefs.length) return false;
  const liveIds = new Set(listSlotSessionItems(slot.slotId).map(item => item.id));
  return slot.imageRefs.some(id => liveIds.has(id));
}

/**
 * 创建楼层尾画廊挂载锚点对象
 * @param element 宿主容器
 * @param messageId 消息楼层 ID
 * @param swipeId 当前 swipe ID
 * @returns 挂载锚点
 */
function createFloorTailAnchor(element: HTMLElement, messageId: number, swipeId: number): InlineFavoriteAnchor {
  return {
    target: element,
    placement: 'append',
    paragraph: null,
    mesId: String(messageId),
    swipeId,
    paragraphTextHash: '',
  };
}

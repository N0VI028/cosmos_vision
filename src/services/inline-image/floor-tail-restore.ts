import { buildSlotSessionKey, listSlotSessionItems } from '@/composables/inlineGallerySession';
import { ensureFloorTailSlotContainer } from '@/services/inline-image/floor-tail-host';
import { deleteFloorTailSlot, listFloorTailSlotsBySwipe } from '@/services/inline-image/floor-tail-slot';
import { hasInlineImageFavoriteBySlot } from '@/services/inline-image/favorites-cache';
import { getCurrentInlineFavoriteScope } from '@/services/sillytavern/chat-context';
import type { GalleryMountSpec } from '@/services/inline-image/slot-gallery-pick';
import { getMessageSwipeId, type InlineFavoriteAnchor } from '@/services/sillytavern/chat-dom';

/**
 * 扫描指定楼层的楼层尾 slot 并构造画廊挂载规格
 * 恢复期惰性清理 imageRefs 全部失效且无服务端收藏的 slot（IDB blob 已被数量限制淘汰）
 * 存活判定兼容两种来源：IDB 临时会话（本地）与服务端收藏 manifest（跨设备）
 * @param messageId 消息楼层 ID
 * @param seen 全局已处理 key 集合
 * @param sessionRestored 是否已完成 IDB 临时图片恢复；false 时只跳过不删，避免事件抢跑误删 slot
 * @returns 挂载规格列表
 */
export async function pickFloorTailMountsForMessage(
  messageId: number,
  seen: Set<string>,
  sessionRestored = true,
): Promise<GalleryMountSpec[]> {
  const swipeId = getMessageSwipeId(messageId) ?? 0;
  const slots = listFloorTailSlotsBySwipe(messageId, swipeId);
  const mounts: GalleryMountSpec[] = [];
  const mes = document.querySelector<HTMLElement>(`#chat .mes[mesid="${messageId}"]`);

  for (const slot of slots) {
    // IDB 临时图存活：即时判定，无需网络
    const liveTemporary = hasAnyLiveImageRef(slot);
    // 服务端收藏存活：异步读 manifest，保证跨设备/换浏览器仍可恢复
    const liveFavorite = liveTemporary ? true : await hasInlineImageFavoriteBySlot(slot.slotId, getCurrentInlineFavoriteScope());
    const live = liveTemporary || liveFavorite;
    // 仅在 IDB 恢复完成后才惰性清理失效 slot；恢复未完成时若清理必为误删
    if (!live && sessionRestored) {
      deleteFloorTailSlot(slot.slotId);
      continue;
    }
    if (!live) continue; // 恢复未完成：跳过挂载但保留 slot，待恢复完整量重扫再判定
    const key = buildSlotSessionKey(slot.slotId);
    if (seen.has(key)) continue;
    seen.add(key);

    let targetIframe: HTMLElement | null = null;
    if (mes) {
      if (slot.targetIframeId) {
        targetIframe = mes.querySelector<HTMLElement>(`#${slot.targetIframeId}`);
      }
      if (!targetIframe && typeof slot.targetIframeIndex === 'number') {
        const iframes = Array.from(mes.querySelectorAll('iframe'));
        targetIframe = iframes[slot.targetIframeIndex] ?? null;
      }
    }

    const element = ensureFloorTailSlotContainer(messageId, swipeId, slot.slotId, targetIframe ?? undefined);
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
 * @returns 是否有存活的临时图片引用
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
  };
}

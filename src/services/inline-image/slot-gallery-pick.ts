import type { GallerySessionRecord } from '@/composables/inlineGallerySession';
import {
  CV_SLOT_ATTR,
  ensureSlotRenderContainer,
  ensureSlotRenderContainerForParagraph,
} from '@/services/inline-image/cv-render-container';
import { ensureFloorTailSlotContainer } from '@/services/inline-image/floor-tail-host';
import { pickFloorTailMountsForMessage } from '@/services/inline-image/floor-tail-restore';
import { parseSlotMarkerLine } from '@/services/inline-image/slot-shortcode';
import { buildSlotSessionKey } from '@/composables/inlineGallerySession';
import { createInlineFavoriteAnchor, findMessageId } from '@/services/sillytavern/chat-dom';

/** 单个画廊挂载规格 */
export interface GalleryMountSpec {
  key: string;
  messageId: number;
  element: HTMLElement;
  mountKey: { kind: 'slot'; slotId: string };
  anchor: ReturnType<typeof createInlineFavoriteAnchor>;
}

/**
 * 将会话记录转换为挂载规格（用于前端型气泡生图）
 * @param record 会话记录
 * @param mesId 消息楼层 ID
 * @param swipeId 当前 swipe ID
 * @param targetAnchor 可选目标 iframe 或组件元素
 * @returns 挂载规格
 */
export function pickMountFromFloorTailSession(
  record: GallerySessionRecord,
  mesId: number,
  swipeId: number,
  targetAnchor?: HTMLElement,
): GalleryMountSpec {
  const element = ensureFloorTailSlotContainer(mesId, swipeId, record.slotId, targetAnchor);
  return {
    key: record.key,
    messageId: mesId,
    element,
    mountKey: { kind: 'slot', slotId: record.slotId },
    anchor: {
      target: element,
      placement: 'append',
      paragraph: null,
      mesId: String(mesId),
      swipeId,
      paragraphTextHash: '',
    },
  };
}

/**
 * 将普通段落会话记录转换为挂载规格（用于经典 p 段落生图）
 * @param record 会话记录
 * @param paragraph 锚点段落
 * @returns 挂载规格或 null
 */
export function pickMountFromSession(
  record: GallerySessionRecord,
  paragraph: HTMLElement,
): GalleryMountSpec | null {
  const mesIdStr = findMessageId(paragraph);
  if (!mesIdStr) return null;
  const messageId = Number(mesIdStr);
  const container = ensureSlotRenderContainerForParagraph(paragraph, record.slotId);
  return {
    key: record.key,
    messageId,
    element: container,
    mountKey: { kind: 'slot', slotId: record.slotId },
    anchor: createInlineFavoriteAnchor(paragraph),
  };
}

/**
 * 扫描指定楼层的全部画廊挂载规格
 * @param messageIds 楼层 ID 列表
 * @returns 挂载规格列表
 */
export async function pickGalleryMounts(messageIds?: number[]): Promise<GalleryMountSpec[]> {
  const ids = resolveTargetMessageIds(messageIds);
  const seen = new Set<string>();
  const mounts: GalleryMountSpec[] = [];
  for (const id of ids) {
    mounts.push(...await pickSlotMountsForMessage(id, seen));
  }
  return mounts;
}

/**
 * 解析待扫描楼层 id 列表
 * @param messageIds 可选限定
 * @returns 楼层 id
 */
function resolveTargetMessageIds(messageIds?: number[]): number[] {
  if (messageIds?.length) return messageIds;
  return Array.from(document.querySelectorAll('#chat > .mes'))
    .map(div => Number(div.getAttribute('mesid')))
    .filter(id => Number.isFinite(id));
}

/**
 * 扫描某一楼的短码与楼层尾 slot
 * @param messageId 楼层
 * @param seen 全局 key 去重
 * @returns 挂载规格
 */
async function pickSlotMountsForMessage(messageId: number, seen: Set<string>): Promise<GalleryMountSpec[]> {
  const mounts: GalleryMountSpec[] = [];
  for (const paragraph of getMessageParagraphs(messageId)) {
    const mount = pickSlotMountForParagraph(paragraph, messageId, seen);
    if (mount) mounts.push(mount);
  }
  mounts.push(...pickFloorTailMountsForMessage(messageId, seen));
  return mounts;
}

/**
 * 单 marker 挂载：短码段绑定前一个正文段落
 * @param marker 独立短码段
 * @param messageId 楼层
 * @param seen 去重
 * @returns mount 或 null
 */
function pickSlotMountForParagraph(
  marker: HTMLElement,
  messageId: number,
  seen: Set<string>,
): GalleryMountSpec | null {
  const slotId = parseSlotMarkerLine(marker.textContent ?? '');
  const paragraph = findMarkerHostParagraph(marker);
  if (!slotId || !paragraph) return null;
  const key = buildSlotSessionKey(slotId);
  if (seen.has(key)) return null;
  seen.add(key);
  return {
    key,
    messageId,
    element: ensureSlotRenderContainer(marker, slotId),
    mountKey: { kind: 'slot', slotId },
    anchor: createInlineFavoriteAnchor(paragraph),
  };
}

/**
 * 读取 marker 前一个正文段落
 * @param marker 独立短码段
 * @returns 宿主段落或 null
 */
function findMarkerHostParagraph(marker: HTMLElement): HTMLElement | null {
  const previous = marker.previousElementSibling;
  return previous instanceof HTMLElement && previous.matches('.mes_text p') ? previous : null;
}

/**
 * 读取指定楼层的全部段落元素
 * @param messageId 楼层
 * @returns 段落元素数组
 */
function getMessageParagraphs(messageId: number): HTMLElement[] {
  const mes = document.querySelector(`#chat > .mes[mesid="${messageId}"]`);
  if (!mes) return [];
  return Array.from(mes.querySelectorAll('.mes_text p')).filter(
    (element): element is HTMLElement => element instanceof HTMLElement,
  );
}

/**
 * 读取挂载 key
 * @param element 容器
 * @returns key 或 null
 */
export function readMountKeyFromElement(element: HTMLElement): GalleryMountSpec['mountKey'] | null {
  const slotId = element.getAttribute(CV_SLOT_ATTR);
  return slotId ? { kind: 'slot', slotId } : null;
}

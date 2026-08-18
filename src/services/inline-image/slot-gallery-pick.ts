import { parseSlotMarkerLine } from '@/services/inline-image/slot-shortcode';
import {
  CV_SLOT_ATTR,
  ensureSlotRenderContainer,
  ensureSlotRenderContainerForParagraph,
} from '@/services/inline-image/cv-render-container';
import {
  buildSlotSessionKey,
  type GallerySessionRecord,
} from '@/composables/inlineGallerySession';
import { ensureFloorTailSlotContainer } from '@/services/inline-image/floor-tail-host';
import { pickFloorTailMountsForMessage } from '@/services/inline-image/floor-tail-restore';
import {
  createInlineFavoriteAnchor,
  findMessageId,
  type InlineFavoriteAnchor,
} from '@/services/sillytavern/chat-dom';

/** 画廊挂载规格：容器 + 短码位点 + 楼层（不含 Vue） */
export interface GalleryMountSpec {
  key: string;
  messageId: number;
  element: HTMLElement;
  mountKey: { kind: 'slot'; slotId: string };
  anchor: InlineFavoriteAnchor;
}

/**
 * 扫描可见楼层的短码，产出可 Teleport 的挂载规格
 * @param messageIds 可选限定楼层
 * @returns 挂载规格列表
 */
export async function pickGalleryMounts(messageIds?: number[]): Promise<GalleryMountSpec[]> {
  const targetMes = resolveTargetMessageIds(messageIds);
  const seen = new Set<string>();
  const mounts: GalleryMountSpec[] = [];
  for (const messageId of targetMes) {
    mounts.push(...await pickSlotMountsForMessage(messageId, seen));
  }
  return mounts;
}

/**
 * 在生成完成时把单条 slot 会话转为挂载规格
 * @param record 会话记录
 * @param paragraph 宿主段落
 * @returns 挂载规格或 null
 */
export function pickMountFromSession(
  record: GallerySessionRecord,
  paragraph: HTMLElement,
): GalleryMountSpec | null {
  const messageId = Number(findMessageId(paragraph) ?? NaN);
  if (!Number.isFinite(messageId)) return null;
  return {
    key: record.key,
    messageId,
    element: ensureSlotRenderContainerForParagraph(paragraph, record.slotId),
    mountKey: { kind: 'slot', slotId: record.slotId },
    anchor: createInlineFavoriteAnchor(paragraph),
  };
}

/**
 * 在前端型生成完成时把单条 slot 会话转为楼层尾挂载规格
 * @param record 会话记录
 * @param mesId 消息楼层 ID
 * @param swipeId 当前 swipe ID
 * @returns 挂载规格
 */
export function pickMountFromFloorTailSession(
  record: GallerySessionRecord,
  mesId: number,
  swipeId: number,
): GalleryMountSpec {
  const element = ensureFloorTailSlotContainer(mesId, swipeId, record.slotId);
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

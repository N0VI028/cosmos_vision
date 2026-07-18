import {
  parseSlotMarkerLine,
} from '@/services/inline-image/slot-shortcode';
import {
  CV_SLOT_ATTR,
  CV_TEMP_ATTR,
  ensureSlotRenderContainer,
  ensureTempRenderContainer,
} from '@/services/inline-image/cv-render-container';
import {
  listSessionsByMessage,
  buildSlotSessionKey,
  buildTempSessionKey,
  resolveSessionAnchor,
  type GallerySessionRecord,
} from '@/composables/inlineGallerySession';
import {
  createInlineFavoriteAnchor,
  findMessageId,
  getVisibleChatParagraphElements,
  type InlineFavoriteAnchor,
} from '@/services/sillytavern/chat-dom';

/** 画廊挂载规格：容器 + 键 + 楼层（不含 Vue） */
export interface GalleryMountSpec {
  key: string;
  messageId: number;
  element: HTMLElement;
  mountKey: { kind: 'slot'; slotId: string } | { kind: 'temp'; tempId: string };
  anchor: InlineFavoriteAnchor;
}

/**
 * 扫描可见楼层的短码与会话临时图，产出可 Teleport 的挂载规格
 * @param messageIds 可选限定楼层；缺省=全部可见 mes
 * @returns 挂载规格列表
 */
export async function pickGalleryMounts(messageIds?: number[]): Promise<GalleryMountSpec[]> {
  const targetMes = resolveTargetMessageIds(messageIds);
  const mounts: GalleryMountSpec[] = [];
  const seen = new Set<string>();
  for (const messageId of targetMes) {
    const slotMounts = await pickSlotMountsForMessage(messageId, seen);
    mounts.push(...slotMounts);
    mounts.push(...pickTempMountsForMessage(messageId, seen));
  }
  return mounts;
}

/**
 * 在生成完成时把单条会话记录转为挂载规格
 * @param record 会话记录
 * @param paragraph 宿主段落
 * @returns 挂载规格或 null
 */
export function pickMountFromSession(
  record: GallerySessionRecord,
  paragraph: HTMLElement,
): GalleryMountSpec | null {
  const messageId = Number(findMessageId(paragraph) ?? record.messageId);
  if (!Number.isFinite(messageId)) return null;
  if (record.kind === 'slot' && record.slotId) {
    const marker = findSlotMarkerAfter(paragraph, record.slotId);
    if (!marker) return null;
    const element = ensureSlotRenderContainer(marker, record.slotId);
    return {
      key: buildSlotSessionKey(record.slotId),
      messageId,
      element,
      mountKey: { kind: 'slot', slotId: record.slotId },
      anchor: createInlineFavoriteAnchor(paragraph),
    };
  }
  if (record.kind === 'temp' && record.tempId) {
    const element = ensureTempRenderContainer(paragraph, record.tempId);
    return {
      key: buildTempSessionKey(record.tempId),
      messageId,
      element,
      mountKey: { kind: 'temp', tempId: record.tempId },
      anchor: createInlineFavoriteAnchor(paragraph),
    };
  }
  return null;
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
 * 扫描某一楼短码：有图则 ensure 容器；无图则 prune
 * @param messageId 楼层
 * @param seen 全局 key 去重
 * @returns 挂载规格
 */
async function pickSlotMountsForMessage(
  messageId: number,
  seen: Set<string>,
): Promise<GalleryMountSpec[]> {
  const paragraphs = getMessageParagraphs(messageId);
  const mounts: GalleryMountSpec[] = [];
  for (const paragraph of paragraphs) {
    const mount = await pickSlotMountForParagraph(paragraph, messageId, seen);
    if (mount) mounts.push(mount);
  }
  return mounts;
}

/**
 * 单 marker 挂载：短码段绑定前一个正文段落
 * @param marker 独立短码段
 * @param messageId 楼层
 * @param seen 去重
 * @returns mount 或 null
 */
async function pickSlotMountForParagraph(
  marker: HTMLElement,
  messageId: number,
  seen: Set<string>,
): Promise<GalleryMountSpec | null> {
  const slotId = parseSlotMarkerLine(marker.textContent ?? '');
  const paragraph = findMarkerHostParagraph(marker);
  if (!slotId || !paragraph) return null;
  const key = buildSlotSessionKey(slotId);
  if (seen.has(key)) return null;
  seen.add(key);
  // 💡 不再在此处拦截和移除 DOM 节点，而是直接创建挂载容器，让前端展示失效占位符和一键删除按钮
  const element = ensureSlotRenderContainer(marker, slotId);
  return {
    key,
    messageId,
    element,
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
 * 按会话内存重挂该楼临时 / slot 覆盖层画廊
 * @param messageId 楼层
 * @param seen 全局 key 去重
 * @returns 挂载规格
 */
function pickTempMountsForMessage(messageId: number, seen: Set<string>): GalleryMountSpec[] {
  const mounts: GalleryMountSpec[] = [];
  for (const record of listSessionsByMessage(messageId)) {
    const mount = pickSessionMountIfNeeded(record, messageId, seen);
    if (mount) mounts.push(mount);
  }
  return mounts;
}

/**
 * 将单条会话记录提升为 mount（已 seen 或无法定位则跳过）
 * @param record 会话记录
 * @param messageId 楼层
 * @param seen 全局 key 去重
 * @returns 挂载规格或 null
 */
function pickSessionMountIfNeeded(
  record: GallerySessionRecord,
  messageId: number,
  seen: Set<string>,
): GalleryMountSpec | null {
  if (seen.has(record.key)) return null;
  if (record.kind === 'slot') return pickSlotSessionMount(record, messageId, seen);
  return pickTempSessionMount(record, messageId, seen);
}

/**
 * slot 会话覆盖层：无短码时仍 ensure 容器（取消收藏残留项）
 * @param record 会话
 * @param messageId 楼层
 * @param seen 去重
 * @returns mount 或 null
 */
function pickSlotSessionMount(
  record: GallerySessionRecord,
  messageId: number,
  seen: Set<string>,
): GalleryMountSpec | null {
  const anchor = resolveSessionAnchor(record);
  if (!anchor?.paragraph || !record.slotId) return null;
  const marker = findSlotMarkerAfter(anchor.paragraph, record.slotId);
  if (!marker) return null;
  seen.add(record.key);
  const element = ensureSlotRenderContainer(marker, record.slotId);
  return {
    key: record.key,
    messageId,
    element,
    mountKey: { kind: 'slot', slotId: record.slotId },
    anchor,
  };
}

/**
 * 查找正文后的独立 slot marker
 * @param paragraph 宿主正文
 * @param slotId 位点 id
 * @returns marker 或 null
 */
function findSlotMarkerAfter(paragraph: HTMLElement, slotId: string): HTMLElement | null {
  const marker = paragraph.nextElementSibling;
  if (!(marker instanceof HTMLElement)) return null;
  return parseSlotMarkerLine(marker.textContent ?? '') === slotId ? marker : null;
}

/**
 * 纯临时会话重挂
 * @param record 会话
 * @param messageId 楼层
 * @param seen 去重
 * @returns mount 或 null
 */
function pickTempSessionMount(
  record: GallerySessionRecord,
  messageId: number,
  seen: Set<string>,
): GalleryMountSpec | null {
  if (!record.tempId || !record.items.length) return null;
  const anchor = resolveSessionAnchor(record);
  if (!anchor?.paragraph) return null;
  seen.add(record.key);
  const element = ensureTempRenderContainer(anchor.paragraph, record.tempId);
  return {
    key: record.key,
    messageId,
    element,
    mountKey: { kind: 'temp', tempId: record.tempId },
    anchor,
  };
}

/**
 * 读取指定楼层可见段落
 * @param messageId 楼层
 * @returns 段落
 */
function getMessageParagraphs(messageId: number): HTMLElement[] {
  return getVisibleChatParagraphElements().filter(paragraph => {
    return findMessageId(paragraph) === String(messageId);
  });
}

/**
 * 读取挂载 key（兼容 data 属性）
 * @param element 容器
 * @returns key 或 null
 */
export function readMountKeyFromElement(
  element: HTMLElement,
): GalleryMountSpec['mountKey'] | null {
  const slotId = element.getAttribute(CV_SLOT_ATTR);
  if (slotId) return { kind: 'slot', slotId };
  const tempId = element.getAttribute(CV_TEMP_ATTR);
  if (tempId) return { kind: 'temp', tempId };
  return null;
}

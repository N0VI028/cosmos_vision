import { preventInlineEventBubbling } from '@/composables/inlineImageDom';
import { encodeSlotShortcode } from '@/services/inline-image/slot-shortcode';
import { findMessageId } from '@/services/sillytavern/chat-dom';

/** 统一画廊承载容器 class（独立于 TH-render） */
export const CV_RENDER_CLASS = 'cv-render';
/** slot 位点 data 属性 */
export const CV_SLOT_ATTR = 'data-cv-slot';
/** 临时画廊 data 属性 */
export const CV_TEMP_ATTR = 'data-cv-temp';
/** 归属楼层 data 属性 */
export const CV_MESID_ATTR = 'data-cv-mesid';
/** 独立短码 marker class */
export const CV_SLOT_MARKER_CLASS = 'cv-slot-marker';

/**
 * 确保 marker 后存在 slot 画廊容器
 * @param marker 独立短码段
 * @param slotId 位点 id
 * @returns 承载容器
 */
export function ensureSlotRenderContainer(marker: HTMLElement, slotId: string): HTMLElement {
  marker.classList.add(CV_SLOT_MARKER_CLASS);
  marker.hidden = true;
  const element = ensureAfterContainer(marker, CV_SLOT_ATTR, slotId);
  element.removeAttribute(CV_TEMP_ATTR);
  return element;
}

/**
 * 删除渲染容器并恢复独立短码 marker
 * @param element 渲染容器
 */
export function removeRenderContainer(element: Element): void {
  const marker = element.previousElementSibling;
  if (marker instanceof HTMLElement && marker.classList.contains(CV_SLOT_MARKER_CLASS)) {
    marker.hidden = false;
    marker.classList.remove(CV_SLOT_MARKER_CLASS);
  }
  element.remove();
}

/**
 * 确保段落后存在临时画廊容器
 * @param paragraph 宿主段落
 * @param tempId 临时键
 * @returns 承载容器
 */
export function ensureTempRenderContainer(paragraph: HTMLElement, tempId: string): HTMLElement {
  const element = ensureAfterContainer(paragraph, CV_TEMP_ATTR, tempId);
  element.removeAttribute(CV_SLOT_ATTR);
  return element;
}

/**
 * 把已有临时容器升级为 slot 容器
 * @param element 当前容器
 * @param slotId 位点 id
 */
export function rekeyRenderContainerToSlot(element: HTMLElement, slotId: string): void {
  ensureMarkerBeforeContainer(element, slotId);
  element.setAttribute(CV_SLOT_ATTR, slotId);
  element.removeAttribute(CV_TEMP_ATTR);
}

/**
 * 临时画廊晋升时补齐独立短码 marker
 * @param element 当前容器
 * @param slotId 位点 id
 */
function ensureMarkerBeforeContainer(element: HTMLElement, slotId: string): void {
  const previous = element.previousElementSibling;
  if (previous instanceof HTMLElement && previous.classList.contains(CV_SLOT_MARKER_CLASS)) return;
  const marker = document.createElement('p');
  marker.textContent = encodeSlotShortcode(slotId);
  marker.classList.add(CV_SLOT_MARKER_CLASS);
  marker.hidden = true;
  element.before(marker);
}

/**
 * 读取段落上的 cv-render 容器（相邻 after sibling，跳过隐藏的短码 marker）
 * @param paragraph 宿主段落
 * @returns 容器或 null
 */
export function findRenderContainerAfter(paragraph: HTMLElement): HTMLElement | null {
  let next = paragraph.nextElementSibling;
  if (next instanceof HTMLElement && next.classList.contains(CV_SLOT_MARKER_CLASS)) {
    next = next.nextElementSibling;
  }
  return next instanceof HTMLElement && next.classList.contains(CV_RENDER_CLASS) ? next : null;
}

/**
 * 从元素文本节点中移除给定短码字面量
 * @param root 根元素
 * @param shortcode 短码全文
 */
export function stripShortcodeTextFromElement(root: HTMLElement, shortcode: string): void {
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

/**
 * 复用或创建段落 after 的 cv-render 容器
 * @param paragraph 宿主段落
 * @param attr 主 data 属性
 * @param value 属性值
 * @returns 容器元素
 */
function ensureAfterContainer(paragraph: HTMLElement, attr: string, value: string): HTMLElement {
  const existing = findMatchingContainer(paragraph, attr, value);
  if (existing) {
    writeMesId(existing, paragraph);
    return existing;
  }
  const claimable = findClaimableContainer(paragraph, attr);
  if (claimable) {
    claimable.setAttribute(attr, value);
    writeMesId(claimable, paragraph);
    return claimable;
  }
  return createRenderContainer(paragraph, attr, value);
}

/**
 * 创建段落后新的 cv-render 容器
 * @param paragraph 宿主段落
 * @param attr 主 data 属性
 * @param value 属性值
 * @returns 新建容器
 */
function createRenderContainer(paragraph: HTMLElement, attr: string, value: string): HTMLElement {
  const element = document.createElement('div');
  element.className = CV_RENDER_CLASS;
  element.setAttribute(attr, value);
  writeMesId(element, paragraph);
  preventInlineEventBubbling(element);
  paragraph.after(element);
  return element;
}

/**
 * 查找同段可升级复用的 cv-render（避免 temp/slot 各建一个）
 * @param paragraph 宿主段落
 * @param attr 目标属性
 * @returns 可复用容器或 null
 */
function findClaimableContainer(paragraph: HTMLElement, attr: string): HTMLElement | null {
  const next = findRenderContainerAfter(paragraph);
  if (!next) return null;
  // slot 升级可吃掉 temp；temp 不得降级吃 slot
  if (attr === CV_SLOT_ATTR && next.hasAttribute(CV_TEMP_ATTR) && !next.hasAttribute(CV_SLOT_ATTR)) {
    return next;
  }
  if (!next.hasAttribute(CV_SLOT_ATTR) && !next.hasAttribute(CV_TEMP_ATTR)) return next;
  return null;
}

/**
 * 在段落后查找匹配 data 属性的 cv-render
 * @param paragraph 宿主段落
 * @param attr data 属性名
 * @param value 属性值
 * @returns 容器或 null
 */
function findMatchingContainer(paragraph: HTMLElement, attr: string, value: string): HTMLElement | null {
  let sibling = paragraph.nextElementSibling;
  while (sibling instanceof HTMLElement && sibling.classList.contains(CV_RENDER_CLASS)) {
    if (sibling.getAttribute(attr) === value) return sibling;
    sibling = sibling.nextElementSibling;
  }
  return null;
}

/**
 * 写入楼层 id 到容器
 * @param element 容器
 * @param paragraph 宿主段落
 */
function writeMesId(element: HTMLElement, paragraph: HTMLElement): void {
  const messageId = findMessageId(paragraph);
  if (messageId) element.setAttribute(CV_MESID_ATTR, messageId);
}

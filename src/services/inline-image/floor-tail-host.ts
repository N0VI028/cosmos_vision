import { preventInlineEventBubbling } from '@/composables/inlineImageDom';
import { CV_MESID_ATTR, CV_RENDER_CLASS, CV_SLOT_ATTR } from '@/services/inline-image/cv-render-container';
import { getHostIframe, isHTMLElementNode } from '@/services/inline-image/iframe-utils';

export const CV_FLOOR_TAIL_CLASS = 'cv-floor-tail';
export const CV_FLOOR_TAIL_SLOT_CLASS = 'cv-floor-tail-slot';
export const CV_SWIPE_ATTR = 'data-cv-swipe';
export const CV_ROUTE_ATTR = 'data-cv-route';

/**
 * 查找指定 targetAnchor 对应的顶层宿主挂载外层容器
 * iframe 情境回退到宿主 iframe；HTML 情境回退到最近的有 class 容器
 * @param targetAnchor 目标元素
 * @returns 顶层宿主容器
 */
function resolveAnchorWrapper(targetAnchor: HTMLElement): HTMLElement {
  const iframe = targetAnchor.tagName === 'IFRAME' ? targetAnchor : getHostIframe(targetAnchor);
  if (iframe) {
    return iframe.closest<HTMLElement>('div.TH-render') ?? iframe;
  }
  return targetAnchor.closest<HTMLElement>('details')
    ?? targetAnchor.closest<HTMLElement>('dialog')
    ?? targetAnchor.closest<HTMLElement>('table')
    ?? targetAnchor.closest<HTMLElement>('div[class]:not(.mes_text):not(.cv-render)')
    ?? targetAnchor;
}

/**
 * 判断 targetAnchor 是否关联 iframe（iframe 本身或处于 iframe 内）
 * @param targetAnchor 目标元素
 * @returns 是否 iframe 路由
 */
function isIframeAnchor(targetAnchor: HTMLElement): boolean {
  if (targetAnchor.tagName === 'IFRAME') return true;
  return Boolean(getHostIframe(targetAnchor));
}

/**
 * 确保指定楼层与 swipe 的宿主根容器存在
 * iframe 路由精准锚定到对应渲染单元正后方；HTML（无 iframe）统一复用楼层末尾 root
 * @param mesId 消息楼层 ID
 * @param swipeId 当前 swipe ID
 * @param targetAnchor 可选的目标元素或 iframe（仅 iframe 路由用于精准定位）
 * @returns 楼层宿主根容器
 */
export function ensureFloorTailHost(mesId: number, swipeId: number, targetAnchor?: HTMLElement): HTMLElement {
  const mes = findMessageElement(mesId);
  if (!mes) throw new Error(`未找到 ID 为 ${mesId} 的消息元素`);

  // iframe 路由：在对应渲染单元后查找已有 root，找不到则精准创建在其后
  if (targetAnchor && isIframeAnchor(targetAnchor)) {
    const wrapper = resolveAnchorWrapper(targetAnchor);
    let next = wrapper.nextElementSibling;
    while (next instanceof HTMLElement && next.classList.contains(CV_RENDER_CLASS)) {
      if (next.getAttribute(CV_MESID_ATTR) === String(mesId) && next.getAttribute(CV_SWIPE_ATTR) === String(swipeId)) {
        return next;
      }
      next = next.nextElementSibling;
    }
    return createFloorTailRootContainer(mes, mesId, swipeId, targetAnchor);
  }

  // HTML 或无锚点：复用楼层末尾已有 root，不存在则创建到末尾
  const existing = findFloorTailHost(mesId, swipeId);
  if (existing) return existing;
  return createFloorTailRootContainer(mes, mesId, swipeId);
}

/**
 * 确保指定 slot 的独立挂载承载容器存在（支持精准锚定到对应 iframe/组件下方）
 * @param mesId 消息楼层 ID
 * @param swipeId 当前 swipe ID
 * @param slotId 位点 ID
 * @param targetAnchor 可选目标 iframe 或组件元素
 * @returns slot 挂载容器
 */
export function ensureFloorTailSlotContainer(
  mesId: number,
  swipeId: number,
  slotId: string,
  targetAnchor?: HTMLElement,
): HTMLElement {
  // 全局查找是否已存在该 slotId 的容器
  const existing = document.querySelector<HTMLElement>(`.${CV_FLOOR_TAIL_SLOT_CLASS}[${CV_SLOT_ATTR}="${slotId}"]`);
  if (existing) {
    return existing;
  }

  const root = ensureFloorTailHost(mesId, swipeId, targetAnchor);
  const existingInRoot = root.querySelector<HTMLElement>(`.${CV_FLOOR_TAIL_SLOT_CLASS}[${CV_SLOT_ATTR}="${slotId}"]`);
  if (existingInRoot) {
    return existingInRoot;
  }

  const slotContainer = document.createElement('div');
  slotContainer.className = CV_FLOOR_TAIL_SLOT_CLASS;
  slotContainer.setAttribute(CV_SLOT_ATTR, slotId);
  preventInlineEventBubbling(slotContainer);
  root.appendChild(slotContainer);
  return slotContainer;
}

/**
 * 查找指定楼层与 swipe 的楼层尾根容器
 * @param mesId 消息楼层 ID
 * @param swipeId 可选限定 swipe ID
 * @returns 根容器元素或 null
 */
export function findFloorTailHost(mesId: number, swipeId?: number): HTMLElement | null {
  const selector = typeof swipeId === 'number'
    ? `.${CV_RENDER_CLASS}.${CV_FLOOR_TAIL_CLASS}[${CV_MESID_ATTR}="${mesId}"][${CV_SWIPE_ATTR}="${swipeId}"]`
    : `.${CV_RENDER_CLASS}.${CV_FLOOR_TAIL_CLASS}[${CV_MESID_ATTR}="${mesId}"]`;
  return document.querySelector<HTMLElement>(selector);
}

/**
 * 查找消息楼层 DOM 元素
 * @param mesId 消息楼层 ID
 * @returns 消息根元素或 null
 */
function findMessageElement(mesId: number): HTMLElement | null {
  return document.querySelector<HTMLElement>(`#chat .mes[mesid="${mesId}"]`);
}

/**
 * 创建并插入楼层尾根容器
 * 有 targetAnchor（iframe 路由）则精准插入在对应渲染单元正后方；无则插入楼层末尾
 * @param mes 消息根元素
 * @param mesId 消息楼层 ID
 * @param swipeId 当前 swipe ID
 * @param targetAnchor 可选目标元素（仅 iframe 路由）
 * @returns 新创建的根容器
 */
function createFloorTailRootContainer(
  mes: HTMLElement,
  mesId: number,
  swipeId: number,
  targetAnchor?: HTMLElement,
): HTMLElement {
  const host = document.createElement('div');
  host.className = `${CV_RENDER_CLASS} ${CV_FLOOR_TAIL_CLASS}`;
  host.setAttribute(CV_MESID_ATTR, String(mesId));
  host.setAttribute(CV_SWIPE_ATTR, String(swipeId));
  host.setAttribute(CV_ROUTE_ATTR, 'frontend');
  preventInlineEventBubbling(host);

  // iframe 路由：精准插入在对应渲染单元正后方
  if (targetAnchor) {
    const wrapper = resolveAnchorWrapper(targetAnchor);
    if (wrapper && mes.contains(wrapper)) {
      wrapper.after(host);
      return host;
    }
  }

  // HTML / 无锚点兜底：插入楼层内最后一个 TH-render / iframe 后，否则追加 mes_text 末尾
  const thRenders = Array.from(mes.querySelectorAll('div.TH-render')).filter(isHTMLElementNode);
  if (thRenders.length > 0) {
    thRenders[thRenders.length - 1]!.after(host);
    return host;
  }

  const iframes = Array.from(mes.querySelectorAll('iframe')).filter(isHTMLElementNode);
  if (iframes.length > 0) {
    iframes[iframes.length - 1]!.after(host);
    return host;
  }

  const mesText = mes.querySelector('.mes_text');
  if (mesText instanceof HTMLElement) {
    mesText.appendChild(host);
    return host;
  }

  mes.appendChild(host);
  return host;
}

import { preventInlineEventBubbling } from '@/composables/inlineImageDom';
import { CV_MESID_ATTR, CV_RENDER_CLASS, CV_SLOT_ATTR } from '@/services/inline-image/cv-render-container';

export const CV_FLOOR_TAIL_CLASS = 'cv-floor-tail';
export const CV_FLOOR_TAIL_SLOT_CLASS = 'cv-floor-tail-slot';
export const CV_SWIPE_ATTR = 'data-cv-swipe';
export const CV_ROUTE_ATTR = 'data-cv-route';

/**
 * 确保指定楼层与 swipe 的楼层尾根容器存在
 * @param mesId 消息楼层 ID
 * @param swipeId 当前 swipe ID
 * @returns 楼层尾根容器
 */
export function ensureFloorTailHost(mesId: number, swipeId: number): HTMLElement {
  const existing = findFloorTailHost(mesId, swipeId);
  if (existing) return existing;

  const mes = findMessageElement(mesId);
  if (!mes) throw new Error(`未找到 ID 为 ${mesId} 的消息元素`);

  return createFloorTailRootContainer(mes, mesId, swipeId);
}

/**
 * 确保楼层尾中指定 slot 的独立挂载承载容器存在
 * @param mesId 消息楼层 ID
 * @param swipeId 当前 swipe ID
 * @param slotId 位点 ID
 * @returns slot 挂载容器
 */
export function ensureFloorTailSlotContainer(mesId: number, swipeId: number, slotId: string): HTMLElement {
  const root = ensureFloorTailHost(mesId, swipeId);
  const existing = root.querySelector<HTMLElement>(`.${CV_FLOOR_TAIL_SLOT_CLASS}[${CV_SLOT_ATTR}="${slotId}"]`);
  if (existing) return existing;

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
 * @param mes 消息根元素
 * @param mesId 消息楼层 ID
 * @param swipeId 当前 swipe ID
 * @returns 新创建的根容器
 */
function createFloorTailRootContainer(mes: HTMLElement, mesId: number, swipeId: number): HTMLElement {
  const host = document.createElement('div');
  host.className = `${CV_RENDER_CLASS} ${CV_FLOOR_TAIL_CLASS}`;
  host.setAttribute(CV_MESID_ATTR, String(mesId));
  host.setAttribute(CV_SWIPE_ATTR, String(swipeId));
  host.setAttribute(CV_ROUTE_ATTR, 'frontend');
  preventInlineEventBubbling(host);

  const thRender = mes.querySelector('div.TH-render');
  if (thRender instanceof HTMLElement) {
    thRender.after(host);
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

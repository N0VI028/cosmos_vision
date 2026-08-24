export interface BorderInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/**
 * 安全尝试访问 iframe 的 document 对象
 *
 * 跨域或未加载时返回 null，避免 SecurityError 崩溃
 * @param iframe 目标 iframe
 * @returns 可访问的 Document 或 null
 */
export function tryAccessIframeDocument(iframe: HTMLIFrameElement): Document | null {
  try {
    return iframe.contentDocument ?? iframe.contentWindow?.document ?? null;
  } catch {
    return null;
  }
}

/**
 * 跨 realm 检查节点是否为 Element（不使用 instanceof）
 *
 * iframe 内的 Element 构造函数与父文档不同，instanceof 判定会失败
 * @param node 待检查节点
 * @returns 是否为 Element 节点
 */
export function isElementNode(node: unknown): node is Element {
  return typeof node === 'object' && node !== null && 'nodeType' in node && (node as Node).nodeType === Node.ELEMENT_NODE;
}

/**
 * 跨 realm 检查节点是否为 HTMLElement（不使用 instanceof）
 *
 * iframe 内的 HTMLElement 构造函数与父文档不同，instanceof 判定会失败
 * @param node 待检查节点
 * @returns 是否为 HTMLElement 节点
 */
export function isHTMLElementNode(node: unknown): node is HTMLElement {
  return isElementNode(node) && 'tagName' in node;
}

/**
 * 检查节点是否为 iframe 元素
 * @param node 待检查节点
 * @returns 是否为 HTMLIFrameElement
 */
export function isIframeElementNode(node: unknown): node is HTMLIFrameElement {
  return isHTMLElementNode(node) && node.tagName === 'IFRAME';
}

/**
 * 获取 iframe 内元素在父文档中的宿主 iframe 元素
 *
 * DOM 事件与 closest 均不跨越 iframe 文档边界，
 * 需要先取宿主 iframe 再回到父文档查找祖先
 * @param element 可能在 iframe 内的元素
 * @returns 宿主 iframe 元素，元素不在 iframe 内或无法访问时返回 null
 */
export function getHostIframe(element: Element): HTMLIFrameElement | null {
  if (element.tagName === 'IFRAME') {
    const parentFrame = element.ownerDocument?.defaultView?.frameElement;
    if (isHTMLElementNode(parentFrame) && parentFrame.tagName === 'IFRAME') {
      return parentFrame as HTMLIFrameElement;
    }
    return null;
  }

  const defaultView = element.ownerDocument?.defaultView;
  if (!defaultView || defaultView === window) return null;

  try {
    const frameElement = defaultView.frameElement;
    return isHTMLElementNode(frameElement) && frameElement.tagName === 'IFRAME'
      ? (frameElement as HTMLIFrameElement)
      : null;
  } catch {
    return null;
  }
}

/**
 * 递归计算元素相对于最外层顶层视口的累加偏移（跨 iframe 穿透）
 *
 * 当元素位于同源 iframe 内时，仅使用 element.getBoundingClientRect()
 * 得到的是相对于该 iframe 视口的坐标，必须累加各层 iframe 的视口偏移与内边距
 * @param element 目标元素
 * @returns 顶层视口下的 clientRect 与各层 border 累计值
 */
export function getCrossFrameBoundingClientRect(element: Element): DOMRect {
  const rect = element.getBoundingClientRect();
  const hostIframe = getHostIframe(element);
  if (!hostIframe) {
    return rect;
  }

  const iframeRect = getCrossFrameBoundingClientRect(hostIframe);
  const insets = getIframeBorderInsets(hostIframe);

  const left = iframeRect.left + insets.left + rect.left;
  const top = iframeRect.top + insets.top + rect.top;
  const width = rect.width;
  const height = rect.height;

  return new DOMRect(left, top, width, height);
}

/**
 * 视口全局坐标系别名
 */
export const getViewportRect = getCrossFrameBoundingClientRect;

/**
 * 提取 iframe 元素的边框与内边距厚度，避免内部绝对坐标出现几像素偏移
 * @param iframe 宿主 iframe
 * @returns 上右下左四个方向的额外 inset
 */
export function getIframeBorderInsets(iframe: HTMLIFrameElement): BorderInsets {
  try {
    const style = window.getComputedStyle(iframe);
    return {
      top: parseFloat(style.borderTopWidth) || 0,
      right: parseFloat(style.borderRightWidth) || 0,
      bottom: parseFloat(style.borderBottomWidth) || 0,
      left: parseFloat(style.borderLeftWidth) || 0,
    };
  } catch {
    return { top: 0, right: 0, bottom: 0, left: 0 };
  }
}

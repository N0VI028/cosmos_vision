interface InlineImageCleanupObserver {
  disconnect: () => void;
  notifyImageAdded: () => void;
}

interface InlineImageCleanupObserverOptions {
  getEntries: () => Iterable<[HTMLElement, HTMLElement]>;
  removeImageCard: (paragraph: HTMLElement) => void;
}

interface InlineImageCleanupObserverState {
  checkQueued: boolean;
  observer: MutationObserver | null;
  options: InlineImageCleanupObserverOptions;
}

const HIDDEN_ATTRIBUTE = 'aria-hidden';
const OBSERVED_ATTRIBUTES = ['class', 'style', 'hidden', HIDDEN_ATTRIBUTE];

/**
 * 创建内联图片清理观察器
 * @param options 清理观察器选项
 * @returns 观察器控制句柄
 */
export function createInlineImageCleanupObserver(
  options: InlineImageCleanupObserverOptions,
): InlineImageCleanupObserver {
  const state: InlineImageCleanupObserverState = { checkQueued: false, observer: null, options };
  return {
    disconnect: () => disconnectObserver(state),
    notifyImageAdded: () => notifyImageAdded(state),
  };
}

/**
 * 通知清理器有新图片加入
 * @param state 清理器状态
 */
function notifyImageAdded(state: InlineImageCleanupObserverState): void {
  ensureObserver(state);
  queueCleanupCheck(state);
}

/**
 * 确保 DOM 观察器已启动
 * @param state 清理器状态
 */
function ensureObserver(state: InlineImageCleanupObserverState): void {
  if (state.observer || !document.body) return;
  state.observer = new MutationObserver(() => queueCleanupCheck(state));
  state.observer.observe(document.body, {
    attributeFilter: OBSERVED_ATTRIBUTES,
    attributes: true,
    childList: true,
    subtree: true,
  });
}

/**
 * 排队执行一次清理检查
 * @param state 清理器状态
 */
function queueCleanupCheck(state: InlineImageCleanupObserverState): void {
  if (state.checkQueued) return;
  state.checkQueued = true;
  queueMicrotask(() => runCleanupCheck(state));
}

/**
 * 执行内联图片清理检查
 * @param state 清理器状态
 */
function runCleanupCheck(state: InlineImageCleanupObserverState): void {
  state.checkQueued = false;
  Array.from(state.options.getEntries()).forEach(([paragraph, container]) => {
    if (shouldRemoveInlineImage(paragraph, container)) state.options.removeImageCard(paragraph);
  });
  disconnectWhenEmpty(state);
}

/**
 * 图片缓存为空时关闭观察器
 * @param state 清理器状态
 */
function disconnectWhenEmpty(state: InlineImageCleanupObserverState): void {
  if (Array.from(state.options.getEntries()).length > 0) return;
  disconnectObserver(state);
}

/**
 * 关闭 DOM 观察器
 * @param state 清理器状态
 */
function disconnectObserver(state: InlineImageCleanupObserverState): void {
  state.observer?.disconnect();
  state.observer = null;
  state.checkQueued = false;
}

/**
 * 判断内联图片是否应被清理
 * @param paragraph 聊天段落元素
 * @param container 图片容器元素
 * @returns 是否需要清理
 */
function shouldRemoveInlineImage(paragraph: HTMLElement, container: HTMLElement): boolean {
  if (!paragraph.isConnected || !container.isConnected) return true;
  return hasHiddenAncestor(container) || hasHiddenAncestor(getMessageRoot(paragraph));
}

/**
 * 获取段落所属消息根节点
 * @param paragraph 聊天段落元素
 * @returns 消息根节点或段落本身
 */
function getMessageRoot(paragraph: HTMLElement): HTMLElement {
  const root = paragraph.closest('[mesid], .mes');
  return root instanceof HTMLElement ? root : paragraph;
}

/**
 * 判断元素或祖先是否处于隐藏状态
 * @param element 待检查元素
 * @returns 是否隐藏
 */
function hasHiddenAncestor(element: HTMLElement): boolean {
  let current: HTMLElement | null = element;
  while (current && current !== document.body) {
    if (isDirectlyHidden(current)) return true;
    current = current.parentElement;
  }
  return false;
}

/**
 * 判断元素自身是否处于隐藏状态
 * @param element 待检查元素
 * @returns 是否隐藏
 */
function isDirectlyHidden(element: HTMLElement): boolean {
  const style = window.getComputedStyle(element);
  return (
    element.hidden ||
    element.getAttribute(HIDDEN_ATTRIBUTE) === 'true' ||
    style.display === 'none' ||
    style.visibility === 'hidden'
  );
}

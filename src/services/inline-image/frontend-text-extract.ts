import { mapNormalize } from '@/services/inline-image/host-locate';

const IGNORED_TAGS = new Set(['SCRIPT', 'STYLE', 'BUTTON']);

/**
 * 提取前端型气泡内的纯文本内容（保留 <br> 换行，剔除控件与脚本）
 * @param element 选中的气泡或气泡内部元素
 * @returns 规范化后的提示词文本
 */
export function extractFrontendText(element: HTMLElement): string {
  const root = resolveFrontendBubbleRoot(element);
  const rawText = collectBubbleDomText(root);
  return mapNormalize(rawText, true).normalized;
}

/**
 * 解析前端型气泡的顶级承载容器
 * @param element 触发元素
 * @returns 气泡容器元素
 */
export function resolveFrontendBubbleRoot(element: HTMLElement): HTMLElement {
  const custom = element.closest<HTMLElement>('[data-cv-selectable]');
  if (custom) return custom;
  const block = element.closest<HTMLElement>('div, p, section, article');
  return block ?? element;
}

/**
 * 通过 TreeWalker 收集气泡内的文本内容与换行
 * @param root 气泡根元素
 * @returns 未规范化的拼接文本
 */
function collectBubbleDomText(root: HTMLElement): string {
  const doc = root.ownerDocument ?? document;
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
    acceptNode: node => filterBubbleNode(node),
  });

  const chunks: string[] = [];
  let current = walker.nextNode();
  while (current) {
    if (current instanceof HTMLElement && current.tagName === 'BR') {
      chunks.push('\n');
    } else if (current.nodeType === Node.TEXT_NODE) {
      chunks.push(current.textContent ?? '');
    }
    current = walker.nextNode();
  }
  return chunks.join('');
}

/**
 * 过滤气泡 DOM 节点，剔除按钮/脚本/控件
 * @param node DOM 节点
 * @returns 节点过滤状态
 */
function filterBubbleNode(node: Node): number {
  if (node instanceof HTMLElement) {
    if (IGNORED_TAGS.has(node.tagName) || hasIgnoredClass(node)) {
      return NodeFilter.FILTER_REJECT;
    }
    if (node.tagName === 'BR') {
      return NodeFilter.FILTER_ACCEPT;
    }
    return NodeFilter.FILTER_SKIP;
  }
  const parent = node.parentElement;
  if (parent && (IGNORED_TAGS.has(parent.tagName) || hasIgnoredClass(parent))) {
    return NodeFilter.FILTER_REJECT;
  }
  return NodeFilter.FILTER_ACCEPT;
}

/**
 * 判断元素是否包含需排除的控件或插件装饰类
 * @param element 待检查元素
 * @returns 是否应排除
 */
function hasIgnoredClass(element: HTMLElement): boolean {
  if (element.classList.contains('image-tag-button')) return true;
  // 仅排除楼层尾挂载容器，避免误伤气泡内合法的 cv-render 文本
  if (element.classList.contains('cv-floor-tail') || element.classList.contains('cv-floor-tail-slot')) return true;
  return Array.from(element.classList).some(
    // 豁免 cv-inline-selected：选中态气泡文本仍需提取
    className => className.startsWith('cv-inline') && className !== 'cv-inline-selected',
  );
}

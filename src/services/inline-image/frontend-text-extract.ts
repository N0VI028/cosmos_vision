import { mapNormalize } from '@/services/inline-image/host-locate';
import {
  getHostIframe,
  isHTMLElementNode,
  isIframeElementNode,
  tryAccessIframeDocument,
} from '@/services/inline-image/iframe-utils';

export const FRONTEND_IGNORED_TAGS = new Set(['HEAD', 'TITLE', 'SCRIPT', 'STYLE', 'BUTTON']);

/**
 * 块级元素标签：遍历到边界时插入换行，避免相邻块文本粘连
 */
const BLOCK_TAGS = new Set([
  'DIV', 'P', 'BLOCKQUOTE', 'PRE', 'UL', 'OL', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
  'DETAILS', 'SUMMARY', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER', 'MAIN', 'NAV', 'ASIDE',
  'FIGURE', 'FIGCAPTION', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TD', 'TH', 'HR', 'DL', 'DT', 'DD',
]);

/**
 * Markdown 语义文本块选择器：判定文本是否已被标准 markdown 块覆盖
 */
const MARKDOWN_TEXT_BLOCK_SELECTOR = 'p, li, blockquote, pre, h1, h2, h3, h4, h5, h6';

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
 * 优先查找显式标记的 data-cv-selectable，否则智能识别CSS气泡特征
 * @param element 触发元素
 * @returns 气泡容器元素
 */
export function resolveFrontendBubbleRoot(element: HTMLElement): HTMLElement {
  // 优先使用显式标记
  const custom = element.closest<HTMLElement>('[data-cv-selectable]');
  if (custom) {
    return custom;
  }

  // 智能识别CSS气泡：查找最近的有class的div/section/article
  let current: HTMLElement | null = element;
  while (current) {
    const parent: HTMLElement | null = current.parentElement;
    if (!parent) break;

    // 停止条件：到达 .mes_text 边界
    if (parent.classList.contains('mes_text')) {
      // 如果当前节点有class且包含文本，视为气泡
      if (current.className && current.textContent?.trim()) {
        return current;
      }
      break;
    }

    // 识别气泡特征：div/section/article + 有class + 包含文本
    if (
      current.matches('div, section, article') &&
      current.className &&
      current.textContent?.trim()
    ) {
      return current;
    }

    current = parent;
  }

  // 降级：查找通用块级元素
  const block = element.closest<HTMLElement>('div, p, section, article');
  return block ?? element;
}

/**
 * 通过 TreeWalker 收集气泡内的文本内容与换行
 * @param root 气泡根元素
 * @returns 未规范化的拼接文本
 */
function collectBubbleDomText(root: HTMLElement): string {
  const chunks: string[] = [];
  collectDomTextInto(root, chunks, null, { stopped: false });
  return chunks.join('');
}

/**
 * 判断元素是否包含需排除的控件或插件装饰类
 * @param element 待检查元素
 * @returns 是否应排除
 */
function hasIgnoredClass(element: HTMLElement): boolean {
  if (element.classList.contains('image-tag-button')) return true;
  // cv-render 为插件渲染容器，内含占位/状态提示等非原文，整体排除
  if (element.classList.contains('cv-render')) return true;
  // 仅排除楼层尾挂载容器，避免误伤气泡内合法的 cv-render 文本
  if (element.classList.contains('cv-floor-tail') || element.classList.contains('cv-floor-tail-slot')) return true;
  return Array.from(element.classList).some(
    // 豁免 cv-inline-selected：选中态气泡文本仍需提取
    className => className.startsWith('cv-inline') && className !== 'cv-inline-selected',
  );
}

/**
 * 判断元素是否视觉隐藏（hidden 属性 / aria-hidden / 内联样式隐藏）
 *
 * 仅检测内联可见的隐藏信号，不调用 getComputedStyle 以免触发布局；
 * 折叠的 <details> 不视为隐藏（其内容虽有语义价值）
 * @param element 待检查元素
 * @returns 是否隐藏
 */
function isHiddenElement(element: HTMLElement): boolean {
  if (element.hasAttribute('hidden')) return true;
  if (element.getAttribute('aria-hidden') === 'true') return true;
  const style = element.getAttribute('style');
  return Boolean(style && /display\s*:\s*none|visibility\s*:\s*hidden/i.test(style));
}

/**
 * 全量收集容器内的可见纯文本（含同源 iframe 递归），支持焦点截断
 *
 * 用户视觉看到的文字就提取，剔除脚本/样式/控件与 cv 插件装饰节点，
 * `<br>` 与块边界转 `\n`，跨域 iframe 自动跳过。
 * 焦点跨文档（位于 iframe 内）时，父文档全收 + 目标 iframe 内按焦点截断
 * @param root 容器根元素（.mes_text 或 iframe body）
 * @param focus 焦点元素，收完其内部文本后立即停止；为 null 时收全部
 * @returns 焦点及之前的全部文本，未命中焦点时返回全部
 */
export function collectVisibleTextUntil(root: HTMLElement, focus: HTMLElement | null): string {
  const chunks: string[] = [];
  const state = { stopped: false };
  collectDomTextInto(root, chunks, focus, state);
  return normalizeCollectedText(chunks.join(''));
}

/**
 * 判定楼层是否为前端型（需走全量文本收集而非 markdown 白名单分块）
 *
 * 含同源 iframe 即为前端型；否则检查是否存在未被 markdown 语义块覆盖的
 * 非空文本节点（如裸 span/section/table/无 class 宿主），有则改走全量收集避免漏取
 * @param root 文本根节点
 * @returns 是否为前端型楼层
 */
export function isFrontendFloor(root: HTMLElement): boolean {
  if (root.querySelector('iframe')) return true;
  // 含插件 UI（按钮、cv 装饰）的楼层需走全量收集，由 hasIgnoredClass 统一剔除装饰节点
  if (root.querySelector('button, [class*="cv-"]')) return true;
  return hasTextOutsideMarkdownBlocks(root);
}

/**
 * 检查 root 内是否存在未被 markdown 语义块覆盖的非空文本节点
 * @param root 文本根节点
 * @returns 是否存在裸文本
 */
function hasTextOutsideMarkdownBlocks(root: HTMLElement): boolean {
  const doc = root.ownerDocument ?? document;
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node: Node) => {
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      if (FRONTEND_IGNORED_TAGS.has(parent.tagName) || hasIgnoredClass(parent) || isHiddenElement(parent)) {
        return NodeFilter.FILTER_REJECT;
      }
      // 文本已被标准 markdown 块覆盖，视为白名单可收，跳过
      if (parent.closest(MARKDOWN_TEXT_BLOCK_SELECTOR)) return NodeFilter.FILTER_REJECT;
      return node.textContent?.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });
  return walker.nextNode() !== null;
}

/**
 * 解析全量收集时用于截断的焦点元素
 * 焦点位于父文档时直接返回；位于 iframe 内时也返回该元素，
 * 由 collectVisibleTextUntil 递归进入对应 iframe 后按引用命中截断
 * @param targetP 目标焦点元素
 * @param root 文本根节点
 * @returns 截断焦点元素；目标不在楼层内时返回 null（不截断）
 */
export function resolveFrontendCollectFocus(targetP: HTMLElement, root: HTMLElement): HTMLElement | null {
  const hostIframe = getHostIframe(targetP);
  // 焦点在 iframe 内：root.contains 因跨文档会失败，通过宿主 iframe 判定归属
  if (hostIframe && root.contains(hostIframe)) return targetP;
  // 焦点在父文档内
  return root.contains(targetP) ? targetP : null;
}

/**
 * 递归收集容器内文本节点与 `<br>` 换行，按焦点截断
 *
 * 焦点与当前 root 同文档时按文档顺序截断；跨文档时（焦点在 iframe 内），
 * 当前文档全收，递归进入焦点所在 iframe 时由其文档内截断处理
 * @param root 容器根元素
 * @param chunks 文本片段累积数组（就地写入）
 * @param focus 焦点元素，null 表示不截断
 * @param state 停止状态（就地写入）
 */
function collectDomTextInto(
  root: HTMLElement,
  chunks: string[],
  focus: HTMLElement | null,
  state: { stopped: boolean; focusSubtreeDone?: boolean },
): void {
  if (state.stopped) return;
  const doc = root.ownerDocument ?? document;
  // 仅当焦点与当前文档同属一个文档时，本文档按焦点截断
  const sameDocFocus = focus && focus.ownerDocument === doc ? focus : null;
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
    acceptNode: node => filterCollectNode(node),
  });

  let current: Node | null = walker.nextNode();
  while (current && !state.stopped) {
    if (sameDocFocus && isAfterFocus(current, sameDocFocus, state)) {
      break;
    }
    if (isHTMLElementNode(current)) {
      // 块级元素边界与 <br> 插入换行，避免相邻块文本粘连
      if (current.tagName === 'BR' || BLOCK_TAGS.has(current.tagName)) {
        chunks.push('\n');
      } else if (isIframeElementNode(current)) {
        // 同源 iframe 递归收集，跨域自动跳过；原始 focus 传入以支持 iframe 内截断
        const innerDoc = tryAccessIframeDocument(current);
        if (innerDoc?.body) {
          collectDomTextInto(innerDoc.body, chunks, focus, state);
        }
      }
    } else if (current.nodeType === Node.TEXT_NODE) {
      chunks.push(current.textContent ?? '');
    }
    current = walker.nextNode();
  }
}

/**
 * 判断节点是否已越过焦点（焦点子树文本已收完）
 *
 * 状态机：节点在焦点内时继续收并标记边界；离开焦点子树的首个节点触发停止；
 * 未进入焦点子树即遇到文档顺序在焦点之后的节点，直接停止
 * @param node 当前遍历节点
 * @param focus 焦点元素
 * @param state 停止状态（focusSubtreeDone 标记焦点子树是否收完）
 * @returns 是否应停止收集
 */
function isAfterFocus(
  node: Node,
  focus: HTMLElement,
  state: { stopped: boolean; focusSubtreeDone?: boolean },
): boolean {
  // 节点在焦点元素内部：继续收，待离开焦点子树后再停
  if (focus.contains(node) || node === focus) {
    state.focusSubtreeDone = false;
    return false;
  }
  // 焦点子树刚收完的边界：下一个节点已不在焦点内，停止
  if (state.focusSubtreeDone === false) {
    state.focusSubtreeDone = true;
    state.stopped = true;
    return true;
  }
  // 节点在焦点之后（文档顺序）：未命中焦点就越过，停止
  const relation = focus.compareDocumentPosition(node);
  return Boolean(relation & Node.DOCUMENT_POSITION_FOLLOWING);
}

/**
 * TreeWalker 节点过滤：剔除隐藏节点、脚本/样式/控件与 cv 装饰节点
 *
 * 块级元素与 <br>、iframe 予以 ACCEPT，以便遍历时插入换行或递归进入 iframe；
 * 其余普通元素 SKIP（仍访问其子文本节点）
 * @param node DOM 节点
 * @returns 节点过滤状态
 */
function filterCollectNode(node: Node): number {
  if (isHTMLElementNode(node)) {
    if (FRONTEND_IGNORED_TAGS.has(node.tagName) || hasIgnoredClass(node) || isHiddenElement(node)) {
      return NodeFilter.FILTER_REJECT;
    }
    if (node.tagName === 'BR' || isIframeElementNode(node) || BLOCK_TAGS.has(node.tagName)) {
      return NodeFilter.FILTER_ACCEPT;
    }
    return NodeFilter.FILTER_SKIP;
  }
  const parent = node.parentElement;
  if (parent && (FRONTEND_IGNORED_TAGS.has(parent.tagName) || hasIgnoredClass(parent) || isHiddenElement(parent))) {
    return NodeFilter.FILTER_REJECT;
  }
  return NodeFilter.FILTER_ACCEPT;
}

/**
 * 规范化收集后的文本：折叠多余空白与换行
 * @param text 原始拼接文本
 * @returns 规范化后的文本
 */
function normalizeCollectedText(text: string): string {
  return text
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

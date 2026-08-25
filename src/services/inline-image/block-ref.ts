import {
  extractFrontendText,
  resolveFrontendBubbleRoot,
} from '@/services/inline-image/frontend-text-extract';
import {
  getHostIframe,
  isHTMLElementNode,
  isIframeElementNode,
  tryAccessIframeDocument,
} from '@/services/inline-image/iframe-utils';

export type BlockKind = 'classic-p' | 'frontend-bubble' | 'custom-selectable';

export interface BlockRef {
  /** 块唯一标识 */
  id: string;
  /** 块类型分类 */
  kind: BlockKind;
  /** 对应的 DOM 元素 */
  element: HTMLElement;
  /** 提取并规范化后的纯文本内容 */
  text: string;
  /** 所属宿主 iframe（若处于 iframe 内部） */
  hostIframe?: HTMLIFrameElement | null;
  /** 所属消息 mesid 序号（若可解析） */
  messageIndex?: number;
}

const IGNORED_TAGS = new Set(['HEAD', 'TITLE', 'SCRIPT', 'STYLE', 'BUTTON']);

/**
 * 结构化文本提取管道结果
 */
export interface ExtractedBlockContext {
  /** 焦点块之前的同消息历史块 */
  historyBlocks: BlockRef[];
  /** 焦点块（若未精准匹配则回退为目标元素自身构成的块） */
  focusBlock: BlockRef;
  /** 当前消息内的全部块 */
  allBlocks: BlockRef[];
}

/**
 * 从消息容器中抽取所有结构化的文本块（支持顶层与同源 iframe 内嵌多气泡）
 * 严格按照 DOM / 视口线性顺序排列
 * @param mesElement 消息 DOM 容器（.mes_text 或 [mesid]）
 * @returns 规范化的 BlockRef 数组
 */
export function extractMessageBlocks(mesElement: HTMLElement): BlockRef[] {
  const host = mesElement.classList.contains('mes_text')
    ? mesElement
    : (mesElement.querySelector<HTMLElement>('.mes_text') ?? mesElement);

  const mesIdStr = mesElement.getAttribute('mesid') ?? host.closest('[mesid]')?.getAttribute('mesid');
  const messageIndex = mesIdStr ? parseInt(mesIdStr, 10) : undefined;

  const blocks: BlockRef[] = [];
  let blockSeq = 0;

  // 递归/遍历容器内的直接子节点与同源 iframe
  function traverse(container: HTMLElement, currentIframe: HTMLIFrameElement | null = null): void {
    const children = Array.from(container.children).filter(isHTMLElementNode);
    for (const child of children) {
      if (IGNORED_TAGS.has(child.tagName) || hasIgnoredClass(child)) {
        continue;
      }

      if (isIframeElementNode(child)) {
        const doc = tryAccessIframeDocument(child);
        if (doc?.body) {
          // 遍历 iframe 内部的子元素
          traverseIframeBody(doc.body, child);
        }
        continue;
      }

      // 如果显式声明了可选标记
      if (child.hasAttribute('data-cv-selectable')) {
        const text = extractFrontendText(child);
        if (text) {
          blocks.push({
            id: `mes-${messageIndex ?? 'x'}-block-${blockSeq++}`,
            kind: 'custom-selectable',
            element: child,
            text,
            hostIframe: currentIframe,
            messageIndex,
          });
        }
        continue;
      }

      // 如果是普通段落 <p>
      if (child.tagName === 'P') {
        const text = extractCleanText(child);
        if (text && !isSourceMarkupText(text)) {
          blocks.push({
            id: `mes-${messageIndex ?? 'x'}-block-${blockSeq++}`,
            kind: 'classic-p',
            element: child,
            text,
            hostIframe: currentIframe,
            messageIndex,
          });
        }
        continue;
      }

      // 如果是内联前端气泡（顶层文档非 iframe 场景）
      if (isFrontendBubbleElement(child)) {
        const text = extractFrontendText(child);
        if (text && !isSourceMarkupText(text)) {
          blocks.push({
            id: `mes-${messageIndex ?? 'x'}-block-${blockSeq++}`,
            kind: 'frontend-bubble',
            element: child,
            text,
            hostIframe: currentIframe,
            messageIndex,
          });
        }
        continue;
      }

      // 若包含更深层子节点，继续向下遍历
      if (child.children.length > 0) {
        traverse(child, currentIframe);
      } else {
        // 叶子文本块
        const text = extractCleanText(child);
        if (text && !isSourceMarkupText(text)) {
          blocks.push({
            id: `mes-${messageIndex ?? 'x'}-block-${blockSeq++}`,
            kind: 'classic-p',
            element: child,
            text,
            hostIframe: currentIframe,
            messageIndex,
          });
        }
      }
    }
  }

  function traverseIframeBody(body: HTMLElement, iframe: HTMLIFrameElement): void {
    // 优先查找显式标记或具有气泡特征的元素
    const explicitSelectables = Array.from(
      body.querySelectorAll<HTMLElement>('[data-cv-selectable]'),
    ).filter(isHTMLElementNode);

    if (explicitSelectables.length > 0) {
      for (const el of explicitSelectables) {
        const text = extractFrontendText(el);
        if (text) {
          blocks.push({
            id: `mes-${messageIndex ?? 'x'}-iframe-${blockSeq++}`,
            kind: 'custom-selectable',
            element: el,
            text,
            hostIframe: iframe,
            messageIndex,
          });
        }
      }
      return;
    }

    // 查找具有 bubble 特征的子节点
    const candidates = Array.from(
      body.querySelectorAll<HTMLElement>('.bubble, .message-bubble, .chat-bubble, div[class*=\"bubble\"], div[class*=\"message\"]'),
    ).filter(isHTMLElementNode);

    // 过滤出叶子气泡容器
    const leafBubbles = candidates.filter(
      c => !candidates.some(other => other !== c && c.contains(other)),
    );

    if (leafBubbles.length > 0) {
      for (const bubble of leafBubbles) {
        const text = extractFrontendText(bubble);
        if (text && !isSourceMarkupText(text)) {
          blocks.push({
            id: `mes-${messageIndex ?? 'x'}-iframe-${blockSeq++}`,
            kind: 'frontend-bubble',
            element: bubble,
            text,
            hostIframe: iframe,
            messageIndex,
          });
        }
      }
      return;
    }

    // 降级扫描 iframe 内的所有 <p> 或顶层块
    const pElements = Array.from(body.querySelectorAll<HTMLElement>('p')).filter(isHTMLElementNode);
    if (pElements.length > 0) {
      for (const p of pElements) {
        const text = extractCleanText(p);
        if (text && !isSourceMarkupText(text)) {
          blocks.push({
            id: `mes-${messageIndex ?? 'x'}-iframe-${blockSeq++}`,
            kind: 'classic-p',
            element: p,
            text,
            hostIframe: iframe,
            messageIndex,
          });
        }
      }
      return;
    }

    // 兜底整个 body
    const bodyText = extractFrontendText(body);
    if (bodyText && !isSourceMarkupText(bodyText)) {
      blocks.push({
        id: `mes-${messageIndex ?? 'x'}-iframe-${blockSeq++}`,
        kind: 'frontend-bubble',
        element: body,
        text: bodyText,
        hostIframe: iframe,
        messageIndex,
      });
    }
  }

  traverse(host);
  return blocks;
}

/**
 * 抽取从消息开头截断至目标焦点的结构化块上下文
 * 保证严格排除焦点块之后的任何文本
 * @param target 目标点击/焦点元素
 * @returns 包含历史块、焦点块与全量块的上下文
 */
export function extractBlocksUntil(target: HTMLElement): ExtractedBlockContext {
  const hostIframe = getHostIframe(target);
  const anchorNode = hostIframe ?? target;
  const mesBlock = anchorNode.closest<HTMLElement>('.mes_text, [mesid]');

  if (!mesBlock) {
    const focusBlock: BlockRef = {
      id: 'fallback-0',
      kind: 'classic-p',
      element: target,
      text: extractFrontendText(target) || (target.textContent?.trim() ?? ''),
      hostIframe,
    };
    return {
      historyBlocks: [],
      focusBlock,
      allBlocks: [focusBlock],
    };
  }

  const allBlocks = extractMessageBlocks(mesBlock);
  if (allBlocks.length === 0) {
    const focusBlock: BlockRef = {
      id: 'fallback-0',
      kind: 'classic-p',
      element: target,
      text: extractFrontendText(target) || (target.textContent?.trim() ?? ''),
      hostIframe,
    };
    return {
      historyBlocks: [],
      focusBlock,
      allBlocks: [focusBlock],
    };
  }

  // 查找 target 对应的块
  let targetIndex = allBlocks.findIndex(
    b => b.element === target || b.element.contains(target) || target.contains(b.element),
  );

  // 如果 target 在 iframe 内且未精准匹配到 element，匹配其 hostIframe
  if (targetIndex < 0 && hostIframe) {
    targetIndex = allBlocks.findIndex(b => b.hostIframe === hostIframe);
  }

  if (targetIndex < 0) {
    // 未能在已有块列表中索引到，回退为最后一个块或目标元素
    const focusBlock: BlockRef = {
      id: 'fallback-focus',
      kind: 'frontend-bubble',
      element: target,
      text: extractFrontendText(target) || (target.textContent?.trim() ?? ''),
      hostIframe,
    };
    return {
      historyBlocks: allBlocks,
      focusBlock,
      allBlocks: [...allBlocks, focusBlock],
    };
  }

  const historyBlocks = allBlocks.slice(0, targetIndex);
  const focusBlock = allBlocks[targetIndex]!;

  return {
    historyBlocks,
    focusBlock,
    allBlocks,
  };
}

/**
 * 判断元素是否为前端气泡（CSS 类或结构特征）
 */
function isFrontendBubbleElement(element: HTMLElement): boolean {
  if (element.hasAttribute('data-cv-selectable')) return true;
  if (element.matches('div, section, article') && element.className && element.textContent?.trim()) {
    const bubbleRoot = resolveFrontendBubbleRoot(element);
    return bubbleRoot === element;
  }
  return false;
}

/**
 * 提取普通文本块纯净文本（保留换行）
 */
function extractCleanText(element: HTMLElement): string {
  return extractFrontendText(element);
}

/**
 * 判断元素是否包含应忽略的类名（如头像、状态栏、操作菜单等）
 */
function hasIgnoredClass(element: HTMLElement): boolean {
  const ignoredClasses = [
    'avatar',
    'cv-inline',
    'cv-render',
    'menu',
    'toolbar',
    'controls',
    'timestamp',
    'badge',
  ];
  return ignoredClasses.some(cls => element.classList.contains(cls));
}

/**
 * 过滤源标记或纯空白
 */
function isSourceMarkupText(text: string): boolean {
  return !text.trim();
}

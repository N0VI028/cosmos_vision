/**
 * 前端卡段落定位服务
 * 使用浏览器原生 Caret 与 Selection.modify API 判定点击所在的视觉段落，并映射回 DOM 元素
 */

export interface FrontendCaretDeps {
  caretFromPoint?: (doc: Document, x: number, y: number) => { node: Node; offset: number } | null;
  modify?: (sel: Selection, action: string, direction: string, granularity: string) => boolean;
  hasRects?: (range: Range) => boolean;
}

interface CaretTarget {
  node: Node;
  offset: number;
}

/**
 * 检查 Range 是否包含非空布局矩形
 */
function checkRangeRects(range: Range, deps?: FrontendCaretDeps): boolean {
  if (deps?.hasRects) return deps.hasRects(range);
  return range.getClientRects().length > 0;
}

/**
 * 解析点击坐标处的文本插入点
 */
function resolveCaretTarget(
  doc: Document,
  x: number,
  y: number,
  deps?: FrontendCaretDeps,
): CaretTarget | null {
  if (deps?.caretFromPoint) {
    const custom = deps.caretFromPoint(doc, x, y);
    return custom && custom.node.nodeType === Node.TEXT_NODE ? custom : null;
  }
  const anyDoc = doc as any;
  if (typeof anyDoc.caretPositionFromPoint === 'function') {
    const pos = anyDoc.caretPositionFromPoint(x, y);
    if (!pos?.offsetNode || pos.offsetNode.nodeType !== Node.TEXT_NODE) return null;
    return { node: pos.offsetNode, offset: pos.offset };
  }
  if (typeof anyDoc.caretRangeFromPoint === 'function') {
    const range = anyDoc.caretRangeFromPoint(x, y);
    if (!range?.startContainer || range.startContainer.nodeType !== Node.TEXT_NODE) return null;
    return { node: range.startContainer, offset: range.startOffset };
  }
  return null;
}

/**
 * 构造包含目标字符的探针 Range
 */
function tryCharRange(
  doc: Document,
  node: Node,
  start: number,
  end: number,
  deps?: FrontendCaretDeps,
): Range | null {
  const len = node.textContent?.length ?? 0;
  if (start < 0 || end > len || start >= end) return null;
  const range = doc.createRange();
  range.setStart(node, start);
  range.setEnd(node, end);
  return checkRangeRects(range, deps) ? range : null;
}

/**
 * 校验并构造可见字符 seed Range
 */
function createSeedRange(doc: Document, target: CaretTarget, deps?: FrontendCaretDeps): Range | null {
  const { node, offset } = target;
  const primaryStart = offset > 0 ? offset - 1 : offset;
  const primaryEnd = primaryStart + 1;
  const first = tryCharRange(doc, node, primaryStart, primaryEnd, deps);
  if (first) return first;

  const altStart = offset > 0 ? offset : -1;
  const altEnd = altStart + 1;
  return tryCharRange(doc, node, altStart, altEnd, deps);
}

/**
 * 在选区上执行边界移动
 */
function performModify(
  sel: Selection,
  direction: 'backward' | 'forward',
  granularity: string,
  deps?: FrontendCaretDeps,
): boolean {
  if (deps?.modify) {
    return deps.modify(sel, 'move', direction, granularity);
  }
  const anySel = sel as any;
  if (typeof anySel.modify === 'function') {
    anySel.modify('move', direction, granularity);
    return true;
  }
  return false;
}

/**
 * 将探针移动到段落/行边界并读取端点
 */
function probeBoundary(
  sel: Selection,
  seedRange: Range,
  direction: 'backward' | 'forward',
  granularity: string,
  deps?: FrontendCaretDeps,
): CaretTarget | null {
  sel.removeAllRanges();
  sel.addRange(seedRange.cloneRange());
  const ok = performModify(sel, direction, granularity, deps);
  if (!ok || !sel.anchorNode) return null;
  return { node: sel.anchorNode, offset: sel.anchorOffset };
}

/**
 * 验证扩段结果是否合法有效
 */
function validateExpandedRange(range: Range, seedRange: Range, deps?: FrontendCaretDeps): boolean {
  const text = range.toString();
  if (!text.trim() || text.length > 50000) return false;
  const startOk = range.compareBoundaryPoints(Range.START_TO_START, seedRange) <= 0;
  const endOk = range.compareBoundaryPoints(Range.END_TO_END, seedRange) >= 0;
  if (!startOk || !endOk) return false;
  return checkRangeRects(range, deps);
}

/**
 * 获取节点所属的最近 DOM 元素
 */
function toElement(node: Node): HTMLElement | null {
  return node.nodeType === Node.ELEMENT_NODE ? (node as HTMLElement) : node.parentElement;
}

/**
 * 计算两个节点的最低公共祖先元素
 */
function findLcaElement(node1: Node, node2: Node): HTMLElement | null {
  const el1 = toElement(node1);
  const el2 = toElement(node2);
  if (!el1 || !el2) return null;

  const ancestors = new Set<HTMLElement>();
  let curr: HTMLElement | null = el1;
  while (curr) {
    ancestors.add(curr);
    curr = curr.parentElement;
  }
  curr = el2;
  while (curr) {
    if (ancestors.has(curr)) return curr;
    curr = curr.parentElement;
  }
  return null;
}

/**
 * 判定 LCA 是否退化为楼层级或文档级容器（粒度过大，应回退）
 */
function isDegradedLca(lca: HTMLElement, doc: Document): boolean {
  if (lca === doc.body || lca === doc.documentElement) return true;
  return lca.classList.contains('mes_text') || lca.hasAttribute('mesid');
}

/**
 * 使用指定粒度扩展选区并映射回非退化的 DOM 元素
 */
function expandAndMap(
  doc: Document,
  sel: Selection,
  seedRange: Range,
  granularity: string,
  deps?: FrontendCaretDeps,
): HTMLElement | null {
  const savedRanges: Range[] = [];
  for (let i = 0; i < sel.rangeCount; i++) {
    savedRanges.push(sel.getRangeAt(i).cloneRange());
  }

  try {
    const start = probeBoundary(sel, seedRange, 'backward', granularity, deps);
    if (!start) return null;

    const end = probeBoundary(sel, seedRange, 'forward', granularity, deps);
    if (!end) return null;

    const range = doc.createRange();
    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset);

    if (!validateExpandedRange(range, seedRange, deps)) return null;
    const lca = findLcaElement(range.startContainer, range.endContainer);
    if (!lca || isDegradedLca(lca, doc)) return null;

    return lca;
  } catch {
    return null;
  } finally {
    sel.removeAllRanges();
    for (const saved of savedRanges) {
      sel.addRange(saved);
    }
  }
}

/**
 * 给定点击坐标，定位被点中的前端卡视觉段落元素
 * @param doc 点击所在的文档对象
 * @param x 视口水平坐标
 * @param y 视口垂直坐标
 * @param deps 可选的依赖注入项（供测试环境注入）
 * @returns 命中的段落 DOM 元素，若未命中或退化则返回 null
 */
export function locateFrontendParagraphFromPoint(
  doc: Document,
  x: number,
  y: number,
  deps?: FrontendCaretDeps,
): HTMLElement | null {
  const caret = resolveCaretTarget(doc, x, y, deps);
  if (!caret) return null;

  const seedRange = createSeedRange(doc, caret, deps);
  if (!seedRange) return null;

  const sel = doc.defaultView?.getSelection();
  if (!sel) return null;

  const paragraphResult = expandAndMap(doc, sel, seedRange, 'paragraphboundary', deps);
  if (paragraphResult) return paragraphResult;

  return expandAndMap(doc, sel, seedRange, 'lineboundary', deps);
}

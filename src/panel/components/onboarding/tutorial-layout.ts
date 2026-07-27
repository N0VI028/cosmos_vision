export interface TutorialRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface TutorialSize {
  width: number;
  height: number;
}

export interface TutorialPoint {
  top: number;
  left: number;
}

/** 洞口相对完整目标的四边裁剪状态 */
export interface TutorialEdges {
  top: boolean;
  right: boolean;
  bottom: boolean;
  left: boolean;
}

/** 洞口四角半径（px），被裁剪边相邻的角为 0 */
export interface CornerRadii {
  tl: number;
  tr: number;
  br: number;
  bl: number;
}

const VIEWPORT_MARGIN = 16;
const TARGET_GAP = 20;
const NARROW_VIEWPORT = 640;
/** 判定边是否被裁剪时允许的像素容差 */
const EDGE_CLIP_TOLERANCE = 1;

/**
 * 读取当前视口尺寸，优先 visualViewport 以适配移动端地址栏缩放
 * @returns 视口宽高
 */
export function readTutorialViewport(): TutorialSize {
  const visual = window.visualViewport;
  return {
    width: Math.round(visual?.width ?? window.innerWidth),
    height: Math.round(visual?.height ?? window.innerHeight),
  };
}

/**
 * 读取元素相对布局视口的包围盒，直接用于 position:fixed
 * @param element 目标元素
 * @returns 四舍五入后的矩形，不可见时返回 null
 */
export function readElementRect(element: HTMLElement): TutorialRect | null {
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  return {
    top: Math.round(rect.top),
    left: Math.round(rect.left),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  };
}

/**
 * 读取目标在视口与溢出裁剪祖先中的可见矩形
 * @param element 目标元素
 * @param viewport 当前视口尺寸
 * @returns 可见交集矩形；完全不可见时返回 null
 */
export function readVisibleElementRect(element: HTMLElement, viewport: TutorialSize): TutorialRect | null {
  const raw = readElementRect(element);
  if (!raw) return null;
  let visible: TutorialRect = {
    top: 0,
    left: 0,
    width: viewport.width,
    height: viewport.height,
  };
  for (const ancestor of collectClipAncestors(element)) {
    const clipped = intersectRects(visible, readClipAncestorRect(ancestor, viewport));
    if (!clipped) return null;
    visible = clipped;
  }
  return intersectRects(raw, visible);
}

/**
 * 计算受视口约束的高亮矩形（与目标等大，不外扩）
 * @param target 原始目标矩形
 * @param viewport 视口尺寸
 * @returns 裁剪到视口内的矩形
 */
export function calculateHighlightRect(target: TutorialRect, viewport: TutorialSize): TutorialRect {
  const top = clamp(target.top, 0, viewport.height);
  const left = clamp(target.left, 0, viewport.width);
  const right = clamp(target.left + target.width, 0, viewport.width);
  const bottom = clamp(target.top + target.height, 0, viewport.height);
  return {
    top,
    left,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  };
}

/**
 * 读取目标容器的圆角，供描边与遮罩洞口共用
 * @param element 目标元素
 * @returns 计算后的 border-radius 字符串
 */
export function readElementBorderRadius(element: HTMLElement): string {
  const radius = window.getComputedStyle(element).borderRadius.trim();
  return radius || '0px';
}

/**
 * 生成 evenodd 遮罩路径：外圈全屏、内圈按目标圆角挖洞
 * @param hole 镂空矩形
 * @param viewport 视口尺寸
 * @param radius 目标圆角（取首个 px 值）
 * @param full 完整目标矩形（用于判定裁剪边）
 * @returns SVG path 的 d 属性
 */
export function calculateMaskHolePath(
  hole: TutorialRect,
  viewport: TutorialSize,
  radius: string,
  full: TutorialRect | null,
): string {
  const radii = calculateHoleCornerRadii(hole, full, radius);
  const outer = `M0 0H${viewport.width}V${viewport.height}H0Z`;
  return `${outer}${roundedRectPath(hole, radii)}`;
}

/**
 * 计算洞口四角半径：被裁剪边相邻的角归零，供遮罩路径与描边框共用
 * @param hole 可见洞口矩形
 * @param full 完整目标矩形
 * @param radius 目标圆角（取首个 px 值）
 * @returns 四角半径（px）
 */
export function calculateHoleCornerRadii(hole: TutorialRect, full: TutorialRect | null, radius: string): CornerRadii {
  const clipped = detectClippedEdges(hole, full);
  return adjustCornerRadii(parseRadiusPx(radius), hole, clipped);
}

/** 解析 border-radius 首个 px 数值 */
function parseRadiusPx(radius: string): number {
  const value = Number.parseFloat(radius);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * 检测洞口四边相对完整目标是否被裁剪
 * @param hole 可见洞口矩形
 * @param full 完整目标矩形
 * @returns 四边裁剪状态；完整目标不存在时全部返回 false
 */
function detectClippedEdges(hole: TutorialRect, full: TutorialRect | null): TutorialEdges {
  if (!full) return { top: false, right: false, bottom: false, left: false };
  return {
    top: hole.top > full.top + EDGE_CLIP_TOLERANCE,
    right: hole.left + hole.width < full.left + full.width - EDGE_CLIP_TOLERANCE,
    bottom: hole.top + hole.height < full.top + full.height - EDGE_CLIP_TOLERANCE,
    left: hole.left > full.left + EDGE_CLIP_TOLERANCE,
  };
}

/**
 * 根据裁剪边调整四角半径：被裁剪边相邻的角设为 0
 * @param baseRadius 原始圆角半径
 * @param hole 洞口矩形
 * @param clipped 四边裁剪状态
 * @returns 四角半径（px）
 */
function adjustCornerRadii(baseRadius: number, hole: TutorialRect, clipped: TutorialEdges): CornerRadii {
  const r = clampRadius(baseRadius, hole);
  return {
    tl: clipped.top || clipped.left ? 0 : r,
    tr: clipped.top || clipped.right ? 0 : r,
    br: clipped.bottom || clipped.right ? 0 : r,
    bl: clipped.bottom || clipped.left ? 0 : r,
  };
}

/** 圆角不得超过洞口短边的一半 */
function clampRadius(radius: number, hole: TutorialRect): number {
  return Math.min(radius, hole.width / 2, hole.height / 2);
}

/** 生成顺时针圆角矩形子路径，与外圈构成 evenodd 挖洞 */
function roundedRectPath(rect: TutorialRect, radii: CornerRadii): string {
  const { top, left, width, height } = rect;
  const right = left + width;
  const bottom = top + height;
  const { tl, tr, br, bl } = radii;

  // 全直角
  if (tl + tr + br + bl === 0) {
    return `M${left} ${top}H${right}V${bottom}H${left}Z`;
  }

  // 混合圆角：每个角独立处理
  let path = `M${left + tl} ${top}`;
  // 上边 + 右上角
  path += `H${right - tr}`;
  if (tr > 0) path += `A${tr} ${tr} 0 0 1 ${right} ${top + tr}`;
  // 右边 + 右下角
  path += `V${bottom - br}`;
  if (br > 0) path += `A${br} ${br} 0 0 1 ${right - br} ${bottom}`;
  // 下边 + 左下角
  path += `H${left + bl}`;
  if (bl > 0) path += `A${bl} ${bl} 0 0 1 ${left} ${bottom - bl}`;
  // 左边 + 左上角
  path += `V${top + tl}`;
  if (tl > 0) path += `A${tl} ${tl} 0 0 1 ${left + tl} ${top}`;
  return path + 'Z';
}

/**
 * 求两个矩形的交集
 * @param a 矩形 A
 * @param b 矩形 B
 * @returns 交集；无重叠时返回 null
 */
export function intersectRects(a: TutorialRect, b: TutorialRect): TutorialRect | null {
  const top = Math.max(a.top, b.top);
  const left = Math.max(a.left, b.left);
  const right = Math.min(a.left + a.width, b.left + b.width);
  const bottom = Math.min(a.top + a.height, b.top + b.height);
  if (right <= left || bottom <= top) return null;
  return { top, left, width: right - left, height: bottom - top };
}

/** 收集会裁剪子孙内容的祖先元素 */
function collectClipAncestors(element: HTMLElement): HTMLElement[] {
  const ancestors: HTMLElement[] = [];
  let current = element.parentElement;
  while (current && current !== document.documentElement) {
    if (isClipAncestor(current)) ancestors.push(current);
    current = current.parentElement;
  }
  return ancestors;
}

/** 判断元素是否通过 overflow 裁剪子孙 */
function isClipAncestor(element: HTMLElement): boolean {
  const style = window.getComputedStyle(element);
  return (
    style.overflow !== 'visible' ||
    style.overflowX !== 'visible' ||
    style.overflowY !== 'visible' ||
    style.contain.includes('paint') ||
    style.contain.includes('content') ||
    style.contain.includes('strict')
  );
}

/** 读取裁剪祖先在布局视口中的可见盒 */
function readClipAncestorRect(element: HTMLElement, viewport: TutorialSize): TutorialRect {
  const rect = element.getBoundingClientRect();
  return {
    top: clamp(Math.round(rect.top), 0, viewport.height),
    left: clamp(Math.round(rect.left), 0, viewport.width),
    width: Math.max(0, Math.min(Math.round(rect.right), viewport.width) - clamp(Math.round(rect.left), 0, viewport.width)),
    height: Math.max(
      0,
      Math.min(Math.round(rect.bottom), viewport.height) - clamp(Math.round(rect.top), 0, viewport.height),
    ),
  };
}

/**
 * 计算卡片围绕高亮目标的安全位置
 * @param target 高亮目标矩形
 * @param viewport 视口尺寸
 * @param card 卡片尺寸
 * @returns 视口内的卡片坐标
 */
export function calculateTutorialCardPosition(
  target: TutorialRect,
  viewport: TutorialSize,
  card: TutorialSize,
): TutorialPoint {
  if (viewport.width <= NARROW_VIEWPORT) {
    return calculateMobileTargetCardPosition(target, viewport, card);
  }
  const candidates = buildCandidates(target, card);
  const candidate = candidates.find(point => fitsViewport(point, viewport, card)) ?? candidates[0];
  return clampPoint(candidate, viewport, card);
}

/**
 * 计算无高亮目标时的居中位置
 * @param viewport 视口尺寸
 * @param card 卡片尺寸
 * @returns 居中且受视口约束的坐标
 */
export function calculateCenteredCardPosition(viewport: TutorialSize, card: TutorialSize): TutorialPoint {
  if (viewport.width <= NARROW_VIEWPORT) {
    return calculateMobileCardPosition(viewport, card);
  }
  return clampPoint(
    { top: (viewport.height - card.height) / 2, left: (viewport.width - card.width) / 2 },
    viewport,
    card,
  );
}

/** 窄屏无目标时将卡片固定在底部安全区 */
function calculateMobileCardPosition(viewport: TutorialSize, card: TutorialSize): TutorialPoint {
  return clampPoint(
    {
      top: viewport.height - card.height - VIEWPORT_MARGIN,
      left: (viewport.width - card.width) / 2,
    },
    viewport,
    card,
  );
}

/** 窄屏按目标位置选择遮挡更少的顶部或底部停靠点 */
function calculateMobileTargetCardPosition(
  target: TutorialRect,
  viewport: TutorialSize,
  card: TutorialSize,
): TutorialPoint {
  const bottom = calculateMobileCardPosition(viewport, card);
  const top = { top: VIEWPORT_MARGIN, left: bottom.left };
  const safeTarget = { top: target.top - TARGET_GAP, height: target.height + TARGET_GAP * 2 };
  return verticalOverlap(bottom, card, safeTarget) <= verticalOverlap(top, card, safeTarget) ? bottom : top;
}

/** 计算卡片与目标安全区的垂直重叠高度 */
function verticalOverlap(point: TutorialPoint, card: TutorialSize, target: Pick<TutorialRect, 'top' | 'height'>): number {
  const overlapTop = Math.max(point.top, target.top);
  const overlapBottom = Math.min(point.top + card.height, target.top + target.height);
  return Math.max(0, overlapBottom - overlapTop);
}

/** 构建右、左、下、上的候选位置 */
function buildCandidates(target: TutorialRect, card: TutorialSize): TutorialPoint[] {
  const centeredTop = target.top + (target.height - card.height) / 2;
  const centeredLeft = target.left + (target.width - card.width) / 2;
  return [
    { top: centeredTop, left: target.left + target.width + TARGET_GAP },
    { top: centeredTop, left: target.left - card.width - TARGET_GAP },
    { top: target.top + target.height + TARGET_GAP, left: centeredLeft },
    { top: target.top - card.height - TARGET_GAP, left: centeredLeft },
  ];
}

/** 判断候选位置能否完整放入视口 */
function fitsViewport(point: TutorialPoint, viewport: TutorialSize, card: TutorialSize): boolean {
  return (
    point.top >= VIEWPORT_MARGIN &&
    point.left >= VIEWPORT_MARGIN &&
    point.top + card.height <= viewport.height - VIEWPORT_MARGIN &&
    point.left + card.width <= viewport.width - VIEWPORT_MARGIN
  );
}

/** 把卡片坐标限制在视口安全区 */
function clampPoint(point: TutorialPoint, viewport: TutorialSize, card: TutorialSize): TutorialPoint {
  const maxTop = Math.max(VIEWPORT_MARGIN, viewport.height - card.height - VIEWPORT_MARGIN);
  const maxLeft = Math.max(VIEWPORT_MARGIN, viewport.width - card.width - VIEWPORT_MARGIN);
  return {
    top: clamp(point.top, VIEWPORT_MARGIN, maxTop),
    left: clamp(point.left, VIEWPORT_MARGIN, maxLeft),
  };
}

/** 把数值限制在闭区间内 */
function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

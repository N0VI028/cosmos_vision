import { useElementSize, useMediaQuery, useVirtualList } from '@vueuse/core';
import type { ComponentPublicInstance, ComputedRef, Ref } from 'vue';

/** 虚拟卡片网格行 */
export interface VirtualCardRow<T> {
  /** 行在完整行列表中的索引 */
  rowIndex: number;
  items: T[];
}

export interface VirtualCardGridOptions {
  /** 视口外缓冲行数 */
  overscan?: number;
  /** 未实测行估算行高使用的卡片文字区高度（rem） */
  estimatedTextBlockRem?: number;
}

export interface VirtualCardGrid<T> {
  /** 绑定到滚动容器：v-bind="grid.containerProps" */
  containerProps: ReturnType<typeof useVirtualList<VirtualCardRow<T>>>['containerProps'];
  /** 绑定到占位 wrapper：v-bind="grid.wrapperProps" */
  wrapperProps: ReturnType<typeof useVirtualList<VirtualCardRow<T>>>['wrapperProps'];
  /** 当前渲染的行（含视口与缓冲区） */
  visibleRows: ComputedRef<VirtualCardRow<T>[]>;
  /** 行模板 ref：`:ref="grid.rowRef(row.rowIndex)"`，每行绑定，用于逐行实测行高 */
  rowRef: (rowIndex: number) => (el: Element | ComponentPublicInstance | null) => void;
  /** 滚动到指定行 */
  scrollToRow: (rowIndex: number) => void;
}

/** 与面板 Tailwind 断点类 grid-cols-3 max-[56rem]:grid-cols-2 保持一致（移动端保持两列） */
const TWO_COLUMNS_MAX_REM = 56;
/** 与面板间距 token --cv-space-4xl 保持一致（行模板的列间距 gap-x 与行下边距 pb 同值） */
const ROW_GAP_EM = 0.9333;
const REM_FALLBACK_PX = 16;
const DEFAULT_TEXT_BLOCK_REM = 9;
const MIN_ROW_HEIGHT_PX = 120;

/**
 * 按视口宽度解析卡片网格列数（断点与面板 Tailwind 类一致；移动端保持两列）
 * @param widthPx 视口宽度（px）
 * @param remPx 每 rem 对应像素
 * @returns 列数：2 / 3
 */
export function resolveCardGridColumns(widthPx: number, remPx: number = REM_FALLBACK_PX): number {
  if (widthPx <= TWO_COLUMNS_MAX_REM * remPx) return 2;
  return 3;
}

/**
 * 把扁平列表按列数切成行
 * @param items 扁平列表
 * @param columns 列数（小于 1 时按 1 处理）
 * @returns 行列表（空输入返回空数组）
 */
export function chunkIntoRows<T>(items: readonly T[], columns: number): T[][] {
  const cols = Math.max(1, Math.trunc(columns));
  if (!items.length) return [];
  const rows: T[][] = [];
  for (let start = 0; start < items.length; start += cols) {
    rows.push(items.slice(start, start + cols));
  }
  return rows;
}

/**
 * 虚拟卡片网格：响应式列数 + 按行虚拟滚动 + 逐行实测行高
 *
 * 必须在 setup 顶层解构使用（模板才会自动解包 ref）：
 *   const { containerProps, wrapperProps, visibleRows, rowRef } = useVirtualCardGrid(() => items);
 *
 * 滚动容器与行结构约定（调用方模板）：
 *   <div v-bind="containerProps" class="max-h-…">
 *     <div v-bind="wrapperProps">
 *       <div v-for="row in visibleRows" :key="row.rowIndex" :ref="rowRef(row.rowIndex)"
 *            class="grid grid-cols-3 gap-x-(--cv-space-4xl) pb-(--cv-space-4xl) …">
 *         <卡片 v-for="item in row.items" />
 *       </div>
 *     </div>
 *   </div>
 *
 * 行高按行实测：卡片内可换行内容（如 tag 徽章折行）导致行高不均一，
 * 已渲染行用实测值、未渲染行用估算值，滚动过的区域数学精确不累计漂移。
 *
 * @param items 扁平卡片列表（响应式）
 * @param options 网格选项
 * @returns 虚拟网格句柄
 */
export function useVirtualCardGrid<T>(
  items: MaybeRefOrGetter<readonly T[]>,
  options: VirtualCardGridOptions = {},
): VirtualCardGrid<T> {
  const overscan = options.overscan ?? 2;
  const estimatedTextBlockRem = options.estimatedTextBlockRem ?? DEFAULT_TEXT_BLOCK_REM;

  const matchesTwoColumns = useMediaQuery(`(max-width: ${TWO_COLUMNS_MAX_REM}rem)`);
  const columns = computed(() => (matchesTwoColumns.value ? 2 : 3));

  const rows = computed(() => chunkIntoRows(toValue(items), columns.value));

  const { containerProps, wrapperProps, list, scrollTo } = useVirtualList(rows, {
    itemHeight: (index: number) => rowHeights.get(index) ?? estimatedRowHeight.value,
    overscan,
  });

  const containerRef = containerProps.ref as Ref<HTMLElement | null>;
  const { width: containerWidth } = useElementSize(containerRef);

  const estimatedRowHeight = computed(() => {
    const width = containerWidth.value;
    if (width <= 0) return MIN_ROW_HEIGHT_PX;
    const remPx = parseFloat(getComputedStyle(document.documentElement).fontSize) || REM_FALLBACK_PX;
    const container = containerRef.value;
    // 间距 token 为 em 基，按滚动容器字号换算；容器未知时退回根字号
    const fontPx = (container && parseFloat(getComputedStyle(container).fontSize)) || remPx;
    const gapPx = ROW_GAP_EM * fontPx;
    // 卡片为 aspect-square 图 + 固定文字区：行高 ≈ 卡片宽(扣除列间距) + 行下边距 + 文字区
    const cardWidth = (width - (columns.value - 1) * gapPx) / columns.value;
    return Math.max(MIN_ROW_HEIGHT_PX, cardWidth + gapPx + estimatedTextBlockRem * remPx);
  });

  // 逐行实测行高（rowIndex → 高度 px）；行卸载后保留实测值供后续滚动使用
  const rowHeights = reactive(new Map<number, number>());
  const rowEls = new Map<number, HTMLElement>();
  const rowRefCache = new Map<number, (el: Element | ComponentPublicInstance | null) => void>();
  const rowObserver = new ResizeObserver(entries => {
    for (const entry of entries) {
      const el = entry.target as HTMLElement;
      const height = el.getBoundingClientRect().height;
      if (height > 1) rowHeights.set(Number(el.dataset.rowIndex), height);
    }
  });
  onScopeDispose(() => rowObserver.disconnect());

  const visibleRows = computed<VirtualCardRow<T>[]>(() =>
    list.value.map(entry => ({ rowIndex: entry.index, items: entry.data })),
  );

  // 任一行实测高度更新后，可视窗口与总高度需要重算
  watch(rowHeights, () => {
    void nextTick(() => containerProps.onScroll());
  });

  /**
   * 生成行模板 ref：每行绑定实测（回调按索引缓存，引用稳定可避免渲染时反复解绑/重绑）
   * @param rowIndex 行索引
   * @returns 该行的 ref 回调
   */
  function rowRef(rowIndex: number) {
    let bound = rowRefCache.get(rowIndex);
    if (!bound) {
      bound = (el: Element | ComponentPublicInstance | null): void => {
        const prev = rowEls.get(rowIndex);
        if (prev) {
          rowObserver.unobserve(prev);
          rowEls.delete(rowIndex);
        }
        if (el instanceof HTMLElement) {
          el.dataset.rowIndex = String(rowIndex);
          rowEls.set(rowIndex, el);
          rowObserver.observe(el);
        }
      };
      rowRefCache.set(rowIndex, bound);
    }
    return bound;
  }

  return {
    containerProps,
    wrapperProps,
    visibleRows,
    rowRef,
    scrollToRow: scrollTo,
  };
}

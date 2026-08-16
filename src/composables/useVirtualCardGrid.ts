import { useElementSize, useMediaQuery, useResizeObserver, useVirtualList } from '@vueuse/core';
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
  /** 实测前估算行高使用的卡片文字区高度（rem） */
  estimatedTextBlockRem?: number;
}

export interface VirtualCardGrid<T> {
  /** 绑定到滚动容器：v-bind="grid.containerProps" */
  containerProps: ReturnType<typeof useVirtualList<VirtualCardRow<T>>>['containerProps'];
  /** 绑定到占位 wrapper：v-bind="grid.wrapperProps" */
  wrapperProps: ReturnType<typeof useVirtualList<VirtualCardRow<T>>>['wrapperProps'];
  /** 当前渲染的行（含视口与缓冲区） */
  visibleRows: ComputedRef<VirtualCardRow<T>[]>;
  /** 模板行元素 ref：`:ref="grid.rowRef(row.rowIndex)"`，用于实测行高 */
  rowRef: (rowIndex: number) => ((el: Element | ComponentPublicInstance | null) => void) | undefined;
  /** 滚动到指定行 */
  scrollToRow: (rowIndex: number) => void;
}

/** 与面板 Tailwind 断点类 grid-cols-3 max-[56rem]:grid-cols-2 保持一致（移动端保持两列） */
const TWO_COLUMNS_MAX_REM = 56;
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
 * 虚拟卡片网格：响应式列数 + 按行虚拟滚动 + 行高实测
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
  const measuredRowHeight = ref(0);

  const { containerProps, wrapperProps, list, scrollTo } = useVirtualList(rows, {
    itemHeight: () => effectiveRowHeight.value,
    overscan,
  });

  const { width: containerWidth } = useElementSize(containerProps.ref as Ref<HTMLElement | null>);

  const effectiveRowHeight = computed(() => {
    if (measuredRowHeight.value > 1) return measuredRowHeight.value;
    const width = containerWidth.value;
    if (width <= 0) return MIN_ROW_HEIGHT_PX;
    const remPx = parseFloat(getComputedStyle(document.documentElement).fontSize) || REM_FALLBACK_PX;
    // 卡片为 aspect-square 图 + 固定文字区，估算行高 = 卡片宽 + 文字区高度
    return Math.max(MIN_ROW_HEIGHT_PX, width / columns.value + estimatedTextBlockRem * remPx);
  });

  const rowEl = shallowRef<HTMLElement | null>(null);
  useResizeObserver(rowEl, () => {
    const el = rowEl.value;
    if (!el) return;
    const height = el.getBoundingClientRect().height;
    if (height > 1) measuredRowHeight.value = height;
  });

  const visibleRows = computed<VirtualCardRow<T>[]>(() =>
    list.value.map(entry => ({ rowIndex: entry.index, items: entry.data })),
  );

  // 行高从估算切换到实测后，容量计算需要重算一次
  watch(effectiveRowHeight, () => {
    void nextTick(() => containerProps.onScroll());
  });

  /**
   * 记录首个渲染行元素（用于实测行高）
   * @param el 行元素或组件实例
   */
  function setRowEl(el: Element | ComponentPublicInstance | null): void {
    rowEl.value = el instanceof HTMLElement ? el : null;
  }

  /**
   * 生成行模板 ref：仅首个渲染行需要绑定实测
   * @param rowIndex 行索引
   * @returns ref 回调或 undefined
   */
  function rowRef(rowIndex: number) {
    return rowIndex === (list.value[0]?.index ?? -1) ? setRowEl : undefined;
  }

  return {
    containerProps,
    wrapperProps,
    visibleRows,
    rowRef,
    scrollToRow: scrollTo,
  };
}

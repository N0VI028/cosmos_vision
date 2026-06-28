import type { InlineGalleryItem } from '@/composables/inlineImageGalleryView';
import type { ComponentPublicInstance, PropType, VNode, VNodeRef } from 'vue';
import { defineComponent, h, nextTick, onMounted, watch } from 'vue';

export interface InlineGalleryThumbnailStripProps {
  items: InlineGalleryItem[];
  activeItemId: string;
  selectItem: (item: InlineGalleryItem) => void;
}

export const InlineGalleryThumbnailStripView = defineComponent({
  name: 'InlineGalleryThumbnailStripView',
  props: {
    items: { type: Array as PropType<InlineGalleryItem[]>, required: true },
    activeItemId: { type: String, required: true },
    selectItem: { type: Function as PropType<(item: InlineGalleryItem) => void>, required: true },
  },
  setup(props) {
    const resolvedProps = props as InlineGalleryThumbnailStripProps;
    const thumbnailRefs = new Map<string, HTMLButtonElement>();
    onMounted(() => queueActiveThumbnailSync(resolvedProps, thumbnailRefs));
    watch(
      () => resolvedProps.activeItemId,
      () => queueActiveThumbnailSync(resolvedProps, thumbnailRefs),
    );
    watch(
      () => resolvedProps.items,
      () => queueActiveThumbnailSync(resolvedProps, thumbnailRefs),
    );
    return () => (resolvedProps.items.length > 1 ? renderThumbnailStrip(resolvedProps, thumbnailRefs) : h('div'));
  },
});

/**
 * 排队同步当前焦点缩略图位置
 * @param props 组件参数
 * @param thumbnailRefs 缩略图按钮引用
 */
function queueActiveThumbnailSync(
  props: Readonly<InlineGalleryThumbnailStripProps>,
  thumbnailRefs: Map<string, HTMLButtonElement>,
): void {
  void nextTick(() => scrollActiveThumbnail(props.activeItemId, thumbnailRefs));
}

/**
 * 让当前焦点缩略图滚动到可见区域
 * @param activeItemId 当前焦点图片 ID
 * @param thumbnailRefs 缩略图按钮引用
 */
function scrollActiveThumbnail(activeItemId: string, thumbnailRefs: Map<string, HTMLButtonElement>): void {
  thumbnailRefs.get(activeItemId)?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
}

/**
 * 渲染缩略图条
 * @param props 组件参数
 * @param thumbnailRefs 缩略图按钮引用
 * @returns 缩略图条 VNode
 */
function renderThumbnailStrip(
  props: Readonly<InlineGalleryThumbnailStripProps>,
  thumbnailRefs: Map<string, HTMLButtonElement>,
): VNode {
  return h('div', { class: 'cv-inline-gallery-strip', role: 'group', 'aria-label': '图片缩略图' }, [
    renderThumbnailNavButton(props, -1),
    h('div', { class: 'cv-inline-gallery-strip-viewport' }, [renderThumbnailList(props, thumbnailRefs)]),
    renderThumbnailNavButton(props, 1),
  ]);
}

/**
 * 渲染缩略图列表
 * @param props 组件参数
 * @param thumbnailRefs 缩略图按钮引用
 * @returns 缩略图列表 VNode
 */
function renderThumbnailList(
  props: Readonly<InlineGalleryThumbnailStripProps>,
  thumbnailRefs: Map<string, HTMLButtonElement>,
): VNode {
  return h(
    'div',
    { class: 'cv-inline-gallery-strip-list' },
    props.items.map((item, index) =>
      renderThumbnailItem(item, index, props.activeItemId, props.selectItem, thumbnailRefs),
    ),
  );
}

/**
 * 渲染单个缩略图按钮
 * @param item 当前图片项
 * @param index 当前索引
 * @param activeItemId 当前焦点图片 ID
 * @param selectItem 切换焦点图片
 * @param thumbnailRefs 缩略图按钮引用
 * @returns 缩略图按钮 VNode
 */
function renderThumbnailItem(
  item: InlineGalleryItem,
  index: number,
  activeItemId: string,
  selectItem: (item: InlineGalleryItem) => void,
  thumbnailRefs: Map<string, HTMLButtonElement>,
): VNode {
  const active = item.id === activeItemId;
  return h(
    'button',
    {
      ref: createThumbnailRef(thumbnailRefs, item.id),
      type: 'button',
      class: 'cv-prime-galleria-thumbnail-item cv-inline-gallery-strip-item',
      'data-p-active': active ? 'true' : 'false',
      'aria-label': `切换到第 ${index + 1} 张图片`,
      'aria-pressed': active,
      onClick: () => selectItem(item),
    },
    [h('img', { class: 'cv-inline-favorite-thumb', src: item.objectUrl, alt: '', draggable: false })],
  );
}

/**
 * 创建缩略图按钮引用回调
 * @param thumbnailRefs 缩略图按钮引用
 * @param itemId 图片 ID
 * @returns Vue DOM 引用回调
 */
function createThumbnailRef(thumbnailRefs: Map<string, HTMLButtonElement>, itemId: string): VNodeRef {
  return (ref: Element | ComponentPublicInstance | null) => bindThumbnailRef(thumbnailRefs, itemId, ref);
}

/**
 * 绑定缩略图按钮引用
 * @param thumbnailRefs 缩略图按钮引用
 * @param itemId 图片 ID
 * @param element DOM 元素
 */
function bindThumbnailRef(
  thumbnailRefs: Map<string, HTMLButtonElement>,
  itemId: string,
  element: Element | ComponentPublicInstance | null,
): void {
  if (element instanceof HTMLButtonElement) thumbnailRefs.set(itemId, element);
  else thumbnailRefs.delete(itemId);
}

/**
 * 渲染缩略图导航按钮
 * @param props 组件参数
 * @param step 切换步进
 * @returns 导航按钮 VNode
 */
function renderThumbnailNavButton(props: Readonly<InlineGalleryThumbnailStripProps>, step: -1 | 1): VNode {
  const previous = step < 0;
  return h(
    'button',
    {
      type: 'button',
      class: 'cv-prime-galleria-nav-button cv-inline-gallery-strip-nav',
      disabled: isThumbnailNavDisabled(props, step),
      'aria-label': previous ? '上一张图片' : '下一张图片',
      onClick: () => selectAdjacentThumbnail(props, step),
    },
    [h('i', { class: ['cv-prime-galleria-nav-icon fa-solid', previous ? 'fa-chevron-left' : 'fa-chevron-right'] })],
  );
}

/**
 * 判断缩略图导航按钮是否应禁用
 * @param props 组件参数
 * @param step 切换步进
 * @returns 是否禁用
 */
function isThumbnailNavDisabled(props: Readonly<InlineGalleryThumbnailStripProps>, step: -1 | 1): boolean {
  const activeIndex = findActiveThumbnailIndex(props.items, props.activeItemId);
  return step < 0 ? activeIndex <= 0 : activeIndex >= props.items.length - 1;
}

/**
 * 切换相邻缩略图
 * @param props 组件参数
 * @param step 切换步进
 */
function selectAdjacentThumbnail(props: Readonly<InlineGalleryThumbnailStripProps>, step: -1 | 1): void {
  const activeIndex = findActiveThumbnailIndex(props.items, props.activeItemId);
  const target = props.items[activeIndex + step];
  if (target) props.selectItem(target);
}

/**
 * 读取当前焦点缩略图索引
 * @param items 缩略图列表
 * @param activeItemId 当前焦点图片 ID
 * @returns 当前索引
 */
function findActiveThumbnailIndex(items: InlineGalleryItem[], activeItemId: string): number {
  const index = items.findIndex(item => item.id === activeItemId);
  return index >= 0 ? index : 0;
}

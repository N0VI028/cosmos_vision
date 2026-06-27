import { handleInlineImageClick, type InlinePromptSnapshot } from '@/composables/inlineImageLightbox';
import {
  buildInlineActionButtonProps,
  buildInlineActionHostClass,
  type InlineActionButtonSpec,
} from '@/composables/inlineImageDom';
import Button from 'primevue/button';
import Galleria from 'primevue/galleria';
import type { GalleriaResponsiveOptions } from 'primevue/galleria';
import type { PropType, VNode } from 'vue';
import { defineComponent, h } from 'vue';

export interface InlineGalleryItem {
  id: string;
  favoriteId: number | null;
  globalParagraphIndex: number;
  imageBlob: Blob;
  mimeType: string;
  objectUrl: string;
  promptSnapshot: InlinePromptSnapshot;
  createdAt: number;
}

export interface InlineGalleryGroupProps {
  items: InlineGalleryItem[];
  activeItemId: string;
  darkMode: boolean;
  canGenerate: boolean;
  isRuntimeEnabled: () => boolean;
  toggleFavorite: (item: InlineGalleryItem) => void;
  removeItem: (item: InlineGalleryItem) => void;
  generateLast: (item: InlineGalleryItem) => void;
  generateFresh: () => void;
}

const GALLERIA_RESPONSIVE_OPTIONS: GalleriaResponsiveOptions[] = [
  { breakpoint: '768px', numVisible: 3 },
  { breakpoint: '480px', numVisible: 1 },
];

export const InlineGalleryGroupView = defineComponent({
  name: 'InlineGalleryGroupView',
  props: {
    items: { type: Array as PropType<InlineGalleryItem[]>, required: true },
    activeItemId: { type: String, required: true },
    darkMode: { type: Boolean, required: true },
    canGenerate: { type: Boolean, required: true },
    isRuntimeEnabled: { type: Function as PropType<() => boolean>, required: true },
    toggleFavorite: { type: Function as PropType<(item: InlineGalleryItem) => void>, required: true },
    removeItem: { type: Function as PropType<(item: InlineGalleryItem) => void>, required: true },
    generateLast: { type: Function as PropType<(item: InlineGalleryItem) => void>, required: true },
    generateFresh: { type: Function as PropType<() => void>, required: true },
  },
  setup(props) {
    return () => props.items.length
      ? renderGalleryGroup(props as InlineGalleryGroupProps)
      : h('div');
  },
});

/**
 * 渲染画廊主体
 * @param props 组件参数
 * @returns VNode
 */
function renderGalleryGroup(props: Readonly<InlineGalleryGroupProps>): VNode {
  const media = props.items.length > 1
    ? renderGalleria(props)
    : renderFocusImage(props, props.items[0]);
  return h('div', { class: 'cv-inline-favorite-content' }, [media]);
}

/**
 * 渲染 PrimeVue Galleria
 * @param props 组件参数
 * @returns VNode
 */
function renderGalleria(props: Readonly<InlineGalleryGroupProps>): VNode {
  return h(Galleria, buildGalleriaProps(props), {
    item: (slot: { item: InlineGalleryItem }) => [renderFocusImage(props, slot.item)],
    thumbnail: (slot: { item: InlineGalleryItem }) => [renderGalleryThumbnail(slot.item)],
  });
}

/**
 * 构建 Galleria 参数
 * @param props 组件参数
 * @returns Galleria 参数
 */
function buildGalleriaProps(props: Readonly<InlineGalleryGroupProps>): Record<string, unknown> {
  return {
    value: props.items,
    activeIndex: findActiveIndex(props.items, props.activeItemId),
    numVisible: 5,
    responsiveOptions: GALLERIA_RESPONSIVE_OPTIONS,
    circular: true,
    showItemNavigators: false,
    showThumbnails: true,
    thumbnailsPosition: 'bottom',
    class: 'cv-inline-favorite-galleria',
  };
}

/**
 * 渲染可承载操作按钮的焦点图片舞台
 * @param props 组件参数
 * @param item 当前焦点图片
 * @returns 图片舞台 VNode
 */
function renderFocusImage(
  props: Readonly<InlineGalleryGroupProps>,
  item: InlineGalleryItem,
): VNode {
  return h('div', { class: 'cv-inline-favorite-stage' }, [
    renderGalleryImage(props, item),
    renderFavoriteToggle(props, item),
    renderRemoveToggle(props, item),
    renderGalleryActions(props, item),
  ]);
}

/**
 * 渲染主图
 * @param props 组件参数
 * @param item 画廊项
 * @returns 图片 VNode
 */
function renderGalleryImage(
  props: Readonly<InlineGalleryGroupProps>,
  item: InlineGalleryItem,
): VNode {
  return h('img', {
    class: 'cv-inline-favorite-img',
    src: item.objectUrl,
    alt: '生成的图片',
    draggable: false,
    onClick: (event: MouseEvent) => openLightbox(event, props, item),
  });
}

/**
 * 渲染缩略图
 * @param item 画廊项
 * @returns 缩略图 VNode
 */
function renderGalleryThumbnail(item: InlineGalleryItem): VNode {
  return h('img', {
    class: 'cv-inline-favorite-thumb',
    src: item.objectUrl,
    alt: '图片缩略图',
    draggable: false,
  });
}

/**
 * 打开图片预览
 * @param event 鼠标事件
 * @param props 组件参数
 * @param item 画廊项
 */
function openLightbox(
  event: MouseEvent,
  props: Readonly<InlineGalleryGroupProps>,
  item: InlineGalleryItem,
): void {
  const img = event.currentTarget as HTMLImageElement;
  const wrap = img.closest('.cv-inline-img-wrap');
  if (wrap instanceof HTMLElement) {
    handleInlineImageClick(event, img, wrap, props.isRuntimeEnabled, item.promptSnapshot);
  }
}

/**
 * 渲染收藏切换按钮
 * @param props 组件参数
 * @param item 画廊项
 * @returns 按钮 VNode
 */
function renderFavoriteToggle(
  props: Readonly<InlineGalleryGroupProps>,
  item: InlineGalleryItem,
): VNode {
  const active = typeof item.favoriteId === 'number';
  return h('button', {
    class: 'cv-inline-corner-button cv-inline-favorite-toggle',
    'data-cv-inline-item-id': item.id,
    title: active ? '取消收藏' : '收藏图片',
    'aria-label': active ? '取消收藏' : '收藏图片',
    onClick: () => props.toggleFavorite(item),
  }, [renderFavoriteStarIcon(active)]);
}

/**
 * 渲染收藏星标 SVG, 直接由 fill 切换灰/金实心星
 * @param active 是否已收藏
 * @returns 星标 SVG VNode
 */
function renderFavoriteStarIcon(active: boolean): VNode {
  return h('svg', {
    class: 'cv-inline-favorite-star',
    viewBox: '0 0 24 24',
    'aria-hidden': 'true',
    fill: active ? '#f5b301' : '#9ca3af',
  }, [h('path', {
    d: 'M12 2.5l2.94 5.96 6.58.96-4.76 4.64 1.12 6.55L12 18.56 6.12 21.6l1.12-6.55L2.48 9.42l6.58-.96L12 2.5z',
  })]);
}

/**
 * 渲染左下角移除按钮
 * @param props 组件参数
 * @param item 画廊项
 * @returns 按钮 VNode
 */
function renderRemoveToggle(
  props: Readonly<InlineGalleryGroupProps>,
  item: InlineGalleryItem,
): VNode {
  return h('button', {
    class: 'cv-inline-corner-button cv-inline-remove-toggle',
    title: '移除',
    'aria-label': '移除',
    onClick: () => props.removeItem(item),
  }, [h('i', { class: 'fa-solid fa-trash' })]);
}

/**
 * 渲染当前焦点图片操作条
 * @param props 组件参数
 * @param item 当前焦点图片
 * @returns 操作条 VNode
 */
function renderGalleryActions(
  props: Readonly<InlineGalleryGroupProps>,
  item: InlineGalleryItem,
): VNode {
  return h('div', { class: buildInlineActionHostClass('cv-inline-img-actions', props.darkMode) }, [
    h('div', { class: 'cv-inline-button-row' }, buildActions(props, item).map(renderActionButton)),
  ]);
}

/**
 * 构建当前焦点图片操作
 * @param props 组件参数
 * @param item 当前焦点图片
 * @returns 操作配置
 */
function buildActions(
  props: Readonly<InlineGalleryGroupProps>,
  item: InlineGalleryItem,
): InlineActionButtonSpec[] {
  return props.canGenerate ? buildGenerateActions(props, item) : [];
}

/**
 * 构建重新生成操作
 * @param props 组件参数
 * @param item 当前焦点图片
 * @returns 操作配置
 */
function buildGenerateActions(
  props: Readonly<InlineGalleryGroupProps>,
  item: InlineGalleryItem,
): InlineActionButtonSpec[] {
  return [
    {
      label: '重新生成图片',
      icon: 'fa-solid fa-repeat',
      severity: 'secondary',
      variant: 'outlined',
      onClick: () => props.generateLast(item),
    },
    {
      label: '重新生成TAG和图片',
      icon: 'fa-solid fa-robot',
      severity: 'secondary',
      variant: 'outlined',
      onClick: () => props.generateFresh(),
    },
  ];
}

/**
 * 渲染操作按钮
 * @param action 操作配置
 * @returns 按钮 VNode
 */
function renderActionButton(action: InlineActionButtonSpec): VNode {
  return h(Button, buildInlineActionButtonProps(action));
}

/**
 * 读取焦点图片索引
 * @param items 图片项
 * @param activeItemId 焦点 ID
 * @returns 索引
 */
function findActiveIndex(items: InlineGalleryItem[], activeItemId: string): number {
  const index = items.findIndex(item => item.id === activeItemId);
  return index >= 0 ? index : 0;
}

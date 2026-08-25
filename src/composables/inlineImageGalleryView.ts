import { handleInlineImageClick, type InlinePromptSnapshot } from '@/composables/inlineImageLightbox';
import {
  buildInlineActionButtonProps,
  buildInlineActionHostClass,
  type InlineActionButtonSpec,
} from '@/composables/inlineImageDom';
import Button from 'primevue/button';
import Galleria from 'primevue/galleria';
import type { PropType, VNode } from 'vue';
import { defineComponent, h } from 'vue';

export interface InlineGalleryItem {
  id: string;
  favoriteId: number | null;
  /** 段落位点 slotId；临时项可以为空 */
  slotId: string | null;
  imageBlob: Blob;
  objectUrl: string;
  promptSnapshot: InlinePromptSnapshot;
  createdAt: number;
}

export interface InlineGalleryGroupProps {
  items: InlineGalleryItem[];
  activeItemId: string;
  darkMode: boolean;
  canGenerate: boolean;
  showCornerActions: boolean;
  isRuntimeEnabled: () => boolean;
  selectItem: (item: InlineGalleryItem) => void;
  toggleFavorite: (item: InlineGalleryItem) => void;
  removeItem: (item: InlineGalleryItem) => void;
  generateLast: (item: InlineGalleryItem) => void;
  generateFresh: () => void;
  generateWithEditablePrompt: (item: InlineGalleryItem) => void;
  downloadImage?: (item: InlineGalleryItem) => void;
}

interface InlineGalleryThumbnailStripProps {
  items: InlineGalleryItem[];
  activeItemId: string;
  selectItem: (item: InlineGalleryItem) => void;
}

export const InlineGalleryGroupView = defineComponent({
  name: 'InlineGalleryGroupView',
  props: {
    items: { type: Array as PropType<InlineGalleryItem[]>, required: true },
    activeItemId: { type: String, required: true },
    darkMode: { type: Boolean, required: true },
    canGenerate: { type: Boolean, required: true },
    showCornerActions: { type: Boolean, default: true },
    isRuntimeEnabled: { type: Function as PropType<() => boolean>, required: true },
    selectItem: { type: Function as PropType<(item: InlineGalleryItem) => void>, required: true },
    toggleFavorite: { type: Function as PropType<(item: InlineGalleryItem) => void>, required: true },
    removeItem: { type: Function as PropType<(item: InlineGalleryItem) => void>, required: true },
    generateLast: { type: Function as PropType<(item: InlineGalleryItem) => void>, required: true },
    generateFresh: { type: Function as PropType<() => void>, required: true },
    generateWithEditablePrompt: { type: Function as PropType<(item: InlineGalleryItem) => void>, required: true },
    downloadImage: { type: Function as PropType<(item: InlineGalleryItem) => void>, default: undefined },
  },
  setup(props) {
    const resolvedProps = props as InlineGalleryGroupProps;
    return () => (resolvedProps.items.length ? renderGalleryGroup(resolvedProps) : h('div'));
  },
});

/**
 * 渲染画廊主体
 * @param props 组件参数
 * @returns VNode
 */
function renderGalleryGroup(
  props: Readonly<InlineGalleryGroupProps>,
): VNode {
  const children: VNode[] = [
    h('div', { class: 'cv-inline-favorite-main' }, [
      h('div', { class: 'cv-inline-generation-overlay-shell' }),
      renderGalleria(props),
    ]),
  ];
  if (props.items.length > 1) children.push(renderThumbnailStrip(props));
  return h('div', { class: 'cv-inline-favorite-content' }, children);
}

/**
 * 渲染 PrimeVue Galleria（仅主图，缩略图由外层稳定区渲染）
 * @param props 组件参数
 * @returns VNode
 */
function renderGalleria(props: Readonly<InlineGalleryGroupProps>): VNode {
  return h(Galleria, buildGalleriaProps(props), {
    item: (slot: { item: InlineGalleryItem }) => [renderFocusImage(props, slot.item)],
  });
}

/**
 * 构建 Galleria 参数
 * @param props 组件参数
 * @returns Galleria 参数
 */
function buildGalleriaProps(props: Readonly<InlineGalleryGroupProps>): Record<string, unknown> {
  const hasMultiple = props.items.length > 1;
  return {
    value: props.items,
    activeIndex: findActiveIndex(props.items, props.activeItemId),
    circular: hasMultiple,
    showItemNavigators: false,
    showThumbnails: false,
    class: 'cv-inline-favorite-galleria',
    'onUpdate:activeIndex': (index: number) => syncActiveItemByIndex(props, index),
  };
}

/**
 * 同步 Galleria 焦点图片
 * @param props 组件参数
 * @param index 当前焦点索引
 */
function syncActiveItemByIndex(props: Readonly<InlineGalleryGroupProps>, index: number): void {
  const item = props.items[index];
  if (item) props.selectItem(item);
}

/**
 * 渲染可承载操作按钮的焦点图片舞台
 * @param props 组件参数
 * @param item 当前焦点图片
 * @returns 图片舞台 VNode
 */
function renderFocusImage(props: Readonly<InlineGalleryGroupProps>, item: InlineGalleryItem): VNode {
  const children = [renderGalleryImage(props, item)];
  if (props.showCornerActions) {
    children.push(renderFavoriteToggle(props, item), renderRemoveToggle(props, item));
  }
  children.push(renderGalleryActions(props, item));
  return h('div', { class: 'cv-inline-favorite-stage' }, children);
}

/**
 * 渲染主图
 * @param props 组件参数
 * @param item 画廊项
 * @returns 图片 VNode
 */
function renderGalleryImage(props: Readonly<InlineGalleryGroupProps>, item: InlineGalleryItem): VNode {
  return h('img', {
    class: 'cv-inline-favorite-img',
    src: item.objectUrl,
    alt: '生成的图片',
    draggable: false,
    onClick: (event: MouseEvent) => openLightbox(event, props, item),
  });
}

/**
 * 打开图片预览
 * @param event 鼠标事件
 * @param props 组件参数
 * @param item 画廊项
 */
function openLightbox(event: MouseEvent, props: Readonly<InlineGalleryGroupProps>, item: InlineGalleryItem): void {
  const img = event.currentTarget as HTMLImageElement;
  const wrap = img.closest('.cv-inline-favorite-stage') ?? img.closest('.cv-inline-img-wrap');
  if (wrap instanceof HTMLElement) {
    const downloadImage = props.downloadImage;
    const actions = downloadImage ? { onDownload: () => downloadImage(item) } : undefined;
    handleInlineImageClick(event, img, wrap, props.isRuntimeEnabled, item.promptSnapshot, actions);
  }
}

/**
 * 渲染收藏切换按钮
 * @param props 组件参数
 * @param item 画廊项
 * @returns 按钮 VNode
 */
function renderFavoriteToggle(props: Readonly<InlineGalleryGroupProps>, item: InlineGalleryItem): VNode {
  const active = typeof item.favoriteId === 'number';
  const label = active ? '取消收藏' : '收藏图片';
  return h(
    'button',
    {
      class: {
        'cv-inline-corner-button': true,
        'cv-inline-favorite-toggle': true,
        'cv-inline-favorite-toggle--active': active,
      },
      'data-cv-inline-item-id': item.id,
      title: label,
      'aria-label': label,
      onClick: () => props.toggleFavorite(item),
    },
    [renderFavoriteStarIcon(active)],
  );
}

/**
 * 渲染收藏星标图标
 * @param active 是否已收藏
 * @returns 星标图标 VNode
 */
function renderFavoriteStarIcon(active: boolean): VNode {
  return h('i', {
    class: ['cv-inline-favorite-star fa-star', active ? 'fa-solid' : 'fa-regular'],
    'aria-hidden': 'true',
  });
}

/**
 * 渲染左下角移除按钮
 * @param props 组件参数
 * @param item 画廊项
 * @returns 按钮 VNode
 */
function renderRemoveToggle(props: Readonly<InlineGalleryGroupProps>, item: InlineGalleryItem): VNode {
  return h(
    'button',
    {
      class: 'cv-inline-corner-button cv-inline-remove-toggle',
      title: '移除',
      'aria-label': '移除',
      onClick: () => props.removeItem(item),
    },
    [h('i', { class: 'fa-solid fa-trash' })],
  );
}

/**
 * 渲染当前焦点图片操作条
 * @param props 组件参数
 * @param item 当前焦点图片
 * @returns 操作条 VNode
 */
function renderGalleryActions(props: Readonly<InlineGalleryGroupProps>, item: InlineGalleryItem): VNode {
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
function buildActions(props: Readonly<InlineGalleryGroupProps>, item: InlineGalleryItem): InlineActionButtonSpec[] {
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
      label: '重新生图',
      icon: 'fa-solid fa-repeat',
      severity: 'secondary',
      variant: 'outlined',
      onClick: () => props.generateLast(item),
    },
    {
      label: '编辑TAG后重新生图',
      icon: 'fa-solid fa-pen-to-square',
      severity: 'secondary',
      variant: 'outlined',
      onClick: () => props.generateWithEditablePrompt(item),
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

/**
 * 渲染缩略图条
 * @param props 组件参数
 * @returns 缩略图条 VNode
 */
function renderThumbnailStrip(
  props: Readonly<InlineGalleryThumbnailStripProps>,
): VNode {
  return h('div', { class: 'cv-inline-gallery-strip', role: 'group', 'aria-label': '图片缩略图' }, [
    renderThumbnailNavButton(props, -1),
    h('div', { class: 'cv-inline-gallery-strip-viewport' }, [renderThumbnailList(props)]),
    renderThumbnailNavButton(props, 1),
  ]);
}

/**
 * 渲染缩略图列表
 * @param props 组件参数
 * @returns 缩略图列表 VNode
 */
function renderThumbnailList(
  props: Readonly<InlineGalleryThumbnailStripProps>,
): VNode {
  return h(
    'div',
    { class: 'cv-inline-gallery-strip-list' },
    props.items.map((item, index) =>
      renderThumbnailItem(item, index, props.activeItemId, props.selectItem),
    ),
  );
}

/**
 * 渲染单个缩略图按钮
 * @param item 当前图片项
 * @param index 当前索引
 * @param activeItemId 当前焦点图片 ID
 * @param selectItem 切换焦点图片
 * @returns 缩略图按钮 VNode
 */
function renderThumbnailItem(
  item: InlineGalleryItem,
  index: number,
  activeItemId: string,
  selectItem: (item: InlineGalleryItem) => void,
): VNode {
  const active = item.id === activeItemId;
  return h(
    'button',
    {
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
 * 渲染缩略图前后导航箭头按钮
 * @param props 组件参数
 * @param step 步进方向（-1 上一张，1 下一张）
 * @returns 导航按钮 VNode
 */
function renderThumbnailNavButton(props: Readonly<InlineGalleryThumbnailStripProps>, step: -1 | 1): VNode {
  const activeIndex = findActiveIndex(props.items, props.activeItemId);
  const disabled = props.items.length <= 1;
  const isPrev = step === -1;
  return h(
    'button',
    {
      type: 'button',
      class: 'cv-prime-galleria-nav-button cv-inline-gallery-strip-nav',
      disabled,
      'aria-label': isPrev ? '上一张' : '下一张',
      onClick: () => stepActiveItem(props, activeIndex + step),
    },
    [
      h('i', {
        class: [
          'cv-prime-galleria-nav-icon',
          isPrev ? 'fa-solid fa-chevron-left' : 'fa-solid fa-chevron-right',
        ],
        'aria-hidden': 'true',
      }),
    ],
  );
}

/**
 * 步进切换当前焦点图片
 * @param props 组件参数
 * @param targetIndex 目标索引
 */
function stepActiveItem(props: Readonly<InlineGalleryThumbnailStripProps>, targetIndex: number): void {
  const total = props.items.length;
  if (total <= 1) return;
  const normalized = (targetIndex + total) % total;
  const nextItem = props.items[normalized];
  if (nextItem) props.selectItem(nextItem);
}

import type { InlinePromptSnapshot } from '@/composables/inlineImageLightbox';
import {
  deleteFavoriteGalleryItem,
  favoriteGalleryItem,
  unfavoriteGalleryItem,
} from '@/composables/inlineImageGalleryFavorite';
import { buildInlineActionHostClass, preventInlineEventBubbling } from '@/composables/inlineImageDom';
import {
  InlineGalleryGroupView,
  type InlineGalleryGroupProps,
  type InlineGalleryItem,
} from '@/composables/inlineImageGalleryView';
import {
  createInlineImageMessageRenderRestorer,
  type InlineImageMessageRenderRestorer,
} from '@/composables/inlineImageMessageRenderRestore';
import { type InlineImageFavoriteListItem } from '@/services/inline-image/favorites-cache';
import { resolveParagraphSlotId } from '@/services/inline-image/slot-bind';
import {
  collectMessageSlotGalleryMounts,
  collectVisibleSlotGalleryMounts,
  type SlotGalleryMountSpec,
} from '@/services/inline-image/slot-gallery-restore';
import { getCurrentInlineFavoriteScope } from '@/services/sillytavern/chat-context';
import {
  createInlineFavoriteAnchor,
  getGlobalParagraphIndex,
  type InlineFavoriteAnchor,
} from '@/services/sillytavern/chat-dom';
import { event_types, eventSource } from '@sillytavern/script';
import type { AppContext } from 'vue';
import { h, render } from 'vue';

export interface InlineGeneratedImageResult {
  imageBlob: Blob;
  promptSnapshot: InlinePromptSnapshot;
}

interface InlineGalleryRendererOptions {
  appContext?: AppContext;
  getDarkMode: () => boolean;
  isRuntimeEnabled: () => boolean;
  onGenerateWithSnapshot: (paragraph: HTMLElement, snapshot: InlinePromptSnapshot) => Promise<void>;
  onGenerateWithFreshPrompt: (paragraph: HTMLElement) => Promise<void>;
  onGenerateWithEditablePrompt: (paragraph: HTMLElement, snapshot: InlinePromptSnapshot) => Promise<void>;
  onDownloadImage: (imageBlob: Blob, createdAt: number) => Promise<void>;
}

export interface InlineImageGalleryRenderer {
  getHost: (paragraph: HTMLElement) => HTMLElement | null;
  showGenerated: (paragraph: HTMLElement, result: InlineGeneratedImageResult) => void;
  restore: () => Promise<void>;
  refreshTheme: () => void;
  cleanup: () => void;
}

interface InlineGalleryGroup {
  /** groups key：优先 slotId，临时画廊用 temp:${index} */
  key: string;
  index: number;
  slotId: string | null;
  anchor: InlineFavoriteAnchor;
  host: HTMLElement;
  items: InlineGalleryItem[];
  activeItemId: string;
}

interface InlineGalleryState extends InlineGalleryRendererOptions {
  groups: Map<string, InlineGalleryGroup>;
  objectUrls: Set<string>;
  messageRestorer: InlineImageMessageRenderRestorer | null;
  chatRestoreTimer: number | null;
  scheduleChatRestore: () => void;
  restoreToken: number;
  nextTemporaryId: number;
  disposed: boolean;
}

const CHAT_RESTORE_DELAY_MS = 80;

/**
 * 创建聊天段落图片画廊渲染器
 * @param options 渲染依赖
 * @returns 画廊控制器
 */
export function createInlineImageGalleryRenderer(options: InlineGalleryRendererOptions): InlineImageGalleryRenderer {
  const state = createGalleryState(options);
  attachMessageRenderRestorer(state);
  registerChatChangeRestore(state);
  void restoreGallery(state);
  return {
    getHost: paragraph => getGroupByParagraph(state, paragraph)?.host ?? null,
    showGenerated: (paragraph, result) => showGeneratedImage(state, paragraph, result),
    restore: () => restoreGallery(state),
    refreshTheme: () => state.groups.forEach(group => renderGroup(state, group)),
    cleanup: () => cleanupGallery(state),
  };
}

/**
 * 创建画廊运行状态
 * @param options 渲染依赖
 * @returns 画廊状态
 */
function createGalleryState(options: InlineGalleryRendererOptions): InlineGalleryState {
  const state: InlineGalleryState = {
    ...options,
    groups: new Map(),
    objectUrls: new Set(),
    messageRestorer: null,
    chatRestoreTimer: null,
    scheduleChatRestore: () => undefined,
    restoreToken: 0,
    nextTemporaryId: 1,
    disposed: false,
  };
  state.scheduleChatRestore = () => scheduleRestoreGallery(state);
  return state;
}

/**
 * 挂载单条消息渲染恢复器
 * @param state 画廊状态
 */
function attachMessageRenderRestorer(state: InlineGalleryState): void {
  state.messageRestorer = createInlineImageMessageRenderRestorer({
    getRestoreToken: () => state.restoreToken,
    isDisposed: () => state.disposed,
    restoreBySlotMounts: mounts => mergeSlotGalleryMounts(state, mounts),
    remountGroups: anchors => remountRenderedGroups(state, anchors),
    readMessageSlotMounts: messageIds => collectMessageSlotGalleryMounts(messageIds),
  });
}

/**
 * 注册聊天切换后的收藏图全量恢复
 * @param state 画廊状态
 */
function registerChatChangeRestore(state: InlineGalleryState): void {
  eventSource.makeLast(event_types.CHAT_CHANGED, state.scheduleChatRestore);
}

/**
 * 排队执行一次聊天切换恢复
 * @param state 画廊状态
 */
function scheduleRestoreGallery(state: InlineGalleryState): void {
  if (state.disposed) return;
  if (state.chatRestoreTimer !== null) window.clearTimeout(state.chatRestoreTimer);
  state.chatRestoreTimer = window.setTimeout(() => flushScheduledGalleryRestore(state), CHAT_RESTORE_DELAY_MS);
}

/**
 * 执行已排队的聊天切换恢复
 * @param state 画廊状态
 */
function flushScheduledGalleryRestore(state: InlineGalleryState): void {
  state.chatRestoreTimer = null;
  void restoreGallery(state);
}

/**
 * 注销聊天切换恢复监听
 * @param state 画廊状态
 */
function disposeChatChangeRestore(state: InlineGalleryState): void {
  if (state.chatRestoreTimer !== null) window.clearTimeout(state.chatRestoreTimer);
  state.chatRestoreTimer = null;
  eventSource.removeListener(event_types.CHAT_CHANGED, state.scheduleChatRestore);
}

/**
 * 从 DOM 短码 + IDB slot 恢复当前聊天画廊
 * @param state 画廊状态
 */
async function restoreGallery(state: InlineGalleryState): Promise<void> {
  if (state.disposed) return;
  const token = state.restoreToken + 1;
  state.restoreToken = token;
  cleanupGalleryHosts(state);
  if (!getCurrentInlineFavoriteScope()) return;
  let mounts: SlotGalleryMountSpec[] = [];
  try {
    mounts = await collectVisibleSlotGalleryMounts();
  } catch (error) {
    console.error('[CosmosVision] 读取段落图片收藏失败', error);
    toastr.error('读取段落图片收藏失败');
  }
  if (state.disposed || token !== state.restoreToken) return;
  mergeSlotGalleryMounts(state, mounts);
}

/**
 * 把短码扫描到的 slot 画廊挂到 DOM
 * @param state 画廊状态
 * @param mounts 挂载规格
 */
function mergeSlotGalleryMounts(state: InlineGalleryState, mounts: SlotGalleryMountSpec[]): void {
  for (const mount of mounts) {
    const group = ensureGroup(state, mount.index, mount.anchor, mount.slotId);
    const items = mount.records
      .filter(record => !hasFavoriteItem(group, record.id))
      .map(record => createFavoriteItem(state, record, mount.slotId));
    if (!items.length) {
      remountGroupIfNeeded(state, group, mount.anchor);
      continue;
    }
    group.items = sortGalleryItems([...group.items, ...items]);
    group.activeItemId = resolveActiveItemId(group);
    renderGroup(state, group);
  }
}

/**
 * 展示本次会话新生成的图片（仅 DOM，不写 raw / 默认不写 IDB）
 * @param state 画廊状态
 * @param paragraph 目标段落
 * @param result 生成结果
 */
function showGeneratedImage(
  state: InlineGalleryState,
  paragraph: HTMLElement,
  result: InlineGeneratedImageResult,
): void {
  const index = Math.max(0, getGlobalParagraphIndex(paragraph));
  const existingSlotId = resolveParagraphSlotId(paragraph) ?? findGroupSlotOnParagraph(state, paragraph);
  const anchor = createInlineFavoriteAnchor(paragraph);
  const item = createTemporaryItem(state, existingSlotId, result);
  const group = ensureGroup(state, index, anchor, existingSlotId);
  group.items = sortGalleryItems([item, ...group.items]);
  group.activeItemId = item.id;
  renderGroup(state, group);
}

/**
 * 创建恢复收藏项
 * @param state 画廊状态
 * @param record 收藏记录
 * @param slotId 位点 id
 * @returns 画廊项
 */
function createFavoriteItem(
  state: InlineGalleryState,
  record: InlineImageFavoriteListItem,
  slotId: string,
): InlineGalleryItem {
  const objectUrl = URL.createObjectURL(record.imageBlob);
  state.objectUrls.add(objectUrl);
  return {
    id: `favorite-${record.id}`,
    favoriteId: record.id,
    slotId,
    imageBlob: record.imageBlob,
    objectUrl,
    promptSnapshot: record.promptSnapshot,
    createdAt: record.createdAt,
  };
}

/**
 * 创建会话临时生成项
 * @param state 画廊状态
 * @param slotId 已有位点或 null
 * @param result 生成结果
 * @returns 画廊项
 */
function createTemporaryItem(
  state: InlineGalleryState,
  slotId: string | null,
  result: InlineGeneratedImageResult,
): InlineGalleryItem {
  const objectUrl = URL.createObjectURL(result.imageBlob);
  state.objectUrls.add(objectUrl);
  return {
    id: `temporary-${state.nextTemporaryId++}`,
    favoriteId: null,
    slotId,
    imageBlob: result.imageBlob,
    objectUrl,
    promptSnapshot: result.promptSnapshot,
    createdAt: Date.now(),
  };
}

/**
 * 判断画廊组是否已有指定收藏项
 * @param group 画廊组
 * @param favoriteId 收藏 ID
 * @returns 是否已存在
 */
function hasFavoriteItem(group: InlineGalleryGroup, favoriteId: number): boolean {
  return group.items.some(item => item.favoriteId === favoriteId);
}

/**
 * 确保指定段落位点存在画廊组
 * @param state 画廊状态
 * @param index 段落索引
 * @param anchor 挂载锚点
 * @param slotId 位点 id 或 null
 * @returns 画廊组
 */
function ensureGroup(
  state: InlineGalleryState,
  index: number,
  anchor: InlineFavoriteAnchor,
  slotId: string | null,
): InlineGalleryGroup {
  const key = buildGroupKey(slotId, index);
  const existing = state.groups.get(key) ?? findGroupByParagraph(state, anchor.paragraph);
  if (existing) {
    if (!canReuseGroupAnchor(existing.anchor, anchor)) {
      removeGroup(state, existing);
      return mountGroup(state, index, anchor, slotId, [], '');
    }
    remountGroupIfNeeded(state, existing, anchor);
    if (slotId && !existing.slotId) bindGroupSlot(state, existing, slotId);
    return existing;
  }
  return mountGroup(state, index, anchor, slotId, [], '');
}

/**
 * 挂载一个画廊组
 * @param state 画廊状态
 * @param index 段落索引
 * @param anchor 挂载锚点
 * @param slotId 位点 id
 * @param items 初始图片项
 * @param activeItemId 当前焦点项
 * @returns 画廊组
 */
function mountGroup(
  state: InlineGalleryState,
  index: number,
  anchor: InlineFavoriteAnchor,
  slotId: string | null,
  items: InlineGalleryItem[],
  activeItemId: string,
): InlineGalleryGroup {
  const host = createGalleryHost(state, anchor);
  const group: InlineGalleryGroup = {
    key: buildGroupKey(slotId, index),
    index,
    slotId,
    anchor,
    host,
    items: sortGalleryItems(items),
    activeItemId,
  };
  group.activeItemId = resolveActiveItemId(group);
  state.groups.set(group.key, group);
  renderGroup(state, group);
  return group;
}

/**
 * 把临时组升级为 slot 键
 * @param state 画廊状态
 * @param group 画廊组
 * @param slotId 位点 id
 */
function bindGroupSlot(state: InlineGalleryState, group: InlineGalleryGroup, slotId: string): void {
  if (group.slotId === slotId) return;
  state.groups.delete(group.key);
  group.slotId = slotId;
  group.key = buildSlotGroupKey(slotId);
  group.items.forEach(item => {
    if (!item.slotId) item.slotId = slotId;
  });
  state.groups.set(group.key, group);
}

/**
 * 创建画廊宿主并插入聊天 DOM
 * @param state 画廊状态
 * @param anchor 挂载锚点
 * @returns 宿主元素
 */
function createGalleryHost(state: InlineGalleryState, anchor: InlineFavoriteAnchor): HTMLElement {
  const host = document.createElement('div');
  host.className = buildInlineActionHostClass('cv-inline-img-wrap cv-inline-favorite-wrap', state.getDarkMode());
  preventInlineEventBubbling(host);
  if (anchor.placement === 'after') anchor.target.after(host);
  else anchor.target.appendChild(host);
  return host;
}

/**
 * 渲染指定画廊组
 * @param state 画廊状态
 * @param group 画廊组
 */
function renderGroup(state: InlineGalleryState, group: InlineGalleryGroup): void {
  group.items = sortGalleryItems(group.items);
  group.activeItemId = resolveActiveItemId(group);
  group.host.className = buildInlineActionHostClass('cv-inline-img-wrap cv-inline-favorite-wrap', state.getDarkMode());
  const vnode = h(InlineGalleryGroupView, buildGroupProps(state, group));
  if (state.appContext) vnode.appContext = state.appContext;
  render(vnode, group.host);
}

/**
 * 重挂已存在的消息内画廊组
 * @param state 画廊状态
 * @param anchors 当前消息的段落锚点（index → anchor）
 */
function remountRenderedGroups(state: InlineGalleryState, anchors: Map<number, InlineFavoriteAnchor>): void {
  state.groups.forEach(group => {
    const byIndex = anchors.get(group.index);
    const byParagraph = [...anchors.values()].find(anchor => anchor.paragraph === group.anchor.paragraph);
    const anchor = byParagraph ?? byIndex;
    if (anchor && canReuseGroupAnchor(group.anchor, anchor)) remountGroupIfNeeded(state, group, anchor);
  });
}

/**
 * 判断画廊组是否可重用到当前可见锚点
 * @param current 当前画廊锚点
 * @param next 新锚点
 * @returns 是否允许复用
 */
function canReuseGroupAnchor(current: InlineFavoriteAnchor, next: InlineFavoriteAnchor): boolean {
  if (current.mesId && next.mesId && current.mesId !== next.mesId) return false;
  if (typeof current.swipeId === 'number' && typeof next.swipeId === 'number') return current.swipeId === next.swipeId;
  return true;
}

/**
 * 必要时把画廊组挂到新的段落 DOM
 * @param state 画廊状态
 * @param group 画廊组
 * @param anchor 新锚点
 */
function remountGroupIfNeeded(
  state: InlineGalleryState,
  group: InlineGalleryGroup,
  anchor: InlineFavoriteAnchor,
): void {
  if (anchor.paragraph) group.index = Math.max(0, getGlobalParagraphIndex(anchor.paragraph));
  if (group.host.isConnected && group.anchor.paragraph === anchor.paragraph) {
    group.anchor = anchor;
    return;
  }
  render(null, group.host);
  group.host.remove();
  group.anchor = anchor;
  group.host = createGalleryHost(state, anchor);
  renderGroup(state, group);
}

/**
 * 构建画廊组件参数
 * @param state 画廊状态
 * @param group 画廊组
 * @returns 组件参数
 */
function buildGroupProps(state: InlineGalleryState, group: InlineGalleryGroup): InlineGalleryGroupProps {
  return {
    items: group.items,
    activeItemId: group.activeItemId,
    darkMode: state.getDarkMode(),
    canGenerate: Boolean(group.anchor.paragraph),
    isRuntimeEnabled: state.isRuntimeEnabled,
    selectItem: item => selectGalleryItem(state, group, item),
    toggleFavorite: item => void toggleFavorite(state, group, item),
    removeItem: item => void removeItem(state, group, item),
    generateLast: item => void generateLast(state, group, item),
    generateFresh: () => void generateFresh(state, group),
    generateWithEditablePrompt: item => void generateWithEditablePrompt(state, group, item),
    downloadImage: item => void downloadImage(state, item),
  };
}

/**
 * 切换画廊当前焦点图片
 * @param state 画廊状态
 * @param group 画廊组
 * @param item 目标画廊项
 */
function selectGalleryItem(state: InlineGalleryState, group: InlineGalleryGroup, item: InlineGalleryItem): void {
  if (group.activeItemId === item.id) return;
  group.activeItemId = item.id;
  renderGroup(state, group);
}

/**
 * 切换画廊项收藏状态
 * @param state 画廊状态
 * @param group 画廊组
 * @param item 画廊项
 */
async function toggleFavorite(
  state: InlineGalleryState,
  group: InlineGalleryGroup,
  item: InlineGalleryItem,
): Promise<void> {
  if (!state.isRuntimeEnabled()) return;
  const wasFavorited = typeof item.favoriteId === 'number';
  try {
    if (wasFavorited) {
      await unfavoriteGalleryItem(group, item);
      toastr.success('已取消收藏');
    } else {
      const bound = await favoriteGalleryItem(group, item, slotId => bindGroupSlot(state, group, slotId));
      if (bound) toastr.success('已收藏图片，将长期存储');
    }
    syncFavoriteButtons(group.host, item);
  } catch (error) {
    console.error('[CosmosVision] 切换段落图片收藏失败', error);
    toastr.error(error instanceof Error ? error.message : '切换段落图片收藏失败');
  }
}

/**
 * 移除画廊项
 * @param state 画廊状态
 * @param group 画廊组
 * @param item 画廊项
 */
async function removeItem(
  state: InlineGalleryState,
  group: InlineGalleryGroup,
  item: InlineGalleryItem,
): Promise<void> {
  if (!state.isRuntimeEnabled()) return;
  try {
    if (item.favoriteId) await deleteFavoriteGalleryItem(group, item);
    removeItemFromGroup(state, group, item);
  } catch (error) {
    console.error('[CosmosVision] 删除段落图片失败', error);
    toastr.error('删除段落图片失败');
  }
}

/**
 * 从画廊组中移除图片项
 * @param state 画廊状态
 * @param group 画廊组
 * @param item 画廊项
 */
function removeItemFromGroup(state: InlineGalleryState, group: InlineGalleryGroup, item: InlineGalleryItem): void {
  const removedActiveItem = item.id === group.activeItemId;
  group.items = group.items.filter(candidate => candidate.id !== item.id);
  revokeItemObjectUrl(state, item);
  if (!group.items.length) {
    removeGroup(state, group);
    return;
  }
  group.activeItemId = removedActiveItem ? (group.items[0]?.id ?? '') : resolveActiveItemId(group);
  renderGroup(state, group);
}

/**
 * 删除空画廊组
 * @param state 画廊状态
 * @param group 画廊组
 */
function removeGroup(state: InlineGalleryState, group: InlineGalleryGroup): void {
  render(null, group.host);
  group.host.remove();
  state.groups.delete(group.key);
}

/**
 * 同步当前图片的收藏按钮状态
 * @param host 画廊宿主
 * @param item 图片项
 */
function syncFavoriteButtons(host: HTMLElement, item: InlineGalleryItem): void {
  const active = typeof item.favoriteId === 'number';
  host.querySelectorAll<HTMLButtonElement>('.cv-inline-favorite-toggle').forEach(button => {
    if (button.dataset.cvInlineItemId === item.id) updateFavoriteButton(button, active);
  });
}

/**
 * 更新单个收藏按钮视觉状态
 * @param button 收藏按钮
 * @param active 是否已收藏
 */
function updateFavoriteButton(button: HTMLButtonElement, active: boolean): void {
  button.title = active ? '取消收藏' : '收藏图片';
  button.setAttribute('aria-label', button.title);
  button.classList.toggle('cv-inline-favorite-toggle--active', active);
  const star = button.querySelector('.cv-inline-favorite-star');
  star?.classList.toggle('fa-solid', active);
  star?.classList.toggle('fa-regular', !active);
}

/**
 * 按当前图片提示词重新生成
 * @param state 画廊状态
 * @param group 画廊组
 * @param item 画廊项
 */
async function generateLast(
  state: InlineGalleryState,
  group: InlineGalleryGroup,
  item: InlineGalleryItem,
): Promise<void> {
  if (!state.isRuntimeEnabled() || !group.anchor.paragraph) return;
  await state.onGenerateWithSnapshot(group.anchor.paragraph, item.promptSnapshot);
}

/**
 * 重新生成 TAG 和图片
 * @param state 画廊状态
 * @param group 画廊组
 */
async function generateFresh(state: InlineGalleryState, group: InlineGalleryGroup): Promise<void> {
  if (!state.isRuntimeEnabled() || !group.anchor.paragraph) return;
  await state.onGenerateWithFreshPrompt(group.anchor.paragraph);
}

/**
 * 编辑当前图片提示词后生图
 * @param state 画廊状态
 * @param group 画廊组
 * @param item 当前画廊项
 */
async function generateWithEditablePrompt(
  state: InlineGalleryState,
  group: InlineGalleryGroup,
  item: InlineGalleryItem,
): Promise<void> {
  if (!state.isRuntimeEnabled() || !group.anchor.paragraph) return;
  await state.onGenerateWithEditablePrompt(group.anchor.paragraph, item.promptSnapshot);
}

/**
 * 下载当前画廊图片
 * @param state 画廊状态
 * @param item 当前画廊项
 */
async function downloadImage(state: InlineGalleryState, item: InlineGalleryItem): Promise<void> {
  if (!state.isRuntimeEnabled()) return;
  await state.onDownloadImage(item.imageBlob, item.createdAt);
}

/**
 * 按创建时间从新到旧排序
 * @param items 画廊项
 * @returns 排序项
 */
function sortGalleryItems(items: InlineGalleryItem[]): InlineGalleryItem[] {
  return [...items].sort((left, right) => right.createdAt - left.createdAt);
}

/**
 * 修正当前焦点图片 ID
 * @param group 画廊组
 * @returns 有效焦点图片 ID
 */
function resolveActiveItemId(group: Pick<InlineGalleryGroup, 'items' | 'activeItemId'>): string {
  return group.items.some(item => item.id === group.activeItemId) ? group.activeItemId : (group.items[0]?.id ?? '');
}

/**
 * 按段落读取画廊组
 * @param state 画廊状态
 * @param paragraph 段落元素
 * @returns 画廊组或 null
 */
function getGroupByParagraph(state: InlineGalleryState, paragraph: HTMLElement): InlineGalleryGroup | null {
  return findGroupByParagraph(state, paragraph);
}

/**
 * 在状态中按段落定位画廊组
 * @param state 画廊状态
 * @param paragraph 段落元素
 * @returns 画廊组或 null
 */
function findGroupByParagraph(
  state: InlineGalleryState,
  paragraph: HTMLElement | null | undefined,
): InlineGalleryGroup | null {
  if (!paragraph) return null;
  for (const group of state.groups.values()) {
    if (group.anchor.paragraph === paragraph) return group;
  }
  const slotId = resolveParagraphSlotId(paragraph);
  if (slotId) {
    const bySlot = state.groups.get(buildSlotGroupKey(slotId));
    if (bySlot) return bySlot;
  }
  return state.groups.get(buildTempGroupKey(Math.max(0, getGlobalParagraphIndex(paragraph)))) ?? null;
}

/**
 * 读取段落上已挂画廊组的 slot
 * @param state 画廊状态
 * @param paragraph 段落
 * @returns slotId 或 null
 */
function findGroupSlotOnParagraph(state: InlineGalleryState, paragraph: HTMLElement): string | null {
  return findGroupByParagraph(state, paragraph)?.slotId ?? null;
}

/**
 * 构建 groups map 键
 * @param slotId 位点 id
 * @param index 段落索引
 * @returns map key
 */
function buildGroupKey(slotId: string | null, index: number): string {
  return slotId ? buildSlotGroupKey(slotId) : buildTempGroupKey(index);
}

/** 构建 slot 画廊 key */
function buildSlotGroupKey(slotId: string): string {
  return `slot:${slotId}`;
}

/** 构建临时画廊 key */
function buildTempGroupKey(index: number): string {
  return `temp:${index}`;
}

/**
 * 清理画廊渲染器
 * @param state 画廊状态
 */
function cleanupGallery(state: InlineGalleryState): void {
  state.disposed = true;
  state.restoreToken += 1;
  disposeChatChangeRestore(state);
  state.messageRestorer?.dispose();
  state.messageRestorer = null;
  cleanupGalleryHosts(state);
}

/**
 * 清理所有画廊宿主与 Object URL
 * @param state 画廊状态
 */
function cleanupGalleryHosts(state: InlineGalleryState): void {
  state.groups.forEach(group => {
    render(null, group.host);
    group.host.remove();
  });
  state.groups.clear();
  state.objectUrls.forEach(url => URL.revokeObjectURL(url));
  state.objectUrls.clear();
}

/**
 * 释放图片 Object URL
 * @param state 画廊状态
 * @param item 画廊项
 */
function revokeItemObjectUrl(state: InlineGalleryState, item: InlineGalleryItem): void {
  if (!state.objectUrls.delete(item.objectUrl)) return;
  URL.revokeObjectURL(item.objectUrl);
}

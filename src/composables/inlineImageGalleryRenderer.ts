import type { InlinePromptSnapshot } from '@/composables/inlineImageLightbox';
import { cloneInlinePromptSnapshot } from '@/composables/inlineImageLightbox';
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
import {
  deleteInlineImageFavorite,
  listInlineImageFavorites,
  saveInlineImageFavorite,
  type InlineImageFavoriteListItem,
  type InlineImageFavoriteRecord,
} from '@/services/inline-image/favorites-cache';
import { getCurrentInlineFavoriteScope } from '@/services/sillytavern/chat-context';
import {
  findMessageId,
  getGlobalParagraphIndex,
  getInlineFavoriteAnchor,
  getMessageTextHash,
  getParagraphTextHash,
  type InlineFavoriteAnchor,
} from '@/services/sillytavern/chat-dom';
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
}

export interface InlineImageGalleryRenderer {
  getHost: (paragraph: HTMLElement) => HTMLElement | null;
  showGenerated: (paragraph: HTMLElement, result: InlineGeneratedImageResult) => void;
  restore: () => Promise<void>;
  cleanup: () => void;
}

interface InlineGalleryGroup {
  index: number;
  anchor: InlineFavoriteAnchor;
  host: HTMLElement;
  items: InlineGalleryItem[];
  activeItemId: string;
}

interface InlineGalleryState extends InlineGalleryRendererOptions {
  groups: Map<number, InlineGalleryGroup>;
  objectUrls: Set<string>;
  messageRestorer: InlineImageMessageRenderRestorer | null;
  restoreToken: number;
  nextTemporaryId: number;
  disposed: boolean;
}

/**
 * 创建聊天段落图片画廊渲染器
 * @param options 渲染依赖
 * @returns 画廊控制器
 */
export function createInlineImageGalleryRenderer(options: InlineGalleryRendererOptions): InlineImageGalleryRenderer {
  const state = createGalleryState(options);
  attachMessageRenderRestorer(state);
  void restoreGallery(state);
  return {
    getHost: paragraph => getGroupByParagraph(state, paragraph)?.host ?? null,
    showGenerated: (paragraph, result) => showGeneratedImage(state, paragraph, result),
    restore: () => restoreGallery(state),
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
    restoreToken: 0,
    nextTemporaryId: 1,
    disposed: false,
  };
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
    mergeFavoriteRecords: (index, anchor, records) => mergeFavoriteRecordsIntoGroup(state, index, anchor, records),
    readRecords: () => readFavoriteRecordsForCurrentScope(),
    remountGroups: anchors => remountRenderedGroups(state, anchors),
  });
}

/**
 * 从 IndexedDB 恢复当前聊天的收藏图
 * @param state 画廊状态
 */
async function restoreGallery(state: InlineGalleryState): Promise<void> {
  if (state.disposed) return;
  const token = state.restoreToken + 1;
  state.restoreToken = token;
  cleanupGalleryHosts(state);
  const scope = getCurrentInlineFavoriteScope();
  if (!scope) return;
  const records = await readFavoriteRecords(scope);
  if (state.disposed || token !== state.restoreToken) return;
  renderFavoriteRecords(state, records);
}

/**
 * 读取当前聊天作用域下的收藏记录
 * @returns 当前聊天收藏记录,作用域缺失时返回 null
 */
async function readFavoriteRecordsForCurrentScope(): Promise<InlineImageFavoriteListItem[] | null> {
  const scope = getCurrentInlineFavoriteScope();
  return scope ? readFavoriteRecords(scope) : null;
}

/**
 * 读取收藏记录
 * @param scope 当前收藏作用域
 * @returns 收藏记录列表
 */
async function readFavoriteRecords(
  scope: Parameters<typeof listInlineImageFavorites>[0],
): Promise<InlineImageFavoriteListItem[]> {
  try {
    return await listInlineImageFavorites(scope);
  } catch (error) {
    console.error('[CosmosVision] 读取段落图片收藏失败', error);
    toastr.error('读取段落图片收藏失败');
    return [];
  }
}

/**
 * 渲染恢复出的收藏记录
 * @param state 画廊状态
 * @param records 收藏记录
 */
function renderFavoriteRecords(state: InlineGalleryState, records: InlineImageFavoriteListItem[]): void {
  groupFavoriteRecords(records).forEach(group => {
    const anchor = getInlineFavoriteAnchor(group.index);
    if (!anchor) return;
    const items = group.records.map(record => createFavoriteItem(state, record));
    mountGroup(state, group.index, anchor, items, items[0]?.id ?? '');
  });
}

/**
 * 展示本次会话新生成的图片
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
  const anchor = getInlineFavoriteAnchor(index) ?? { target: paragraph, placement: 'after', paragraph };
  const item = createTemporaryItem(state, index, result);
  const group = ensureGroup(state, index, anchor);
  group.items = sortGalleryItems([item, ...group.items]);
  group.activeItemId = item.id;
  renderGroup(state, group);
}

/**
 * 创建恢复收藏项
 * @param state 画廊状态
 * @param record 收藏记录
 * @returns 画廊项
 */
function createFavoriteItem(state: InlineGalleryState, record: InlineImageFavoriteListItem): InlineGalleryItem {
  const objectUrl = URL.createObjectURL(record.imageBlob);
  state.objectUrls.add(objectUrl);
  return {
    id: `favorite-${record.id}`,
    favoriteId: record.id,
    globalParagraphIndex: record.globalParagraphIndex,
    imageBlob: record.imageBlob,
    mimeType: record.mimeType,
    objectUrl,
    promptSnapshot: record.promptSnapshot,
    createdAt: record.createdAt,
  };
}

/**
 * 创建会话临时生成项
 * @param state 画廊状态
 * @param index 段落索引
 * @param result 生成结果
 * @returns 画廊项
 */
function createTemporaryItem(
  state: InlineGalleryState,
  index: number,
  result: InlineGeneratedImageResult,
): InlineGalleryItem {
  const objectUrl = URL.createObjectURL(result.imageBlob);
  state.objectUrls.add(objectUrl);
  return {
    id: `temporary-${state.nextTemporaryId++}`,
    favoriteId: null,
    globalParagraphIndex: index,
    imageBlob: result.imageBlob,
    mimeType: result.imageBlob.type || 'image/png',
    objectUrl,
    promptSnapshot: result.promptSnapshot,
    createdAt: Date.now(),
  };
}

/**
 * 合并收藏记录到已有或新建的画廊组
 * @param state 画廊状态
 * @param index 全局段落索引
 * @param anchor 当前段落锚点
 * @param records 收藏记录
 */
function mergeFavoriteRecordsIntoGroup(
  state: InlineGalleryState,
  index: number,
  anchor: InlineFavoriteAnchor,
  records: InlineImageFavoriteListItem[],
): void {
  const group = ensureGroup(state, index, anchor);
  const items = records
    .filter(record => !hasFavoriteItem(group, record.id))
    .map(record => createFavoriteItem(state, record));
  if (!items.length) return;
  group.items = sortGalleryItems([...group.items, ...items]);
  group.activeItemId = group.activeItemId || group.items[0]?.id || '';
  renderGroup(state, group);
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
 * 确保指定段落索引存在画廊组
 * @param state 画廊状态
 * @param index 段落索引
 * @param anchor 挂载锚点
 * @returns 画廊组
 */
function ensureGroup(state: InlineGalleryState, index: number, anchor: InlineFavoriteAnchor): InlineGalleryGroup {
  const existing = state.groups.get(index);
  if (existing) return existing;
  return mountGroup(state, index, anchor, [], '');
}

/**
 * 挂载一个画廊组
 * @param state 画廊状态
 * @param index 段落索引
 * @param anchor 挂载锚点
 * @param items 初始图片项
 * @param activeItemId 当前焦点项
 * @returns 画廊组
 */
function mountGroup(
  state: InlineGalleryState,
  index: number,
  anchor: InlineFavoriteAnchor,
  items: InlineGalleryItem[],
  activeItemId: string,
): InlineGalleryGroup {
  const host = createGalleryHost(state, anchor);
  const group = { index, anchor, host, items: sortGalleryItems(items), activeItemId };
  state.groups.set(index, group);
  renderGroup(state, group);
  return group;
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
  const vnode = h(InlineGalleryGroupView, buildGroupProps(state, group));
  if (state.appContext) vnode.appContext = state.appContext;
  render(vnode, group.host);
}

/**
 * 重挂已存在的消息内画廊组
 * @param state 画廊状态
 * @param anchors 当前消息的段落锚点
 */
function remountRenderedGroups(state: InlineGalleryState, anchors: Map<number, InlineFavoriteAnchor>): void {
  state.groups.forEach(group => {
    const anchor = anchors.get(group.index);
    if (anchor) remountGroupIfNeeded(state, group, anchor);
  });
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
  if (group.host.isConnected && group.anchor.paragraph === anchor.paragraph) return;
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
    toggleFavorite: item => void toggleFavorite(state, group, item),
    removeItem: item => void removeItem(state, group, item),
    generateLast: item => void generateLast(state, group, item),
    generateFresh: () => void generateFresh(state, group),
  };
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
    if (wasFavorited) await unsetFavorite(item);
    else item.favoriteId = await saveFavoriteItem(group, item);
    syncFavoriteButtons(group.host, item);
    toastr.success(wasFavorited ? '已取消收藏' : '已收藏图片');
  } catch (error) {
    console.error('[CosmosVision] 切换段落图片收藏失败', error);
    toastr.error('切换段落图片收藏失败');
  }
}

/**
 * 取消收藏但保留当前会话图片
 * @param item 画廊项
 */
async function unsetFavorite(item: InlineGalleryItem): Promise<void> {
  if (!item.favoriteId) return;
  await deleteInlineImageFavorite(item.favoriteId);
  item.favoriteId = null;
}

/**
 * 保存画廊项为收藏
 * @param group 画廊组
 * @param item 画廊项
 * @returns 收藏 ID
 */
async function saveFavoriteItem(group: InlineGalleryGroup, item: InlineGalleryItem): Promise<number> {
  item.createdAt = Date.now();
  const record = buildFavoriteRecord(group, item);
  if (!record) throw new Error('当前角色或聊天未就绪，暂时无法收藏图片');
  return saveInlineImageFavorite(record);
}

/**
 * 构建 IndexedDB 收藏记录
 * @param group 画廊组
 * @param item 画廊项
 * @returns 收藏记录或 null
 */
function buildFavoriteRecord(
  group: InlineGalleryGroup,
  item: InlineGalleryItem,
): Omit<InlineImageFavoriteRecord, 'id'> | null {
  const scope = getCurrentInlineFavoriteScope();
  const paragraph = group.anchor.paragraph;
  if (!scope || !paragraph) return null;
  return {
    ...scope,
    globalParagraphIndex: item.globalParagraphIndex,
    mesId: findMessageId(paragraph) ?? undefined,
    paragraphTextHash: getParagraphTextHash(paragraph),
    messageTextHash: getMessageTextHash(paragraph),
    imageBlob: item.imageBlob,
    mimeType: item.mimeType,
    promptSnapshot: cloneInlinePromptSnapshot(item.promptSnapshot),
    createdAt: item.createdAt,
  };
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
    if (item.favoriteId) await deleteInlineImageFavorite(item.favoriteId);
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
  group.items = group.items.filter(candidate => candidate.id !== item.id);
  revokeItemObjectUrl(state, item);
  group.activeItemId = group.items[0]?.id ?? '';
  if (!group.items.length) removeGroup(state, group);
  else renderGroup(state, group);
}

/**
 * 删除空画廊组
 * @param state 画廊状态
 * @param group 画廊组
 */
function removeGroup(state: InlineGalleryState, group: InlineGalleryGroup): void {
  render(null, group.host);
  group.host.remove();
  state.groups.delete(group.index);
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
 * 更新单个收藏按钮视觉状态: 直接切换星标 SVG 的填充色(灰/金)
 * @param button 收藏按钮
 * @param active 是否已收藏
 */
function updateFavoriteButton(button: HTMLButtonElement, active: boolean): void {
  button.title = active ? '取消收藏' : '收藏图片';
  button.setAttribute('aria-label', button.title);
  const star = button.querySelector('.cv-inline-favorite-star');
  star?.setAttribute('fill', active ? '#f5b301' : '#9ca3af');
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
 * 按段落索引聚合收藏记录
 * @param records 收藏记录
 * @returns 聚合结果
 */
function groupFavoriteRecords(records: InlineImageFavoriteListItem[]): Array<{
  index: number;
  records: InlineImageFavoriteListItem[];
}> {
  const groups = new Map<number, InlineImageFavoriteListItem[]>();
  records.forEach(record =>
    groups.set(record.globalParagraphIndex, [...(groups.get(record.globalParagraphIndex) ?? []), record]),
  );
  return Array.from(groups.entries()).map(([index, items]) => ({
    index,
    records: sortFavoriteRecords(items),
  }));
}

/**
 * 按收藏时间从新到旧排序
 * @param records 收藏记录
 * @returns 排序记录
 */
function sortFavoriteRecords(records: InlineImageFavoriteListItem[]): InlineImageFavoriteListItem[] {
  return [...records].sort((left, right) => right.createdAt - left.createdAt);
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
 * 按段落读取画廊组
 * @param state 画廊状态
 * @param paragraph 段落元素
 * @returns 画廊组或 null
 */
function getGroupByParagraph(state: InlineGalleryState, paragraph: HTMLElement): InlineGalleryGroup | null {
  return state.groups.get(getGlobalParagraphIndex(paragraph)) ?? null;
}

/**
 * 清理画廊渲染器
 * @param state 画廊状态
 */
function cleanupGallery(state: InlineGalleryState): void {
  state.disposed = true;
  state.restoreToken += 1;
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

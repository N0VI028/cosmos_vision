import { event_types, eventSource } from '@sillytavern/scripts/extensions';
import { v4 as uuidv4 } from 'uuid';
import { markRaw, ref, watch } from 'vue';
import {
  appendGeneratedSessionItem,
  clearAllGallerySessions,
  createSessionItemId,
  type GallerySessionItem,
  type GallerySessionRecord,
  persistGallerySessionItem,
  restoreGallerySessions,
} from '@/composables/inlineGallerySession';
import { pruneTemporaryImages } from '@/services/inline-image/temporary-images';
import {
  findRenderContainerAfter,
  removeRenderContainer,
} from '@/services/inline-image/cv-render-container';
import {
  pickGalleryMounts,
  pickMountFromFloorTailSession,
  pickMountFromSession,
  type GalleryMountSpec,
} from '@/services/inline-image/slot-gallery-pick';
import {
  ensureSlotShortcodeOnParagraph,
  resolveParagraphSlotId,
} from '@/services/inline-image/slot-bind';
import { ensureSlotRenderContainerForParagraph } from '@/services/inline-image/cv-render-container';
import { getCurrentInlineFavoriteScope } from '@/services/sillytavern/chat-context';
import { type InlineFavoriteAnchor } from '@/services/sillytavern/chat-dom';
import { useSettingsStore } from '@/store/settings';

declare const toastr: any;

/** 单张临时图入参 */
export interface InlineGeneratedImageResult {
  imageBlob: Blob;
  promptSnapshot: string;
}

/** 单个位点类型互换就地补丁 */
export interface GalleryKindPatch {
  kind: 'card' | 'gallery';
  imageIndex: number;
}

/** 挂载项运行时状态 */
export interface GalleryMountRuntime {
  key: string;
  messageId: number;
  element: HTMLElement;
  mountKey: GalleryMountSpec['mountKey'];
  /** 就地生成的单图项（优先于会话数据直接渲染） */
  generatedItem: GallerySessionItem | null;
  /** 就地类型互换补丁 */
  kindPatch: GalleryKindPatch | null;
  anchor: InlineFavoriteAnchor;
}

/** 单楼层运行时汇总 */
export interface GalleryMessageRuntime {
  message_id: number;
  reload_memo: string;
  mounts: GalleryMountRuntime[];
}

/** 动作回调 */
export interface GalleryRuntimeHandlers {
  onGenerateMore: (anchor: InlineFavoriteAnchor) => void;
  onDownload: (anchor: InlineFavoriteAnchor) => void;
}

/** 事件串行队列项 */
type QueueJob =
  | { kind: 'chatLoaded' }
  | { kind: 'rerenderAll'; clearSessions: boolean }
  | { kind: 'floor'; messageId: number }
  | { kind: 'audit' };

/** 全局单例 state */
const runtimes = ref<GalleryMessageRuntime[]>([]);
const themeToken = ref(0);
let started = false;
let disposed = false;
let handlers: GalleryRuntimeHandlers | null = null;

let queueTail: Promise<void> = Promise.resolve();

/**
 * 集中管理画廊挂载实例与会话
 */
export function useGalleryRuntimes() {
  const settingsStore = useSettingsStore();

  /**
   * 启动画廊挂载运行时
   */
  function start(): void {
    if (started) return;
    started = true;
    disposed = false;
    bindEvents();
    scheduleRestore();
  }

  /**
   * 清理运行时
   */
  function cleanup(): void {
    disposed = true;
    started = false;
    unbindEvents();
    clearRuntimesOnly();
  }

  /**
   * 注册动作回调
   */
  function setHandlers(nextHandlers: GalleryRuntimeHandlers): void {
    handlers = nextHandlers;
  }

  /**
   * 获取动作回调
   */
  function getActionHandlers(): GalleryRuntimeHandlers | null {
    return handlers;
  }

  /**
   * 触发重绘（例如主题色改变）
   */
  function bumpThemeToken(): void {
    themeToken.value += 1;
  }

  /**
   * 全量恢复
   */
  async function restoreAll(): Promise<void> {
    await enqueue(() => runJob({ kind: 'rerenderAll', clearSessions: false }));
  }

  /**
   * 对指定 slot 下发类型互换就地补丁（不拆 DOM、不重建 objectUrl）
   * @param slotId 短码位点
   * @param patch 补丁
   */
  function patchSlotKind(slotId: string, patch: GalleryKindPatch): void {
    if (!slotId || disposed || !settingsStore.savedSettings.enabled) return;
    runtimes.value
      .flatMap(runtime => runtime.mounts)
      .filter(mount => mount.mountKey.slotId === slotId)
      .forEach(mount => {
        mount.kindPatch = { ...patch };
      });
  }

  /**
   * 展示新生成的临时图
   * @param paragraph 锚点段落
   * @param result 生成结果
   */
  async function showGenerated(paragraph: HTMLElement, result: InlineGeneratedImageResult): Promise<void> {
    if (disposed || !settingsStore.savedSettings.enabled) return;
    const slotId = resolveParagraphSlotId(paragraph) ?? newSlotId();
    await ensureSlotShortcodeOnParagraph(paragraph, slotId);
    const item: GallerySessionItem = {
      id: createSessionItemId(),
      favoriteId: null,
      slotId,
      imageBlob: result.imageBlob,
      promptSnapshot: result.promptSnapshot,
      createdAt: Date.now(),
    };
    const session = appendGeneratedSessionItem(slotId, item);
    ensureSlotRenderContainerForParagraph(paragraph, slotId);
    upsertSessionMount(session, paragraph);
    const scope = getCurrentInlineFavoriteScope();
    if (!scope) {
      console.warn('[CosmosVision] 当前聊天不可用，临时图片仅保留在内存中');
      return;
    }
    void persistGallerySessionItem(session, item, scope, settingsStore.savedSettings.temporaryImageLimit)
      .then(removedIds => removePrunedMounts(removedIds))
      .catch(error => {
        console.error('[CosmosVision] 临时图片持久化失败', error);
        toastr?.error?.('临时图片保存失败');
      });
  }

  /**
   * 展示新生成的前端型楼层尾/组件尾临时图并返回持久化后的图片 ID
   * @param mesId 消息楼层 ID
   * @param swipeId 当前 swipe ID
   * @param slotId 楼层尾 slotId
   * @param result 生成结果
   * @param targetAnchor 可选的目标 iframe 或组件元素（用于精准就近插入）
   * @returns 持久化成功且未被数量限制淘汰时返回图片 ID，否则返回 null
   */
  async function showGeneratedFloorTail(
    mesId: number,
    swipeId: number,
    slotId: string,
    result: InlineGeneratedImageResult,
    targetAnchor?: HTMLElement,
  ): Promise<string | null> {
    if (disposed || !settingsStore.savedSettings.enabled) return null;
    const item: GallerySessionItem = {
      id: createSessionItemId(),
      favoriteId: null,
      slotId,
      imageBlob: result.imageBlob,
      promptSnapshot: result.promptSnapshot,
      createdAt: Date.now(),
    };
    const session = appendGeneratedSessionItem(slotId, item);
    upsertFloorTailSessionMount(session, mesId, swipeId, targetAnchor);
    const scope = getCurrentInlineFavoriteScope();
    if (!scope) {
      console.warn('[CosmosVision] 当前聊天不可用，临时图片仅保留在内存中');
      return item.id;
    }
    try {
      const removedIds = await persistGallerySessionItem(session, item, scope, settingsStore.savedSettings.temporaryImageLimit);
      removePrunedMounts(removedIds);
      return removedIds.includes(item.id) ? null : item.id;
    } catch (error) {
      console.error('[CosmosVision] 临时图片持久化失败', error);
      toastr?.error?.('临时图片保存失败');
      return null;
    }
  }

  /** 从 IndexedDB 恢复当前聊天临时图片 */
  function scheduleRestore(): void {
    void enqueue(async () => {
      const scope = getCurrentInlineFavoriteScope();
      clearAllGallerySessions();
      await pruneTemporaryImages(settingsStore.savedSettings.temporaryImageLimit);
      if (scope) await restoreGallerySessions(scope);
      await runJob({ kind: 'rerenderAll', clearSessions: false });
    });
  }

  /**
   * 移除因数量限制被淘汰的运行时挂载
   * @param removedIds 被淘汰图片 ID
   */
  function removePrunedMounts(removedIds: string[]): void {
    if (!removedIds.length) return;
    scheduleJob({ kind: 'rerenderAll', clearSessions: false });
  }

  /**
   * 读取段落 after 或楼层尾的生成蒙版宿主
   * @param target 段落或楼层元素
   * @returns 宿主容器或 null
   */
  function getHost(target: HTMLElement): HTMLElement | null {
    const container = findRenderContainerAfter(target)
      ?? (target.classList.contains('cv-render') ? target : target.querySelector('.cv-render'));
    if (!container) return null;
    return container.querySelector('.cv-inline-generation-overlay-shell')
      ?? container.querySelector('.cv-inline-img-wrap')
      ?? container;
  }

  /**
   * 绑定 ST 聊天事件
   */
  function bindEvents(): void {
    // 依靠 chatLoaded 事件进行初始化，不监听 CHAT_CHANGED 以防御重复清空问题
    eventSource.makeLast('chatLoaded', onChatLoaded);
    eventSource.makeLast(event_types.MORE_MESSAGES_LOADED, onMoreMessages);
    eventSource.makeLast(event_types.MESSAGE_DELETED, onMessageDeleted);
    for (const event of [
      event_types.CHARACTER_MESSAGE_RENDERED,
      event_types.USER_MESSAGE_RENDERED,
      event_types.MESSAGE_UPDATED,
      event_types.MESSAGE_SWIPED,
    ]) {
      eventSource.makeLast(event, onMessageFloor);
    }
  }

  /**
   * 解除全部事件
   */
  function unbindEvents(): void {
    eventSource.removeListener('chatLoaded', onChatLoaded);
    eventSource.removeListener(event_types.MORE_MESSAGES_LOADED, onMoreMessages);
    eventSource.removeListener(event_types.MESSAGE_DELETED, onMessageDeleted);
    for (const event of [
      event_types.CHARACTER_MESSAGE_RENDERED,
      event_types.USER_MESSAGE_RENDERED,
      event_types.MESSAGE_UPDATED,
      event_types.MESSAGE_SWIPED,
    ]) {
      eventSource.removeListener(event, onMessageFloor);
    }
  }

  /**
   * 把事件任务加入串行队列
   * @param job 待执行工作
   */
  function scheduleJob(job: QueueJob): void {
    if (disposed) return;
    void enqueue(() => runJob(job));
  }

  /**
   * 执行单个队列任务
   * @param job 队列项
   */
  async function runJob(job: QueueJob): Promise<void> {
    if (disposed) return;
    switch (job.kind) {
      case 'chatLoaded':
        await onChatLoadedJob();
        break;
      case 'rerenderAll':
        await rerenderAll();
        break;
      case 'floor':
        await applyFloor(job.messageId);
        break;
      case 'audit':
        await auditVisibleMessages();
        break;
    }
  }

  /**
   * 聊天加载完成工作：恢复 IDB，并重扫整屏
   */
  async function onChatLoadedJob(): Promise<void> {
    if (disposed || !settingsStore.savedSettings.enabled) return;
    const scope = getCurrentInlineFavoriteScope();
    clearAllGallerySessions();
    if (scope) {
      await pruneTemporaryImages(settingsStore.savedSettings.temporaryImageLimit);
      await restoreGallerySessions(scope);
    }
    await rerenderAll();
  }

  /**
   * 差异审计可视楼层（用于滚动加载/零星更新）
   */
  async function auditVisibleMessages(): Promise<void> {
    if (disposed || !settingsStore.savedSettings.enabled) return;
    const toRender = listVisibleMessageIds();
    const keep = runtimes.value.filter(runtime =>
      toRender.includes(runtime.message_id) && document.querySelector(`#chat > .mes[mesid="${runtime.message_id}"]`),
    );
    const missing = toRender.filter(id => !keep.some(runtime => runtime.message_id === id));
    const added = await buildRuntimes(missing);
    if (disposed) return;
    runtimes.value = [...keep, ...added];
  }

  /**
   * 全量重建 runtime 列表
   */
  async function rerenderAll(): Promise<void> {
    if (disposed) return;
    if (!settingsStore.savedSettings.enabled) {
      runtimes.value = [];
      return;
    }
    removeAllRenderContainers();
    runtimes.value = [];
    if (!getCurrentInlineFavoriteScope()) return;
    const added = await buildRuntimes(listVisibleMessageIds());
    if (disposed) return;
    runtimes.value = added;
  }

  /**
   * 重扫单楼（synchronous 串行路径）
   * @param messageId 楼层
   */
  async function applyFloor(messageId: number): Promise<void> {
    if (disposed || !settingsStore.savedSettings.enabled) return;
    dropFloorRuntime(messageId);
    const built = await buildRuntimes([messageId]);
    if (disposed) return;
    const others = runtimes.value.filter(runtime => runtime.message_id !== messageId);
    runtimes.value = built.length ? [...others, ...built] : others;
  }

  /**
   * 从 runtime 列表剔除某楼（不删会话）
   * @param messageId 楼层
   */
  function dropFloorRuntime(messageId: number): void {
    runtimes.value = runtimes.value.filter(runtime => runtime.message_id !== messageId);
    document
      .querySelectorAll(`#chat > .mes[mesid="${messageId}"] .cv-render`)
      .forEach(removeRenderContainer);
  }

  /**
   * 把生成会话写入 / 更新楼层 runtime
   * @param session 会话
   * @param paragraph 段落
   */
  function upsertSessionMount(session: GallerySessionRecord, paragraph: HTMLElement): void {
    const mount = pickMountFromSession(session, paragraph);
    if (!mount) return;
    const messageId = mount.messageId;
    const existing = runtimes.value.find(runtime => runtime.message_id === messageId);
    if (!existing) {
      runtimes.value = [
        ...runtimes.value,
        {
          message_id: messageId,
          reload_memo: createReloadMemo(),
          mounts: [toMountRuntime(mount)],
        },
      ];
      return;
    }
    const current = existing.mounts.find(item => item.key === mount.key || item.element === mount.element);
    if (current) {
      current.mountKey = mount.mountKey;
      current.anchor = toMountRuntime(mount).anchor;
      current.generatedItem = session.items[0] ?? null;
      return;
    }
    existing.mounts.push(toMountRuntime(mount));
  }

  /**
   * 把前端型生成会话写入 / 更新楼层 runtime
   * @param session 会话
   * @param mesId 消息楼层 ID
   * @param swipeId 当前 swipe ID
   * @param targetAnchor 可选目标 iframe 或组件元素
   */
  function upsertFloorTailSessionMount(
    session: GallerySessionRecord,
    mesId: number,
    swipeId: number,
    targetAnchor?: HTMLElement,
  ): void {
    const mount = pickMountFromFloorTailSession(session, mesId, swipeId, targetAnchor);
    const existing = runtimes.value.find(runtime => runtime.message_id === mesId);
    if (!existing) {
      runtimes.value = [
        ...runtimes.value,
        {
          message_id: mesId,
          reload_memo: createReloadMemo(),
          mounts: [toMountRuntime(mount)],
        },
      ];
      return;
    }
    const current = existing.mounts.find(item => item.key === mount.key || item.element === mount.element);
    if (current) {
      current.mountKey = mount.mountKey;
      current.anchor = toMountRuntime(mount).anchor;
      current.generatedItem = session.items[0] ?? null;
      return;
    }
    existing.mounts.push(toMountRuntime(mount));
  }

  /**
   * 摘掉空 mount 并可能移除空壳容器
   * @param key mount key
   * @param messageId 楼层
   */
  function removeMount(key: string, messageId: number): void {
    const runtime = runtimes.value.find(item => item.message_id === messageId);
    if (!runtime) return;
    const mount = runtime.mounts.find(item => item.key === key);
    runtime.mounts = runtime.mounts.filter(item => item.key !== key);
    const orphan = Boolean(mount?.element.isConnected)
      && !runtime.mounts.some(item => item.element === mount?.element);
    if (orphan && mount?.element) {
      removeRenderContainer(mount.element);
    }
    if (!runtime.mounts.length) {
      runtimes.value = runtimes.value.filter(item => item.message_id !== messageId);
    }
  }

  /** 仅清空前端 runtime 视图（保留 IndexedDB 会话数据） */
  function clearRuntimesOnly(): void {
    removeAllRenderContainers();
    runtimes.value = [];
  }

  function onChatLoaded(): void {
    scheduleJob({ kind: 'chatLoaded' });
  }

  function onMoreMessages(): void {
    scheduleJob({ kind: 'audit' });
  }

  function onMessageDeleted(_rawId: unknown): void {
    scheduleJob({ kind: 'audit' });
  }

  function onMessageFloor(rawId: unknown): void {
    const id = normalizeMessageId(rawId);
    if (id === null) return;
    scheduleJob({ kind: 'floor', messageId: id });
  }

  function newSlotId(): string {
    return uuidv4();
  }

  return {
    runtimes,
    themeToken,
    start,
    cleanup,
    setHandlers,
    getActionHandlers,
    bumpThemeToken,
    restoreAll,
    patchSlotKind,
    showGenerated,
    showGeneratedFloorTail,
    removeMount,
    getHost,
  };
}

export const useGalleryRuntimesStore = useGalleryRuntimes;

/**
 * 串行任务排队包装
 * @param task 异步任务
 */
function enqueue(task: () => Promise<void>): Promise<void> {
  queueTail = queueTail
    .catch(() => {})
    .then(async () => {
      await task();
    });
  return queueTail;
}

/**
 * 批量 build 楼层 runtime
 * @param messageIds 楼层集合
 * @returns runtimes
 */
async function buildRuntimes(messageIds: number[]): Promise<GalleryMessageRuntime[]> {
  if (!messageIds.length) return [];
  try {
    const mounts = await pickGalleryMounts(messageIds);
    const byMessage = new Map<number, GalleryMountRuntime[]>();
    for (const mount of mounts) {
      const list = byMessage.get(mount.messageId) ?? [];
      list.push(toMountRuntime(mount));
      byMessage.set(mount.messageId, list);
    }
    return [...byMessage.entries()].map(([message_id, items]) => ({
      message_id,
      reload_memo: createReloadMemo(),
      mounts: items,
    }));
  } catch (error) {
    console.error('[CosmosVision] 扫描画廊 runtime 失败', error);
    toastr?.error?.('读取段落图片收藏失败');
    return [];
  }
}

/**
 * GalleryMountSpec → runtime mount
 * @param mount 挂载规格
 * @returns runtime
 */
function toMountRuntime(mount: GalleryMountSpec): GalleryMountRuntime {
  return {
    key: mount.key,
    messageId: mount.messageId,
    element: markRaw(mount.element),
    mountKey: mount.mountKey,
    generatedItem: null,
    kindPatch: null,
    anchor: {
      ...mount.anchor,
      target: markRaw(mount.anchor.target),
      paragraph: mount.anchor.paragraph ? markRaw(mount.anchor.paragraph) : null,
    },
  };
}

/**
 * 当前 DOM 可见 mes id 列表
 * @returns ids
 */
function listVisibleMessageIds(): number[] {
  return Array.from(document.querySelectorAll('#chat > .mes'))
    .map(div => Number(div.getAttribute('mesid')))
    .filter(id => Number.isFinite(id));
}

/**
 * 规范化事件 message id
 * @param messageId 原始值
 * @returns number 或 null
 */
function normalizeMessageId(messageId: unknown): number | null {
  if (typeof messageId === 'number' && Number.isFinite(messageId)) return messageId;
  if (typeof messageId === 'string' && messageId.trim()) {
    const value = Number(messageId);
    return Number.isFinite(value) ? value : null;
  }
  return null;
}

/**
 * 生成 reload_memo
 * @returns uuid
 */
function createReloadMemo(): string {
  return uuidv4();
}

/**
 * 移除全部 cv-render 容器
 */
function removeAllRenderContainers(): void {
  document.querySelectorAll('#chat .cv-render').forEach(removeRenderContainer);
}

import { uuidv4 } from '@sillytavern/scripts/utils';
import {
  pickGalleryMounts,
  pickMountFromSession,
  type GalleryMountSpec,
} from '@/services/inline-image/slot-gallery-pick';
import {
  appendGeneratedSessionItem,
  clearAllGallerySessions,
  createSessionItemId,
  type GallerySessionItem,
  type GallerySessionRecord,
} from '@/composables/inlineGallerySession';
import type { InlineGeneratedImageResult } from '@/composables/inlineImageGeneratedResult';
import {
  findRenderContainerAfter,
  removeRenderContainer,
} from '@/services/inline-image/cv-render-container';
import { getCurrentInlineFavoriteScope } from '@/services/sillytavern/chat-context';
import { consumeSilentMessageWrite } from '@/services/inline-image/message-raw';
import type { InlineFavoriteAnchor } from '@/services/sillytavern/chat-dom';
import { event_types, eventSource } from '@sillytavern/script';
import { useSettingsStore } from '@/store/settings';

/** 单画廊 mount 运行时 */
export interface GalleryMountRuntime {
  key: string;
  messageId: number;
  element: HTMLElement;
  mountKey: GalleryMountSpec['mountKey'];
  anchor: InlineFavoriteAnchor;
  generatedItem: GallerySessionItem | null;
}

/** 楼层粒度 runtime（对标 TH message runtime） */
export interface GalleryMessageRuntime {
  message_id: number;
  reload_memo: string;
  mounts: GalleryMountRuntime[];
}

export type { InlineGeneratedImageResult };

interface GalleryRuntimeHandlers {
  onGenerateWithSnapshot: (
    paragraph: HTMLElement,
    snapshot: GallerySessionItem['promptSnapshot'],
  ) => Promise<void>;
  onGenerateWithFreshPrompt: (paragraph: HTMLElement) => Promise<void>;
  onGenerateWithEditablePrompt: (
    paragraph: HTMLElement,
    snapshot: GallerySessionItem['promptSnapshot'],
  ) => Promise<void>;
  onDownloadImage: (imageBlob: Blob, createdAt: number) => Promise<void>;
}

type PendingJob =
  | { kind: 'audit' }
  | { kind: 'rerenderAll'; clearSessions: boolean }
  | { kind: 'floor'; messageId: number };

/**
 * 段落画廊 runtime store：扫短码 / temp → cv-render → Teleport
 * 事件与幂等策略对齐酒馆助手 message iframe runtime，异步任务串行防重入
 */
export const useGalleryRuntimesStore = defineStore('cosmos_vision_gallery_runtimes', () => {
  const settingsStore = useSettingsStore();
  const runtimes = ref<GalleryMessageRuntime[]>([]);
  const themeToken = ref(0);
  let handlers: GalleryRuntimeHandlers | null = null;
  let disposed = false;
  let started = false;
  let chain: Promise<void> = Promise.resolve();

  const onChatChanged = () => {
    // ST 换聊会先 CHAT_CHANGED；DOM 全量扫留给 chatLoaded / 单楼事件（TH 同款）
    clearAllGallerySessions();
    clearRuntimesOnly();
  };
  const onChatLoaded = () => scheduleJob({ kind: 'rerenderAll', clearSessions: true });
  const onMoreMessages = () => scheduleJob({ kind: 'audit' });
  const onMessageDeleted = () => scheduleJob({ kind: 'audit' });
  const onMessageFloor = (messageId: unknown) => {
    const id = normalizeMessageId(messageId);
    if (id === null) return;
    const silentWrite = consumeSilentMessageWrite(id);
    if (silentWrite) return;
    scheduleJob({ kind: 'floor', messageId: id });
  };

  watch(
    () => settingsStore.savedSettings.enabled,
    enabled => {
      if (!started || disposed) return;
      if (enabled) scheduleJob({ kind: 'rerenderAll', clearSessions: false });
      else clearRuntimesOnly();
    },
  );

  /**
   * 注入生成/下载回调
   * @param next 回调集合
   */
  function setHandlers(next: GalleryRuntimeHandlers): void {
    handlers = next;
  }

  /**
   * 读取动作回调
   * @returns handlers 或 null
   */
  function getActionHandlers(): GalleryRuntimeHandlers | null {
    return handlers;
  }

  /**
   * 启动事件监听并首次全量 scan
   */
  function start(): void {
    if (started) return;
    started = true;
    disposed = false;
    bindEvents();
    scheduleJob({ kind: 'rerenderAll', clearSessions: false });
  }

  /**
   * 清理监听、容器与会话
   */
  function cleanup(): void {
    disposed = true;
    started = false;
    unbindEvents();
    removeAllRenderContainers();
    runtimes.value = [];
    clearAllGallerySessions();
    handlers = null;
  }

  /**
   * 仅清空运行时 DOM（关插件，保留会话与监听）
   */
  function clearRuntimesOnly(): void {
    removeAllRenderContainers();
    runtimes.value = [];
  }

  /**
   * 刷新主题 token
   */
  function refreshTheme(): void {
    themeToken.value += 1;
  }

  /**
   * 全量恢复
   */
  async function restoreAll(): Promise<void> {
    await enqueue(() => runJob({ kind: 'rerenderAll', clearSessions: false }));
  }

  /**
   * 展示新生成的临时图
   * @param paragraph 锚点段落
   * @param result 生成结果
   */
  function showGenerated(paragraph: HTMLElement, result: InlineGeneratedImageResult): void {
    if (disposed || !settingsStore.savedSettings.enabled) return;
    const item: GallerySessionItem = {
      id: createSessionItemId(),
      favoriteId: null,
      slotId: null,
      imageBlob: result.imageBlob,
      promptSnapshot: result.promptSnapshot,
      createdAt: Date.now(),
    };
    const session = appendGeneratedSessionItem(paragraph, item);
    upsertSessionMount(session, paragraph);
  }

  /**
   * 读取段落 after 的图片包裹容器，优先精确至大图舞台或单图包裹层以支持 overlay 毛玻璃蒙版
   * @param paragraph 段落
   * @returns 宿主容器或 null
   */
  function getHost(paragraph: HTMLElement): HTMLElement | null {
    const container = findRenderContainerAfter(paragraph);
    if (!container) return null;
    return container.querySelector('.cv-inline-favorite-stage') ??
      container.querySelector('.cv-inline-img-wrap') ??
      container;
  }

  /**
   * 绑定 ST 聊天事件
   */
  function bindEvents(): void {
    // 对标 TH：全量靠 chatLoaded；CHAT_CHANGED 只清会话，避免与随后 RENDERED 叠扫
    eventSource.makeLast(event_types.CHAT_CHANGED, onChatChanged);
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
    eventSource.removeListener(event_types.CHAT_CHANGED, onChatChanged);
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
  function scheduleJob(job: PendingJob): void {
    if (disposed) return;
    void enqueue(() => runJob(job));
  }

  /**
   * 串行执行异步工作，避免 auditToken 互废
   * @param task 任务
   */
  function enqueue(task: () => Promise<void>): Promise<void> {
    const run = chain.then(task, task);
    chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  /**
   * 执行合并后的单次 job
   * @param job 合并结果
   */
  async function runJob(job: PendingJob): Promise<void> {
    if (disposed) return;
    if (job.kind === 'rerenderAll') {
      if (job.clearSessions) clearAllGallerySessions();
      await rerenderAll();
      return;
    }
    if (job.kind === 'floor') {
      await applyFloor(job.messageId);
      return;
    }
    await audit();
  }

  /**
   * 增量 audit：保留已有 runtime，补扫未渲染楼层
   */
  async function audit(): Promise<void> {
    if (disposed || !settingsStore.savedSettings.enabled) {
      runtimes.value = [];
      return;
    }
    if (!getCurrentInlineFavoriteScope()) return;
    const toRender = listVisibleMessageIds();
    const keep = runtimes.value.filter(runtime =>
      toRender.includes(runtime.message_id) && isRuntimeLive(runtime),
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
   * 将临时画廊 mount 原地升级为收藏 slot，避免整层重扫导致聊天 DOM 闪烁
   * @param key 当前 mount 键
   * @param messageId 楼层 id
   * @param slotId 收藏位点 id
   */
  function rekeyMountToSlot(key: string, messageId: number, slotId: string): void {
    const runtime = runtimes.value.find(item => item.message_id === messageId);
    const mount = runtime?.mounts.find(item => item.key === key);
    if (!runtime || !mount || mount.mountKey.kind === 'slot') return;
    mount.mountKey = { kind: 'slot', slotId };
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
    if (orphan) mount?.element.remove();
    if (!runtime.mounts.length) {
      runtimes.value = runtimes.value.filter(item => item.message_id !== messageId);
      return;
    }
    runtime.reload_memo = createReloadMemo();
  }

  return {
    runtimes,
    themeToken,
    setHandlers,
    getActionHandlers,
    start,
    cleanup,
    refreshTheme,
    restoreAll,
    showGenerated,
    getHost,
    removeMount,
    rekeyMountToSlot,
  };
});

/**
 * Runtime 挂载目标是否仍连在文档
 * @param runtime 楼层 runtime
 * @returns 是否可 keep
 */
function isRuntimeLive(runtime: GalleryMessageRuntime): boolean {
  return runtime.mounts.every(mount => mount.element.isConnected);
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
    toastr.error('读取段落图片收藏失败');
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

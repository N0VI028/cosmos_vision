import type { CosmosVisionSettings, PromptLlmContext } from '@/constants/novelai';
import {
  createInlineGenerationSessionController,
  type InlineGenerationSession,
} from '@/composables/inlineGenerationSession';
import { preventInlineEventBubbling } from '@/composables/inlineImageDom';
import type { InlinePromptSnapshot } from '@/composables/inlineImageLightbox';
import { useGalleryRuntimesStore, type GalleryGenerationContext } from '@/store/gallery-runtimes';
import { generateComfyUIImagesFromResolvedRequest } from '@/services/comfyui/api';
import { buildComfyUIResolvedRequest, getComfyUIRequestError } from '@/services/comfyui/workflow';
import {
  buildNovelAIResolvedRequest,
  buildNovelAIPromptOverrides,
  generateNovelAIImagesFromResolvedRequest,
} from '@/services/novelai/api';
import { createSelectionShellController } from '@/composables/inlineSelectionShell';
import { nextParagraphSelection } from '@/composables/inlineParagraphSelection';
import {
  buildPromptLlmContextFromParagraphs,
  findChatParagraph,
  findMessageId,
  getMessageSwipeId,
  sortChatParagraphsByDomOrder,
} from '@/services/sillytavern/chat-dom';
import {
  buildPromptLlmTriggerContext,
  generatePromptFromRuntimeContext,
} from '@/services/prompt-llm/runtime-request';
import { buildPromptLlmSchemaFields, getPromptLlmRequestError } from '@/services/tavern-helper/prompt-llm';
import { useSettingsStore } from '@/store/settings';
import { getCurrentInstance, ref } from 'vue';
import { downloadInlineImageBlob } from '@/services/inline-image/image-download-transform';
import {
  buildInlineImageDownloadBaseName,
  createComfyUISnapshot,
  createNovelAISnapshot,
} from '@/composables/inlineGenerationSnapshot';
import { resolveInlineRoute } from '@/services/inline-image/route-resolve';
import { resolveFrontendBubbleRoot } from '@/services/inline-image/frontend-text-extract';
import { ensureFloorTailHost } from '@/services/inline-image/floor-tail-host';
import { writeFloorTailSlot } from '@/services/inline-image/floor-tail-slot';
import { newSlotId } from '@/services/inline-image/slot-shortcode';
import { getHostIframe } from '@/services/inline-image/iframe-utils';
import { FrameRegistry } from '@/services/inline-image/frame-registry';
import {
  buildFrontendPromptContext,
  generateImagesFromSnapshot,
  persistFloorTailImages,
  resolveFloorTailRenderContext,
} from '@/composables/inlineImageGenerationRequests';
import {
  collectTemporaryVibeSourceHashes,
  type FreshPromptMode,
  hasPromotedTemporaryVibes,
  type InlineGenerationBatchResult,
  type InlineGenerationTask,
  type InlineImageGenerationOptions,
  type InlinePromptPairInputOptions,
  type InlinePromptPairInputValue,
  type InlineTextInputOptions,
  requestEditedPromptSnapshot,
  type SpecialRequestContext,
} from '@/composables/inlineGenerationInput';

export type { InlineTextInputOptions, InlinePromptPairInputOptions, InlinePromptPairInputValue, InlineImageGenerationOptions };
export type { InlineCharacterPromptDraft } from '@/composables/inlineEditableCharacterPrompt';
type PromptLlmSchemaFields = ReturnType<typeof buildPromptLlmSchemaFields>;
declare const toastr: any;

/**
 * 段落生图运行时控制器
 * 管理段落选中、生图按钮显隐、生成流程、临时图片插入与清理
 */
export function useInlineImageGeneration(
  settings: CosmosVisionSettings,
  options: InlineImageGenerationOptions,
) {
  const isRuntimeEnabled = options.isRuntimeEnabled ?? (() => true);
  const requestTextInput = options.requestTextInput;
  const requestPromptPairInput = options.requestPromptPairInput;
  const requestImageDownloadOptions = options.requestImageDownloadOptions;
  const settingsStore = useSettingsStore();
  /** 当前组件实例上下文,用于把 PrimeVue Button 渲染到聊天内联 DOM */
  const appContext = getCurrentInstance()?.appContext;
  /** 生成会话与取消控制 */
  const generationSession = createInlineGenerationSessionController({
    appContext,
    getDarkMode: options.getDarkMode,
  });
  /** 当前活动选区（同一消息内连续段落，DOM 序） */
  const selectedParagraphs = ref<HTMLElement[]>([]);
  /** 统一的同源 iframe 生命周期与手势注册表 */
  const frameRegistry = new FrameRegistry();
  /** 跟踪当前挂载了 pointerup 的文档（顶层或 iframe 文档） */
  let activePointerUpDoc: Document | null = null;
  /** 连续选区整体蒙版壳控制器 */
  const selectionShell = createSelectionShellController();

  /** 是否处于段落生图选择模式 */
  const isSelectionMode = ref(false);

  /** 当前段落生图上下文中的临时追加要求 */
  let specialRequestContext: SpecialRequestContext | null = null;
  /** TH 风格画廊 runtime（cv-render + Teleport） */
  const imageGallery = useGalleryRuntimesStore();
  imageGallery.setHandlers({
    onGenerateWithSnapshot: handleGenerateWithFavoriteSnapshot,
    onGenerateWithFreshPrompt: handleGenerateWithFreshPrompt,
    onGenerateWithEditablePrompt: handleGenerateWithEditablePrompt,
    onDownloadImage: handleDownloadImage,
  });
  imageGallery.start();

  /** 记录 pointerdown 的位置,用于区分点击和拖拽 */
  let pointerDownX = 0;
  let pointerDownY = 0;

  /**
   * 清理 pointerup / pointercancel 监听器，防止跨文档手势泄漏
   */
  function removeActivePointerUpListener(): void {
    if (activePointerUpDoc) {
      try {
        activePointerUpDoc.removeEventListener('pointerup', handleSelectionPointerUp, true);
        activePointerUpDoc.removeEventListener('pointercancel', handleSelectionPointerCancel, true);
      } catch {
        // 忽略已卸载的文档异常
      }
      activePointerUpDoc = null;
    }
    window.removeEventListener('pointerup', handleSelectionPointerUp, true);
    window.removeEventListener('pointercancel', handleSelectionPointerCancel, true);
  }

  /**
   * 处理手势取消
   */
  function handleSelectionPointerCancel(): void {
    removeActivePointerUpListener();
  }

  /**
   * 切换段落生图选择模式
   */
  function toggleSelectionMode(): void {
    if (isSelectionMode.value) {
      exitSelectionMode();
      return;
    }
    enterSelectionMode();
  }

  /**
   * 进入段落生图选择模式
   */
  function enterSelectionMode(): void {
    if (!isRuntimeEnabled() || isSelectionMode.value) return;
    isSelectionMode.value = true;
    document.addEventListener('pointerdown', handleSelectionPointerDown, true);
    document.addEventListener('pointerover', handleSelectionPointerOver, true);
    frameRegistry.bindPointerDown(handleSelectionPointerDown);
    frameRegistry.startObserving();
  }

  /**
   * 退出段落生图选择模式
   * @param options 退出选项
   */
  function exitSelectionMode(options: { preserveSelection?: boolean } = {}): void {
    document.removeEventListener('pointerdown', handleSelectionPointerDown, true);
    document.removeEventListener('pointerover', handleSelectionPointerOver, true);
    removeActivePointerUpListener();
    frameRegistry.destroy();

    isSelectionMode.value = false;
    if (!options.preserveSelection) clearSelection();
  }

  /**
   * 鼠标悬停到 iframe 元素时提前登记并刷新监听器
   * @param e 指针事件
   */
  function handleSelectionPointerOver(e: PointerEvent): void {
    const target = e.target;
    if (target instanceof HTMLIFrameElement) {
      frameRegistry.registerIframe(target);
    }
  }

  /**
   * 处理选择模式 pointerdown 事件
   * 在移动端焦点默认行为发生前拦截段落点击
   * @param e 指针事件
   */
  function handleSelectionPointerDown(e: PointerEvent): void {
    const target = e.target as HTMLElement;
    const inIframe = target.ownerDocument !== document;

    if (inIframe) {
      const iframe = target.ownerDocument.defaultView?.frameElement;
      if (iframe instanceof HTMLIFrameElement) {
        frameRegistry.registerIframe(iframe);
      }
    }

    if (!shouldHandleParagraphPointer(e)) return;

    pointerDownX = e.clientX;
    pointerDownY = e.clientY;
    e.preventDefault();
    removeActivePointerUpListener();
    const doc = target.ownerDocument ?? document;
    activePointerUpDoc = doc;
    doc.addEventListener('pointerup', handleSelectionPointerUp, { once: true, capture: true });
    doc.addEventListener('pointercancel', handleSelectionPointerCancel, { once: true, capture: true });
    if (doc !== document) {
      window.addEventListener('pointerup', handleSelectionPointerUp, { once: true, capture: true });
      window.addEventListener('pointercancel', handleSelectionPointerCancel, { once: true, capture: true });
    }
  }

  /**
   * 判断本次 pointer 事件是否应进入段落选择处理
   * @param e 指针事件
   * @returns 是否应处理
   */
  function shouldHandleParagraphPointer(e: PointerEvent): boolean {
    const target = e.target as HTMLElement;
    if (isIgnoredInlineTarget(target)) return false;
    const host = getHostIframe(target) ?? target;
    if (!host.closest('.mes_text, [mesid]')) return false;

    // 排除空容器：目标或其最近文本块祖先必须包含可见文本
    const textBlock = target.closest('p, div, span, section, article, li, blockquote') as HTMLElement | null;
    const hasText = textBlock && textBlock.textContent?.trim();
    return Boolean(hasText);
  }

  /**
   * 处理选择模式 pointerup 事件
   * 检查移动距离,仅处理短距离移动(真正的点击)
   * @param e 指针事件
   */
  function handleSelectionPointerUp(e: PointerEvent): void {
    if (!isRuntimeEnabled() || !isShortTap(e)) return;
    const target = e.target as HTMLElement;
    if (isIgnoredInlineTarget(target)) return;

    try {
      const route = resolveInlineRoute(target);
      if (route === 'classic-p') {
        const p = findChatParagraph(target);
        if (p) {
          e.preventDefault();
          setSelection(nextParagraphSelection(selectedParagraphs.value, p));
          return;
        }
      } else {
        const bubble = resolveFrontendBubbleRoot(target);
        e.preventDefault();
        setSelection(selectedParagraphs.value.includes(bubble) ? [] : [bubble]);
        return;
      }
    } catch (error) {
      toastr?.warning?.(error instanceof Error ? error.message : '选段失败');
      return;
    }

    // 点击聊天区空白处取消选中
    const host = getHostIframe(target) ?? target;
    if (host.closest('.mes_text, [mesid]')) {
      clearSelection();
    }
  }

  /**
   * 判断目标是否应跳过段落选择
   * @param target 事件目标
   * @returns 是否跳过
   */
  function isIgnoredInlineTarget(target: HTMLElement): boolean {
    return Boolean(target.closest('.cv-inline-selection-shell, .cv-inline-toolbar, .cv-inline-img-wrap, .cv-render, .cv-speed-dial-container, a, button, input, textarea, [role="button"]'));
  }

  /**
   * 判断本次 pointer 是否是短距离点击
   * @param e 指针事件
   * @returns 是否为点击
   */
  function isShortTap(e: PointerEvent): boolean {
    return Math.abs(e.clientX - pointerDownX) <= 10 && Math.abs(e.clientY - pointerDownY) <= 10;
  }

  /**
   * 设置活动选区并刷新蒙版与工具条
   * @param paragraphs 新选区
   */
  function setSelection(paragraphs: HTMLElement[]): void {
    if (!isRuntimeEnabled() && paragraphs.length) return;
    clearSelectionDom();
    selectedParagraphs.value = sortChatParagraphsByDomOrder(paragraphs);
    paintSelectionUi();
  }

  /**
   * 清空活动选区
   */
  function clearSelection(): void {
    clearSelectionDom();
    selectedParagraphs.value = [];
  }

  /**
   * 清理选区 DOM 装饰（class / 蒙版壳 / 工具条）
   */
  function clearSelectionDom(): void {
    selectionShell.clear(selectedParagraphs.value);
  }

  /**
   * 为当前选区画整体蒙版壳，并在壳内居中挂载生图按钮
   */
  function paintSelectionUi(): void {
    selectionShell.paint(selectedParagraphs.value, createSelectionToolbar);
  }

  /**
   * 创建选中段落的操作条
   * @returns 带有圆角白色胶囊的操作条元素
   */
  function createSelectionToolbar(): HTMLElement {
    const host = document.createElement('div');
    host.className = 'cv-inline-toolbar';
    preventInlineEventBubbling(host);

    const trigger = document.createElement('div');
    trigger.className = 'cv-inline-trigger';

    const text = document.createElement('span');
    text.className = 'cv-inline-trigger-text';
    text.textContent = '生成图片';

    const iconWrap = document.createElement('span');
    iconWrap.className = 'cv-inline-trigger-icon-wrap';
    const icon = document.createElement('i');
    icon.className = 'fa-solid fa-paint-brush cv-inline-trigger-icon';
    iconWrap.appendChild(icon);

    trigger.append(text, iconWrap);
    trigger.addEventListener('click', () => {
      const paragraphs = [...selectedParagraphs.value];
      if (paragraphs.length) void handleGenerateWithFreshPrompt(paragraphs, 'new');
    });

    host.appendChild(trigger);
    return host;
  }

  /**
   * 重新让 LLM 生成提示词后生图
   * @param source 目标段落或连续段落列表
   * @param mode 生成模式：新上下文不复用，重复生成复用同一锚点缓存
   */
  async function handleGenerateWithFreshPrompt(
    source?: HTMLElement | HTMLElement[],
    mode: FreshPromptMode = 'repeat',
    floorTailContext?: GalleryGenerationContext,
  ): Promise<void> {
    const paragraphs = resolveGenerationParagraphs(source);
    if (!paragraphs.length) return;

    const anchor = paragraphs.at(-1)!;
    const defaultValue = mode === 'repeat' && specialRequestContext?.anchor === anchor
      ? specialRequestContext.value
      : '';
    exitSelectionMode();

    const specialRequest = await requestTextInput({
      title: '本次临时追加要求',
      message: '可输入本次生图的临时追加要求，如无，可不填写直接确定',
      defaultValue,
      rows: 4,
    });
    if (specialRequest === null) return;

    specialRequestContext = { anchor, value: specialRequest };
    await runImageGeneration(anchor, true, (session, onSnapshotResolved) =>
      generateImageResultFromContext(paragraphs, specialRequest, session, onSnapshotResolved),
      floorTailContext,
    );
  }

  /**
   * 解析生图用的段落列表
   * @param source 外部传入的段落或列表
   * @returns 规范化后的段落数组
   */
  function resolveGenerationParagraphs(source?: HTMLElement | HTMLElement[]): HTMLElement[] {
    if (Array.isArray(source)) return sortChatParagraphsByDomOrder(source);
    if (source) return [source];
    return [...selectedParagraphs.value];
  }

  /**
   * 编辑当前图片保存的提示词快照后生图
   * @param paragraph 目标段落
   * @param snapshot 当前图片保存的提示词快照
   */
  async function handleGenerateWithEditablePrompt(
    paragraph: HTMLElement,
    snapshot: InlinePromptSnapshot,
    floorTailContext?: GalleryGenerationContext,
  ): Promise<void> {
    if (!isRuntimeEnabled()) return;
    exitSelectionMode();
    const editedSnapshot = await requestEditedPromptSnapshot(settings, snapshot, requestPromptPairInput);
    if (!editedSnapshot) return;
    await runImageGeneration(paragraph, false, session => generateImageResultFromSnapshot(editedSnapshot, session), floorTailContext);
  }

  /**
   * 基于收藏图保存的提示词快照重新生成图片
   * @param paragraph 目标段落
   * @param snapshot 收藏图提示词快照
   */
  async function handleGenerateWithFavoriteSnapshot(
    paragraph: HTMLElement,
    snapshot: InlinePromptSnapshot,
    floorTailContext?: GalleryGenerationContext,
  ): Promise<void> {
    await runImageGeneration(paragraph, false, session => generateImageResultFromSnapshot(snapshot, session), floorTailContext);
  }

  /**
   * 下载当前预览图片
   * @param imageBlob 当前图片 Blob
   * @param createdAt 当前图片创建时间
   */
  async function handleDownloadImage(imageBlob: Blob, createdAt: number): Promise<void> {
    const options = await requestImageDownloadOptions();
    if (!options) return;
    try {
      await downloadInlineImageBlob(imageBlob, buildInlineImageDownloadBaseName(createdAt), options);
    } catch (error) {
      toastr?.error?.('下载图片失败');
      console.error('[CosmosVision] 下载图片失败', error);
    }
  }

  /**
   * 执行一次完整的内联生图流程
   * 支持多段落并发:不同段落可同时发起生图,同一段落重复触发时保留最新请求
   * @param paragraph 锚点段落（选区末段）
   * @param requiresPromptLlm 是否需要先校验 Prompt LLM
   * @param task 实际生图任务
   */
  async function runImageGeneration(
    paragraph: HTMLElement,
    requiresPromptLlm: boolean,
    task: InlineGenerationTask,
    floorTailContext?: GalleryGenerationContext,
  ): Promise<void> {
    if (!isRuntimeEnabled()) return;
    const requestError = getGenerationRequestError(requiresPromptLlm);
    if (requestError) {
      toastr?.warning?.(requestError);
      return;
    }

    // 记录 LLM 成功后的提示词快照；生图失败时用于构建"仅重试生图"回调
    let resolvedSnapshot: InlinePromptSnapshot | undefined;
    const onSnapshotResolved = (snapshot: InlinePromptSnapshot) => { resolvedSnapshot = snapshot; };

    const session = startGenerationSession(paragraph, requiresPromptLlm);
    try {
      await applyGenerationResult(paragraph, await task(session, onSnapshotResolved), session, floorTailContext);
    } catch (error) {
      // resolvedSnapshot 有值 → LLM 通过但生图失败 → 重试只需复用快照
      const retryTask = resolvedSnapshot
        ? () => void runImageGeneration(
          paragraph,
          false,
          s => generateImageResultFromSnapshot(resolvedSnapshot!, s),
          floorTailContext,
        )
        : () => void runImageGeneration(paragraph, requiresPromptLlm, task, floorTailContext);
      generationSession.handleFailure(error, session, retryTask);
    } finally {
      generationSession.clear(session);
    }
  }

  /**
   * 启动一次内联生成会话
   * 同段落若已有活动请求，会话控制器内部会先取消旧请求再创建新会话
   * @param paragraph 目标段落或气泡
   * @param requiresPromptLlm 是否需要先生成提示词
   * @returns 生成会话
   */
  function startGenerationSession(paragraph: HTMLElement, requiresPromptLlm: boolean): InlineGenerationSession {
    exitSelectionMode();
    const route = resolveInlineRoute(paragraph);
    if (route === 'frontend') {
      const mesId = Number(findMessageId(paragraph) ?? NaN);
      const swipeId = getMessageSwipeId(mesId) ?? 0;
      const hostIframe = getHostIframe(paragraph);
      const slotTarget = paragraph.closest('.cv-floor-tail-slot');
      const host = ensureFloorTailHost(mesId, swipeId, slotTarget ? undefined : hostIframe ?? paragraph);
      const target = host.querySelector<HTMLElement>('.cv-inline-generation-overlay-shell, .cv-inline-img-wrap') ?? host;
      const placement = target === host ? 'append' : 'overlay';
      const statusText = requiresPromptLlm ? '正在生成提示词...' : '正在生成图片...';
      return generationSession.start(paragraph, target, statusText, placement);
    }
    const imageContainer = imageGallery.getHost(paragraph);
    const target = imageContainer ?? paragraph;
    const placement = imageContainer ? 'overlay' : 'after';
    const statusText = requiresPromptLlm ? '正在生成提示词...' : '正在生成图片...';
    return generationSession.start(paragraph, target, statusText, placement);
  }

  /**
   * 应用生成结果并按顺序插入全部图片
   * @param paragraph 目标段落或气泡
   * @param result 批量生成结果
   * @param session 生成会话
   */
  async function applyGenerationResult(
    paragraph: HTMLElement,
    result: InlineGenerationBatchResult,
    session: InlineGenerationSession,
    floorTailContext?: GalleryGenerationContext,
  ): Promise<void> {
    generationSession.ensureActive(session);
    session.status.remove();
    const route = resolveInlineRoute(paragraph);
    if (route === 'frontend') {
      await applyFrontendGenerationResult(paragraph, result, floorTailContext);
      return;
    }
    for (const imageBlob of result.imageBlobs) {
      await imageGallery.showGenerated(paragraph, {
        imageBlob,
        promptSnapshot: result.promptSnapshot,
      });
    }
  }

  /**
   * 应用前端型气泡生成结果并写入 chatMetadata 楼层尾 slot
   * imageRefs 由 showGeneratedFloorTail 返回的持久化 ID 构成，排除被数量限制淘汰的图片
   * @param bubble 气泡元素
   * @param result 批量生成结果
   */
  async function applyFrontendGenerationResult(
    bubble: HTMLElement, result: InlineGenerationBatchResult, floorTailContext?: GalleryGenerationContext,
  ): Promise<void> {
    const mesId = Number(findMessageId(bubble) ?? NaN);
    if (!Number.isFinite(mesId)) throw new Error('未能获取消息楼层 ID');
    const swipeId = getMessageSwipeId(mesId) ?? 0;
    const slotId = newSlotId();
    imageGallery.setFloorTailAnchor(slotId, bubble);
    const renderContext = resolveFloorTailRenderContext(bubble, mesId, floorTailContext);
    const targetAnchor = renderContext.hostIframe ?? bubble;
    const imageRefs = await persistFloorTailImages(
      imageGallery.showGeneratedFloorTail,
      mesId,
      swipeId,
      slotId,
      result,
      targetAnchor,
    );
    if (!imageRefs.length) {
      imageGallery.clearFloorTailAnchor(slotId);
      return;
    }
    writeFloorTailSlot({
      slotId,
      mesId,
      swipeId,
      imageRefs,
      targetIframeId: renderContext.targetIframeId,
      targetIframeIndex: renderContext.targetIframeIndex,
    });
  }

  /**
   * 读取本次生图前的校验错误
   * @param requiresPromptLlm 是否需要先校验 Prompt LLM
   * @returns 校验错误或 null
   */
  function getGenerationRequestError(requiresPromptLlm: boolean): string | null {
    if (settings.imageSource === 'comfyui') {
      const imageRequestError = getComfyUIRequestError(settings.comfyui);
      if (imageRequestError) return imageRequestError;
    }
    if (!requiresPromptLlm) return null;
    return getPromptLlmRequestError(settings.promptLlm);
  }

  /**
   * 执行 Prompt LLM 阶段并在完成后校验请求仍有效
   * @param session 生成会话
   * @param task 实际的 Prompt LLM 请求
   * @returns Prompt LLM 阶段结果
   */
  async function runPromptLlmStep<T>(
    session: InlineGenerationSession,
    task: (schemaFields: PromptLlmSchemaFields) => Promise<T>,
  ): Promise<T> {
    session.status.setStatus('正在生成提示词...');
    const result = await task(buildPromptLlmSchemaFields(settings.promptLlm));
    generationSession.ensureActive(session);
    return result;
  }

  /**
   * 切换到图片生成阶段并保留失败重试所需的提示词快照
   * @param session 生成会话
   * @param retrySnapshot 生图失败时可复用的提示词快照
   * @param task 实际的图片生成任务
   * @param onSnapshotResolved LLM 成功后回调，传出提示词快照
   * @returns 图片与提示词快照
   */
  async function runImageStep(
    session: InlineGenerationSession,
    retrySnapshot: InlinePromptSnapshot,
    task: () => Promise<InlineGenerationBatchResult>,
    onSnapshotResolved?: (snapshot: InlinePromptSnapshot) => void,
  ): Promise<InlineGenerationBatchResult> {
    onSnapshotResolved?.(retrySnapshot);
    session.status.setStatus('正在生成图片...');
    return task();
  }

  /**
   * 根据连续段落或气泡上下文重新生成提示词并生图
   * @param paragraphs 选中的连续聊天段落或气泡
   * @param specialRequest 本次临时追加要求
   * @param session 生成会话
   * @param onSnapshotResolved LLM 成功后回调，传出提示词快照
   * @returns 图片与提示词快照
   */
  async function generateImageResultFromContext(
    paragraphs: HTMLElement[],
    specialRequest: string,
    session: InlineGenerationSession,
    onSnapshotResolved?: (snapshot: InlinePromptSnapshot) => void,
  ): Promise<InlineGenerationBatchResult> {
    const route = resolveInlineRoute(paragraphs[0]!);
    const promptContext = route === 'frontend'
      ? await buildFrontendPromptContext(paragraphs, settings.promptLlm)
      : await buildPromptLlmContextFromParagraphs(paragraphs, settings.promptLlm);
    const context = { ...promptContext, specialRequest };
    return settings.imageSource === 'comfyui'
      ? generateComfyUIImageResult(context, session, onSnapshotResolved)
      : generateNovelAIImageResult(context, session, onSnapshotResolved);
  }

  /**
   * 使用上次提示词快照直接请求当前图像源
   * @param snapshot 上次成功使用的提示词快照
   * @returns 图片与提示词快照
   */
  async function generateImageResultFromSnapshot(
    snapshot: InlinePromptSnapshot,
    session: InlineGenerationSession,
  ): Promise<InlineGenerationBatchResult> {
    session.status.setStatus('正在生成图片...');
    return generateImagesFromSnapshot(settings, snapshot, session.controller.signal);
  }

  /**
   * 使用 NovelAI 生成图片
   * @param context Prompt LLM 运行时上下文
   * @param session 生成会话
   * @param onSnapshotResolved LLM 成功后回调，传出提示词快照
   * @returns NovelAI 返回的图片与提示词快照
   */
  async function generateNovelAIImageResult(
    context: PromptLlmContext,
    session: InlineGenerationSession,
    onSnapshotResolved?: (snapshot: InlinePromptSnapshot) => void,
  ): Promise<InlineGenerationBatchResult> {
    const { output, characterPrompts } = await generateRuntimePrompt(context, session, 'novelai');
    const overrides = buildNovelAIPromptOverrides(output, characterPrompts);
    const request = buildNovelAIResolvedRequest(
      settings.novelai,
      settings.imagePromptPresets,
      settings.promptLlm,
      overrides,
    );
    const temporarySourceHashes = collectTemporaryVibeSourceHashes(request.prompts.vibeReferences);
    return runImageStep(
      session,
      createNovelAISnapshot(request.prompts),
      () => requestNovelAIImages(request, temporarySourceHashes, session),
      onSnapshotResolved,
    );
  }

  /**
   * 请求 NovelAI 图片并同步已提升的临时 Vibe
   * @param request 已解析请求
   * @param temporarySourceHashes 临时 Vibe 哈希
   * @param session 生成会话
   * @returns 批量生成结果
   */
  async function requestNovelAIImages(
    request: ReturnType<typeof buildNovelAIResolvedRequest>,
    temporarySourceHashes: readonly string[],
    session: InlineGenerationSession,
  ): Promise<InlineGenerationBatchResult> {
    try {
      const result = await generateNovelAIImagesFromResolvedRequest(request, settings.novelai.imageCount, {
        signal: session.controller.signal,
      });
      return { promptSnapshot: createNovelAISnapshot(result.prompts), imageBlobs: result.imageBlobs };
    } finally {
      if (hasPromotedTemporaryVibes(request.prompts.vibeReferences, temporarySourceHashes)) {
        settingsStore.persistSavedSettings();
      }
    }
  }

  /**
   * 使用 ComfyUI 生成图片
   * @param context Prompt LLM 运行时上下文
   * @param session 生成会话
   * @param onSnapshotResolved LLM 成功后回调，传出提示词快照
   * @returns ComfyUI 返回的图片与提示词快照
   */
  async function generateComfyUIImageResult(
    context: PromptLlmContext,
    session: InlineGenerationSession,
    onSnapshotResolved?: (snapshot: InlinePromptSnapshot) => void,
  ): Promise<InlineGenerationBatchResult> {
    const { output } = await generateRuntimePrompt(context, session, 'comfyui');
    const request = buildComfyUIResolvedRequest(settings.comfyui, settings.imagePromptPresets, output);
    return runImageStep(
      session,
      createComfyUISnapshot(request.snapshot),
      async () => ({
        promptSnapshot: createComfyUISnapshot(request.snapshot),
        imageBlobs: await generateComfyUIImagesFromResolvedRequest(settings.comfyui, request, {
          signal: session.controller.signal,
        }),
      }),
      onSnapshotResolved,
    );
  }

  /**
   * 使用指定图像源生成运行时提示词
   * @param context Prompt LLM 上下文
   * @param session 生成会话
   * @param imageSource 图像源
   * @returns Prompt LLM 结果
   */
  function generateRuntimePrompt(
    context: PromptLlmContext,
    session: InlineGenerationSession,
    imageSource: 'novelai' | 'comfyui',
  ) {
    return runPromptLlmStep(session, schemaFields => generatePromptFromRuntimeContext(
      context,
      settings.promptLlm,
      settings.promptLlmMessagePresets,
      settings.promptProfiles,
      schemaFields,
      { generationId: session.promptGenerationId, triggerContext: buildPromptLlmTriggerContext(settings, imageSource) },
    ));
  }

  /**
   * 清理所有临时图片与 Object URL
   */
  function cleanup(): void {
    specialRequestContext = null;
    imageGallery.cleanup();
    exitSelectionMode();
    generationSession.cleanup();
  }

  return {
    isSelectionMode,
    toggleSelectionMode,
    exitSelectionMode,
    deselectParagraph: clearSelection,
    refreshGalleryTheme: () => imageGallery.refreshTheme(),
    cleanup,
  };
}

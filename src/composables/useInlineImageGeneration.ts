import type { CosmosVisionSettings, PromptLlmContext } from '@/constants/novelai';
import {
  createInlineGenerationSessionController,
  type InlineGenerationSession,
} from '@/composables/inlineGenerationSession';
import { preventInlineEventBubbling } from '@/composables/inlineImageDom';
import type { InlinePromptSnapshot } from '@/composables/inlineImageLightbox';
import {
  canEditInlineCharacterPrompts,
  type InlineCharacterPromptDraft,
} from '@/composables/inlineEditableCharacterPrompt';
import {
  createEditedPromptSnapshot,
  readEditablePromptInput,
} from '@/composables/inlineEditablePromptSnapshot';
import { useGalleryRuntimesStore } from '@/store/gallery-runtimes';
import {
  generateComfyUIImagesFromPrompts,
  generateComfyUIImagesFromResolvedRequest,
} from '@/services/comfyui/api';
import { buildComfyUIResolvedRequest, getComfyUIRequestError } from '@/services/comfyui/workflow';
import type { ComfyUIRequestSnapshot } from '@/services/comfyui/types';
import {
  buildNovelAIResolvedRequest,
  buildNovelAIPromptOverrides,
  type NovelAIFinalPrompts,
  generateNovelAIImageFromPrompts,
  generateNovelAIImagesFromResolvedRequest,
} from '@/services/novelai/api';
import { createSelectionShellController } from '@/composables/inlineSelectionShell';
import { nextParagraphSelection } from '@/composables/inlineParagraphSelection';
import {
  buildPromptLlmContextFromParagraphs,
  findChatParagraph,
  sortChatParagraphsByDomOrder,
} from '@/services/sillytavern/chat-dom';
import {
  buildPromptLlmTriggerContext,
  generatePromptFromRuntimeContext,
} from '@/services/prompt-llm/runtime-request';
import { buildPromptLlmSchemaFields, getPromptLlmRequestError } from '@/services/tavern-helper/prompt-llm';
import type { ImagePromptVibeRef } from '@/constants/novelai-vibe';
import { useSettingsStore } from '@/store/settings';
import { getCurrentInstance } from 'vue';
import {
  downloadInlineImageBlob,
} from '@/services/inline-image/image-download-transform';
import type { InlineImageDownloadOptions } from '@/services/inline-image/download-options';
import { formatTimestampForFileName } from '@/services/inline-image/filename-utils';

type RuntimeEnabledGetter = () => boolean;
type PromptLlmSchemaFields = ReturnType<typeof buildPromptLlmSchemaFields>;

/** 编辑 TAG 弹窗中的角色提示词草稿 */
export type { InlineCharacterPromptDraft } from '@/composables/inlineEditableCharacterPrompt';

export interface InlineTextInputOptions {
  title?: string;
  message: string;
  defaultValue?: string;
  rows?: number;
  acceptLabel?: string;
  cancelLabel?: string;
}

export interface InlinePromptPairInputOptions {
  title?: string;
  message: string;
  positiveLabel?: string;
  negativeLabel?: string;
  positiveDefaultValue?: string;
  negativeDefaultValue?: string;
  positiveRows?: number;
  negativeRows?: number;
  acceptLabel?: string;
  cancelLabel?: string;
  /** 是否展示角色提示词编辑区（仅 NovelAI V4 / V4.5） */
  enableCharacters?: boolean;
  /** 角色提示词初始值 */
  charactersDefaultValue?: InlineCharacterPromptDraft[];
}

export interface InlinePromptPairInputValue {
  positive: string;
  negative: string;
  characters: InlineCharacterPromptDraft[];
}

interface InlineImageGenerationOptions {
  isRuntimeEnabled?: RuntimeEnabledGetter;
  requestTextInput: (options: InlineTextInputOptions) => Promise<string | null>;
  requestPromptPairInput: (options: InlinePromptPairInputOptions) => Promise<InlinePromptPairInputValue | null>;
  requestImageDownloadOptions: () => Promise<InlineImageDownloadOptions | null>;
  getDarkMode: () => boolean;
}

type FreshPromptMode = 'new' | 'repeat';

interface SpecialRequestContext {
  anchor: HTMLElement;
  value: string;
}

interface InlineGenerationBatchResult {
  imageBlobs: Blob[];
  promptSnapshot: InlinePromptSnapshot;
}

type InlineGenerationTask = (
  session: InlineGenerationSession,
  onSnapshotResolved?: (snapshot: InlinePromptSnapshot) => void,
) => Promise<InlineGenerationBatchResult>;


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
  }

  /**
   * 退出段落生图选择模式
   * @param options 退出选项
   */
  function exitSelectionMode(options: { preserveSelection?: boolean } = {}): void {
    document.removeEventListener('pointerdown', handleSelectionPointerDown, true);
    document.removeEventListener('pointerup', handleSelectionPointerUp, true);
    isSelectionMode.value = false;
    if (!options.preserveSelection) clearSelection();
  }

  /**
   * 处理选择模式 pointerdown 事件
   * 在移动端焦点默认行为发生前拦截段落点击
   * @param e 指针事件
   */
  function handleSelectionPointerDown(e: PointerEvent): void {
    if (!shouldHandleParagraphPointer(e)) return;
    pointerDownX = e.clientX;
    pointerDownY = e.clientY;
    e.preventDefault();
    document.addEventListener('pointerup', handleSelectionPointerUp, { once: true, capture: true });
  }

  /**
   * 判断本次 pointer 事件是否应进入段落选择处理
   * @param e 指针事件
   * @returns 是否应处理
   */
  function shouldHandleParagraphPointer(e: PointerEvent): boolean {
    const target = e.target as HTMLElement;
    return !isIgnoredInlineTarget(target) && Boolean(target.closest('.mes_text, [mesid]'));
  }

  /**
   * 处理选择模式 pointerup 事件
   * 检查移动距离,仅处理短距离移动(真正的点击)
   * @param e 指针事件
   */
  function handleSelectionPointerUp(e: PointerEvent): void {
    if (!isRuntimeEnabled()) return;
    if (!isShortTap(e)) return;

    const target = e.target as HTMLElement;
    if (isIgnoredInlineTarget(target)) return;

    // 向上回溯,兼容点击 p 内部 em/q/strong 等子元素
    const p = findChatParagraph(target);
    if (p) {
      // 阻止 pointerup 默认行为,从而避免产生 click 事件唤起手机键盘
      e.preventDefault();
      setSelection(nextParagraphSelection(selectedParagraphs.value, p));
      return;
    }

    // 点击聊天区空白处取消选中
    if (target.closest('.mes_text, [mesid]')) {
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
  ): Promise<void> {
    if (!isRuntimeEnabled()) return;
    exitSelectionMode();
    const editedSnapshot = await requestEditedPromptSnapshot(snapshot);
    if (!editedSnapshot) return;
    await runImageGeneration(paragraph, false, session => generateImageResultFromSnapshot(editedSnapshot, session));
  }

  /**
   * 基于收藏图保存的提示词快照重新生成图片
   * @param paragraph 目标段落
   * @param snapshot 收藏图提示词快照
   */
  async function handleGenerateWithFavoriteSnapshot(
    paragraph: HTMLElement,
    snapshot: InlinePromptSnapshot,
  ): Promise<void> {
    await runImageGeneration(paragraph, false, session => generateImageResultFromSnapshot(snapshot, session));
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
      toastr.error('下载图片失败');
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
  ): Promise<void> {
    if (!isRuntimeEnabled()) return;
    const requestError = getGenerationRequestError(requiresPromptLlm);
    if (requestError) {
      toastr.warning(requestError);
      return;
    }

    // 记录 LLM 成功后的提示词快照；生图失败时用于构建"仅重试生图"回调
    let resolvedSnapshot: InlinePromptSnapshot | undefined;
    const onSnapshotResolved = (snapshot: InlinePromptSnapshot) => { resolvedSnapshot = snapshot; };

    const session = startGenerationSession(paragraph, requiresPromptLlm);
    try {
      await applyGenerationResult(paragraph, await task(session, onSnapshotResolved), session);
    } catch (error) {
      // resolvedSnapshot 有值 → LLM 通过但生图失败 → 重试只需复用快照
      const retryTask = resolvedSnapshot
        ? () => void runImageGeneration(paragraph, false, s => generateImageResultFromSnapshot(resolvedSnapshot!, s))
        : () => void runImageGeneration(paragraph, requiresPromptLlm, task);
      generationSession.handleFailure(error, session, retryTask);
    } finally {
      generationSession.clear(session);
    }
  }

  /**
   * 启动一次内联生成会话
   * 同段落若已有活动请求，会话控制器内部会先取消旧请求再创建新会话
   * @param paragraph 目标段落
   * @param requiresPromptLlm 是否需要先生成提示词
   * @returns 生成会话
   */
  function startGenerationSession(paragraph: HTMLElement, requiresPromptLlm: boolean): InlineGenerationSession {
    exitSelectionMode();
    const imageContainer = imageGallery.getHost(paragraph);
    const target = imageContainer ?? paragraph;
    const placement = imageContainer ? 'overlay' : 'after';
    return generationSession.start(paragraph, target, getInitialStatusText(requiresPromptLlm), placement);
  }

  /**
   * 应用生成结果并按顺序插入全部图片
   * @param paragraph 目标段落
   * @param result 批量生成结果
   * @param session 生成会话
   */
  async function applyGenerationResult(
    paragraph: HTMLElement,
    result: InlineGenerationBatchResult,
    session: InlineGenerationSession,
  ): Promise<void> {
    generationSession.ensureActive(session);
    session.status.remove();
    for (const imageBlob of result.imageBlobs) {
      await imageGallery.showGenerated(paragraph, {
        imageBlob,
        promptSnapshot: result.promptSnapshot,
      });
    }
  }

  /**
   * 读取初始生成状态文本
   * @param requiresPromptLlm 是否需要先生成提示词
   * @returns 状态文本
   */
  function getInitialStatusText(requiresPromptLlm: boolean): string {
    return requiresPromptLlm ? '正在生成提示词...' : '正在生成图片...';
  }

  /**
   * 读取本次生图前的校验错误
   * @param requiresPromptLlm 是否需要先校验 Prompt LLM
   * @returns 校验错误或 null
   */
  function getGenerationRequestError(requiresPromptLlm: boolean): string | null {
    const imageRequestError = getImageRequestError();
    if (imageRequestError) return imageRequestError;
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
   * 根据连续段落上下文重新生成提示词并生图
   * @param paragraphs 选中的连续聊天段落
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
    const context = { ...buildPromptLlmContextFromParagraphs(paragraphs, settings.promptLlm), specialRequest };
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
    const imageSource = snapshot.imageSource ?? settings.imageSource;
    if (imageSource === 'comfyui') {
      return {
        promptSnapshot: snapshot,
        imageBlobs: await generateComfyUIImagesFromPrompts(settings.comfyui, snapshot.comfyui ?? snapshot, {
          signal: session.controller.signal,
        }),
      };
    }

    return {
      promptSnapshot: snapshot,
      imageBlobs: [
        await generateNovelAIImageFromPrompts(settings.novelai, snapshot.novelai ?? snapshot, {
          signal: session.controller.signal,
        }),
      ],
    };
  }

  /**
   * 读取当前图像来源的前置校验错误
   * @returns 校验错误或 null
   */
  function getImageRequestError(): string | null {
    if (settings.imageSource !== 'comfyui') return null;
    return getComfyUIRequestError(settings.comfyui);
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
    const { output, characterPrompts } = await runPromptLlmStep(session, schemaFields =>
      generatePromptFromRuntimeContext(
        context,
        settings.promptLlm,
        settings.promptLlmMessagePresets,
        settings.promptProfiles,
        schemaFields,
        {
          generationId: session.promptGenerationId,
          triggerContext: buildPromptLlmTriggerContext(settings, 'novelai'),
        },
      ),
    );

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
      async () => {
        try {
          const result = await generateNovelAIImagesFromResolvedRequest(request, settings.novelai.imageCount, {
            signal: session.controller.signal,
          });
          return {
            promptSnapshot: createNovelAISnapshot(result.prompts),
            imageBlobs: result.imageBlobs,
          };
        } finally {
          if (hasPromotedTemporaryVibes(request.prompts.vibeReferences, temporarySourceHashes)) {
            settingsStore.persistSavedSettings();
          }
        }
      },
      onSnapshotResolved,
    );
  }

  /**
   * 收集当前仍为临时态的 vibe 来源 hash
   * @param vibes 本次请求绑定的 vibe 引用
   */
  function collectTemporaryVibeSourceHashes(vibes?: readonly ImagePromptVibeRef[]): string[] {
    return (vibes ?? []).filter(vibe => vibe.temporary).map(vibe => vibe.sourceHash);
  }

  /**
   * 判断本次请求是否将临时 vibe 升级为持久条目
   * @param vibes 当前 vibe 引用
   * @param sourceHashes 请求开始前的临时 vibe hash
   * @returns 是否发生升级
   */
  function hasPromotedTemporaryVibes(vibes: readonly ImagePromptVibeRef[] | undefined, sourceHashes: readonly string[]): boolean {
    if (!sourceHashes.length || !vibes?.length) return false;
    return sourceHashes.some(sourceHash => !vibes.find(vibe => vibe.sourceHash === sourceHash)?.temporary);
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
    const { output } = await runPromptLlmStep(session, schemaFields =>
      generatePromptFromRuntimeContext(
        context,
        settings.promptLlm,
        settings.promptLlmMessagePresets,
        settings.promptProfiles,
        schemaFields,
        {
          generationId: session.promptGenerationId,
          triggerContext: buildPromptLlmTriggerContext(settings, 'comfyui'),
        },
      ),
    );
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
   * 请求用户编辑当前图片保存的正负提示词（含角色）
   * @param snapshot 当前图片保存的提示词快照
   * @returns 编辑后的快照,取消时返回 null
   */
  async function requestEditedPromptSnapshot(snapshot: InlinePromptSnapshot): Promise<InlinePromptSnapshot | null> {
    const initialPrompts = readEditablePromptInput(settings.novelai, snapshot);
    const canEditCharacters = canEditInlineCharacterPrompts(settings.novelai.model);
    const prompts = await requestPromptPairInput({
      title: '编辑提示词后生图',
      message: canEditCharacters
        ? '直接编辑当前图片保存的全局提示词与角色提示词，确认后生成图片'
        : '直接编辑当前图片保存的提示词，确认后生成图片',
      positiveLabel: '正向提示词',
      negativeLabel: '负向提示词',
      positiveDefaultValue: initialPrompts.positive,
      negativeDefaultValue: initialPrompts.negative,
      positiveRows: 6,
      negativeRows: 4,
      enableCharacters: canEditCharacters,
      charactersDefaultValue: initialPrompts.characters,
    });
    if (!prompts) return null;
    return createEditedPromptSnapshot(settings.novelai, snapshot, prompts);
  }

  /**
   * 创建 NovelAI 内联提示词快照
   * @param prompts NovelAI 最终提示词
   * @returns 内联提示词快照
   */
  function createNovelAISnapshot(prompts: NovelAIFinalPrompts): InlinePromptSnapshot {
    return {
      positivePrompt: prompts.positivePrompt,
      negativePrompt: prompts.negativePrompt,
      imageSource: 'novelai',
      novelai: prompts,
    };
  }

  /**
   * 创建 ComfyUI 内联提示词快照
   * @param snapshot ComfyUI 请求快照
   * @returns 内联提示词快照
   */
  function createComfyUISnapshot(snapshot: ComfyUIRequestSnapshot): InlinePromptSnapshot {
    return {
      positivePrompt: snapshot.positivePrompt,
      negativePrompt: snapshot.negativePrompt,
      imageSource: 'comfyui',
      comfyui: snapshot,
    };
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

/**
 * 构建内联单图下载文件名
 * @param createdAt 图片创建时间
 * @returns 不含扩展名的文件名
 */
function buildInlineImageDownloadBaseName(createdAt: number): string {
  return `cosmos-vision-inline-image-${formatTimestampForFileName(createdAt)}`;
}

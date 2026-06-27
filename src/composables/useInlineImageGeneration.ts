import type { CosmosVisionSettings, PromptLlmContext } from '@/constants/novelai';
import {
  createInlineGenerationSessionController,
  type InlineGenerationSession,
} from '@/composables/inlineGenerationSession';
import { preventInlineEventBubbling, removeInlineVueHost } from '@/composables/inlineImageDom';
import { createInlineImageGalleryRenderer } from '@/composables/inlineImageGalleryRenderer';
import type { InlinePromptSnapshot } from '@/composables/inlineImageLightbox';
import { generateComfyUIImageFromPrompts, generateComfyUIImageFromResolvedRequest } from '@/services/comfyui/api';
import { buildComfyUIResolvedRequest, getComfyUIRequestError, type ComfyUIRequestSnapshot } from '@/services/comfyui/workflow';
import {
  buildNovelAIResolvedRequest,
  buildNovelAILlmPromptOverrides,
  type NovelAIFinalPrompts,
  generateNovelAIImageFromPrompts,
  generateNovelAIImageFromResolvedRequest,
} from '@/services/novelai/api';
import {
  buildPromptLlmContextFromParagraph,
  findChatParagraph,
} from '@/services/sillytavern/chat-dom';
import {
  generatePromptFromRuntimeContext,
  generatePromptTextFromRuntimeContext,
} from '@/services/prompt-llm/runtime-request';
import { buildPromptLlmSchemaFields, getPromptLlmRequestError } from '@/services/tavern-helper/prompt-llm';
import type { ImagePromptVibeRef } from '@/constants/image-prompt';
import { useSettingsStore } from '@/store/settings';
import { getCurrentInstance } from 'vue';

type RuntimeEnabledGetter = () => boolean;
type PromptLlmSchemaFields = ReturnType<typeof buildPromptLlmSchemaFields>;

export interface InlineTextInputOptions {
  title?: string;
  message: string;
  defaultValue?: string;
  rows?: number;
  acceptLabel?: string;
  cancelLabel?: string;
}

interface InlineImageGenerationOptions {
  isRuntimeEnabled?: RuntimeEnabledGetter;
  requestTextInput: (options: InlineTextInputOptions) => Promise<string | null>;
  getDarkMode: () => boolean;
}

interface InlineGenerationResult {
  imageBlob: Blob;
  promptSnapshot: InlinePromptSnapshot;
}

type InlineGenerationTask = (
  session: InlineGenerationSession,
  onSnapshotResolved?: (snapshot: InlinePromptSnapshot) => void,
) => Promise<InlineGenerationResult>;


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
  const settingsStore = useSettingsStore();

  /** 当前组件实例上下文,用于把 PrimeVue Button 渲染到聊天内联 DOM */
  const appContext = getCurrentInstance()?.appContext;

  /** 生成会话与取消控制 */
  const generationSession = createInlineGenerationSessionController({
    appContext,
    getDarkMode: options.getDarkMode,
  });

  /** 当前选中的段落 DOM 引用 */
  const selectedParagraph = ref<HTMLElement | null>(null);

  /** 是否处于段落生图选择模式 */
  const isSelectionMode = ref(false);

  /** 段落图片画廊渲染器 */
  const imageGallery = createInlineImageGalleryRenderer({
    appContext,
    getDarkMode: options.getDarkMode,
    isRuntimeEnabled,
    onGenerateWithSnapshot: handleGenerateWithFavoriteSnapshot,
    onGenerateWithFreshPrompt: handleGenerateWithFreshPrompt,
  });

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
    if (!options.preserveSelection) deselectParagraph();
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
      toggleParagraphSelection(p);
      return;
    }

    // 点击聊天区空白处取消选中
    if (target.closest('.mes_text, [mesid]')) {
      deselectParagraph();
    }
  }

  /**
   * 判断目标是否应跳过段落选择
   * @param target 事件目标
   * @returns 是否跳过
   */
  function isIgnoredInlineTarget(target: HTMLElement): boolean {
    return Boolean(target.closest('.cv-inline-toolbar, .cv-inline-img-wrap, .cv-speed-dial-container, a, button, input, textarea, [role="button"]'));
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
   * 切换段落选中状态
   * @param p 目标段落
   */
  function toggleParagraphSelection(p: HTMLElement): void {
    if (selectedParagraph.value === p) {
      deselectParagraph();
      return;
    }
    selectParagraph(p);
  }

  /**
   * 选中段落并在其右上角显示浮窗生图按钮
   */
  function selectParagraph(p: HTMLElement): void {
    if (!isRuntimeEnabled()) return;

    deselectParagraph();

    selectedParagraph.value = p;

    p.classList.add('cv-inline-selected');

    p.appendChild(createSelectionToolbar());
  }

  /**
   * 取消选中段落并移除浮窗按钮
   */
  function deselectParagraph(): void {
    if (!selectedParagraph.value) return;

    const toolbar = selectedParagraph.value.querySelector(':scope > .cv-inline-toolbar') as HTMLElement | null;
    removeInlineVueHost(toolbar);

    selectedParagraph.value.classList.remove('cv-inline-selected');

    selectedParagraph.value = null;
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

    // 创建右侧圆形主题色包围盒
    const iconWrap = document.createElement('span');
    iconWrap.className = 'cv-inline-trigger-icon-wrap';

    const icon = document.createElement('i');
    icon.className = 'fa-solid fa-paint-brush cv-inline-trigger-icon';
    iconWrap.appendChild(icon);

    // 左边为黑色文字，右边为圆形 icon
    trigger.append(text, iconWrap);

    trigger.addEventListener('click', () => {
      const paragraph = selectedParagraph.value;
      if (paragraph) {
        void handleGenerateWithFreshPrompt(paragraph);
      }
    });

    host.appendChild(trigger);
    return host;
  }

  /**
   * 重新让 LLM 生成提示词后生图
   * @param paragraph 目标段落
   */
  async function handleGenerateWithFreshPrompt(paragraph = selectedParagraph.value): Promise<void> {
    if (!paragraph) return;
    exitSelectionMode();
    const specialRequest = await requestTextInput({
      title: '本次临时追加要求',
      message: '可输入本次生图的临时追加要求，如无，可不填写直接确定',
      rows: 4,
    });
    if (specialRequest === null) return;
    await runImageGeneration(paragraph, true, (session, onSnapshotResolved) => generateImageResultFromContext(paragraph, specialRequest, session, onSnapshotResolved));
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
   * 执行一次完整的内联生图流程
   * 支持多段落并发:不同段落可同时发起生图,同一段落重复触发时保留最新请求
   * @param paragraph 目标段落
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
   * 应用生成结果并插入图片
   * @param paragraph 目标段落
   * @param result 生成结果
   * @param session 生成会话
   */
  function applyGenerationResult(
    paragraph: HTMLElement,
    result: InlineGenerationResult,
    session: InlineGenerationSession,
  ): void {
    generationSession.ensureActive(session);
    session.status.remove();
    imageGallery.showGenerated(paragraph, result);
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
    task: () => Promise<InlineGenerationResult>,
    onSnapshotResolved?: (snapshot: InlinePromptSnapshot) => void,
  ): Promise<InlineGenerationResult> {
    onSnapshotResolved?.(retrySnapshot);
    session.status.setStatus('正在生成图片...');
    return task();
  }

  /**
   * 根据段落上下文重新生成提示词并生图
   * @param paragraph 目标聊天段落
   * @param specialRequest 本次临时追加要求
   * @param session 生成会话
   * @param onSnapshotResolved LLM 成功后回调，传出提示词快照
   * @returns 图片与提示词快照
   */
  async function generateImageResultFromContext(
    paragraph: HTMLElement,
    specialRequest: string,
    session: InlineGenerationSession,
    onSnapshotResolved?: (snapshot: InlinePromptSnapshot) => void,
  ): Promise<InlineGenerationResult> {
    const context = { ...buildPromptLlmContextFromParagraph(paragraph), specialRequest };
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
  ): Promise<InlineGenerationResult> {
    session.status.setStatus('正在生成图片...');
    const imageSource = snapshot.imageSource ?? settings.imageSource;
    if (imageSource === 'comfyui') {
      return {
        promptSnapshot: snapshot,
        imageBlob: await generateComfyUIImageFromPrompts(settings.comfyui, snapshot.comfyui ?? snapshot, {
          signal: session.controller.signal,
        }),
      };
    }

    return {
      promptSnapshot: snapshot,
      imageBlob: await generateNovelAIImageFromPrompts(settings.novelai, snapshot.novelai ?? snapshot, {
        signal: session.controller.signal,
      }),
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
  ): Promise<InlineGenerationResult> {
    const rawResponse = await runPromptLlmStep(session, schemaFields =>
      generatePromptTextFromRuntimeContext(
        context,
        settings.promptLlm,
        settings.promptLlmMessagePresets,
        settings.promptProfiles,
        schemaFields,
        { generationId: session.promptGenerationId },
      ),
    );

    const overrides = buildNovelAILlmPromptOverrides(settings.promptLlm, rawResponse);
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
          const result = await generateNovelAIImageFromResolvedRequest(request, { signal: session.controller.signal });
          return {
            promptSnapshot: createNovelAISnapshot(result.prompts),
            imageBlob: result.imageBlob,
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
   * @returns 临时 vibe hash 列表
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
  ): Promise<InlineGenerationResult> {
    const prompts = await runPromptLlmStep(session, schemaFields =>
      generatePromptFromRuntimeContext(
        context,
        settings.promptLlm,
        settings.promptLlmMessagePresets,
        settings.promptProfiles,
        schemaFields,
        { generationId: session.promptGenerationId },
      ),
    );

    const request = buildComfyUIResolvedRequest(settings.comfyui, settings.imagePromptPresets, prompts);
    return runImageStep(
      session,
      createComfyUISnapshot(request.snapshot),
      async () => ({
        promptSnapshot: createComfyUISnapshot(request.snapshot),
        imageBlob: await generateComfyUIImageFromResolvedRequest(settings.comfyui, request, {
          signal: session.controller.signal,
        }),
      }),
      onSnapshotResolved,
    );
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
    imageGallery.cleanup();
    exitSelectionMode();
    generationSession.cleanup();
  }
  return {
    isSelectionMode,
    toggleSelectionMode,
    exitSelectionMode,
    deselectParagraph,
    cleanup,
  };
}

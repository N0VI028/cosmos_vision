import type { CosmosVisionSettings, PromptLlmContext } from '@/constants/novelai';
import { DARK_CLASS } from '@/constants/theme';
import {
  createInlineGenerationSessionController,
  type InlineGenerationSession,
} from '@/composables/inlineGenerationSession';
import { createInlineImageCleanupObserver } from '@/composables/inlineImageCleanupObserver';
import { handleInlineImageClick, type InlinePromptSnapshot } from '@/composables/inlineImageLightbox';
import { generateComfyUIImageFromPrompts, generateComfyUIImageFromResolvedRequest } from '@/services/comfyui/api';
import { buildComfyUIResolvedRequest, getComfyUIRequestError } from '@/services/comfyui/workflow';
import {
  buildNovelAIResolvedRequest,
  buildNovelAILlmPromptOverrides,
  generateNovelAIImageFromPrompts,
  generateNovelAIImageFromResolvedRequest,
} from '@/services/novelai/api';
import {
  buildPromptLlmContextFromParagraph,
  findChatParagraph,
} from '@/services/sillytavern/chat-dom';
import { showTextInputPopup } from '@/services/sillytavern/popup';
import {
  generatePromptFromRuntimeContext,
  generatePromptTextFromRuntimeContext,
} from '@/services/prompt-llm/runtime-request';
import { buildPromptLlmSchemaFields, getPromptLlmRequestError } from '@/services/tavern-helper/prompt-llm';
import Button from 'primevue/button';
import { getCurrentInstance, h, render } from 'vue';

type RuntimeEnabledGetter = () => boolean;

interface InlineGenerationResult {
  imageBlob: Blob;
  promptSnapshot: InlinePromptSnapshot;
}

interface InlineActionButtonSpec {
  label?: string;
  icon: string;
  severity?: 'secondary' | 'danger';
  variant?: 'outlined';
  onClick: () => void;
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
  isRuntimeEnabled: RuntimeEnabledGetter = () => true,
) {
  /** 当前组件实例上下文,用于把 PrimeVue Button 渲染到聊天内联 DOM */
  const appContext = getCurrentInstance()?.appContext;

  /** 生成会话与取消控制 */
  const generationSession = createInlineGenerationSessionController({
    appContext,
    getDarkMode: () => settings.darkMode,
  });

  /** 当前选中的段落 DOM 引用 */
  const selectedParagraph = ref<HTMLElement | null>(null);

  /** 当前是否正在生成 */
  const isGenerating = ref(false);

  /** 是否处于段落生图选择模式 */
  const isSelectionMode = ref(false);

  /** 段落到临时图片容器的映射 */
  const imageContainers = new Map<HTMLElement, HTMLElement>();

  /** 段落到 Object URL 的映射 */
  const imageObjectUrls = new Map<HTMLElement, string>();

  /** 段落到上次提示词快照的映射 */
  const promptSnapshots = new Map<HTMLElement, InlinePromptSnapshot>();

  /** Object URL 清理表 */
  const objectUrls = new Set<string>();

  /** 聊天 DOM 变化清理器 */
  const imageCleanupObserver = createInlineImageCleanupObserver({
    getEntries: () => imageContainers.entries(),
    removeImageCard,
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
   */
  function exitSelectionMode(): void {
    document.removeEventListener('pointerdown', handleSelectionPointerDown, true);
    document.removeEventListener('pointerup', handleSelectionPointerUp, true);
    isSelectionMode.value = false;
    deselectParagraph();
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
    removeActionHost(toolbar);

    selectedParagraph.value.classList.remove('cv-inline-selected');

    selectedParagraph.value = null;
  }

  /**
   * 阻止交互事件冒泡到底层
   * @param host 宿主元素
   */
  function preventEventBubbling(host: HTMLElement): void {
    const events = ['pointerdown', 'mousedown', 'touchstart', 'pointerup', 'mouseup', 'touchend', 'click'];
    events.forEach(evt => host.addEventListener(evt, e => e.stopPropagation()));
  }

  /**
   * 创建选中段落的操作条
   * @returns 带有圆角白色胶囊的操作条元素
   */
  function createSelectionToolbar(): HTMLElement {
    const host = document.createElement('div');
    host.className = 'cv-inline-toolbar';
    preventEventBubbling(host);

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
   * 创建图片卡片操作条
   * @param paragraph 目标段落
   * @returns PrimeVue 按钮容器
   */
  function createImageActionBar(paragraph: HTMLElement): HTMLElement {
    return createActionHost('cv-inline-img-actions', [
      {
        label: '重新生成图片',
        icon: 'fa-solid fa-repeat',
        severity: 'secondary',
        variant: 'outlined',
        onClick: () => void handleGenerateWithLastPrompt(paragraph),
      },
      {
        label: '重新生成TAG和图片',
        icon: 'fa-solid fa-robot',
        severity: 'secondary',
        variant: 'outlined',
        onClick: () => void handleGenerateWithFreshPrompt(paragraph),
      },
      {
        label: '移除',
        icon: 'fa-solid fa-trash',
        severity: 'danger',
        variant: 'outlined',
        onClick: () => removeImageCardWhenEnabled(paragraph),
      },
    ]);
  }

  /**
   * 渲染 PrimeVue 按钮容器
   * @param hostClass 容器 class
   * @param actions 按钮配置
   * @returns 按钮宿主元素
   */
  function createActionHost(hostClass: string, actions: InlineActionButtonSpec[]): HTMLElement {
    const host = document.createElement('div');
    host.className = buildActionHostClass(hostClass);
    preventEventBubbling(host);

    const vnode = h(
      'div',
      { class: 'cv-inline-button-row' },
      actions.map(action => h(Button, buildActionButtonProps(action))),
    );

    if (appContext) {
      vnode.appContext = appContext;
    }

    render(vnode, host);
    return host;
  }

  /**
   * 组装按钮宿主的主题 class
   * @param hostClass 宿主原始 class
   * @returns 带 PrimeVue 主题作用域的 class 字符串
   */
  function buildActionHostClass(hostClass: string): string {
    return settings.darkMode ? `${hostClass} cosmos-vision-root ${DARK_CLASS}` : `${hostClass} cosmos-vision-root`;
  }

  /**
   * 构建 PrimeVue 按钮属性
   * @param action 按钮配置
   * @returns Button props
   */
  function buildActionButtonProps(action: InlineActionButtonSpec): Record<string, unknown> {
    return {
      class: 'cv-inline-action-button',
      icon: action.icon,
      label: action.label,
      severity: action.severity,
      size: 'small',
      variant: action.variant,
      onClick: action.onClick,
    };
  }

  /**
   * 卸载并移除按钮容器
   * @param host 按钮宿主元素
   */
  function removeActionHost(host: HTMLElement | null): void {
    if (!host) return;
    render(null, host);
    host.remove();
  }

  /**
   * 重新让 LLM 生成提示词后生图
   * @param paragraph 目标段落
   */
  async function handleGenerateWithFreshPrompt(paragraph = selectedParagraph.value): Promise<void> {
    if (!paragraph) return;
    exitSelectionMode();
    const specialRequest = await showTextInputPopup({
      message: '<h3>本次临时追加要求</h3><small>可输入本次生图的临时追加要求，如无，可不填写直接确定</small>',
      rows: 4,
    });
    if (specialRequest === null) return;
    await runImageGeneration(paragraph, true, (session, onSnapshotResolved) => generateImageResultFromContext(paragraph, specialRequest, session, onSnapshotResolved));
  }

  /**
   * 沿用上次提示词快照直接重新请求生图
   * @param paragraph 目标段落
   */
  async function handleGenerateWithLastPrompt(paragraph: HTMLElement): Promise<void> {
    const snapshot = promptSnapshots.get(paragraph);
    if (!snapshot) {
      toastr.warning('当前图片还没有可复用的上次标签');
      return;
    }
    await runImageGeneration(paragraph, false, session => generateImageResultFromSnapshot(snapshot, session));
  }

  /**
   * 执行一次完整的内联生图流程
   * @param paragraph 目标段落
   * @param requiresPromptLlm 是否需要先校验 Prompt LLM
   * @param task 实际生图任务
   */
  async function runImageGeneration(
    paragraph: HTMLElement,
    requiresPromptLlm: boolean,
    task: InlineGenerationTask,
  ): Promise<void> {
    if (!isRuntimeEnabled() || isGenerating.value) return;
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
      isGenerating.value = false;
    }
  }

  /**
   * 启动一次内联生成会话
   * @param paragraph 目标段落
   * @param requiresPromptLlm 是否需要先生成提示词
   * @returns 生成会话
   */
  function startGenerationSession(paragraph: HTMLElement, requiresPromptLlm: boolean): InlineGenerationSession {
    isGenerating.value = true;
    exitSelectionMode();
    const imageContainer = imageContainers.get(paragraph);
    if (imageContainer) {
      return generationSession.start(imageContainer, getInitialStatusText(requiresPromptLlm), 'overlay');
    }
    return generationSession.start(paragraph, getInitialStatusText(requiresPromptLlm));
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
    const objectUrl = URL.createObjectURL(result.imageBlob);
    objectUrls.add(objectUrl);
    session.status.remove();
    insertImageCard(paragraph, objectUrl);
    promptSnapshots.set(paragraph, result.promptSnapshot);
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
    if (settings.imageSource === 'comfyui') {
      return {
        promptSnapshot: snapshot,
        imageBlob: await generateComfyUIImageFromPrompts(settings.comfyui, snapshot, {
          signal: session.controller.signal,
        }),
      };
    }

    return {
      promptSnapshot: snapshot,
      imageBlob: await generateNovelAIImageFromPrompts(settings.novelai, snapshot, {
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
    session.status.setStatus('正在生成提示词...');
    const schemaFields = buildPromptLlmSchemaFields(settings.promptLlm);
    const rawResponse = await generatePromptTextFromRuntimeContext(
      context,
      settings.promptLlm,
      settings.promptLlmMessagePresets,
      settings.promptProfiles,
      schemaFields,
      { generationId: session.promptGenerationId },
    );
    generationSession.ensureActive(session);

    const overrides = buildNovelAILlmPromptOverrides(settings.promptLlm, rawResponse);
    const request = buildNovelAIResolvedRequest(
      settings.novelai,
      settings.imagePromptPresets,
      settings.promptLlm,
      overrides,
    );

    // LLM 阶段成功，通知调用方提示词快照（用于生图失败时的重试）
    onSnapshotResolved?.(request.prompts);

    session.status.setStatus('正在生成图片...');
    const result = await generateNovelAIImageFromResolvedRequest(request, { signal: session.controller.signal });
    return {
      promptSnapshot: result.prompts,
      imageBlob: result.imageBlob,
    };
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
    session.status.setStatus('正在生成提示词...');
    const schemaFields = buildPromptLlmSchemaFields(settings.promptLlm);
    const prompts = await generatePromptFromRuntimeContext(
      context,
      settings.promptLlm,
      settings.promptLlmMessagePresets,
      settings.promptProfiles,
      schemaFields,
      { generationId: session.promptGenerationId },
    );
    generationSession.ensureActive(session);

    const request = buildComfyUIResolvedRequest(settings.comfyui, settings.imagePromptPresets, prompts);

    // LLM 阶段成功，通知调用方提示词快照（用于生图失败时的重试）
    onSnapshotResolved?.(request.snapshot);

    session.status.setStatus('正在生成图片...');
    return {
      promptSnapshot: request.snapshot,
      imageBlob: await generateComfyUIImageFromResolvedRequest(settings.comfyui, request, {
        signal: session.controller.signal,
      }),
    };
  }

  /**
   * 在段落后插入临时图片(纯净展示,hover/点击浮现操作图标)
   */
  function insertImageCard(p: HTMLElement, objectUrl: string): void {
    removeImageCard(p);

    const wrap = document.createElement('div');
    wrap.className = 'cv-inline-img-wrap';
    preventEventBubbling(wrap);

    const img = document.createElement('img');
    img.src = objectUrl;
    img.alt = '生成的图片';
    img.draggable = false;

    img.addEventListener('click', (e: MouseEvent) => {
      handleInlineImageClick(e, img, wrap, isRuntimeEnabled, promptSnapshots.get(p));
    });

    wrap.append(img, createImageActionBar(p));

    // 移动端无 hover 能力:点击图片区域切换操作图标显隐(点按钮本身不切换)
    wrap.addEventListener('click', (e: MouseEvent) => {
      if (!isRuntimeEnabled()) return;
      if ((e.target as HTMLElement).closest('button')) return;
      wrap.classList.toggle('cv-inline-img-active');
    });

    p.after(wrap);
    imageContainers.set(p, wrap);
    imageObjectUrls.set(p, objectUrl);
    imageCleanupObserver.notifyImageAdded();
  }

  /**
   * 移除段落的临时图片卡片
   */
  function removeImageCard(p: HTMLElement): void {
    const container = imageContainers.get(p);
    const objectUrl = imageObjectUrls.get(p);

    const actions = container?.querySelector(':scope > .cv-inline-img-actions') as HTMLElement | null;
    removeActionHost(actions);
    container?.remove();
    imageContainers.delete(p);
    imageObjectUrls.delete(p);
    promptSnapshots.delete(p);
    releaseObjectUrl(objectUrl);
  }

  /**
   * 仅在扩展开启时响应移除图片操作
   * @param p 目标聊天段落
   */
  function removeImageCardWhenEnabled(p: HTMLElement): void {
    if (!isRuntimeEnabled()) return;
    removeImageCard(p);
  }

  /**
   * 释放指定 Object URL
   * @param url 待释放的 Object URL
   */
  function releaseObjectUrl(url?: string): void {
    if (!url || !objectUrls.delete(url)) return;
    URL.revokeObjectURL(url);
  }

  /**
   * 清理所有临时图片与 Object URL
   */
  function cleanup(): void {
    imageCleanupObserver.disconnect();
    exitSelectionMode();
    generationSession.cleanup();
    isGenerating.value = false;

    // 移除所有图片容器
    imageContainers.forEach(container => {
      const actions = container.querySelector(':scope > .cv-inline-img-actions') as HTMLElement | null;
      removeActionHost(actions);
      container.remove();
    });
    imageContainers.clear();
    imageObjectUrls.clear();
    promptSnapshots.clear();

    // 释放所有 Object URL
    objectUrls.forEach(url => URL.revokeObjectURL(url));
    objectUrls.clear();

  }
  return {
    isSelectionMode,
    toggleSelectionMode,
    exitSelectionMode,
    deselectParagraph,
    cleanup,
  };
}

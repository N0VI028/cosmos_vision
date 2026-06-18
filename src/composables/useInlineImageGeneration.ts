import type { CosmosVisionSettings } from '@/constants/novelai';
import { DARK_CLASS } from '@/constants/theme';
import { generateComfyUIImageFromPrompts, generateComfyUIImageFromResolvedRequest } from '@/services/comfyui/api';
import { buildComfyUIResolvedRequest, getComfyUIRequestError } from '@/services/comfyui/workflow';
import {
  buildNovelAIResolvedRequest,
  buildNovelAILlmPromptOverrides,
  generateNovelAIImageFromPrompts,
  generateNovelAIImageFromResolvedRequest,
} from '@/services/novelai/api';
import {
  extractContextAroundParagraph,
  findChatParagraph,
  normalizeContextParagraphCount,
} from '@/services/sillytavern/chat-dom';
import {
  generatePromptFromRuntimeContext,
  generatePromptTextFromRuntimeContext,
} from '@/services/prompt-llm/runtime-request';
import { buildPromptLlmSchemaFields, getPromptLlmRequestError } from '@/services/tavern-helper/prompt-llm';
import Button from 'primevue/button';
import { getCurrentInstance, h, render } from 'vue';

type RuntimeEnabledGetter = () => boolean;

interface InlinePromptSnapshot {
  positivePrompt: string;
  negativePrompt: string;
}

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

  /** 当前选中的段落 DOM 引用 */
  const selectedParagraph = ref<HTMLElement | null>(null);

  /** 当前是否正在生成 */
  const isGenerating = ref(false);

  /** 段落到临时图片容器的映射 */
  const imageContainers = new Map<HTMLElement, HTMLElement>();

  /** 段落到 Object URL 的映射 */
  const imageObjectUrls = new Map<HTMLElement, string>();

  /** 段落到上次提示词快照的映射 */
  const promptSnapshots = new Map<HTMLElement, InlinePromptSnapshot>();

  /** Object URL 清理表 */
  const objectUrls = new Set<string>();

  /**
   * 监听聊天区点击,选中段落并显示生图按钮
   */
  function attachChatClickListener(): void {
    document.addEventListener('click', handleChatClick, true);
  }

  /**
   * 移除聊天区点击监听
   */
  function detachChatClickListener(): void {
    document.removeEventListener('click', handleChatClick, true);
  }

  /**
   * 处理聊天区点击事件
   */
  function handleChatClick(e: MouseEvent): void {
    if (!isRuntimeEnabled()) return;

    const target = e.target as HTMLElement;

    // 点击生图按钮或图片卡片内部时不处理
    if (target.closest('.cv-inline-toolbar') || target.closest('.cv-inline-img-wrap')) {
      return;
    }

    // 向上回溯,兼容点击 p 内部 em/q/strong 等子元素
    const p = findChatParagraph(target);
    if (p) {
      selectParagraph(p);
      return;
    }

    if (isChatAreaTarget(target)) {
      deselectParagraph();
    }
  }

  /**
   * 判断点击目标是否仍在聊天区域内
   * @param target 点击目标
   * @returns 是否属于聊天区域
   */
  function isChatAreaTarget(target: HTMLElement): boolean {
    return Boolean(target.closest('.mes_text, [mesid]'));
  }

  /**
   * 选中段落并在其右上角显示浮窗生图按钮
   */
  function selectParagraph(p: HTMLElement): void {
    if (!isRuntimeEnabled()) return;

    // 如果已选中同一段落,不重复处理
    if (selectedParagraph.value === p) return;

    // 清理旧选中态
    deselectParagraph();

    selectedParagraph.value = p;

    // 标记段落为已选中(用于 position: relative 锚点)
    p.classList.add('cv-inline-selected');

    // 在段落内部右上角插入浮窗按钮
    p.appendChild(createSelectionToolbar());
  }

  /**
   * 取消选中段落并移除浮窗按钮
   */
  function deselectParagraph(): void {
    if (!selectedParagraph.value) return;

    // 移除段落内部的浮窗按钮
    const toolbar = selectedParagraph.value.querySelector(':scope > .cv-inline-toolbar') as HTMLElement | null;
    removeActionHost(toolbar);

    // 移除选中态 class
    selectedParagraph.value.classList.remove('cv-inline-selected');

    selectedParagraph.value = null;
  }

  /**
   * 创建选中段落的操作条
   * @returns PrimeVue 按钮容器
   */
  function createSelectionToolbar(): HTMLElement {
    return createActionHost('cv-inline-toolbar', [
      {
        icon: 'fa-solid fa-paint-brush',
        variant: 'outlined',
        onClick: () => void handleGenerateWithFreshPrompt(),
      },
    ]);
  }

  /**
   * 创建图片卡片操作条
   * @param paragraph 目标段落
   * @returns PrimeVue 按钮容器
   */
  function createImageActionBar(paragraph: HTMLElement): HTMLElement {
    return createActionHost('cv-inline-img-actions', [
      {
        label: '沿用上次标签',
        icon: 'fa-solid fa-repeat',
        severity: 'secondary',
        variant: 'outlined',
        onClick: () => void handleGenerateWithLastPrompt(paragraph),
      },
      {
        label: '重新生成标签',
        icon: 'fa-solid fa-robot',
        onClick: () => void handleGenerateWithFreshPrompt(paragraph),
      },
      {
        label: '移除图片',
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
    await runImageGeneration(paragraph, true, () => generateImageResultFromContext(paragraph));
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
    await runImageGeneration(paragraph, false, () => generateImageResultFromSnapshot(snapshot));
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
    task: () => Promise<InlineGenerationResult>,
  ): Promise<void> {
    if (!isRuntimeEnabled() || isGenerating.value) return;

    const requestError = getGenerationRequestError(requiresPromptLlm);
    if (requestError) {
      toastr.warning(requestError);
      return;
    }

    isGenerating.value = true;

    try {
      const result = await task();
      promptSnapshots.set(paragraph, result.promptSnapshot);
      const objectUrl = URL.createObjectURL(result.imageBlob);
      objectUrls.add(objectUrl);
      insertImageCard(paragraph, objectUrl);
      toastr.success('图片生成完成');
    } catch (error) {
      const message = error instanceof Error ? error.message : '图片生成失败';
      toastr.error(message);
      console.error('[InlineImageGeneration]', error);
    } finally {
      isGenerating.value = false;
    }
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
   * @returns 图片与提示词快照
   */
  async function generateImageResultFromContext(paragraph: HTMLElement): Promise<InlineGenerationResult> {
    const context = extractContextAroundParagraph(
      paragraph,
      normalizeContextParagraphCount(settings.promptLlm.contextParagraphCount),
    );
    return settings.imageSource === 'comfyui'
      ? generateComfyUIImageResult(context)
      : generateNovelAIImageResult(context);
  }

  /**
   * 使用上次提示词快照直接请求当前图像源
   * @param snapshot 上次成功使用的提示词快照
   * @returns 图片与提示词快照
   */
  async function generateImageResultFromSnapshot(snapshot: InlinePromptSnapshot): Promise<InlineGenerationResult> {
    toastr.info('正在使用上次标签重新生成图片...');

    if (settings.imageSource === 'comfyui') {
      return {
        promptSnapshot: snapshot,
        imageBlob: await generateComfyUIImageFromPrompts(settings.comfyui, snapshot),
      };
    }

    return {
      promptSnapshot: snapshot,
      imageBlob: await generateNovelAIImageFromPrompts(settings.novelai, snapshot),
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
   * @param context 焦点段落上下文
   * @returns NovelAI 返回的图片与提示词快照
   */
  async function generateNovelAIImageResult(context: string[]): Promise<InlineGenerationResult> {
    toastr.info('正在生成提示词...');
    const schemaFields = buildPromptLlmSchemaFields(settings.promptLlm);
    const rawResponse = await generatePromptTextFromRuntimeContext(
      context,
      settings.promptLlm,
      settings.promptLlmMessagePresets,
      settings.promptProfiles,
      schemaFields,
    );

    const overrides = buildNovelAILlmPromptOverrides(settings.promptLlm, rawResponse);
    const request = buildNovelAIResolvedRequest(
      settings.novelai,
      settings.imagePromptPresets,
      settings.promptLlm,
      overrides,
    );

    toastr.info('正在生成图片...');
    return {
      promptSnapshot: request.prompts,
      imageBlob: (await generateNovelAIImageFromResolvedRequest(request)).imageBlob,
    };
  }

  /**
   * 使用 ComfyUI 生成图片
   * @param context 焦点段落上下文
   * @returns ComfyUI 返回的图片与提示词快照
   */
  async function generateComfyUIImageResult(context: string[]): Promise<InlineGenerationResult> {
    toastr.info('正在生成提示词...');
    const schemaFields = buildPromptLlmSchemaFields(settings.promptLlm);
    const prompts = await generatePromptFromRuntimeContext(
      context,
      settings.promptLlm,
      settings.promptLlmMessagePresets,
      settings.promptProfiles,
      schemaFields,
    );

    toastr.info('正在生成图片...');
    const request = buildComfyUIResolvedRequest(settings.comfyui, settings.imagePromptPresets, prompts);
    return {
      promptSnapshot: request.snapshot,
      imageBlob: await generateComfyUIImageFromResolvedRequest(settings.comfyui, request),
    };
  }

  /**
   * 在段落后插入临时图片(纯净展示,hover/点击浮现操作图标)
   */
  function insertImageCard(p: HTMLElement, objectUrl: string): void {
    removeImageCard(p);

    const wrap = document.createElement('div');
    wrap.className = 'cv-inline-img-wrap';

    const img = document.createElement('img');
    img.src = objectUrl;
    img.alt = '生成的图片';
    img.draggable = false;

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

    // 取消选中
    deselectParagraph();
  }

  return {
    attachChatClickListener,
    detachChatClickListener,
    deselectParagraph,
    cleanup,
  };
}

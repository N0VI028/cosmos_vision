import type { CosmosVisionSettings, PromptLlmContext } from '@/constants/novelai';
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
  buildPromptLlmContextFromParagraph,
  findChatParagraph,
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
    document.addEventListener('pointerdown', handleChatPointerDown, true);
  }

  /**
   * 移除聊天区点击监听
   */
  function detachChatClickListener(): void {
    document.removeEventListener('pointerdown', handleChatPointerDown, true);
  }

  /** 记录 pointerdown 的位置,用于区分点击和拖拽 */
  let pointerDownX = 0;
  let pointerDownY = 0;

  /**
   * 处理聊天区 pointerdown 事件
   * 使用 pointerdown 替代 click,避免被其他插件的 touchend.preventDefault() 阻断
   */
  function handleChatPointerDown(e: PointerEvent): void {
    if (!isRuntimeEnabled()) return;

    // 记录起始位置
    pointerDownX = e.clientX;
    pointerDownY = e.clientY;

    const target = e.target as HTMLElement;

    // 点击生图按钮或图片卡片内部时不处理
    if (target.closest('.cv-inline-toolbar') || target.closest('.cv-inline-img-wrap')) {
      return;
    }

    // 监听 pointerup 以区分点击和拖拽
    document.addEventListener('pointerup', handleChatPointerUp, { once: true, capture: true });
  }

  /**
   * 处理聊天区 pointerup 事件
   * 检查移动距离,仅处理短距离移动(真正的点击)
   */
  function handleChatPointerUp(e: PointerEvent): void {
    if (!isRuntimeEnabled()) return;

    // 计算移动距离
    const moveX = Math.abs(e.clientX - pointerDownX);
    const moveY = Math.abs(e.clientY - pointerDownY);

    // 移动距离超过 10px 视为拖拽,不处理
    if (moveX > 10 || moveY > 10) {
      return;
    }

    const target = e.target as HTMLElement;

    // 点击生图按钮或图片卡片内部时不处理
    if (target.closest('.cv-inline-toolbar') || target.closest('.cv-inline-img-wrap')) {
      return;
    }

    // 向上回溯,兼容点击 p 内部 em/q/strong 等子元素
    const p = findChatParagraph(target);
    if (p) {
      // 避免阻断正常的链接、按钮等元素交互
      if (target.closest('a, button, input, textarea, [role="button"]')) {
        return;
      }
      // 阻止 pointerup 默认行为,从而避免产生 click 事件唤起手机键盘
      e.preventDefault();

      // 如果点击的是已选中的段落,则取消选中(切换行为)
      if (selectedParagraph.value === p) {
        deselectParagraph();
      } else {
        selectParagraph(p);
      }
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

    // 阻止交互事件冒泡,防止触发底层的输入框聚焦
    const stopEvents = ['pointerdown', 'mousedown', 'touchstart', 'pointerup', 'mouseup', 'touchend', 'click'];
    stopEvents.forEach(evt => host.addEventListener(evt, e => e.stopPropagation()));

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
    const context = buildPromptLlmContextFromParagraph(paragraph);
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
   * @param context Prompt LLM 运行时上下文
   * @returns NovelAI 返回的图片与提示词快照
   */
  async function generateNovelAIImageResult(context: PromptLlmContext): Promise<InlineGenerationResult> {
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
   * @param context Prompt LLM 运行时上下文
   * @returns ComfyUI 返回的图片与提示词快照
   */
  async function generateComfyUIImageResult(context: PromptLlmContext): Promise<InlineGenerationResult> {
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

    // 阻止交互事件冒泡,防止触发底层的输入框聚焦
    const stopEvents = ['pointerdown', 'mousedown', 'touchstart', 'pointerup', 'mouseup', 'touchend', 'click'];
    stopEvents.forEach(evt => wrap.addEventListener(evt, e => e.stopPropagation()));

    const img = document.createElement('img');
    img.src = objectUrl;
    img.alt = '生成的图片';
    img.draggable = false;

    img.addEventListener('click', (e: MouseEvent) => {
      handleImageClick(e, img, wrap, isRuntimeEnabled, promptSnapshots.get(p));
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

/**
 * 处理内联生成的图片点击事件
 * @param e 点击事件对象
 * @param img 图片元素
 * @param wrap 外层容器元素
 * @param isRuntimeEnabled 是否启用运行时
 * @param snapshot 提示词快照
 */
function handleImageClick(
  e: MouseEvent,
  img: HTMLImageElement,
  wrap: HTMLElement,
  isRuntimeEnabled: () => boolean,
  snapshot?: InlinePromptSnapshot,
): void {
  if (!isRuntimeEnabled()) return;
  e.stopPropagation();
  const isTouch = window.matchMedia('(hover: none)').matches;
  if (isTouch && !wrap.classList.contains('cv-inline-img-active')) {
    wrap.classList.add('cv-inline-img-active');
  } else {
    openLightbox(img.src, snapshot);
    if (isTouch) wrap.classList.remove('cv-inline-img-active');
  }
}

/**
 * 复制文本并更新按钮状态
 * @param text 复制的文本
 * @param btn 触发复制的按钮
 */
async function copyText(text: string, btn: HTMLElement): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    const originalHTML = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-check"></i> 已复制';
    btn.classList.add('copied');
    setTimeout(() => {
      btn.innerHTML = originalHTML;
      btn.classList.remove('copied');
    }, 1500);
  } catch (err) {
    toastr.error('复制失败');
  }
}

/**
 * 创建 Lightbox 的 DOM 结构
 * @param src 图片地址
 * @param snapshot 提示词快照
 * @returns Lightbox 根元素
 */
function createLightboxDOM(src: string, snapshot?: InlinePromptSnapshot): HTMLElement {
  const overlay = document.createElement('div');
  overlay.className = 'cv-lightbox-overlay';

  const pos = snapshot?.positivePrompt || '无正向提示词';
  const neg = snapshot?.negativePrompt || '无负面提示词';

  overlay.innerHTML = `
    <button class="cv-lightbox-close"><i class="fa-solid fa-xmark"></i></button>
    <div class="cv-lightbox-wrapper">
      <div class="cv-lightbox-img-box">
        <img class="cv-lightbox-preview-img" src="${src}" alt="放大图片" draggable="false" />
      </div>
      <div class="cv-lightbox-info">
        <div class="cv-lightbox-info-header">
          <span class="cv-lightbox-info-title">提示词详情</span>
          <button class="cv-lightbox-toggle-btn" title="隐藏/显示提示词">
            <i class="fa-solid fa-eye-slash"></i> <span>隐藏提示词</span>
          </button>
        </div>
        <div class="cv-lightbox-info-body">
          <div class="cv-lightbox-prompt-group">
            <div class="cv-lightbox-prompt-header">
              <span class="cv-lightbox-prompt-title cv-lightbox-title-pos">正向提示词</span>
              <button class="cv-lightbox-copy-btn cv-copy-pos"><i class="fa-solid fa-copy"></i> 复制</button>
            </div>
            <div class="cv-lightbox-prompt-content">${pos}</div>
          </div>
          <div class="cv-lightbox-prompt-group">
            <div class="cv-lightbox-prompt-header">
              <span class="cv-lightbox-prompt-title cv-lightbox-title-neg">负面提示词</span>
              <button class="cv-lightbox-copy-btn cv-copy-neg"><i class="fa-solid fa-copy"></i> 复制</button>
            </div>
            <div class="cv-lightbox-prompt-content">${neg}</div>
          </div>
        </div>
      </div>
    </div>
  `;
  return overlay;
}

/**
 * 绑定 Lightbox 相关的事件
 * @param overlay Lightbox 根元素
 * @param snapshot 提示词快照
 */
function bindLightboxEvents(overlay: HTMLElement, snapshot?: InlinePromptSnapshot): void {
  const close = () => {
    overlay.classList.remove('cv-lightbox-active');
    setTimeout(() => overlay.remove(), 250);
    document.removeEventListener('keydown', handleEsc);
  };
  const handleEsc = (e: KeyboardEvent) => e.key === 'Escape' && close();
  document.addEventListener('keydown', handleEsc);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || e.target === overlay.querySelector('.cv-lightbox-img-box')) close();
  });
  overlay.querySelector('.cv-lightbox-close')?.addEventListener('click', close);
  
  // 折叠隐藏/显示控制
  const info = overlay.querySelector('.cv-lightbox-info') as HTMLElement;
  const toggleBtn = overlay.querySelector('.cv-lightbox-toggle-btn') as HTMLElement;
  toggleBtn?.addEventListener('click', () => {
    const isCollapsed = info.classList.toggle('cv-info-collapsed');
    toggleBtn.innerHTML = isCollapsed 
      ? '<i class="fa-solid fa-eye"></i> <span>显示提示词</span>' 
      : '<i class="fa-solid fa-eye-slash"></i> <span>隐藏提示词</span>';
  });

  // 复制提示词
  overlay.querySelector('.cv-copy-pos')?.addEventListener('click', (e) => copyText(snapshot?.positivePrompt || '', e.currentTarget as HTMLElement));
  overlay.querySelector('.cv-copy-neg')?.addEventListener('click', (e) => copyText(snapshot?.negativePrompt || '', e.currentTarget as HTMLElement));
}

/**
 * 打开 Lightbox 大图预览弹窗
 * @param src 图片地址
 * @param snapshot 提示词快照
 */
function openLightbox(src: string, snapshot?: InlinePromptSnapshot): void {
  const overlay = createLightboxDOM(src, snapshot);
  document.body.appendChild(overlay);
  requestAnimationFrame(() => {
    overlay.classList.add('cv-lightbox-active');
  });
  bindLightboxEvents(overlay, snapshot);
}

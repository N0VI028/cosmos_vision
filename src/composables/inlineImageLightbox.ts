import type { ImagePromptVibeRef } from '@/constants/image-prompt';
import type { ImageSource } from '@/constants/comfyui';
import type { ComfyUIRequestSnapshot } from '@/services/comfyui/workflow';
import type { NovelAIFinalPrompts } from '@/services/novelai/api';
import type { NovelAIVibeParameters } from '@/services/novelai/vibe-types';

/** 内联生图提示词快照 */
export interface InlinePromptSnapshot {
  positivePrompt: string;
  negativePrompt: string;
  imageSource?: ImageSource;
  novelai?: NovelAIFinalPrompts;
  comfyui?: ComfyUIRequestSnapshot;
}

/**
 * 克隆为 IndexedDB 可结构化保存的纯提示词快照
 * @param snapshot 原始提示词快照
 * @returns 去除响应式代理引用后的快照
 */
export function cloneInlinePromptSnapshot(snapshot: InlinePromptSnapshot): InlinePromptSnapshot {
  return {
    positivePrompt: snapshot.positivePrompt,
    negativePrompt: snapshot.negativePrompt,
    imageSource: snapshot.imageSource,
    novelai: snapshot.novelai ? cloneNovelAIFinalPrompts(snapshot.novelai) : undefined,
    comfyui: snapshot.comfyui ? cloneComfyUIRequestSnapshot(snapshot.comfyui) : undefined,
  };
}

/**
 * 克隆 NovelAI 最终提示词
 * @param prompts 原始 NovelAI 提示词
 * @returns 纯对象提示词
 */
function cloneNovelAIFinalPrompts(prompts: NovelAIFinalPrompts): NovelAIFinalPrompts {
  return {
    positivePrompt: prompts.positivePrompt,
    negativePrompt: prompts.negativePrompt,
    vibeReferences: prompts.vibeReferences?.map(cloneImagePromptVibeRef),
    vibeParameters: prompts.vibeParameters ? cloneNovelAIVibeParameters(prompts.vibeParameters) : undefined,
  };
}

/**
 * 克隆 NovelAI vibe 引用
 * @param vibe 原始 vibe 引用
 * @returns 纯对象 vibe 引用
 */
function cloneImagePromptVibeRef(vibe: ImagePromptVibeRef): ImagePromptVibeRef {
  return {
    id: vibe.id,
    sourceHash: vibe.sourceHash,
    enabled: vibe.enabled,
    referenceStrength: vibe.referenceStrength,
    informationExtracted: vibe.informationExtracted,
    temporary: vibe.temporary,
  };
}

/**
 * 克隆 NovelAI 官方 vibe 参数数组
 * @param parameters 原始 vibe 参数
 * @returns 纯数组 vibe 参数
 */
function cloneNovelAIVibeParameters(parameters: NovelAIVibeParameters): NovelAIVibeParameters {
  return {
    reference_image_multiple: [...parameters.reference_image_multiple],
    reference_strength_multiple: [...parameters.reference_strength_multiple],
    reference_information_extracted_multiple: [...parameters.reference_information_extracted_multiple],
  };
}

/**
 * 克隆 ComfyUI 请求快照
 * @param snapshot 原始 ComfyUI 快照
 * @returns 纯对象 ComfyUI 快照
 */
function cloneComfyUIRequestSnapshot(snapshot: ComfyUIRequestSnapshot): ComfyUIRequestSnapshot {
  return {
    ...snapshot,
    loras: snapshot.loras.map(lora => ({ name: lora.name, strength: lora.strength })),
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
export function handleInlineImageClick(
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
    return;
  }
  openLightbox(img.src, snapshot);
  if (isTouch) wrap.classList.remove('cv-inline-img-active');
}

/**
 * 复制文本并更新按钮状态
 * @param text 复制的文本
 * @param btn 触发复制的按钮
 */
async function copyText(text: string, btn: HTMLElement): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    markCopyButtonSuccess(btn);
  } catch {
    toastr.error('复制失败');
  }
}

/**
 * 标记复制按钮成功状态
 * @param btn 触发复制的按钮
 */
function markCopyButtonSuccess(btn: HTMLElement): void {
  const originalHTML = btn.innerHTML;
  btn.innerHTML = '<i class="fa-solid fa-check"></i> 已复制';
  btn.classList.add('copied');
  window.setTimeout(() => {
    btn.innerHTML = originalHTML;
    btn.classList.remove('copied');
  }, 1500);
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
  overlay.innerHTML = buildLightboxMarkup(src, snapshot);
  return overlay;
}

/**
 * 构建 Lightbox HTML
 * @param src 图片地址
 * @param snapshot 提示词快照
 * @returns HTML 字符串
 */
function buildLightboxMarkup(src: string, snapshot?: InlinePromptSnapshot): string {
  return `
    <button class="cv-lightbox-close"><i class="fa-solid fa-xmark"></i></button>
    <div class="cv-lightbox-wrapper">
      <div class="cv-lightbox-img-box">
        <img class="cv-lightbox-preview-img" src="${escapeHtml(src)}" alt="放大图片" draggable="false" />
      </div>
      <div class="cv-lightbox-info">
        ${buildLightboxHeaderMarkup()}
        <div class="cv-lightbox-info-body">
          ${buildPromptGroupMarkup('pos', '正向提示词', snapshot?.positivePrompt || '无正向提示词')}
          ${buildPromptGroupMarkup('neg', '负面提示词', snapshot?.negativePrompt || '无负面提示词')}
        </div>
      </div>
    </div>
  `;
}

/**
 * 构建 Lightbox 头部 HTML
 * @returns HTML 字符串
 */
function buildLightboxHeaderMarkup(): string {
  return `
    <div class="cv-lightbox-info-header">
      <span class="cv-lightbox-info-title">提示词详情</span>
      <button class="cv-lightbox-toggle-btn" title="隐藏/显示提示词">
        <i class="fa-solid fa-eye-slash"></i> <span>隐藏提示词</span>
      </button>
    </div>
  `;
}

/**
 * 构建提示词分组 HTML
 * @param kind 提示词类型
 * @param title 分组标题
 * @param text 提示词内容
 * @returns HTML 字符串
 */
function buildPromptGroupMarkup(kind: 'pos' | 'neg', title: string, text: string): string {
  return `
    <div class="cv-lightbox-prompt-group">
      <div class="cv-lightbox-prompt-header">
        <span class="cv-lightbox-prompt-title cv-lightbox-title-${kind}">${title}</span>
        <button class="cv-lightbox-copy-btn cv-copy-${kind}"><i class="fa-solid fa-copy"></i> 复制</button>
      </div>
      <div class="cv-lightbox-prompt-content">${escapeHtml(text)}</div>
    </div>
  `;
}

/**
 * 转义 Lightbox 内插文本
 * @param value 原始文本
 * @returns 安全 HTML 文本
 */
function escapeHtml(value: string): string {
  const node = document.createElement('span');
  node.textContent = value;
  return node.innerHTML;
}

/**
 * 绑定 Lightbox 相关的事件
 * @param overlay Lightbox 根元素
 * @param snapshot 提示词快照
 */
function bindLightboxEvents(overlay: HTMLElement, snapshot?: InlinePromptSnapshot): void {
  const close = () => closeLightbox(overlay, handleEsc);
  const handleEsc = (e: KeyboardEvent) => e.key === 'Escape' && close();
  document.addEventListener('keydown', handleEsc);
  overlay.addEventListener('click', e => handleOverlayClick(e, overlay, close));
  overlay.querySelector('.cv-lightbox-close')?.addEventListener('click', close);
  bindLightboxToggle(overlay);
  bindLightboxCopyButtons(overlay, snapshot);
}

/**
 * 关闭 Lightbox 并解绑键盘事件
 * @param overlay Lightbox 根元素
 * @param handleEsc ESC 事件处理器
 */
function closeLightbox(overlay: HTMLElement, handleEsc: (e: KeyboardEvent) => void): void {
  overlay.classList.remove('cv-lightbox-active');
  window.setTimeout(() => overlay.remove(), 250);
  document.removeEventListener('keydown', handleEsc);
}

/**
 * 处理 Lightbox 背景点击
 * @param e 点击事件
 * @param overlay Lightbox 根元素
 * @param close 关闭方法
 */
function handleOverlayClick(e: MouseEvent, overlay: HTMLElement, close: () => void): void {
  if (e.target === overlay || e.target === overlay.querySelector('.cv-lightbox-img-box')) close();
}

/**
 * 绑定提示词详情折叠按钮
 * @param overlay Lightbox 根元素
 */
function bindLightboxToggle(overlay: HTMLElement): void {
  const info = overlay.querySelector('.cv-lightbox-info') as HTMLElement | null;
  const toggleBtn = overlay.querySelector('.cv-lightbox-toggle-btn') as HTMLElement | null;
  toggleBtn?.addEventListener('click', () => togglePromptInfo(info, toggleBtn));
}

/**
 * 切换提示词详情显示状态
 * @param info 提示词面板
 * @param toggleBtn 切换按钮
 */
function togglePromptInfo(info: HTMLElement | null, toggleBtn: HTMLElement): void {
  const isCollapsed = Boolean(info?.classList.toggle('cv-info-collapsed'));
  const icon = isCollapsed ? 'fa-eye' : 'fa-eye-slash';
  const text = isCollapsed ? '显示提示词' : '隐藏提示词';
  toggleBtn.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${text}</span>`;
}

/**
 * 绑定提示词复制按钮
 * @param overlay Lightbox 根元素
 * @param snapshot 提示词快照
 */
function bindLightboxCopyButtons(overlay: HTMLElement, snapshot?: InlinePromptSnapshot): void {
  const copyPos = overlay.querySelector('.cv-copy-pos');
  const copyNeg = overlay.querySelector('.cv-copy-neg');
  copyPos?.addEventListener('click', e => copyText(snapshot?.positivePrompt || '', e.currentTarget as HTMLElement));
  copyNeg?.addEventListener('click', e => copyText(snapshot?.negativePrompt || '', e.currentTarget as HTMLElement));
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

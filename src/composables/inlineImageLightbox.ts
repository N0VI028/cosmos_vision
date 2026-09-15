import type { ImageSource } from '@/constants/comfyui';
import type { CharacterPromptItem } from '@/constants/novelai';
import type { ImagePromptVibeRef } from '@/constants/novelai-vibe';
import type { ComfyUIRequestSnapshot } from '@/services/comfyui/types';
import type { NovelAIFinalPrompts } from '@/services/novelai/api';
import type { NovelAIVibeParameters } from '@/services/novelai/vibe-types';
import { reactive } from 'vue';

/** 内联生图提示词快照 */
export interface InlinePromptSnapshot {
  positivePrompt: string;
  negativePrompt: string;
  imageSource?: ImageSource;
  novelai?: NovelAIFinalPrompts;
  comfyui?: ComfyUIRequestSnapshot;
}

export interface InlineLightboxActions {
  onDownload?: () => void | Promise<void>;
}

/** 灯箱响应式状态（模块级单例，组件与命令式调用方共享） */
export interface InlineLightboxState {
  open: boolean;
  src: string;
  snapshot?: InlinePromptSnapshot;
  onDownload?: () => void | Promise<void>;
}

export const inlineLightboxState = reactive<InlineLightboxState>({ open: false, src: '' });

/**
 * 打开 Lightbox 大图预览弹窗（由 InlineImageLightbox 组件渲染）
 * @param src 图片地址
 * @param snapshot 提示词快照
 * @param actions Lightbox 操作集合
 */
export function openInlineImageLightbox(
  src: string,
  snapshot?: InlinePromptSnapshot,
  actions?: InlineLightboxActions,
): void {
  inlineLightboxState.src = src;
  inlineLightboxState.snapshot = snapshot;
  inlineLightboxState.onDownload = actions?.onDownload;
  inlineLightboxState.open = true;
}

/**
 * 关闭 Lightbox 大图预览弹窗
 */
export function closeInlineImageLightbox(): void {
  inlineLightboxState.open = false;
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
    useCharacterCoords: prompts.useCharacterCoords,
    characterPrompts: prompts.characterPrompts?.map(cloneCharacterPromptItem),
    vibeReferences: prompts.vibeParameters ? undefined : prompts.vibeReferences?.map(cloneImagePromptVibeRef),
    vibeParameters: prompts.vibeParameters ? cloneNovelAIVibeParameters(prompts.vibeParameters) : undefined,
  };
}

/**
 * 克隆单个 NovelAI 角色提示词
 * @param item 原始角色提示词
 * @returns 纯对象角色提示词
 */
function cloneCharacterPromptItem(item: CharacterPromptItem): CharacterPromptItem {
  return {
    positivePrompt: item.positivePrompt,
    negativePrompt: item.negativePrompt,
    position: { x: item.position.x, y: item.position.y },
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
    endpoint: snapshot.endpoint,
    positivePrompt: snapshot.positivePrompt,
    negativePrompt: snapshot.negativePrompt,
    imageOutputNodeId: snapshot.imageOutputNodeId,
    promptBindings: snapshot.promptBindings.map(item => ({ ...item })),
    seedValues: snapshot.seedValues.map(item => ({ ...item })),
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
  actions?: InlineLightboxActions,
): void {
  if (!isRuntimeEnabled()) return;
  e.stopPropagation();
  const isTouch = window.matchMedia('(hover: none)').matches;
  if (isTouch && !wrap.classList.contains('cv-inline-img-active')) {
    wrap.classList.add('cv-inline-img-active');
    ensureInlineImageOutsideDismiss();
    return;
  }
  openInlineImageLightbox(img.src, snapshot, actions);
  if (isTouch) wrap.classList.remove('cv-inline-img-active');
}

/** 是否已绑定移动端外部点击收起监听 */
let inlineImageOutsideDismissBound = false;

/**
 * 懒绑定全局监听: 移动端点击图片外部时收起段落图片操作 UI
 */
function ensureInlineImageOutsideDismiss(): void {
  if (inlineImageOutsideDismissBound) return;
  inlineImageOutsideDismissBound = true;
  // 捕获阶段监听,不受内联控件 stopPropagation 影响
  document.addEventListener('pointerdown', dismissActiveInlineImages, true);
}

/**
 * 收起所有点击落在图片容器之外的激活态操作 UI
 * @param event 指针按下事件
 */
function dismissActiveInlineImages(event: PointerEvent): void {
  const target = event.target as Node | null;
  document.querySelectorAll<HTMLElement>('.cv-inline-img-wrap.cv-inline-img-active').forEach(wrap => {
    if (!target || !wrap.contains(target)) wrap.classList.remove('cv-inline-img-active');
  });
  // 无激活项时解绑,避免常驻监听
  if (!document.querySelector('.cv-inline-img-wrap.cv-inline-img-active')) {
    document.removeEventListener('pointerdown', dismissActiveInlineImages, true);
    inlineImageOutsideDismissBound = false;
  }
}

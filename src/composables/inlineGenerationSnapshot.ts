import type { InlinePromptSnapshot } from '@/composables/inlineImageLightbox';
import type { ComfyUIRequestSnapshot } from '@/services/comfyui/types';
import type { NovelAIFinalPrompts } from '@/services/novelai/api';
import { formatTimestampForFileName } from '@/services/inline-image/filename-utils';

/**
 * 创建 NovelAI 内联提示词快照
 * @param prompts NovelAI 最终提示词
 * @returns 内联提示词快照
 */
export function createNovelAISnapshot(prompts: NovelAIFinalPrompts): InlinePromptSnapshot {
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
export function createComfyUISnapshot(snapshot: ComfyUIRequestSnapshot): InlinePromptSnapshot {
  return {
    positivePrompt: snapshot.positivePrompt,
    negativePrompt: snapshot.negativePrompt,
    imageSource: 'comfyui',
    comfyui: snapshot,
  };
}

/**
 * 构建内联单图下载文件名
 * @param createdAt 图片创建时间
 * @returns 不含扩展名的文件名
 */
export function buildInlineImageDownloadBaseName(createdAt: number): string {
  return `cosmos-vision-inline-image-${formatTimestampForFileName(createdAt)}`;
}

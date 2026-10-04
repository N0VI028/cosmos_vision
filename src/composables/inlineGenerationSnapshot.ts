import type { InlinePromptSnapshot } from '@/composables/inlineImageLightbox';
import type { ComfyUIRequestSnapshot } from '@/services/comfyui/types';
import type { NovelAIFinalPrompts } from '@/services/novelai/api';
import type { NovelAIRequestInfo, NovelAIRequestSnapshot } from '@/services/novelai/types';
import { formatTimestampForFileName } from '@/services/inline-image/filename-utils';

/**
 * 从完整 NovelAI 请求快照提取去除提示词后的参数元数据
 * @param snapshot 完整请求快照
 * @returns 仅保留生成参数与渠道的元数据
 */
export function toNovelAIRequestInfo(snapshot: NovelAIRequestSnapshot): NovelAIRequestInfo {
  const { positivePrompt, negativePrompt, characterPrompts, ...rest } = snapshot;
  return rest;
}

/**
 * 创建 NovelAI 内联提示词快照
 * @param prompts NovelAI 最终提示词（新鲜生图链路含 promptParts 部件分解）
 * @param request 可选的 NovelAI 生成参数与命中渠道元数据
 * @returns 内联提示词快照
 */
export function createNovelAISnapshot(
  prompts: NovelAIFinalPrompts,
  request?: NovelAIRequestInfo,
): InlinePromptSnapshot {
  return {
    positivePrompt: prompts.positivePrompt,
    negativePrompt: prompts.negativePrompt,
    imageSource: 'novelai',
    novelai: prompts,
    promptParts: prompts.promptParts
      ? { positive: { ...prompts.promptParts.positive }, negative: { ...prompts.promptParts.negative } }
      : undefined,
    ...(request ? { novelaiRequest: request } : {}),
  };
}

/**
 * 创建 ComfyUI 内联提示词快照
 * @param snapshot ComfyUI 请求快照
 * @param promptParts 部件分解（新鲜生图链路由调用方组装）
 * @returns 内联提示词快照
 */
export function createComfyUISnapshot(
  snapshot: ComfyUIRequestSnapshot,
  promptParts?: InlinePromptSnapshot['promptParts'],
): InlinePromptSnapshot {
  return {
    imageSource: 'comfyui',
    comfyui: snapshot,
    promptParts,
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

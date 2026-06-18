import type {
  ImagePromptPreset,
  ImagePromptPresetReferences,
  ImagePromptPresetSettings,
} from '@/constants/image-prompt';
import { clampImagePromptPlaceholderOffset } from '@/constants/image-prompt';

/** 生图正负提示词 */
export interface ImagePromptPair {
  positivePrompt: string;
  negativePrompt: string;
}

/**
 * 查找指定 ID 的生图固定提示词预设
 * @param presets 单侧预设列表
 * @param presetId 预设 ID
 * @returns 命中的预设或首个预设
 */
export function findImagePromptPreset(
  presets: readonly ImagePromptPreset[],
  presetId: string,
): ImagePromptPreset | undefined {
  return presets.find(preset => preset.id === presetId) ?? presets[0];
}

/**
 * 读取指定 ID 的生图固定提示词预设
 * @param presets 单侧预设列表
 * @param presetId 预设 ID
 * @returns 命中的预设
 */
export function getImagePromptPreset(presets: readonly ImagePromptPreset[], presetId: string): ImagePromptPreset {
  const preset = findImagePromptPreset(presets, presetId);
  if (!preset) throw new Error('未找到当前生图提示词预设');
  return preset;
}

/**
 * 解析固定提示词预设中的 LLM 占位符
 * @param preset 固定提示词预设
 * @param llmPrompt LLM 输出文本
 * @returns 占位符插入后的固定文本
 */
export function resolveImagePromptPreset(preset: ImagePromptPreset, llmPrompt = ''): string {
  const text = preset.text ?? '';
  const offset = clampImagePromptPlaceholderOffset(text, preset.placeholderOffset);
  return `${text.slice(0, offset)}${llmPrompt}${text.slice(offset)}`.trim();
}

/**
 * 按渠道引用解析共享生图提示词预设
 * @param presetSettings 共享预设集合
 * @param references 渠道引用的预设 ID
 * @param prompts 本次 LLM 或手填提示词
 * @returns 拼接后的正负提示词
 */
export function buildImagePromptPair(
  presetSettings: ImagePromptPresetSettings,
  references: ImagePromptPresetReferences,
  prompts: ImagePromptPair,
): ImagePromptPair {
  return {
    positivePrompt: resolveReferencedImagePrompt(
      presetSettings.positive,
      references.positivePromptPresetId,
      prompts.positivePrompt,
    ),
    negativePrompt: resolveReferencedImagePrompt(
      presetSettings.negative,
      references.negativePromptPresetId,
      prompts.negativePrompt,
    ),
  };
}

/**
 * 解析单侧引用的生图提示词
 * @param presets 单侧预设列表
 * @param presetId 预设 ID
 * @param prompt LLM 或手填提示词
 * @returns 拼接后的提示词
 */
function resolveReferencedImagePrompt(presets: readonly ImagePromptPreset[], presetId: string, prompt: string): string {
  return resolveImagePromptPreset(getImagePromptPreset(presets, presetId), prompt);
}

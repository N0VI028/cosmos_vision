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
 * 从套用预设模板后的完整提示词中精确剥离模板，提取中间的核心提示词
 * 前缀 = preset.text.slice(0, placeholderOffset)，后缀 = preset.text.slice(placeholderOffset)
 * 若整体文本匹配前后缀则返回中间部分，若模板被用户改动导致剥离失败则返回 null
 * @param resolved 套用模板后的完整文本
 * @param preset 目标预设
 * @returns 剥离出的核心文本；若与模板不匹配则返回 null
 */
export function stripImagePromptPresetText(resolved: string, preset: ImagePromptPreset): string | null {
  const text = preset.text ?? '';
  const offset = clampImagePromptPlaceholderOffset(text, preset.placeholderOffset);
  const prefix = text.slice(0, offset);
  const suffix = text.slice(offset);

  const tryStrip = (target: string): string | null => {
    if (!target.startsWith(prefix)) return null;
    if (!suffix) return target.slice(prefix.length);
    if (target.length >= prefix.length + suffix.length && target.endsWith(suffix)) {
      return target.slice(prefix.length, target.length - suffix.length);
    }
    return null;
  };

  const direct = tryStrip(resolved);
  if (direct !== null) return direct;
  return tryStrip(resolved.trim());
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

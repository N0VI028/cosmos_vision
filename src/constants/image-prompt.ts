/**
 * 生图固定提示词预设
 * 由所有生图渠道共享,渠道设置只保存当前引用的预设 ID
 */

export const DEFAULT_IMAGE_PROMPT_VIBE_REFERENCE_STRENGTH = 0.6;
export const DEFAULT_IMAGE_PROMPT_VIBE_INFORMATION_EXTRACTED = 1;

/** 生图提示词预设绑定的 NovelAI vibe 引用 */
export interface ImagePromptVibeRef {
  id: string;
  sourceHash: string;
  enabled: boolean;
  referenceStrength: number;
  informationExtracted: number;
  temporary?: boolean;
}

/** 生图固定提示词预设 */
export interface ImagePromptPreset {
  id: string;
  name: string;
  text: string;
  placeholderOffset: number;
  vibes: ImagePromptVibeRef[];
}

/** 生图正负固定提示词预设集合 */
export interface ImagePromptPresetSettings {
  positive: ImagePromptPreset[];
  negative: ImagePromptPreset[];
}

/** 生图渠道引用的固定提示词预设 ID */
export interface ImagePromptPresetReferences {
  positivePromptPresetId: string;
  negativePromptPresetId: string;
}

/**
 * 创建生图固定提示词预设
 * @param id 预设 id
 * @param name 预设名称
 * @param text 固定文本
 * @returns 预设对象
 */
export function createImagePromptPreset(id: string, name: string, text = ''): ImagePromptPreset {
  return {
    id,
    name,
    text,
    placeholderOffset: clampImagePromptPlaceholderOffset(text, text.length),
    vibes: [],
  };
}

/**
 * 创建单侧生图固定提示词预设列表
 * @param id 默认预设 id
 * @param name 默认预设名称
 * @param text 固定文本
 * @returns 预设列表
 */
export function createImagePromptPresetList(id: string, name: string, text = ''): ImagePromptPreset[] {
  return [createImagePromptPreset(id, name, text)];
}

/**
 * 创建生图正负固定提示词预设集合
 * @param positiveId 正面默认预设 id
 * @param positiveName 正面默认预设名称
 * @param negativeId 负面默认预设 id
 * @param negativeName 负面默认预设名称
 * @returns 生图预设集合
 */
export function createImagePromptPresetSettings(
  positiveId: string,
  positiveName: string,
  negativeId: string,
  negativeName: string,
): ImagePromptPresetSettings {
  return {
    positive: createImagePromptPresetList(positiveId, positiveName),
    negative: createImagePromptPresetList(negativeId, negativeName),
  };
}

/**
 * 约束生图固定提示词占位符位置
 * @param text 固定提示词文本
 * @param offset 占位符位置
 * @returns 合法占位符位置
 */
export function clampImagePromptPlaceholderOffset(text: string, offset: number): number {
  return Math.min(Math.max(offset, 0), text.length);
}

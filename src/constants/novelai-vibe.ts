/**
 * NovelAI vibe 预设
 * 独立于共享生图提示词预设，仅由 NovelAI 使用
 */

export const DEFAULT_IMAGE_PROMPT_VIBE_REFERENCE_STRENGTH = 0.6;
export const DEFAULT_IMAGE_PROMPT_VIBE_INFORMATION_EXTRACTED = 1;
export const DEFAULT_NOVELAI_VIBE_PRESET_ID = 'novelai-vibe-default-preset';
export const DEFAULT_NOVELAI_VIBE_PRESET_NAME = '默认 Vibe 预设';
export const MAX_NOVELAI_VIBES_PER_PRESET = 16;

/** NovelAI vibe 轻量引用 */
export interface ImagePromptVibeRef {
  id: string;
  sourceHash: string;
  enabled: boolean;
  referenceStrength: number;
  informationExtracted: number;
  temporary?: boolean;
}

/** NovelAI vibe 预设 */
export interface NovelAIVibePreset {
  id: string;
  name: string;
  vibes: ImagePromptVibeRef[];
}

/** NovelAI vibe 预设集合 */
export interface NovelAIVibePresetSettings {
  activePresetId: string;
  presets: NovelAIVibePreset[];
}

/**
 * 创建单个 NovelAI vibe 预设
 * @param id 预设 ID
 * @param name 预设名称
 * @returns vibe 预设
 */
export function createNovelAIVibePreset(id: string, name: string): NovelAIVibePreset {
  return {
    id,
    name,
    vibes: [],
  };
}

/**
 * 创建默认 NovelAI vibe 预设集合
 * @param id 默认预设 ID
 * @param name 默认预设名称
 * @returns 预设集合
 */
export function createNovelAIVibePresetSettings(
  id = DEFAULT_NOVELAI_VIBE_PRESET_ID,
  name = DEFAULT_NOVELAI_VIBE_PRESET_NAME,
): NovelAIVibePresetSettings {
  const preset = createNovelAIVibePreset(id, name);
  return {
    activePresetId: preset.id,
    presets: [preset],
  };
}


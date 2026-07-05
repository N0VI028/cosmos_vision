import type { NovelAIVibePreset } from '@/constants/novelai-vibe';

/**
 * 查找指定 ID 的 NovelAI vibe 预设
 * @param presets 预设列表
 * @param presetId 预设 ID
 * @returns 命中的预设或首个预设
 */
export function findNovelAIVibePreset(
  presets: readonly NovelAIVibePreset[],
  presetId: string,
): NovelAIVibePreset | undefined {
  return presets.find(preset => preset.id === presetId) ?? presets[0];
}

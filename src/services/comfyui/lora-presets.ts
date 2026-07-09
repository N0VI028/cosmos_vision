import {
  createComfyUILoraPresetSettings,
  type ComfyUILoraPreset,
  type ComfyUILoraPresetSettings,
  type ComfyUILoraSetting,
} from '@/constants/comfyui';

/**
 * 查找指定 ID 的 ComfyUI LoRA 预设组
 * @param presets 预设组列表
 * @param presetId 预设组 ID
 * @returns 命中的预设组或首个预设组
 */
export function findComfyUILoraPreset(
  presets: readonly ComfyUILoraPreset[],
  presetId: string,
): ComfyUILoraPreset | undefined {
  return presets.find(preset => preset.id === presetId) ?? presets[0];
}

/**
 * 读取当前激活的 ComfyUI LoRA 预设组
 * @param settings LoRA 预设组集合
 * @returns 当前激活的预设组，缺失时返回临时默认组
 */
export function getActiveComfyUILoraPreset(settings: ComfyUILoraPresetSettings): ComfyUILoraPreset {
  return findComfyUILoraPreset(settings.presets, settings.activePresetId) ?? getFallbackComfyUILoraPreset();
}

/**
 * 读取当前激活预设组中的 LoRA 列表
 * @param settings LoRA 预设组集合
 * @returns 当前激活组的 LoRA 列表
 */
export function getActiveComfyUILoras(settings: ComfyUILoraPresetSettings): ComfyUILoraSetting[] {
  return getActiveComfyUILoraPreset(settings).loras;
}

/**
 * 创建运行时兜底用的默认 LoRA 预设组
 * @returns 临时默认 LoRA 预设组
 */
function getFallbackComfyUILoraPreset(): ComfyUILoraPreset {
  return createComfyUILoraPresetSettings().presets[0]!;
}

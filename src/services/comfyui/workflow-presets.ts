import type { ComfyUIWorkflowPreset, ComfyUIWorkflowPresetSettings } from '@/constants/comfyui';

/**
 * 查找指定 ComfyUI 工作流预设
 * @param settings 工作流预设集合
 * @param presetId 预设 ID
 * @returns 命中的预设或首个预设
 */
export function findComfyUIWorkflowPreset(
  settings: ComfyUIWorkflowPresetSettings,
  presetId: string,
): ComfyUIWorkflowPreset | undefined {
  return settings.presets.find(preset => preset.id === presetId) ?? settings.presets[0];
}

/**
 * 读取当前 ComfyUI 工作流预设
 * @param settings 工作流预设集合
 * @returns 当前工作流预设
 */
export function getActiveComfyUIWorkflowPreset(settings: ComfyUIWorkflowPresetSettings): ComfyUIWorkflowPreset {
  const preset = findComfyUIWorkflowPreset(settings, settings.activePresetId);
  if (!preset) throw new Error('未找到当前 ComfyUI 工作流预设');
  return preset;
}

/**
 * 读取当前 ComfyUI 工作流 JSON
 * @param settings 工作流预设集合
 * @returns 当前工作流 JSON
 */
export function getActiveComfyUIWorkflowJson(settings: ComfyUIWorkflowPresetSettings): string {
  return getActiveComfyUIWorkflowPreset(settings).workflowJson;
}

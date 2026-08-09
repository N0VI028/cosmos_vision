import {
  createComfyUILoraPresetSettings,
  type ComfyUILoraPreset,
  type ComfyUILoraPresetSettings,
  type ComfyUILoraSetting,
} from '@/constants/comfyui';
import { writeLoraPresetToNode, isSupportedLoraNode } from '@/services/comfyui/lora-adapter';
import { parseComfyUIWorkflow, serializeComfyUIWorkflow } from '@/services/comfyui/parse';

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
 * 将当前激活 LoRA 预设组写入工作流 JSON 中的兼容节点
 * 用于工作流整体被替换（重置默认/导入）后保持 LoRA 节点与激活预设一致
 * @param workflowJson 工作流 JSON 文本
 * @param settings LoRA 预设组集合
 * @returns 写入后的工作流 JSON；无兼容节点或解析失败时返回原文
 */
export function applyActiveLoraPresetToWorkflowJson(
  workflowJson: string,
  settings: ComfyUILoraPresetSettings,
): string {
  try {
    const workflow = parseComfyUIWorkflow(workflowJson);
    const node = Object.values(workflow).find(isSupportedLoraNode);
    if (!node) return workflowJson;
    writeLoraPresetToNode(node, getActiveComfyUILoraPreset(settings));
    return serializeComfyUIWorkflow(workflow);
  } catch {
    return workflowJson;
  }
}

/**
 * 创建运行时兜底用的默认 LoRA 预设组
 * @returns 临时默认 LoRA 预设组
 */
function getFallbackComfyUILoraPreset(): ComfyUILoraPreset {
  return createComfyUILoraPresetSettings().presets[0]!;
}

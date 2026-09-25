import type { ComfyUIWorkflow } from '@/services/comfyui/types';

/** 主模型输入项名称 */
const COMFYUI_MAIN_MODEL_INPUT_NAMES = new Set(['ckpt_name', 'unet_name']);

/**
 * 读取工作流中全部主模型名（ckpt_name / unet_name 输入值）
 * 按小写去重，保留首次出现顺序
 * @param workflow ComfyUI API 工作流
 * @returns 主模型名列表
 */
export function readComfyUIMainModelNames(workflow: ComfyUIWorkflow): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const node of Object.values(workflow)) {
    for (const [inputName, value] of Object.entries(node.inputs)) {
      if (!COMFYUI_MAIN_MODEL_INPUT_NAMES.has(inputName) || typeof value !== 'string') continue;
      const name = value.trim();
      const key = name.toLowerCase();
      if (!name || seen.has(key)) continue;
      seen.add(key);
      names.push(name);
    }
  }
  return names;
}

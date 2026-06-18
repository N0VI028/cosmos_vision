import defaultComfyUIWorkflowJson from './default-comfyui-workflow.json?raw';

import type { ComfyUILoraSetting } from '@/constants/comfyui';

/** ComfyUI 默认工作流
 * 来自 https://github.com/willmiao/ComfyUI-Lora-Manager 的示例模板
 */
export const DEFAULT_COMFYUI_WORKFLOW_JSON = defaultComfyUIWorkflowJson.trim();

/**
 * 创建默认 ComfyUI LoRA 设置
 * @returns 可安全修改的默认 LoRA 列表
 */
export function createDefaultComfyUILoraSettings(): ComfyUILoraSetting[] {
  return [];
}

import type { ComfyUIWorkflow, ComfyUIWorkflowNode } from '@/services/comfyui/types';
import { readNodeMeta } from '@/services/comfyui/meta';

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

/**
 * 把工作流主模型名写入标记了 modelMatch 的节点 string 输入
 * 供 RegexMatch 之类的节点判断当前主模型属于哪一代，string 非模型名输入，写入不会污染模型名收集
 * @param workflow ComfyUI API 工作流
 */
export function applyModelMatch(workflow: ComfyUIWorkflow): void {
  const mainModelName = readComfyUIMainModelNames(workflow)[0] ?? '';
  for (const node of Object.values(workflow)) {
    if (readNodeMeta(node).modelMatch) node.inputs.string = mainModelName;
  }
}

/**
 * 判断输入是否由 modelMatch 自动填充（应隐藏默认 string 控件）
 * modelMatch 节点的 string 输入由请求构建时自动填充主模型名，编辑器中应隐藏
 * @param node 工作流节点
 * @param inputName 输入名
 * @returns 是否自动填充
 */
export function isModelMatchManagedInput(node: ComfyUIWorkflowNode | undefined, inputName: string): boolean {
  return Boolean(node && readNodeMeta(node).modelMatch && inputName === 'string');
}

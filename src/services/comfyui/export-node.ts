import { isGenericPortType } from '@/services/comfyui/object-info-elementary';
import type { ComfyUIObjectInfoMap, ComfyUIObjectInfoOutputSpec, ComfyUIWorkflow } from '@/services/comfyui/types';

/**
 * 确保工作流具备可被 history 捕获的图片导出节点
 * @param workflow ComfyUI 工作流
 * @param nodeId 结果节点 ID
 * @param objectInfo 节点 schema 表
 * @returns 最终用于轮询 history 的有效取图节点 ID
 */
export function ensureImageExportNode(
  workflow: ComfyUIWorkflow,
  nodeId: string,
  objectInfo: ComfyUIObjectInfoMap | null,
): string {
  const node = workflow[nodeId];
  if (!node || !objectInfo) return nodeId;
  const schema = objectInfo[node.class_type];
  if (!schema || schema.outputNode) return nodeId;
  const output = resolveExportOutput(schema.outputs);
  if (!output) {
    throw new Error(`段落生图结果节点 ${nodeId}（${node.class_type}）不产出 IMAGE，无法导出图片`);
  }
  const exportId = allocateExportNodeId(workflow);
  workflow[exportId] = {
    class_type: 'PreviewImage',
    inputs: { images: [nodeId, output.index] },
  };
  return exportId;
}

/**
 * 选择用于导出的输出端口：优先 IMAGE，其次通配/泛型
 * @param outputs 节点输出端口列表
 * @returns 命中的输出端口或 undefined
 */
function resolveExportOutput(outputs: ComfyUIObjectInfoOutputSpec[]): ComfyUIObjectInfoOutputSpec | undefined {
  return outputs.find(output => output.type === 'IMAGE') ?? outputs.find(output => isGenericPortType(output.type));
}

/**
 * 分配不冲突的图片导出节点 ID
 * @param workflow ComfyUI 工作流
 * @returns 唯一的导出节点 ID
 */
function allocateExportNodeId(workflow: ComfyUIWorkflow): string {
  let exportId = 'cosmos_vision_export';
  while (exportId in workflow) {
    exportId += '_';
  }
  return exportId;
}

import type { ComfyUIWorkflow, ComfyUIWorkflowNode } from '@/services/comfyui/types';
import { validateImageOutput, validatePromptBindings } from '@/services/comfyui/meta';

/**
 * 校验并解析 ComfyUI API 工作流
 * @param workflowJson 工作流 JSON 文本
 * @returns API 工作流对象
 */
export function parseComfyUIWorkflow(workflowJson: string): ComfyUIWorkflow {
  const trimmed = workflowJson.trim();
  if (!trimmed) throw new Error('请先导入或粘贴 API 格式工作流 JSON');

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (error) {
    throw new Error(`工作流 JSON 解析失败: ${(error as Error).message}`);
  }

  if (!isPlainObject(parsed) || Array.isArray(parsed)) {
    throw new Error('工作流 JSON 必须是 API 格式对象');
  }

  const workflow = parsed as ComfyUIWorkflow;
  if (!Object.keys(workflow).length) {
    throw new Error('工作流 JSON 不能为空对象');
  }

  for (const [nodeId, node] of Object.entries(workflow)) {
    assertWorkflowNode(node, nodeId);
  }

  return workflow;
}

/**
 * 以稳定格式序列化工作流
 * @param workflow 工作流对象
 * @returns 两空格缩进的 JSON 文本
 */
export function serializeComfyUIWorkflow(workflow: ComfyUIWorkflow): string {
  return `${JSON.stringify(workflow, null, 2)}\n`;
}

/**
 * 读取工作流校验错误
 * @param workflowJson 工作流 JSON 文本
 * @returns 校验错误或 null
 */
export function getComfyUIWorkflowValidationError(workflowJson: string): string | null {
  try {
    const workflow = parseComfyUIWorkflow(workflowJson);
    return validatePromptBindings(workflow) ?? validateImageOutput(workflow);
  } catch (error) {
    return error instanceof Error ? error.message : '工作流校验失败';
  }
}

/**
 * 规范化 ComfyUI 服务地址
 * @param url 原始地址
 * @returns 去除尾部斜杠的地址
 */
export function normalizeComfyUIUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) throw new Error('请先填写 ComfyUI URL');
  return trimmed.replace(/\/+$/, '');
}

/**
 * 校验单个工作流节点结构
 * @param node 节点对象
 * @param nodeId 节点 ID
 */
function assertWorkflowNode(node: unknown, nodeId: string): asserts node is ComfyUIWorkflowNode {
  if (!isPlainObject(node)) {
    throw new Error(`工作流节点 ${nodeId} 必须是对象`);
  }
  const record = node as Record<string, unknown>;
  if (typeof record.class_type !== 'string' || !record.class_type.trim()) {
    throw new Error(`工作流节点 ${nodeId} 缺少 class_type`);
  }
  if (!isPlainObject(record.inputs)) {
    throw new Error(`工作流节点 ${nodeId} 缺少 inputs 结构`);
  }
}

/**
 * 判断值是否为普通对象
 * @param value 待判断值
 * @returns 是否为对象
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export { isLinkRef, isWritableScalar } from '@/services/comfyui/link';

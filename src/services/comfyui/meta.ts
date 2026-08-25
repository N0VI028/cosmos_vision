import type {
  ComfyUIImageBindingTarget,
  ComfyUIObjectInfoMap,
  ComfyUIObjectInfoNode,
  ComfyUIPromptBindingTarget,
  ComfyUISeedModeTarget,
  ComfyUIWorkflow,
  ComfyUIWorkflowNode,
  CosmosVisionNodeMeta,
  ImageBindingSource,
  PromptBinding,
  SeedMode,
} from '@/services/comfyui/types';
import { isLinkRef, isWritableScalar } from '@/services/comfyui/link';
import { isImageFilename } from '@/services/comfyui/object-info-elementary';

/**
 * 从工作流节点读取 CosmosVision 私有元数据
 * @param node 工作流节点
 * @returns 元数据对象（可能为空）
 */
export function readNodeMeta(node: ComfyUIWorkflowNode): CosmosVisionNodeMeta {
  return node._meta?.cosmosVision ?? {};
}

/**
 * 写入工作流节点 CosmosVision 私有元数据
 * @param node 工作流节点
 * @param meta 元数据
 */
export function writeNodeMeta(node: ComfyUIWorkflowNode, meta: CosmosVisionNodeMeta): void {
  if (!node._meta) node._meta = {};
  node._meta.cosmosVision = meta;
}

/**
 * 读取工作流内全部提示词绑定目标
 * @param workflow 工作流
 * @returns 绑定目标列表
 */
export function readPromptBindings(workflow: ComfyUIWorkflow): ComfyUIPromptBindingTarget[] {
  const targets: ComfyUIPromptBindingTarget[] = [];
  for (const [nodeId, node] of Object.entries(workflow)) {
    const meta = readNodeMeta(node);
    for (const [inputName, binding] of Object.entries(meta.promptBindings ?? {})) {
      targets.push({ nodeId, inputName, binding });
    }
  }
  return targets;
}

/**
 * 读取工作流内全部图片绑定目标
 * @param workflow 工作流
 * @returns 绑定目标列表
 */
export function readImageBindings(workflow: ComfyUIWorkflow): ComfyUIImageBindingTarget[] {
  const targets: ComfyUIImageBindingTarget[] = [];
  for (const [nodeId, node] of Object.entries(workflow)) {
    const meta = readNodeMeta(node);
    for (const [inputName, source] of Object.entries(meta.imageBindings ?? {})) {
      targets.push({ nodeId, inputName, source });
    }
  }
  return targets;
}

/**
 * 读取工作流内全部 seed 模式目标
 * @param workflow 工作流
 * @returns seed 模式目标列表
 */
export function readSeedModes(workflow: ComfyUIWorkflow): ComfyUISeedModeTarget[] {
  const targets: ComfyUISeedModeTarget[] = [];
  for (const [nodeId, node] of Object.entries(workflow)) {
    const meta = readNodeMeta(node);
    for (const [inputName, mode] of Object.entries(meta.seedModes ?? {})) {
      targets.push({
        nodeId,
        inputName,
        mode,
        value: readNumberInput(node, inputName, 0),
      });
    }
  }
  return targets;
}

/**
 * 读取工作流内标记为图片输出的节点 ID
 * @param workflow 工作流
 * @returns 输出节点 ID 或 null
 */
export function readImageOutputNodeId(workflow: ComfyUIWorkflow): string | null {
  for (const [nodeId, node] of Object.entries(workflow)) {
    if (readNodeMeta(node).imageOutput) return nodeId;
  }
  return null;
}

/**
 * 设置某节点为唯一图片输出节点
 * @param workflow 工作流
 * @param nodeId 目标节点 ID
 */
export function setImageOutputNode(workflow: ComfyUIWorkflow, nodeId: string): void {
  for (const [id, node] of Object.entries(workflow)) {
    const meta = readNodeMeta(node);
    if (id === nodeId) {
      writeNodeMeta(node, { ...meta, imageOutput: true });
      continue;
    }
    if (meta.imageOutput) writeNodeMeta(node, { ...meta, imageOutput: false });
  }
}

/**
 * 清除工作流内全部图片输出标记
 * @param workflow 工作流
 */
export function clearImageOutputNode(workflow: ComfyUIWorkflow): void {
  for (const node of Object.values(workflow)) {
    const meta = readNodeMeta(node);
    if (!meta.imageOutput) continue;
    writeNodeMeta(node, { ...meta, imageOutput: false });
  }
}

/**
 * 设置提示词绑定
 * @param workflow 工作流
 * @param nodeId 节点 ID
 * @param inputName 输入名
 * @param binding 绑定类型，null 表示清除
 */
export function setPromptBinding(
  workflow: ComfyUIWorkflow,
  nodeId: string,
  inputName: string,
  binding: PromptBinding | null,
): void {
  const node = workflow[nodeId];
  if (!node) return;
  const meta = readNodeMeta(node);
  const bindings = { ...(meta.promptBindings ?? {}) };
  if (binding === null) delete bindings[inputName];
  else bindings[inputName] = binding;
  writeNodeMeta(node, { ...meta, promptBindings: bindings });
}

/**
 * 设置图片绑定
 * @param workflow 工作流
 * @param nodeId 节点 ID
 * @param inputName 输入名
 * @param source 绑定来源，null 表示清除
 */
export function setImageBinding(
  workflow: ComfyUIWorkflow,
  nodeId: string,
  inputName: string,
  source: ImageBindingSource | null,
): void {
  const node = workflow[nodeId];
  if (!node) return;
  const meta = readNodeMeta(node);
  const bindings = { ...(meta.imageBindings ?? {}) };
  if (source === null) delete bindings[inputName];
  else bindings[inputName] = source;
  writeNodeMeta(node, { ...meta, imageBindings: bindings });
}

/**
 * 设置 seed 模式
 * @param workflow 工作流
 * @param nodeId 节点 ID
 * @param inputName 输入名
 * @param mode 模式，null 表示清除
 */
export function setSeedMode(
  workflow: ComfyUIWorkflow,
  nodeId: string,
  inputName: string,
  mode: SeedMode | null,
): void {
  const node = workflow[nodeId];
  if (!node) return;
  const meta = readNodeMeta(node);
  const modes = { ...(meta.seedModes ?? {}) };
  if (mode === null) delete modes[inputName];
  else modes[inputName] = mode;
  writeNodeMeta(node, { ...meta, seedModes: modes });
}

/**
 * 读取节点的数字输入
 * @param node 工作流节点
 * @param inputName 输入名
 * @param fallback 读取失败时的回退值
 * @returns 数字值
 */
export function readNumberInput(
  node: ComfyUIWorkflowNode,
  inputName: string,
  fallback: number,
): number {
  const value = node.inputs?.[inputName];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

/**
 * 从工作流移除所有 CosmosVision 私有元数据
 * @param workflow 工作流
 */
export function stripCosmosVisionMeta(workflow: ComfyUIWorkflow): void {
  for (const node of Object.values(workflow)) {
    if (!node._meta?.cosmosVision) continue;
    const { cosmosVision: _cv, ...rest } = node._meta;
    if (Object.keys(rest).length) node._meta = rest;
    else delete node._meta;
  }
}

/**
 * 校验提示词绑定仍指向工作流内可写输入
 * @param workflow 工作流
 * @returns 校验错误或 null
 */
export function validatePromptBindings(workflow: ComfyUIWorkflow): string | null {
  const targets = readPromptBindings(workflow);
  if (!targets.length) return '未指定任何提示词绑定目标';
  for (const target of targets) {
    const error = validateBindingTarget(workflow, target.nodeId, target.inputName, '提示词绑定');
    if (error) return error;
  }
  return null;
}

/**
 * 判断工作流输入是否为图片输入（值是图片文件名，或 schema 标记为图片上传）
 * @param classType 节点类型
 * @param inputName 输入名
 * @param value 当前值
 * @param schema 节点定义（在线时提供）
 * @returns 是否为图片输入
 */
function isImageBindingTarget(
  classType: string,
  inputName: string,
  value: unknown,
  schema: ComfyUIObjectInfoNode | undefined,
): boolean {
  const spec = schema?.inputs.find(item => item.name === inputName);
  if (spec?.imageUpload) return true;
  if (spec?.type === 'IMAGEUPLOAD') return true;
  if (classType === 'LoadImage' && inputName === 'image') return true;
  if (typeof value === 'string' && isImageFilename(value)) return true;
  if (spec?.options && spec.options.some(option => isImageFilename(option))) return true;
  return false;
}

/**
 * 校验图片绑定仍指向工作流内可写输入
 * @param workflow 工作流
 * @param objectInfo 可选节点 schema 表，提供时额外校验目标输入是否为图片输入
 * @returns 校验错误或 null
 */
export function validateImageBindings(
  workflow: ComfyUIWorkflow,
  objectInfo?: ComfyUIObjectInfoMap | null,
): string | null {
  const targets = readImageBindings(workflow);
  for (const target of targets) {
    const error = validateBindingTarget(workflow, target.nodeId, target.inputName, '图片绑定');
    if (error) return error;
    if (!objectInfo) continue;
    const node = workflow[target.nodeId];
    const schema = objectInfo[node.class_type];
    // schema 已同步但目标输入被识别为非图片输入时，提示绑定失效
    if (schema && !isImageBindingTarget(node.class_type, target.inputName, node.inputs?.[target.inputName], schema)) {
      return `图片绑定失效: 节点 ${target.nodeId} 输入 ${target.inputName} 不是图片输入`;
    }
  }
  return null;
}

/**
 * 校验输出节点仍存在于工作流
 * @param workflow 工作流
 * @returns 校验错误或 null
 */
export function validateImageOutput(workflow: ComfyUIWorkflow): string | null {
  const nodeId = readImageOutputNodeId(workflow);
  if (!nodeId) return '未指定段落生图结果节点';
  if (!workflow[nodeId]) return `段落生图结果节点 ${nodeId} 不存在于工作流`;
  return null;
}

/**
 * 校验单个绑定目标
 * @param workflow 工作流
 * @param nodeId 节点 ID
 * @param inputName 输入名
 * @param label 提示标签
 * @returns 校验错误或 null
 */
function validateBindingTarget(
  workflow: ComfyUIWorkflow,
  nodeId: string,
  inputName: string,
  label: string,
): string | null {
  const node = workflow[nodeId];
  if (!node) return `${label}失效: 节点 ${nodeId} 不存在`;
  const value = node.inputs?.[inputName];
  if (value === undefined) {
    return `${label}失效: 节点 ${nodeId} 缺少输入 ${inputName}`;
  }
  if (isLinkRef(value)) {
    return `${label}失效: 节点 ${nodeId} 输入 ${inputName} 是连线引用,不能绑定`;
  }
  if (!isWritableScalar(value) && typeof value !== 'string') {
    return `${label}失效: 节点 ${nodeId} 输入 ${inputName} 不是可写值`;
  }
  return null;
}

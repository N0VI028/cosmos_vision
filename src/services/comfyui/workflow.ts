import {
  COMFYUI_MAX_SEED,
  type ComfyUILoraSetting,
  type ComfyUISampler,
  type ComfyUISeedMode,
  type ComfyUISettings,
} from '@/constants/comfyui';
import type { ImagePromptPresetSettings } from '@/constants/image-prompt';
import { buildImagePromptPair, type ImagePromptPair } from '@/services/image-prompt/presets';

interface ComfyUIWorkflowNode {
  inputs?: Record<string, unknown>;
  class_type?: string;
  _meta?: { title?: string };
}

interface ComfyUIWorkflowContext {
  positivePrompt: string;
  negativePrompt: string;
  steps: number;
  width: number;
  height: number;
  seed: number;
  cfgScale: number;
  sampler: ComfyUISampler;
}

interface WorkflowNodeEntry {
  nodeId: string;
  node: ComfyUIWorkflowNode;
}

interface LoraManagerEntry {
  name: string;
  strength: number;
  active: boolean;
  expanded: boolean;
  clipStrength: number;
}

export type ComfyUIWorkflow = Record<string, ComfyUIWorkflowNode>;

/** ComfyUI LoRA 请求快照 */
export interface ComfyUILoraSnapshot {
  name: string;
  strength: number;
}

/** ComfyUI 请求快照 */
export interface ComfyUIRequestSnapshot {
  endpoint: string;
  positivePrompt: string;
  negativePrompt: string;
  width: number;
  height: number;
  steps: number;
  cfgScale: number;
  sampler: ComfyUISampler;
  seed: number;
  seedMode: ComfyUISeedMode;
  loras: ComfyUILoraSnapshot[];
}

/** ComfyUI 已解析请求 */
export interface ComfyUIResolvedRequest {
  workflow: ComfyUIWorkflow;
  snapshot: ComfyUIRequestSnapshot;
}

const LORA_MANAGER_LOADER_CLASS = 'Lora Loader (LoraManager)';
const LORA_MANAGER_PROMPT_CLASS = 'Prompt (LoraManager)';
const LORA_MANAGER_CLIP_STRENGTH = 1;

/**
 * 按共享生图预设解析并构建 ComfyUI 最终请求
 * @param settings ComfyUI 设置
 * @param presetSettings 共享生图提示词预设
 * @param overrides 正负提示词覆写
 * @returns 可直接发送的工作流与快照
 */
export function buildComfyUIResolvedRequest(
  settings: ComfyUISettings,
  presetSettings: ImagePromptPresetSettings,
  prompts: ImagePromptPair,
): ComfyUIResolvedRequest {
  return buildComfyUIResolvedRequestFromPrompts(settings, buildImagePromptPair(presetSettings, settings, prompts));
}

/**
 * 使用最终正负提示词构建 ComfyUI 请求
 * @param settings ComfyUI 设置
 * @param prompts 已完成拼接的正负提示词
 * @returns 可直接发送的工作流与快照
 */
export function buildComfyUIResolvedRequestFromPrompts(
  settings: ComfyUISettings,
  prompts: ImagePromptPair,
): ComfyUIResolvedRequest {
  const workflow = parseComfyUIWorkflow(settings.workflowJson);
  const context = buildWorkflowContext(settings, prompts);

  applyStandardWorkflowResolution(workflow, context);
  applyCheckpointOverride(workflow, settings.checkpointName);
  const appliedLoras = applyLoraManagerOverride(workflow, settings.loras);

  return {
    workflow,
    snapshot: buildRequestSnapshot(settings, context, appliedLoras),
  };
}

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

  if (!_.isPlainObject(parsed) || Array.isArray(parsed)) {
    throw new Error('工作流 JSON 必须是 API 格式对象');
  }

  const workflow = parsed as ComfyUIWorkflow;
  if (!Object.keys(workflow).length) {
    throw new Error('工作流 JSON 不能为空对象');
  }

  return workflow;
}

/**
 * 读取工作流校验错误
 * @param workflowJson 工作流 JSON 文本
 * @returns 校验错误或 null
 */
export function getComfyUIWorkflowValidationError(workflowJson: string): string | null {
  try {
    validateStandardWorkflow(parseComfyUIWorkflow(workflowJson));
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : '工作流校验失败';
  }
}

/**
 * 读取 ComfyUI 请求前置校验错误
 * @param settings ComfyUI 设置
 * @returns 校验错误或 null
 */
export function getComfyUIRequestError(settings: Pick<ComfyUISettings, 'url' | 'workflowJson'>): string | null {
  try {
    normalizeComfyUIUrl(settings.url);
    const workflowError = getComfyUIWorkflowValidationError(settings.workflowJson);
    return workflowError;
  } catch (error) {
    return error instanceof Error ? error.message : 'ComfyUI 配置校验失败';
  }
}

/**
 * 校验标准工作流结构
 * @param workflow ComfyUI 工作流
 */
function validateStandardWorkflow(workflow: ComfyUIWorkflow): void {
  const sampler = findStandardSamplerNode(workflow);
  writeSamplerValue(sampler, 'steps', Number(sampler.node.inputs?.steps), '标准工作流中的 KSampler 缺少 steps 输入');
  writeSamplerValue(sampler, 'cfg', Number(sampler.node.inputs?.cfg), '标准工作流中的 KSampler 缺少 cfg 输入');
  writeSamplerValue(sampler, 'seed', Number(sampler.node.inputs?.seed), '标准工作流中的 KSampler 缺少 seed 输入');
  writeSamplerName(
    sampler,
    String(sampler.node.inputs?.sampler_name),
    '标准工作流中的 KSampler 缺少 sampler_name 输入',
  );
  requireStandardTextInputs(
    resolveStandardReference(workflow, sampler, 'positive', '标准工作流要求 KSampler.positive 连接到可写提示词节点'),
  );
  requireStandardTextInputs(
    resolveStandardReference(workflow, sampler, 'negative', '标准工作流要求 KSampler.negative 连接到可写提示词节点'),
  );
  requireStandardLatentInputs(
    resolveStandardReference(
      workflow,
      sampler,
      'latent_image',
      '标准工作流要求 KSampler.latent_image 连接到 EmptyLatentImage',
    ),
  );
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
 * 构建运行时注入上下文
 * @param settings ComfyUI 设置
 * @param prompts 正负提示词
 * @returns 标准工作流覆写参数
 */
function buildWorkflowContext(settings: ComfyUISettings, prompts: ImagePromptPair): ComfyUIWorkflowContext {
  const positivePrompt = prompts.positivePrompt.trim();
  const negativePrompt = prompts.negativePrompt.trim();
  if (!positivePrompt && !negativePrompt) {
    throw new Error('正向提示词或负向提示词至少填写一个');
  }

  return {
    positivePrompt,
    negativePrompt,
    steps: settings.steps,
    width: settings.width,
    height: settings.height,
    seed: resolveRequestSeed(settings),
    cfgScale: settings.cfgScale,
    sampler: settings.sampler,
  };
}

/**
 * 解析本次请求使用的 seed
 * @param settings ComfyUI 设置
 * @returns 最终 seed
 */
function resolveRequestSeed(settings: ComfyUISettings): number {
  if (settings.seedMode === 'random') {
    return Math.floor(Math.random() * (COMFYUI_MAX_SEED + 1));
  }
  if (!Number.isSafeInteger(settings.seed) || settings.seed < 0 || settings.seed > COMFYUI_MAX_SEED) {
    throw new Error('固定 seed 必须是非负整数');
  }
  return settings.seed;
}

/**
 * 按标准工作流结构回写运行参数
 * @param workflow ComfyUI 工作流
 * @param context 运行时参数
 */
function applyStandardWorkflowResolution(workflow: ComfyUIWorkflow, context: ComfyUIWorkflowContext): void {
  const sampler = findStandardSamplerNode(workflow);

  writeStandardPrompt(workflow, sampler, 'positive', context.positivePrompt);
  writeStandardPrompt(workflow, sampler, 'negative', context.negativePrompt);
  writeSamplerValue(sampler, 'steps', context.steps, '标准工作流中的 KSampler 缺少 steps 输入');
  writeSamplerValue(sampler, 'cfg', context.cfgScale, '标准工作流中的 KSampler 缺少 cfg 输入');
  writeSamplerValue(sampler, 'seed', context.seed, '标准工作流中的 KSampler 缺少 seed 输入');
  writeSamplerName(sampler, context.sampler, '标准工作流中的 KSampler 缺少 sampler_name 输入');
  writeLatentSize(workflow, sampler, context);
}

/**
 * 按设置覆写 checkpoint
 * @param workflow ComfyUI 工作流
 * @param checkpointName 覆写模型名
 */
function applyCheckpointOverride(workflow: ComfyUIWorkflow, checkpointName: string): void {
  const trimmed = checkpointName.trim();
  if (!trimmed) return;
  writeCheckpointValue(findCheckpointLoaderNode(workflow), trimmed);
}

/**
 * 查找唯一的标准 KSampler 节点
 * @param workflow ComfyUI 工作流
 * @returns KSampler 节点
 */
function findStandardSamplerNode(workflow: ComfyUIWorkflow): WorkflowNodeEntry {
  const matches = findWorkflowNodes(workflow, node => node.class_type === 'KSampler');
  if (matches.length === 1) return matches[0];
  if (!matches.length) throw new Error('标准工作流缺少 KSampler 节点');
  throw new Error('标准工作流只支持单个 KSampler 节点');
}

/**
 * 查找唯一的 CheckpointLoaderSimple 节点
 * @param workflow ComfyUI 工作流
 * @returns CheckpointLoaderSimple 节点
 */
function findCheckpointLoaderNode(workflow: ComfyUIWorkflow): WorkflowNodeEntry {
  const matches = findWorkflowNodes(workflow, node => node.class_type === 'CheckpointLoaderSimple');
  if (matches.length === 1) return matches[0];
  if (!matches.length) throw new Error('模型覆盖要求工作流包含 CheckpointLoaderSimple 节点');
  throw new Error('模型覆盖只支持单个 CheckpointLoaderSimple 节点');
}

/**
 * 查找满足条件的工作流节点
 * @param workflow ComfyUI 工作流
 * @param predicate 节点匹配函数
 * @returns 匹配到的节点列表
 */
function findWorkflowNodes(
  workflow: ComfyUIWorkflow,
  predicate: (node: ComfyUIWorkflowNode) => boolean,
): WorkflowNodeEntry[] {
  return Object.entries(workflow)
    .filter(([, node]) => predicate(node))
    .map(([nodeId, node]) => ({ nodeId, node }));
}

/**
 * 写入标准工作流提示词
 * @param workflow ComfyUI 工作流
 * @param sampler KSampler 节点
 * @param inputKey 提示词引用字段
 * @param promptValue 要写入的提示词
 */
function writeStandardPrompt(
  workflow: ComfyUIWorkflow,
  sampler: WorkflowNodeEntry,
  inputKey: 'positive' | 'negative',
  promptValue: string,
): void {
  const node = resolveStandardReference(
    workflow,
    sampler,
    inputKey,
    inputKey === 'positive'
      ? '标准工作流要求 KSampler.positive 连接到可写提示词节点'
      : '标准工作流要求 KSampler.negative 连接到可写提示词节点',
  );
  const inputs = requireStandardTextInputs(node);
  inputs.text = promptValue;
}

/**
 * 写入 KSampler 数值参数
 * @param sampler KSampler 节点
 * @param inputKey 输入字段名
 * @param value 要写入的值
 * @param errorMessage 缺失字段时的错误
 */
function writeSamplerValue(
  sampler: WorkflowNodeEntry,
  inputKey: 'steps' | 'cfg' | 'seed',
  value: number,
  errorMessage: string,
): void {
  const inputs = requireNodeInputs(sampler.node, sampler.nodeId);
  if (!(inputKey in inputs)) throw new Error(errorMessage);
  inputs[inputKey] = value;
}

/**
 * 写入 KSampler 采样器名称
 * @param sampler KSampler 节点
 * @param value 采样器名称
 * @param errorMessage 缺失字段时的错误
 */
function writeSamplerName(sampler: WorkflowNodeEntry, value: string, errorMessage: string): void {
  const inputs = requireNodeInputs(sampler.node, sampler.nodeId);
  if (!('sampler_name' in inputs)) throw new Error(errorMessage);
  inputs.sampler_name = value;
}

/**
 * 写入 CheckpointLoaderSimple 的模型名
 * @param checkpointNode CheckpointLoaderSimple 节点
 * @param checkpointName 要写入的模型名
 */
function writeCheckpointValue(checkpointNode: WorkflowNodeEntry, checkpointName: string): void {
  const inputs = requireNodeInputs(checkpointNode.node, checkpointNode.nodeId);
  if (!('ckpt_name' in inputs)) {
    throw new Error(`工作流节点 ${checkpointNode.nodeId} 缺少 ckpt_name 输入`);
  }
  inputs.ckpt_name = checkpointName;
}

/**
 * 按设置覆写 LoraManager 多 LoRA
 * @param workflow ComfyUI 工作流
 * @param loras LoRA 覆写列表
 * @returns 实际注入到工作流的 LoRA 快照
 */
function applyLoraManagerOverride(workflow: ComfyUIWorkflow, loras: ComfyUILoraSetting[]): ComfyUILoraSnapshot[] {
  const loraNode = findLoraManagerLoaderNode(workflow);
  if (!loraNode) return [];
  writeLoraManagerValues(loraNode, loras);
  return buildLoraSnapshots(loras);
}

/**
 * 查找可选的 LoraManager LoRA 节点
 * @param workflow ComfyUI 工作流
 * @returns LoraManager 节点或 null
 */
function findLoraManagerLoaderNode(workflow: ComfyUIWorkflow): WorkflowNodeEntry | null {
  const matches = findWorkflowNodes(workflow, node => node.class_type === LORA_MANAGER_LOADER_CLASS);
  if (matches.length <= 1) return matches[0] ?? null;
  throw new Error('LoRA 覆盖只支持单个 Lora Loader (LoraManager) 节点');
}

/**
 * 写入 LoraManager 节点输入
 * @param loraNode LoraManager 节点
 * @param loras LoRA 覆写列表
 */
function writeLoraManagerValues(loraNode: WorkflowNodeEntry, loras: ComfyUILoraSetting[]): void {
  const inputs = requireNodeInputs(loraNode.node, loraNode.nodeId);
  const entries = buildLoraManagerEntries(loras);
  inputs.text = entries
    .filter(entry => entry.active)
    .map(formatLoraManagerTag)
    .join(' ');
  inputs.loras = { __value__: entries };
}

/**
 * 构建 LoraManager 节点条目
 * @param loras LoRA 覆写列表
 * @returns LoraManager 可识别的条目
 */
function buildLoraManagerEntries(loras: ComfyUILoraSetting[]): LoraManagerEntry[] {
  return loras.map(toLoraManagerEntry).filter(entry => entry.name.length > 0);
}

/**
 * 转换单个 LoRA 条目
 * @param lora UI 设置中的 LoRA 条目
 * @returns LoraManager 条目
 */
function toLoraManagerEntry(lora: ComfyUILoraSetting): LoraManagerEntry {
  return {
    name: lora.name.trim(),
    strength: normalizeLoraStrength(lora.strength),
    active: lora.enabled,
    expanded: false,
    clipStrength: LORA_MANAGER_CLIP_STRENGTH,
  };
}

/**
 * 格式化 LoraManager 提示词标签
 * @param entry LoraManager 条目
 * @returns LoRA 提示词标签
 */
function formatLoraManagerTag(entry: LoraManagerEntry): string {
  return `<lora:${entry.name}:${formatLoraStrength(entry.strength)}>`;
}

/**
 * 规范化 LoRA 强度数值
 * @param value 原始强度
 * @returns 可写入工作流的强度
 */
function normalizeLoraStrength(value: number): number {
  return Number.isFinite(value) ? value : 1;
}

/**
 * 格式化 LoRA 强度文本
 * @param value LoRA 强度
 * @returns 简洁数值文本
 */
function formatLoraStrength(value: number): string {
  return Number(value.toFixed(3)).toString();
}

/**
 * 写入标准工作流宽高
 * @param workflow ComfyUI 工作流
 * @param sampler KSampler 节点
 * @param context 运行时参数
 */
function writeLatentSize(workflow: ComfyUIWorkflow, sampler: WorkflowNodeEntry, context: ComfyUIWorkflowContext): void {
  const node = resolveStandardReference(
    workflow,
    sampler,
    'latent_image',
    '标准工作流要求 KSampler.latent_image 连接到 EmptyLatentImage',
  );
  const inputs = requireStandardLatentInputs(node);
  inputs.width = context.width;
  inputs.height = context.height;
}

/**
 * 解析标准工作流的上游引用节点
 * @param workflow ComfyUI 工作流
 * @param sampler KSampler 节点
 * @param inputKey 引用字段名
 * @param errorMessage 失败时的错误
 * @returns 引用到的节点
 */
function resolveStandardReference(
  workflow: ComfyUIWorkflow,
  sampler: WorkflowNodeEntry,
  inputKey: 'positive' | 'negative' | 'latent_image',
  errorMessage: string,
): WorkflowNodeEntry {
  const samplerInputs = requireNodeInputs(sampler.node, sampler.nodeId);
  const nodeId = readReferenceNodeId(samplerInputs[inputKey]);
  if (!nodeId || !workflow[nodeId]) throw new Error(errorMessage);
  return { nodeId, node: workflow[nodeId] };
}

/**
 * 读取标准提示词节点 inputs
 * @param nodeEntry 节点信息
 * @returns 可写入 text 的 inputs
 */
function requireStandardTextInputs(nodeEntry: WorkflowNodeEntry): Record<string, unknown> {
  if (!isSupportedPromptNode(nodeEntry.node)) {
    throw new Error('标准工作流要求 KSampler 的正负提示词连接到 CLIPTextEncode 或 Prompt (LoraManager)');
  }

  const inputs = requireNodeInputs(nodeEntry.node, nodeEntry.nodeId);
  if (!('text' in inputs)) throw new Error(`工作流节点 ${nodeEntry.nodeId} 缺少 text 输入`);
  return inputs;
}

/**
 * 判断节点是否支持提示词 text 写入
 * @param node 工作流节点
 * @returns 是否为可写提示词节点
 */
function isSupportedPromptNode(node: ComfyUIWorkflowNode): boolean {
  return node.class_type === 'CLIPTextEncode' || node.class_type === LORA_MANAGER_PROMPT_CLASS;
}

/**
 * 读取标准 latent 节点 inputs
 * @param nodeEntry 节点信息
 * @returns 可写入 width 与 height 的 inputs
 */
function requireStandardLatentInputs(nodeEntry: WorkflowNodeEntry): Record<string, unknown> {
  if (nodeEntry.node.class_type !== 'EmptyLatentImage') {
    throw new Error('标准工作流要求 KSampler 的 latent_image 连接到 EmptyLatentImage');
  }

  const inputs = requireNodeInputs(nodeEntry.node, nodeEntry.nodeId);
  if (!('width' in inputs) || !('height' in inputs)) {
    throw new Error(`工作流节点 ${nodeEntry.nodeId} 缺少 width 或 height 输入`);
  }
  return inputs;
}

/**
 * 读取引用数组中的节点 ID
 * @param value 引用值
 * @returns 节点 ID 或 null
 */
function readReferenceNodeId(value: unknown): string | null {
  if (!Array.isArray(value) || !value.length) return null;
  const nodeId = value[0];
  return typeof nodeId === 'string' || typeof nodeId === 'number' ? String(nodeId) : null;
}

/**
 * 读取节点 inputs 并保证可写
 * @param node 工作流节点
 * @param nodeId 节点 ID
 * @returns 节点 inputs
 */
function requireNodeInputs(node: ComfyUIWorkflowNode | undefined, nodeId: string): Record<string, unknown> {
  if (!node || !_.isPlainObject(node.inputs)) {
    throw new Error(`工作流节点 ${nodeId} 缺少 inputs 结构`);
  }
  return node.inputs as Record<string, unknown>;
}

/**
 * 构建请求快照
 * @param settings ComfyUI 设置
 * @param context 运行时参数
 * @returns 测试面板使用的快照
 */
function buildRequestSnapshot(
  settings: ComfyUISettings,
  context: ComfyUIWorkflowContext,
  loras: ComfyUILoraSnapshot[],
): ComfyUIRequestSnapshot {
  return {
    endpoint: normalizeComfyUIUrl(settings.url),
    positivePrompt: context.positivePrompt,
    negativePrompt: context.negativePrompt,
    width: context.width,
    height: context.height,
    steps: context.steps,
    cfgScale: context.cfgScale,
    sampler: context.sampler,
    seed: context.seed,
    seedMode: settings.seedMode,
    loras,
  };
}

/**
 * 构建启用 LoRA 快照
 * @param loras LoRA 设置列表
 * @returns 本次请求启用的 LoRA 快照
 */
function buildLoraSnapshots(loras: ComfyUILoraSetting[]): ComfyUILoraSnapshot[] {
  return loras.filter(isEnabledNamedLora).map(lora => ({
    name: lora.name.trim(),
    strength: normalizeLoraStrength(lora.strength),
  }));
}

/**
 * 判断 LoRA 是否启用且有名称
 * @param lora LoRA 设置
 * @returns 是否参与本次请求
 */
function isEnabledNamedLora(lora: ComfyUILoraSetting): boolean {
  return lora.enabled && lora.name.trim().length > 0;
}

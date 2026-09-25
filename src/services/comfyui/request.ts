import type { ComfyUILoraPreset, ComfyUISettings } from '@/constants/comfyui';
import type { ImagePromptPresetSettings } from '@/constants/image-prompt';
import { buildImagePromptPair, type ImagePromptPair } from '@/services/image-prompt/presets';
import { readLoraSnapshotsFromWorkflow, writeLoraPresetToNode, isSupportedLoraNode } from '@/services/comfyui/lora-adapter';
import { getActiveComfyUILoraPreset, prependLoraTriggerWords } from '@/services/comfyui/lora-presets';
import {
  readImageBindings,
  readImageOutputNodeId,
  readPromptBindings,
  stripCosmosVisionMeta,
  validateImageBindings,
  validateImageOutput,
  validatePromptBindings,
} from '@/services/comfyui/meta';
import { getComfyUIWorkflowValidationError, normalizeComfyUIUrl, parseComfyUIWorkflow } from '@/services/comfyui/parse';
import { applySeedModes } from '@/services/comfyui/seed-runtime';
import { getCachedComfyUIObjectInfo } from '@/services/comfyui/object-info';
import { getActiveComfyUIWorkflowJson } from '@/services/comfyui/workflow-presets';
import { ensureImageExportNode } from '@/services/comfyui/export-node';
import type {
  ComfyUILoraSnapshot,
  ComfyUIObjectInfoMap,
  ComfyUIRequestSnapshot,
  ComfyUIResolvedRequest,
  ComfyUIWorkflow,
} from '@/services/comfyui/types';

/**
 * 将快照 LoRA 列表转换为等效预设组
 * @param loras 快照记录的 LoRA 列表
 * @returns 等效 LoRA 预设组
 */
export function createComfyUILoraPresetFromSnapshots(
  loras: readonly ComfyUILoraSnapshot[],
): ComfyUILoraPreset {
  return {
    id: 'playback-snapshot-loras',
    name: 'Playback',
    loras: loras.map((lora, index) => ({
      id: `snapshot-lora-${index}`,
      name: lora.name,
      strength: lora.strength,
      enabled: true,
    })),
  };
}

/**
 * 解析待写入工作流的 LoRA 预设
 * 若提供显式预设或快照列表（即使为空）则直接使用，仅在缺省时回退至面板激活组
 * @param settings ComfyUI 设置
 * @param loraPresetOrSnapshots 显式 LoRA 预设组或快照列表
 * @returns 确定的 LoRA 预设组
 */
function resolveEffectiveLoraPreset(
  settings: Pick<ComfyUISettings, 'loraPresets'>,
  loraPresetOrSnapshots?: ComfyUILoraPreset | readonly ComfyUILoraSnapshot[],
): ComfyUILoraPreset {
  if (!loraPresetOrSnapshots) return getActiveComfyUILoraPreset(settings.loraPresets);
  if ('id' in loraPresetOrSnapshots) return loraPresetOrSnapshots;
  return createComfyUILoraPresetFromSnapshots(loraPresetOrSnapshots);
}

/**
 * 按共享生图预设解析并构建 ComfyUI 最终请求
 * @param settings ComfyUI 设置
 * @param presetSettings 共享生图提示词预设
 * @param prompts 正负提示词覆写
 * @param loraTriggerWords 本次生效 LoRA 的触发词
 * @param presetIds 本次实际使用的预设 ID（随机池抽中或面板当前），缺省用设置内引用
 * @param loraPreset 显式指定的 LoRA 预设组或快照列表；传入则不再读取面板激活组
 * @returns 可直接发送的工作流与快照
 */
export function buildComfyUIResolvedRequest(
  settings: ComfyUISettings,
  presetSettings: ImagePromptPresetSettings,
  prompts: ImagePromptPair,
  loraTriggerWords: readonly string[] = [],
  presetIds?: { positive: string; negative: string },
  loraPreset?: ComfyUILoraPreset | readonly ComfyUILoraSnapshot[],
): ComfyUIResolvedRequest {
  const references = presetIds
    ? { positivePromptPresetId: presetIds.positive, negativePromptPresetId: presetIds.negative }
    : settings;
  return buildComfyUIResolvedRequestFromPrompts(
    settings,
    buildImagePromptPair(presetSettings, references, prompts),
    loraTriggerWords,
    loraPreset,
  );
}

/**
 * 使用最终正负提示词构建 ComfyUI 请求
 * @param settings ComfyUI 设置
 * @param prompts 已完成拼接的正负提示词
 * @param loraTriggerWords 本次生效 LoRA 的触发词
 * @param loraPresetOrSnapshots 显式指定的 LoRA 预设组或快照列表；传入则不再读取面板激活组
 * @returns 可直接发送的工作流与快照
 */
export function buildComfyUIResolvedRequestFromPrompts(
  settings: ComfyUISettings,
  prompts: ImagePromptPair,
  loraTriggerWords: readonly string[] = [],
  loraPresetOrSnapshots?: ComfyUILoraPreset | readonly ComfyUILoraSnapshot[],
): ComfyUIResolvedRequest {
  const objectInfo = getCachedComfyUIObjectInfo(settings.url);
  const workflowJson = getActiveComfyUIWorkflowJson(settings.workflowPresets);
  const source = parseAndValidateWorkflow(workflowJson, objectInfo);
  const { positivePrompt, negativePrompt } = requirePromptPair(prompts);
  const workflow = structuredClone(source) as ComfyUIWorkflow;
  const effectiveLoraPreset = resolveEffectiveLoraPreset(settings, loraPresetOrSnapshots);
  const hasLoraNode = applyLoraPreset(workflow, effectiveLoraPreset);
  // 仅当工作流确实承载了生效 LoRA 时才前置触发词，避免未加载的 LoRA 污染提示词
  const triggeredPositivePrompt = hasLoraNode
    ? prependLoraTriggerWords(positivePrompt, loraTriggerWords)
    : positivePrompt;
  applyPromptBindings(workflow, triggeredPositivePrompt, negativePrompt);
  const seedValues = applySeedModes(workflow, workflowJson);
  const imageOutputNodeId = readImageOutputNodeId(workflow)!;
  const exportNodeId = ensureImageExportNode(workflow, imageOutputNodeId, objectInfo);
  const promptBindings = readPromptBindings(workflow);
  const imageBindings = readImageBindings(workflow);
  const loras = readLoraSnapshotsFromWorkflow(workflow);
  stripCosmosVisionMeta(workflow);

  return {
    workflow,
    imageOutputNodeId: exportNodeId,
    snapshot: {
      endpoint: normalizeComfyUIUrl(settings.url),
      positivePrompt: triggeredPositivePrompt,
      negativePrompt,
      imageOutputNodeId,
      promptBindings,
      seedValues,
      imageBindings,
      loras,
    },
  };
}

/**
 * 解析并校验工作流绑定与输出节点
 * @param workflowJson 工作流 JSON
 * @param objectInfo 节点 schema 表
 * @returns 已校验工作流
 */
function parseAndValidateWorkflow(
  workflowJson: string,
  objectInfo: ComfyUIObjectInfoMap | null,
): ComfyUIWorkflow {
  const source = parseComfyUIWorkflow(workflowJson);
  const bindingError = validatePromptBindings(source);
  if (bindingError) throw new Error(bindingError);
  // 图片绑定校验：在线时用已同步 schema 校验目标输入是图片输入；离线时只校验存在性
  const imageBindingError = validateImageBindings(source, objectInfo);
  if (imageBindingError) throw new Error(imageBindingError);
  const outputError = validateImageOutput(source);
  if (outputError) throw new Error(outputError);
  return source;
}

/**
 * 将生效 LoRA 预设写入工作流副本中的首个兼容节点
 * @param workflow 工作流副本
 * @param preset 本次生效的 LoRA 预设组（激活组或随机池抽中组）
 * @returns 工作流是否存在兼容 LoRA 节点（false 表示 LoRA 未被注入工作流）
 */
function applyLoraPreset(workflow: ComfyUIWorkflow, preset: ComfyUILoraPreset): boolean {
  const node = Object.values(workflow).find(isSupportedLoraNode);
  if (!node) return false;
  writeLoraPresetToNode(node, preset);
  return true;
}

/**
 * 读取并要求至少一个非空提示词
 * @param prompts 正负提示词
 * @returns 裁剪后的正负提示词
 */
function requirePromptPair(prompts: ImagePromptPair): ImagePromptPair {
  const positivePrompt = prompts.positivePrompt.trim();
  const negativePrompt = prompts.negativePrompt.trim();
  if (!positivePrompt && !negativePrompt) {
    throw new Error('正面提示词或负面提示词至少填写一个');
  }
  return { positivePrompt, negativePrompt };
}

/**
 * 读取 ComfyUI 请求前置校验错误
 * @param settings ComfyUI 设置
 * @returns 校验错误或 null
 */
export function getComfyUIRequestError(settings: Pick<ComfyUISettings, 'url' | 'workflowPresets'>): string | null {
  try {
    normalizeComfyUIUrl(settings.url);
    return getComfyUIWorkflowValidationError(getActiveComfyUIWorkflowJson(settings.workflowPresets));
  } catch (error) {
    return error instanceof Error ? error.message : 'ComfyUI 配置校验失败';
  }
}

/**
 * 将最终提示词写入全部绑定目标
 * @param workflow 工作流副本
 * @param positivePrompt 正面提示词
 * @param negativePrompt 负面提示词
 */
function applyPromptBindings(workflow: ComfyUIWorkflow, positivePrompt: string, negativePrompt: string): void {
  for (const target of readPromptBindings(workflow)) {
    const node = workflow[target.nodeId];
    if (!node) continue;
    const value = target.binding === 'positive' ? positivePrompt : negativePrompt;
    node.inputs[target.inputName] = value;
  }
}

export type { ComfyUIRequestSnapshot, ComfyUIResolvedRequest, ComfyUIWorkflow };

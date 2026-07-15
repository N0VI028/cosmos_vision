import type { ComfyUISettings } from '@/constants/comfyui';
import type { ImagePromptPresetSettings } from '@/constants/image-prompt';
import { buildImagePromptPair, type ImagePromptPair } from '@/services/image-prompt/presets';
import { readLoraSnapshotsFromWorkflow } from '@/services/comfyui/lora-adapter';
import {
  readImageOutputNodeId,
  readPromptBindings,
  stripCosmosVisionMeta,
  validateImageOutput,
  validatePromptBindings,
} from '@/services/comfyui/meta';
import { getComfyUIWorkflowValidationError, normalizeComfyUIUrl, parseComfyUIWorkflow } from '@/services/comfyui/parse';
import { applySeedModes } from '@/services/comfyui/seed-runtime';
import { getActiveComfyUIWorkflowJson } from '@/services/comfyui/workflow-presets';
import type { ComfyUIRequestSnapshot, ComfyUIResolvedRequest, ComfyUIWorkflow } from '@/services/comfyui/types';

/**
 * 按共享生图预设解析并构建 ComfyUI 最终请求
 * @param settings ComfyUI 设置
 * @param presetSettings 共享生图提示词预设
 * @param prompts 正负提示词覆写
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
  const workflowJson = getActiveComfyUIWorkflowJson(settings.workflowPresets);
  const source = parseAndValidateWorkflow(workflowJson);
  const { positivePrompt, negativePrompt } = requirePromptPair(prompts);
  const workflow = structuredClone(source) as ComfyUIWorkflow;
  applyPromptBindings(workflow, positivePrompt, negativePrompt);
  const seedValues = applySeedModes(workflow, workflowJson);
  const imageOutputNodeId = readImageOutputNodeId(workflow)!;
  const promptBindings = readPromptBindings(workflow);
  const loras = readLoraSnapshotsFromWorkflow(workflow);
  stripCosmosVisionMeta(workflow);

  return {
    workflow,
    imageOutputNodeId,
    snapshot: {
      endpoint: normalizeComfyUIUrl(settings.url),
      positivePrompt,
      negativePrompt,
      imageOutputNodeId,
      promptBindings,
      seedValues,
      loras,
    },
  };
}

/**
 * 解析并校验工作流绑定与输出节点
 * @param workflowJson 工作流 JSON
 * @returns 已校验工作流
 */
function parseAndValidateWorkflow(workflowJson: string): ComfyUIWorkflow {
  const source = parseComfyUIWorkflow(workflowJson);
  const bindingError = validatePromptBindings(source);
  if (bindingError) throw new Error(bindingError);
  const outputError = validateImageOutput(source);
  if (outputError) throw new Error(outputError);
  return source;
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
    throw new Error('正向提示词或负向提示词至少填写一个');
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
 * @param positivePrompt 正向提示词
 * @param negativePrompt 负向提示词
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

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

/**
 * 规范化触发词列表：去空白、丢弃空词、忽略大小写去重（保留首次出现的写法）
 * @param words 原始触发词列表
 * @returns 规范化后的触发词列表
 */
export function dedupeTriggerWords(words: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const word of words) {
    const trimmed = word.trim();
    const key = trimmed.toLowerCase();
    if (!trimmed || seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}

/**
 * 将触发词前置到正向提示词最前面，提示词中已有的触发词不再重复注入
 * @param positivePrompt 已拼接完成的正向提示词
 * @param triggerWords 当前激活 LoRA 的触发词
 * @returns 前置触发词后的正向提示词
 */
export function prependLoraTriggerWords(positivePrompt: string, triggerWords: readonly string[]): string {
  const trimmedPrompt = positivePrompt.trim();
  if (!triggerWords.length) return trimmedPrompt;
  const promptTokens = readPromptTokens(trimmedPrompt);
  const freshWords = triggerWords
    .map(word => word.trim())
    .filter(word => word && !promptTokens.has(word.toLowerCase()));
  if (!freshWords.length) return trimmedPrompt;
  return [freshWords.join(', '), trimmedPrompt].filter(Boolean).join(', ');
}

/**
 * 读取提示词中的标签集合（按逗号/换行拆分，忽略大小写）
 * @param prompt 提示词文本
 * @returns 小写标签集合
 */
function readPromptTokens(prompt: string): Set<string> {
  const tokens = new Set<string>();
  for (const token of prompt.split(/[\n,]+/)) {
    const trimmed = token.trim();
    if (trimmed) tokens.add(trimmed.toLowerCase());
  }
  return tokens;
}

/** LoRA 模型常见扩展名（小写，含点） */
const LORA_FILE_EXTENSIONS = new Set(['.safetensors', '.ckpt', '.pt', '.bin', '.gguf', '.sft']);

/**
 * 格式化 LoRA 展示名：去掉结尾的已知模型扩展名
 * 仅用于界面显示；存储值、写入工作流的 lora_name 与 API 请求仍需完整文件名
 * @param name LoRA 文件名（可含子目录）
 * @returns 去扩展名后的展示名
 */
export function formatLoraDisplayName(name: string): string {
  const trimmed = name.trim();
  const dot = trimmed.lastIndexOf('.');
  if (dot <= 0) return trimmed;
  return LORA_FILE_EXTENSIONS.has(trimmed.slice(dot).toLowerCase()) ? trimmed.slice(0, dot) : trimmed;
}

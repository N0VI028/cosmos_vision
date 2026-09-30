import { createApiRequestId } from '@/api/request-prompt';
import type { CharacterPromptItem, CosmosVisionSettings } from '@/constants/novelai';
import { generateComfyUIImagesFromResolvedRequest } from '@/services/comfyui/api';
import { resolveActiveComfyUILoraTriggerWords } from '@/services/comfyui/lora-trigger-words';
import { getActiveComfyUILoraPreset } from '@/services/comfyui/lora-presets';
import { buildComfyUIResolvedRequest } from '@/services/comfyui/request';
import {
  buildNovelAIPromptOverrides,
  buildNovelAIResolvedRequest,
  generateNovelAIImagesFromResolvedRequest,
} from '@/services/novelai/api';
import { extractPromptLlmResult } from '@/services/prompt-llm/runtime-request';
import { buildPromptLlmSchemaFields } from '@/services/tavern-helper/prompt-llm';
import { useSettingsStore } from '@/store/settings';
import type {
  ApiCharacterPrompt,
  ApiImagePrompts,
  ApiResolvedImagePrompts,
  GenerateImageOptions,
  GenerateImageResult,
} from './types';

/**
 * 按插件当前设置直接生成图片（不请求 LLM、不写聊天楼层与画廊）
 * 核心提示词取 prompts（优先）或由插件从 rawText 提取，再照常拼接正负预设、NovelAI vibe 与 ComfyUI LoRA 触发词
 * 过程回调附加 requestId 便于共享回调区分归属；错误原样 reject，不 catch 不包装
 * @param options 原始回复文本或结构化提示词、requestId、取消信号与过程回调
 * @returns requestId、图片 Blob 列表与实际使用的结构化提示词
 */
export async function generateImage(options: GenerateImageOptions): Promise<GenerateImageResult> {
  if (!options.prompts && !options.rawText) throw new Error('rawText 与 prompts 至少提供一个');
  const requestId = options.requestId ?? createApiRequestId();
  const { savedSettings } = useSettingsStore();
  const prompts = resolveImagePrompts(options, savedSettings);
  const imageBlobs = savedSettings.imageSource === 'comfyui'
    ? await requestComfyUIImageBlobs(savedSettings, prompts, options, requestId)
    : await requestNovelAIImageBlobs(savedSettings, prompts, options, requestId);
  return { requestId, imageBlobs, prompts };
}

/**
 * 解析本次生图使用的核心提示词
 * prompts 优先；rawText 分支由插件提取，提取后正面提示词为空时抛出与内联流程同款错误
 * @param options 接口入参
 * @param settings 运行时已保存设置
 * @returns 结构化核心提示词
 */
function resolveImagePrompts(
  options: GenerateImageOptions,
  settings: CosmosVisionSettings,
): ApiResolvedImagePrompts {
  if (options.prompts) return normalizeApiPrompts(options.prompts);
  // 提取函数内部已保证正面提示词非空（空/无法解析均抛同款结构化错误）
  const result = extractPromptLlmResult(options.rawText ?? '', settings.promptLlm, buildPromptLlmSchemaFields(settings.promptLlm));
  return {
    positivePrompt: result.output.positivePrompt,
    negativePrompt: result.output.negativePrompt,
    characterPrompts: result.characterPrompts,
  };
}

/**
 * 补全调用方传入提示词的缺省字段
 * @param prompts 调用方结构化提示词
 * @returns 字段完整的核心提示词
 */
function normalizeApiPrompts(prompts: ApiImagePrompts): ApiResolvedImagePrompts {
  return {
    positivePrompt: prompts.positivePrompt,
    negativePrompt: prompts.negativePrompt ?? '',
    characterPrompts: (prompts.characterPrompts ?? []).map(normalizeCharacterPrompt),
  };
}

/**
 * 补全单个角色提示词的缺省字段与坐标
 * @param prompt 调用方角色提示词
 * @returns 字段完整的角色提示词
 */
function normalizeCharacterPrompt(prompt: ApiCharacterPrompt): CharacterPromptItem {
  return {
    positivePrompt: prompt.positivePrompt,
    negativePrompt: prompt.negativePrompt ?? '',
    position: normalizeCharacterPosition(prompt.position),
  };
}

/**
 * 规范化角色坐标，缺省或不合法时回退中心点
 * @param position 调用方坐标
 * @returns 0–1 范围内的坐标
 */
function normalizeCharacterPosition(position?: { x: number; y: number }): CharacterPromptItem['position'] {
  if (position && isCoordinate(position.x) && isCoordinate(position.y)) return { x: position.x, y: position.y };
  // 缺省或非法时回退中心点（与内联流程 defaultPosition 一致）
  return { x: 0.5, y: 0.5 };
}

/**
 * 判断坐标数值是否合法
 * @param value 待判断值
 * @returns 是否为 0–1 数值
 */
function isCoordinate(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

/**
 * 走 NovelAI 已解析请求管道生成图片
 * @param settings 运行时已保存设置
 * @param prompts 核心提示词
 * @param options 接口入参
 * @param requestId 本次请求标识
 * @returns 图片 Blob 列表
 */
async function requestNovelAIImageBlobs(
  settings: CosmosVisionSettings,
  prompts: ApiResolvedImagePrompts,
  options: GenerateImageOptions,
  requestId: string,
): Promise<Blob[]> {
  const overrides = buildNovelAIPromptOverrides(prompts, prompts.characterPrompts);
  const request = buildNovelAIResolvedRequest(
    settings.novelai,
    settings.imagePromptPresets,
    settings.promptLlm,
    overrides,
  );
  const onStreamPreview = options.onStreamPreview;
  const result = await generateNovelAIImagesFromResolvedRequest(request, settings.novelai.imageCount, {
    signal: options.signal,
    onStreamPreview: onStreamPreview ? event => onStreamPreview({ ...event, requestId }) : undefined,
  });
  return result.imageBlobs;
}

/**
 * 走 ComfyUI 已解析请求管道生成图片
 * 触发词按本次生效 LoRA 组解析，预设 ID 与 LoRA 组取运行时设置中的激活项
 * @param settings 运行时已保存设置
 * @param prompts 核心提示词
 * @param options 接口入参
 * @param requestId 本次请求标识
 * @returns 图片 Blob 列表
 */
async function requestComfyUIImageBlobs(
  settings: CosmosVisionSettings,
  prompts: ApiResolvedImagePrompts,
  options: GenerateImageOptions,
  requestId: string,
): Promise<Blob[]> {
  const { comfyui } = settings;
  const effectiveLoraPreset = getActiveComfyUILoraPreset(comfyui.loraPresets);
  const loraTriggerWords = await resolveActiveComfyUILoraTriggerWords(
    { url: comfyui.url, loraPresets: { ...comfyui.loraPresets, activePresetId: effectiveLoraPreset.id } },
    options.signal,
  );
  const request = buildComfyUIResolvedRequest(
    comfyui,
    settings.imagePromptPresets,
    { positivePrompt: prompts.positivePrompt, negativePrompt: prompts.negativePrompt },
    loraTriggerWords,
    { positive: comfyui.positivePromptPresetId, negative: comfyui.negativePromptPresetId },
    effectiveLoraPreset,
  );
  const onProgress = options.onProgress;
  return generateComfyUIImagesFromResolvedRequest(comfyui, request, {
    signal: options.signal,
    onProgress: onProgress ? progress => onProgress({ ...progress, requestId }) : undefined,
  });
}

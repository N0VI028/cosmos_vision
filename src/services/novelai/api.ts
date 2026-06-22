import type { ImagePromptPresetSettings } from '@/constants/image-prompt';
import type {
  NovelAIAccount,
  NovelAIModel,
  NovelAISampler,
  NovelAISettings,
  NovelAIUcPreset,
  PromptLlmSettings,
} from '@/constants/novelai';
import {
  buildNegativePrompt,
  buildPositivePrompt,
  getUcPresetValue,
  type NovelAIPromptMode,
} from '@/services/novelai/prompt-presets';
import { readPreferredPromptLlmOutput, type PromptLlmExtractSettings } from '@/services/tavern-helper/prompt-llm';
import { extractFirstImage } from '@/services/novelai/zip';
import { getNovelAIRequestAccounts } from '@/services/novelai/router';

interface NovelAIPayload {
  action: 'generate';
  input: string;
  model: string;
  parameters: Record<string, unknown>;
  use_new_shared_trial: boolean;
}

export interface NovelAIPromptOverrides {
  positiveLLMPrompt?: string;
  negativeLLMPrompt?: string;
  positivePromptMode?: NovelAIPromptMode;
  negativePromptMode?: NovelAIPromptMode;
}

export interface NovelAIFinalPrompts {
  positivePrompt: string;
  negativePrompt: string;
}

export interface NovelAIRequestSnapshot {
  endpoint: string;
  positivePrompt: string;
  negativePrompt: string;
  model: NovelAIModel;
  width: number;
  height: number;
  sampler: NovelAISampler;
  steps: number;
  cfgScale: number;
  ucPreset: NovelAIUcPreset;
  addQualityTags: boolean;
}

export interface NovelAIResolvedRequest {
  settings: NovelAISettings;
  prompts: NovelAIFinalPrompts;
  accounts: NovelAIAccount[];
  snapshot: NovelAIRequestSnapshot;
}

export interface NovelAIImageResult {
  imageBlob: Blob;
  snapshot: NovelAIRequestSnapshot;
}

/** NovelAI 请求控制选项 */
export interface NovelAIRequestOptions {
  signal?: AbortSignal;
}

/**
 * 使用已解析提示词请求 NovelAI 图片
 * @param settings NovelAI 设置页参数
 * @param prompts 最终提示词
 * @param options 请求控制选项
 * @returns 官方响应中的第一张图片 Blob
 */
export async function generateNovelAIImageFromPrompts(
  settings: NovelAISettings,
  prompts: NovelAIFinalPrompts,
  options: NovelAIRequestOptions = {},
): Promise<Blob> {
  const request = createResolvedRequest(settings, prompts);
  return (await generateNovelAIImageFromResolvedRequest(request, options)).imageBlob;
}

/**
 * 按预解析结果请求 NovelAI 图片
 * @param request 已确定提示词与账号顺序的请求
 * @param options 请求控制选项
 * @returns 图片与最终成功账号快照
 */
export async function generateNovelAIImageFromResolvedRequest(
  request: NovelAIResolvedRequest,
  options: NovelAIRequestOptions = {},
): Promise<NovelAIImageResult> {
  validatePrompts(request.prompts);
  ensureRequestAccounts(request.accounts);
  throwIfNovelAIAborted(options.signal);
  const errors: string[] = [];
  for (const [index, account] of request.accounts.entries()) {
    try {
      return {
        imageBlob: await requestNovelAIAccountImage(request.settings, request.prompts, account, options),
        snapshot: buildRequestSnapshot(request.settings, request.prompts, account),
      };
    } catch (error) {
      if (options.signal?.aborted) throw createNovelAIAbortError();
      errors.push(formatAccountError(index, account, error));
    }
  }
  throw new Error(buildAggregateErrorMessage(errors));
}

/**
 * 构建已解析的 NovelAI 请求信息
 * @param settings NovelAI 设置页参数
 * @param imagePromptPresets 共享生图提示词预设
 * @param extractSettings Prompt LLM 正则提取规则
 * @param overrides 临时提示词与模式覆盖
 * @returns 最终提示词与日志快照
 */
export function buildNovelAIResolvedRequest(
  settings: NovelAISettings,
  imagePromptPresets: ImagePromptPresetSettings,
  extractSettings: PromptLlmExtractSettings,
  overrides?: NovelAIPromptOverrides,
): NovelAIResolvedRequest {
  const prompts = resolveFinalPrompts(settings, imagePromptPresets, extractSettings, overrides);
  return createResolvedRequest(settings, prompts);
}

/**
 * 将 LLM 原始返回转换为 NovelAI 提示词覆写
 * @param settings 提示词 LLM 配置(公共:JSON Schema 优先 + 正则回退)
 * @param rawResponse LLM 原始返回
 * @returns NovelAI 提示词覆写
 */
export function buildNovelAILlmPromptOverrides(
  settings: PromptLlmSettings,
  rawResponse: string,
): NovelAIPromptOverrides {
  const output = readPreferredPromptLlmOutput(rawResponse, settings);
  if (output) return buildDirectPromptOverrides(output.positivePrompt, output.negativePrompt);
  return buildExtractPromptOverrides(rawResponse);
}

/**
 * 构建 NovelAI 测试日志快照
 * @param settings NovelAI 设置页参数
 * @param prompts 最终提示词
 * @returns 展示给测试面板的关键请求信息
 */
function buildRequestSnapshot(
  settings: NovelAISettings,
  prompts: NovelAIFinalPrompts,
  account: NovelAIAccount | null,
): NovelAIRequestSnapshot {
  return {
    endpoint: account ? buildEndpoint(account.url) : '未选择可用账号',
    positivePrompt: prompts.positivePrompt,
    negativePrompt: prompts.negativePrompt,
    model: settings.model,
    width: settings.width,
    height: settings.height,
    sampler: settings.sampler,
    steps: settings.steps,
    cfgScale: settings.cfgScale,
    ucPreset: settings.ucPreset,
    addQualityTags: settings.addQualityTags,
  };
}

/**
 * 构建走提取规则的提示词覆写
 * @param rawResponse LLM 原始返回
 * @returns 提示词覆写
 */
function buildExtractPromptOverrides(rawResponse: string): NovelAIPromptOverrides {
  return {
    positiveLLMPrompt: rawResponse,
    negativeLLMPrompt: rawResponse,
  };
}

/**
 * 构建直接使用提示词的覆写
 * @param positivePrompt 正面提示词
 * @param negativePrompt 负面提示词
 * @returns 提示词覆写
 */
function buildDirectPromptOverrides(positivePrompt: string, negativePrompt: string): NovelAIPromptOverrides {
  return {
    positiveLLMPrompt: positivePrompt,
    negativeLLMPrompt: negativePrompt,
    positivePromptMode: 'direct',
    negativePromptMode: 'direct',
  };
}

/**
 * 校验 NovelAI 请求最低必填字段
 * @param prompts 最终发送给 NovelAI 的正负提示词
 */
function validatePrompts(prompts: NovelAIFinalPrompts): void {
  if (!prompts.positivePrompt.trim() && !prompts.negativePrompt.trim()) {
    throw new Error('正向提示词或负向提示词至少填写一个');
  }
}

/** 是否为 V4+ 模型 (V4 / V4.5) */
function isV4Model(model: NovelAIModel): boolean {
  return model.startsWith('nai-diffusion-4');
}

/**
 * 构建 NovelAI 官方请求体
 * @param settings NovelAI 设置页参数
 * @param prompts 最终提示词
 * @returns 官方 API payload
 */
function buildPayload(settings: NovelAISettings, prompts: NovelAIFinalPrompts): NovelAIPayload {
  return {
    action: 'generate',
    input: prompts.positivePrompt,
    model: settings.model,
    parameters: buildParameters(settings, prompts),
    use_new_shared_trial: true,
  };
}

/**
 * 构建 NovelAI parameters 字段(对齐 nai-webui 文生图实现)
 * @param settings NovelAI 设置页参数
 * @param prompts 最终提示词
 * @returns 官方 parameters
 */
function buildParameters(settings: NovelAISettings, prompts: NovelAIFinalPrompts): Record<string, unknown> {
  const v4 = isV4Model(settings.model);

  const parameters: Record<string, unknown> = {
    params_version: 3,
    width: settings.width,
    height: settings.height,
    scale: settings.cfgScale,
    sampler: settings.sampler,
    steps: settings.steps,
    n_samples: 1,
    ucPreset: getUcPresetValue(settings.ucPreset),
    qualityToggle: settings.addQualityTags,
    autoSmea: false,
    dynamic_thresholding: false,
    controlnet_strength: 1,
    legacy: false,
    add_original_image: true,
    cfg_rescale: 0,
    noise_schedule: 'karras',
    legacy_v3_extend: false,
    skip_cfg_above_sigma: null,
    use_coords: false,
    legacy_uc: false,
    normalize_reference_strength_multiple: true,
    inpaintImg2ImgStrength: 1,
    seed: Math.floor(Math.random() * 4294967295),
    characterPrompts: [],
    negative_prompt: prompts.negativePrompt,
    deliberate_euler_ancestral_bug: false,
    prefer_brownian: true,
  };

  if (v4) {
    parameters.v4_prompt = {
      caption: { base_caption: prompts.positivePrompt, char_captions: [] },
      use_coords: false,
      use_order: false,
    };
    parameters.v4_negative_prompt = {
      caption: { base_caption: prompts.negativePrompt, char_captions: [] },
      use_coords: false,
      use_order: false,
      legacy_uc: false,
    };
  }

  return parameters;
}

function buildEndpoint(url: string): string {
  return `${url.replace(/\/+$/, '')}/ai/generate-image`;
}

function buildHeaders(apiKey: string): HeadersInit {
  return { Authorization: `Bearer ${apiKey.trim()}`, 'Content-Type': 'application/json' };
}

/**
 * 解析最终发送给 NovelAI 的正负提示词
 * @param settings NovelAI 设置页参数
 * @param imagePromptPresets 共享生图提示词预设
 * @param extractSettings Prompt LLM 正则提取规则
 * @param overrides LLM 生成的临时提示词
 * @returns 正负提示词
 */
function resolveFinalPrompts(
  settings: NovelAISettings,
  imagePromptPresets: ImagePromptPresetSettings,
  extractSettings: PromptLlmExtractSettings,
  overrides?: NovelAIPromptOverrides,
): NovelAIFinalPrompts {
  return {
    positivePrompt: buildPositivePrompt(
      settings,
      imagePromptPresets,
      extractSettings,
      overrides?.positiveLLMPrompt ?? '',
      overrides?.positivePromptMode ?? 'extract',
    ),
    negativePrompt: buildNegativePrompt(
      settings,
      imagePromptPresets,
      extractSettings,
      overrides?.negativeLLMPrompt ?? '',
      overrides?.negativePromptMode ?? 'extract',
    ),
  };
}

/**
 * 组合本次 NovelAI 请求的固定输入
 * @param settings NovelAI 设置页参数
 * @param prompts 最终提示词
 * @returns 带账号顺序的请求对象
 */
function createResolvedRequest(settings: NovelAISettings, prompts: NovelAIFinalPrompts): NovelAIResolvedRequest {
  const accounts = getNovelAIRequestAccounts(settings);
  return {
    settings,
    prompts,
    accounts,
    snapshot: buildRequestSnapshot(settings, prompts, accounts[0] ?? null),
  };
}

/**
 * 校验当前请求是否至少有一组可用账号
 * @param accounts 本次候选账号列表
 */
function ensureRequestAccounts(accounts: NovelAIAccount[]): void {
  if (accounts.length) return;
  throw new Error('没有可用的 NovelAI 账号，请先填写至少一组完整的 URL 和 API Key');
}

/**
 * 使用指定账号请求 NovelAI 图片
 * @param settings NovelAI 设置页参数
 * @param prompts 最终提示词
 * @param account 本次尝试账号
 * @returns 第一张图片 Blob
 */
async function requestNovelAIAccountImage(
  settings: NovelAISettings,
  prompts: NovelAIFinalPrompts,
  account: NovelAIAccount,
  options: NovelAIRequestOptions,
): Promise<Blob> {
  const response = await requestNovelAIResponse(settings, prompts, account, options);
  throwIfNovelAIAborted(options.signal);
  const zipBlob = await readNovelAIResponseBlob(response);
  throwIfNovelAIAborted(options.signal);
  return extractNovelAIImage(zipBlob);
}

/**
 * 请求单个 NovelAI 账号的原始响应
 * @param settings NovelAI 设置页参数
 * @param prompts 最终提示词
 * @param account 本次尝试账号
 * @returns 官方响应对象
 */
async function requestNovelAIResponse(
  settings: NovelAISettings,
  prompts: NovelAIFinalPrompts,
  account: NovelAIAccount,
  options: NovelAIRequestOptions,
): Promise<Response> {
  try {
    const response = await fetch(buildEndpoint(account.url), {
      method: 'POST',
      headers: buildHeaders(account.apiKey),
      body: JSON.stringify(buildPayload(settings, prompts)),
      signal: options.signal,
    });
    await ensureSuccess(response);
    return response;
  } catch (error) {
    throw new Error(`[fetch] ${(error as Error).message}`);
  }
}

/**
 * 读取 NovelAI 二进制响应体
 * @param response 官方响应
 * @returns ZIP Blob
 */
async function readNovelAIResponseBlob(response: Response): Promise<Blob> {
  try {
    return await response.blob();
  } catch (error) {
    throw new Error(`[读取响应体] ${(error as Error).message}`);
  }
}

/**
 * 解压 NovelAI ZIP 并返回首图
 * @param zipBlob 响应 ZIP
 * @returns 第一张图片 Blob
 */
async function extractNovelAIImage(zipBlob: Blob): Promise<Blob> {
  try {
    return await extractFirstImage(zipBlob);
  } catch (error) {
    throw new Error(`[ZIP 解析] ${(error as Error).message}`);
  }
}

/**
 * 组装单个账号的失败摘要
 * @param index 账号序号
 * @param account 失败账号
 * @param error 失败原因
 * @returns 脱敏后的错误摘要
 */
function formatAccountError(index: number, account: NovelAIAccount, error: unknown): string {
  const reason = error instanceof Error ? error.message : '未知错误';
  return `账号 ${index + 1} (${buildEndpoint(account.url)}) 失败: ${reason}`;
}

/**
 * 组装多账号全部失败时的最终报错
 * @param errors 每个账号的失败摘要
 * @returns 用户可见错误
 */
function buildAggregateErrorMessage(errors: string[]): string {
  return `已尝试多组账号但均失败: ${errors.join('； ')}`;
}

/**
 * 抛出 NovelAI 取消错误
 * @param signal 取消信号
 */
function throwIfNovelAIAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  throw createNovelAIAbortError();
}

/**
 * 创建 NovelAI 取消错误
 * @returns 取消错误
 */
function createNovelAIAbortError(): Error {
  return new Error('已取消生成');
}

async function ensureSuccess(response: Response): Promise<void> {
  if (response.ok) return;
  const detail = await response.text().catch(() => '');
  throw new Error(`NovelAI 请求失败: ${response.status}${formatDetail(detail)}`);
}

function formatDetail(detail: string): string {
  return detail.trim() ? ` ${detail.slice(0, 160)}` : '';
}

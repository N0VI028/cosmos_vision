import type { ImagePromptPresetSettings, ImagePromptVibeRef } from '@/constants/image-prompt';
import type {
  NovelAIAccount,
  NovelAIModel,
  NovelAINoiseSchedule,
  NovelAISampler,
  NovelAISettings,
  NovelAIUcPreset,
  PromptLlmSettings,
} from '@/constants/novelai';
import {
  NOVELAI_MAX_SEED,
  isNovelAIV3Model,
  isNovelAIV4Model,
  isNovelAIV45Model,
  isNovelAIV4OnlyModel,
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
import {
  getNovelAIPositivePresetVibes,
  resolveNovelAIVibeParameters,
} from '@/services/novelai/vibe-parameters';
import type { NovelAIVibeParameters, NovelAIVibeSnapshot } from '@/services/novelai/vibe-types';

const REFERENCE_PIXEL_COUNT = 1011712;
const SIGMA_MAGIC_NUMBER_V3_V4 = 19;
const SIGMA_MAGIC_NUMBER_V4_5 = 58;

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
  vibeReferences?: ImagePromptVibeRef[];
  vibeParameters?: NovelAIVibeParameters;
}

export interface NovelAIRequestSnapshot {
  endpoint: string;
  positivePrompt: string;
  negativePrompt: string;
  model: NovelAIModel;
  width: number;
  height: number;
  sampler: NovelAISampler;
  seed: number;
  steps: number;
  guidance: number;
  autoSampler: boolean;
  varietyPlus: boolean;
  smea: boolean;
  smeaDyn: boolean;
  decrisp: boolean;
  legacyPromptMode: boolean;
  promptGuidanceRescale: number;
  noiseSchedule: NovelAINoiseSchedule;
  ucPreset: NovelAIUcPreset;
  addQualityTags: boolean;
  vibes: NovelAIVibeSnapshot;
}

export interface NovelAIResolvedRequest {
  settings: NovelAISettings;
  prompts: NovelAIFinalPrompts;
  accounts: NovelAIAccount[];
  seed: number;
  snapshot: NovelAIRequestSnapshot;
}

export interface NovelAIImageResult {
  imageBlob: Blob;
  snapshot: NovelAIRequestSnapshot;
  prompts: NovelAIFinalPrompts;
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
  const prompts = await resolveRequestPrompts(request, options);
  const errors: string[] = [];
  for (const [index, account] of request.accounts.entries()) {
    try {
      return {
        imageBlob: await requestNovelAIAccountImage(request.settings, prompts, account, options, request.seed),
        snapshot: buildRequestSnapshot(request.settings, prompts, account, request.seed),
        prompts,
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
 * @param account 快照展示使用的账号
 * @param seed 本次请求使用的 seed
 * @returns 展示给测试面板的关键请求信息
 */
function buildRequestSnapshot(
  settings: NovelAISettings,
  prompts: NovelAIFinalPrompts,
  account: NovelAIAccount | null,
  seed: number,
): NovelAIRequestSnapshot {
  return {
    endpoint: account ? buildEndpoint(account.url) : '未选择可用账号',
    positivePrompt: prompts.positivePrompt,
    negativePrompt: prompts.negativePrompt,
    model: settings.model,
    width: settings.width,
    height: settings.height,
    sampler: getEffectiveSampler(settings),
    seed,
    steps: settings.steps,
    guidance: settings.guidance,
    autoSampler: settings.autoSampler,
    varietyPlus: settings.varietyPlus,
    smea: settings.smea,
    smeaDyn: settings.smeaDyn,
    decrisp: settings.decrisp,
    legacyPromptMode: settings.legacyPromptMode,
    promptGuidanceRescale: settings.promptGuidanceRescale,
    noiseSchedule: getEffectiveNoiseSchedule(settings),
    ucPreset: settings.ucPreset,
    addQualityTags: settings.addQualityTags,
    vibes: buildVibeSnapshot(prompts),
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

/**
 * 构建 NovelAI 官方请求体
 * @param settings NovelAI 设置页参数
 * @param prompts 最终提示词
 * @param seed 本次请求使用的 seed
 * @returns 官方 API payload
 */
function buildPayload(settings: NovelAISettings, prompts: NovelAIFinalPrompts, seed: number): NovelAIPayload {
  return {
    action: 'generate',
    input: prompts.positivePrompt,
    model: settings.model,
    parameters: buildParameters(settings, prompts, seed),
    use_new_shared_trial: true,
  };
}

/**
 * 构建 NovelAI parameters 字段(对齐 nai-webui 文生图实现)
 * @param settings NovelAI 设置页参数
 * @param prompts 最终提示词
 * @param seed 本次请求使用的 seed
 * @returns 官方 parameters
 */
function buildParameters(settings: NovelAISettings, prompts: NovelAIFinalPrompts, seed: number): Record<string, unknown> {
  const parameters = createBaseParameters(settings, prompts, seed);
  if (isNovelAIV3Model(settings.model)) applyV3Parameters(parameters, settings);
  if (isNovelAIV4Model(settings.model)) applyV4Prompts(parameters, prompts);
  if (prompts.vibeParameters) Object.assign(parameters, prompts.vibeParameters);
  return parameters;
}

/**
 * 构建 NovelAI parameters 基础字段
 * @param settings NovelAI 设置页参数
 * @param prompts 最终提示词
 * @param seed 本次请求使用的 seed
 * @returns 官方 parameters 基础对象
 */
function createBaseParameters(settings: NovelAISettings, prompts: NovelAIFinalPrompts, seed: number): Record<string, unknown> {
  return {
    params_version: 3,
    width: settings.width,
    height: settings.height,
    scale: settings.guidance,
    sampler: getEffectiveSampler(settings),
    steps: settings.steps,
    n_samples: 1,
    ucPreset: getUcPresetValue(settings.ucPreset),
    qualityToggle: settings.addQualityTags,
    autoSmea: false,
    controlnet_strength: 1,
    add_original_image: true,
    cfg_rescale: settings.promptGuidanceRescale,
    noise_schedule: getEffectiveNoiseSchedule(settings),
    legacy_v3_extend: false,
    use_coords: false,
    legacy_uc: false,
    normalize_reference_strength_multiple: true,
    inpaintImg2ImgStrength: 1,
    seed,
    characterPrompts: [],
    negative_prompt: prompts.negativePrompt,
    prefer_brownian: true,
    ...createModelCompatibilityParameters(settings),
  };
}

/**
 * 构建 NovelAI 模型兼容字段
 * @param settings NovelAI 设置页参数
 * @returns 与模型能力相关的 parameters 字段
 */
function createModelCompatibilityParameters(settings: NovelAISettings): Record<string, unknown> {
  const legacy = isNovelAIV4OnlyModel(settings.model) && settings.legacyPromptMode;
  return {
    dynamic_thresholding: isNovelAIV3Model(settings.model) && settings.decrisp,
    legacy,
    skip_cfg_above_sigma: calculateSkipCfgAboveSigma(settings),
    deliberate_euler_ancestral_bug: legacy,
  };
}

/**
 * 写入 V3 专属 NovelAI 参数
 * @param parameters 官方 parameters
 * @param settings NovelAI 设置页参数
 */
function applyV3Parameters(parameters: Record<string, unknown>, settings: NovelAISettings): void {
  parameters.sm = settings.smea;
  parameters.sm_dyn = settings.smea && settings.smeaDyn;
}

/**
 * 写入 V4 提示词结构
 * @param parameters 官方 parameters
 * @param prompts 最终提示词
 */
function applyV4Prompts(parameters: Record<string, unknown>, prompts: NovelAIFinalPrompts): void {
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

/**
 * 读取实际发送的采样器
 * V3 Auto 模式按 nai-webui 逻辑使用 Euler Ancestral
 * @param settings NovelAI 设置页参数
 * @returns 实际发送的 sampler
 */
function getEffectiveSampler(settings: NovelAISettings): NovelAISampler {
  return isNovelAIV3Model(settings.model) && settings.autoSampler ? 'k_euler_ancestral' : settings.sampler;
}

/**
 * 解析本次 NovelAI 请求使用的 seed
 * 设置页留空时为本次请求生成随机 seed
 * @param settings NovelAI 设置页参数
 * @returns 最终发送给 NovelAI 的 seed
 */
function resolveNovelAISeed(settings: NovelAISettings): number {
  return settings.seed ?? createRandomSeed();
}

/**
 * 创建 NovelAI 随机 seed
 * @returns 32 位无符号整数范围内的 seed
 */
function createRandomSeed(): number {
  return Math.floor(Math.random() * (NOVELAI_MAX_SEED + 1));
}

/**
 * 读取实际发送的噪声调度
 * native 仅 V3 支持，其他模型自动回退 karras
 * @param settings NovelAI 设置页参数
 * @returns 实际发送的噪声调度
 */
function getEffectiveNoiseSchedule(settings: NovelAISettings): NovelAINoiseSchedule {
  return !isNovelAIV3Model(settings.model) && settings.noiseSchedule === 'native' ? 'karras' : settings.noiseSchedule;
}

/**
 * 计算 Variety+ 的 skip_cfg_above_sigma
 * @param settings NovelAI 设置页参数
 * @returns NovelAI sigma 阈值或 null
 */
function calculateSkipCfgAboveSigma(settings: NovelAISettings): number | null {
  if (!settings.varietyPlus || (!isNovelAIV3Model(settings.model) && !isNovelAIV45Model(settings.model))) return null;
  const ratio = Math.sqrt((settings.width * settings.height) / REFERENCE_PIXEL_COUNT);
  return ratio * (isNovelAIV45Model(settings.model) ? SIGMA_MAGIC_NUMBER_V4_5 : SIGMA_MAGIC_NUMBER_V3_V4);
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
    vibeReferences: getNovelAIPositivePresetVibes(settings, imagePromptPresets),
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
  const seed = resolveNovelAISeed(settings);
  return {
    settings,
    prompts,
    accounts,
    seed,
    snapshot: buildRequestSnapshot(settings, prompts, accounts[0] ?? null, seed),
  };
}

/**
 * 解析请求中的 vibe 参数
 * @param request 已构建请求
 * @param options 请求控制选项
 * @returns 带已解析 vibe 参数的提示词快照
 */
async function resolveRequestPrompts(
  request: NovelAIResolvedRequest,
  options: NovelAIRequestOptions,
): Promise<NovelAIFinalPrompts> {
  if (request.prompts.vibeParameters || !request.prompts.vibeReferences?.length) return request.prompts;
  const vibeParameters = await resolveNovelAIVibeParameters(
    request.settings,
    request.prompts.vibeReferences,
    request.accounts,
    options,
  );
  return vibeParameters ? { ...request.prompts, vibeParameters } : request.prompts;
}

/**
 * 构建测试面板使用的 vibe 摘要
 * @param prompts 最终提示词快照
 * @returns vibe 摘要
 */
function buildVibeSnapshot(prompts: NovelAIFinalPrompts): NovelAIVibeSnapshot {
  if (prompts.vibeParameters) return buildResolvedVibeSnapshot(prompts.vibeParameters);
  const vibes = (prompts.vibeReferences ?? []).filter(vibe => vibe.enabled);
  return {
    count: vibes.length,
    resolved: false,
    referenceStrengths: vibes.map(vibe => vibe.referenceStrength),
    informationExtracted: vibes.map(vibe => vibe.informationExtracted),
  };
}

/**
 * 从官方数组构建已解析 vibe 摘要
 * @param parameters 已解析 vibe 参数
 * @returns vibe 摘要
 */
function buildResolvedVibeSnapshot(parameters: NovelAIVibeParameters): NovelAIVibeSnapshot {
  return {
    count: parameters.reference_image_multiple.length,
    resolved: true,
    referenceStrengths: parameters.reference_strength_multiple,
    informationExtracted: parameters.reference_information_extracted_multiple,
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
 * 使用指定账号请求 NovelAI 图片，兼容 JSON（新格式）与 ZIP（旧格式）
 * @param settings NovelAI 设置页参数
 * @param prompts 最终提示词
 * @param account 本次尝试账号
 * @param options 请求控制选项
 * @param seed 本次请求使用的 seed
 * @returns 第一张图片 Blob
 */
async function requestNovelAIAccountImage(
  settings: NovelAISettings,
  prompts: NovelAIFinalPrompts,
  account: NovelAIAccount,
  options: NovelAIRequestOptions,
  seed: number,
): Promise<Blob> {
  const response = await requestNovelAIResponse(settings, prompts, account, options, seed);
  throwIfNovelAIAborted(options.signal);
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    return extractNovelAIImageFromJson(response);
  }
  const zipBlob = await readNovelAIResponseBlob(response);
  throwIfNovelAIAborted(options.signal);
  return extractNovelAIImage(zipBlob);
}

/**
 * 请求单个 NovelAI 账号的原始响应
 * @param settings NovelAI 设置页参数
 * @param prompts 最终提示词
 * @param account 本次尝试账号
 * @param options 请求控制选项
 * @param seed 本次请求使用的 seed
 * @returns 官方响应对象
 */
async function requestNovelAIResponse(
  settings: NovelAISettings,
  prompts: NovelAIFinalPrompts,
  account: NovelAIAccount,
  options: NovelAIRequestOptions,
  seed: number,
): Promise<Response> {
  try {
    const response = await fetch(buildEndpoint(account.url), {
      method: 'POST',
      headers: buildHeaders(account.apiKey),
      body: JSON.stringify(buildPayload(settings, prompts, seed)),
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
 * 从 NovelAI JSON 响应中提取首图（新格式：images[0].image 为 base64）
 * @param response 官方 JSON 响应
 * @returns 第一张图片 Blob
 */
async function extractNovelAIImageFromJson(response: Response): Promise<Blob> {
  try {
    const json = await response.json() as { images?: Array<{ image?: string }> };
    const base64 = json.images?.[0]?.image;
    if (!base64) throw new Error('JSON 响应中没有找到图片数据');
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: 'image/png' });
  } catch (error) {
    throw new Error(`[JSON 解析] ${(error as Error).message}`);
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

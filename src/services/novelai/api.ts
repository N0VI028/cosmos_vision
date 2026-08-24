import type { ImagePromptPresetSettings } from '@/constants/image-prompt';
import type {
  NovelAIAccount,
  CharacterPromptItem,
  NovelAISettings,
} from '@/constants/novelai';
import {
  NOVELAI_MAX_SEED,
  NOVELAI_IMAGE_COUNT_LIMITS,
  isNovelAIV5Model,
} from '@/constants/novelai';
import {
  buildNegativePrompt,
  buildPositivePrompt,
} from './prompt-presets';
import type { PromptLlmExtractSettings, PromptLlmOutput } from '@/services/tavern-helper/prompt-llm';
import { extractNovelAIJsonImages } from './response-images';
import { extractImages } from './zip';
import { getNovelAIRequestAccounts } from './router';
import { createRequestTimeoutController, throwIfRequestTimedOut } from '@/services/request-timeout';
import {
  getActiveNovelAIVibePresetRefs,
  resolveNovelAIVibeParameters,
} from './vibe-parameters';
import type { NovelAIVibeParameters, NovelAIVibeSnapshot } from './vibe-types';
import {
  buildPayload,
  buildParameters,
  createBaseParameters,
  getEffectiveNoiseSchedule,
  getEffectiveSampler,
  resolveUseCoords,
  toNovelAICoordinate,
} from './payload';
import type {
  NovelAIFinalPrompts,
  NovelAIImageResult,
  NovelAIImagesResult,
  NovelAIPromptOverrides,
  NovelAIRequestOptions,
  NovelAIRequestSnapshot,
  NovelAIResolvedRequest,
} from './types';

export * from './types';
export {
  buildPayload,
  buildParameters,
  createBaseParameters,
  getEffectiveNoiseSchedule,
  getEffectiveSampler,
  resolveUseCoords,
  toNovelAICoordinate,
};

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
  const result = await generateNovelAIImagesFromResolvedRequest(request, NOVELAI_IMAGE_COUNT_LIMITS.min, options);
  return {
    imageBlob: result.imageBlobs[0]!,
    snapshot: result.snapshot,
    prompts: result.prompts,
  };
}

/**
 * 按预解析结果请求多张 NovelAI 图片
 * @param request 已确定提示词与账号顺序的请求
 * @param imageCount 请求图片数
 * @param options 请求控制选项
 */
export async function generateNovelAIImagesFromResolvedRequest(
  request: NovelAIResolvedRequest,
  imageCount: number,
  options: NovelAIRequestOptions = {},
): Promise<NovelAIImagesResult> {
  const timeout = createRequestTimeoutController(options.signal, request.settings.timeout);
  try {
    return await requestNovelAIImages(request, imageCount, { ...options, signal: timeout.signal });
  } catch (error) {
    throwIfRequestTimedOut(timeout, 'NovelAI', request.settings.timeout);
    throw error;
  } finally {
    timeout.dispose();
  }
}

/**
 * 在已解析请求中选择账号并生成图片
 * @param request 已确定提示词与账号顺序的请求
 * @param imageCount 请求图片数
 * @param options 请求控制选项
 * @returns 生成图片与快照
 */
async function requestNovelAIImages(
  request: NovelAIResolvedRequest,
  imageCount: number,
  options: NovelAIRequestOptions,
): Promise<NovelAIImagesResult> {
  validateImageCount(imageCount);
  validatePrompts(request.prompts);
  ensureRequestAccounts(request.accounts);
  throwIfNovelAIAborted(options.signal);
  const prompts = await resolveRequestPrompts(request, options);
  const errors: string[] = [];
  for (const [index, account] of request.accounts.entries()) {
    try {
      return await requestImagesWithAccount(request, prompts, account, imageCount, options);
    } catch (error) {
      if (options.signal?.aborted) throw createNovelAIAbortError();
      errors.push(formatAccountError(index, account, error));
    }
  }
  throw new Error(buildAggregateErrorMessage(errors));
}

/**
 * 使用单个账号请求并组装多图结果
 * @param request 已确定提示词与账号顺序的请求
 * @param prompts 已解析最终提示词
 * @param account 本次尝试账号
 * @param imageCount 请求图片数
 * @param options 请求控制选项
 */
async function requestImagesWithAccount(
  request: NovelAIResolvedRequest,
  prompts: NovelAIFinalPrompts,
  account: NovelAIAccount,
  imageCount: number,
  options: NovelAIRequestOptions,
): Promise<NovelAIImagesResult> {
  const imageBlobs = await requestNovelAIAccountImages(
    request.settings,
    prompts,
    account,
    options,
    request.seed,
    imageCount,
  );
  return {
    imageBlobs,
    snapshot: buildRequestSnapshot(request.settings, prompts, account, request.seed, imageCount),
    prompts,
  };
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
 * 将 LLM 提取结果转换为 NovelAI 提示词覆写
 * @param prompts 已通过统一校验的正负提示词
 * @param characterPrompts LLM 提取的角色提示词
 * @returns NovelAI 提示词覆写
 */
export function buildNovelAIPromptOverrides(
  prompts: PromptLlmOutput,
  characterPrompts: CharacterPromptItem[] = [],
): NovelAIPromptOverrides {
  return {
    positiveLLMPrompt: prompts.positivePrompt,
    negativeLLMPrompt: prompts.negativePrompt,
    positivePromptMode: 'direct',
    negativePromptMode: 'direct',
    characterPrompts,
  };
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
  imageCount: number,
): NovelAIRequestSnapshot {
  return {
    endpoint: account ? buildEndpoint(account.url) : '未选择可用账号',
    positivePrompt: prompts.positivePrompt,
    negativePrompt: prompts.negativePrompt,
    characterPrompts: prompts.characterPrompts ?? [],
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
    qualityPreset: settings.qualityPreset,
    imageCount,
    vibes: buildVibeSnapshot(prompts),
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
  const characterPrompts = overrides?.characterPrompts ?? [];
  const positivePrompt = buildPositivePrompt(
    settings,
    imagePromptPresets,
    extractSettings,
    overrides?.positiveLLMPrompt ?? '',
    overrides?.positivePromptMode ?? 'extract',
  );
  const isV5 = isNovelAIV5Model(settings.model);
  return {
    positivePrompt,
    negativePrompt: buildNegativePrompt(
      settings,
      imagePromptPresets,
      extractSettings,
      overrides?.negativeLLMPrompt ?? '',
      overrides?.negativePromptMode ?? 'extract',
      positivePrompt,
    ),
    useCharacterCoords: resolveUseCoords(characterPrompts.length, settings.autoCharacterCoords, settings.model),
    characterPrompts,
    vibeReferences: isV5 ? [] : getActiveNovelAIVibePresetRefs(settings.novelAIVibePresets),
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
    snapshot: buildRequestSnapshot(settings, prompts, accounts[0] ?? null, seed, 1),
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
  if (isNovelAIV5Model(request.settings.model)) return request.prompts;
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
 * @param imageCount 请求图片数
 * @returns 按响应顺序排列的图片
 */
async function requestNovelAIAccountImages(
  settings: NovelAISettings,
  prompts: NovelAIFinalPrompts,
  account: NovelAIAccount,
  options: NovelAIRequestOptions,
  seed: number,
  imageCount: number,
): Promise<Blob[]> {
  const response = await requestNovelAIResponse(settings, prompts, account, options, seed, imageCount);
  throwIfNovelAIAborted(options.signal);
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    return extractNovelAIJsonImages(response);
  }
  const zipBlob = await readNovelAIResponseBlob(response);
  throwIfNovelAIAborted(options.signal);
  return extractNovelAIZipImages(zipBlob);
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
  imageCount: number,
): Promise<Response> {
  try {
    const response = await fetch(buildEndpoint(account.url), {
      method: 'POST',
      headers: buildHeaders(account.apiKey),
      body: JSON.stringify(buildPayload(settings, prompts, seed, imageCount)),
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
 * 校验 NovelAI 单次请求图片数
 * @param imageCount 图片数
 */
function validateImageCount(imageCount: number): void {
  const { min, max } = NOVELAI_IMAGE_COUNT_LIMITS;
  if (Number.isInteger(imageCount) && imageCount >= min && imageCount <= max) return;
  throw new Error(`图片数必须是 ${min} 到 ${max} 的整数`);
}

/**
 * 从 NovelAI ZIP 响应中提取全部图片
 * @param zipBlob 官方响应 ZIP
 * @returns 按压缩包顺序排列的图片
 */
async function extractNovelAIZipImages(zipBlob: Blob): Promise<Blob[]> {
  try {
    return await extractImages(zipBlob);
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
  const name = account.name.trim() || `账号 ${index + 1}`;
  return `${name} (${buildEndpoint(account.url)}) 失败: ${reason}`;
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

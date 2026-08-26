import { DEFAULT_PROMPT_LLM_OUTPUT_FIELDS } from '@/constants/default-settings';
import type { CosmosVisionSettings } from '@/constants/novelai';
import {
  getPromptLlmAccountDisplayName,
  type PromptLlmAccount,
  type PromptLlmContext,
  type PromptLlmMessagePresetSettings,
  type PromptLlmOutputFields,
  type PromptLlmSettings,
  type PromptProfilesSettings,
} from '@/constants/prompt-llm';
import type { ImageSource } from '@/constants/comfyui';
import { getAvailablePromptLlmAccounts, getPromptLlmRequestAccounts } from '@/services/prompt-llm/router';
import {
  getActivePromptLlmPreset,
  resolvePromptLlmMessageContent,
  type PromptLlmRuntimeContent,
} from '@/services/prompt-llm/message-preset';
import {
  shouldSendPromptLlmMessage,
  type PromptLlmTriggerContext,
} from '@/services/prompt-llm/message-trigger';
import { buildPromptLlmRuntimeContent } from '@/services/prompt-profiles/runtime';
import { getTavernHelper } from '@/services/tavern-helper/availability';
import { requestTavernHelperGenerateRaw } from '@/services/tavern-helper/generate-raw';
import {
  buildCustomApi,
  buildGenerateRawMessagesRequest,
  buildJsonSchema,
  readPromptLlmOutputWithRules,
  type PromptLlmExtractionResult,
  type TavernHelperGenerateRawConfig,
  type TavernHelperRolePrompt,
} from '@/services/tavern-helper/prompt-llm';
import { createExtractionError, detectExtractionFailureType } from '@/services/prompt-llm/errors';
import { readCharacterPrompts } from '@/services/prompt-llm/character-prompt';

/** Prompt LLM 运行时生成选项 */
export interface PromptLlmGenerateOptions {
  generationId?: string;
  /** 显式触发上下文；缺省时仅 history，模型/来源为空 */
  triggerContext?: PromptLlmTriggerContext;
}

/**
 * 构建显式触发上下文
 * @param settings 扩展设置
 * @param imageSource 覆盖生图来源；缺省用 settings.imageSource
 * @returns 触发上下文
 */
export function buildPromptLlmTriggerContext(
  settings: Pick<CosmosVisionSettings, 'imageSource' | 'novelai' | 'comfyui'>,
  imageSource: ImageSource = settings.imageSource,
): PromptLlmTriggerContext {
  return {
    historyContent: '',
    imageSource,
    modelId: readPromptLlmTriggerModelId(settings, imageSource),
  };
}

/**
 * 合并 history 与显式触发上下文
 * @param historyContent 历史文本
 * @param triggerContext 可选触发上下文
 * @returns 完整触发上下文
 */
export function mergePromptLlmTriggerContext(
  historyContent: string,
  triggerContext?: PromptLlmTriggerContext,
): PromptLlmTriggerContext {
  return {
    historyContent,
    imageSource: triggerContext?.imageSource ?? 'novelai',
    modelId: triggerContext?.modelId ?? '',
  };
}

/**
 * 读取当前来源对应的模型 ID
 * @param settings 扩展设置
 * @param imageSource 生图来源
 * @returns 模型 ID
 */
function readPromptLlmTriggerModelId(
  settings: Pick<CosmosVisionSettings, 'novelai' | 'comfyui'>,
  imageSource: ImageSource,
): string {
  if (imageSource === 'comfyui') return '';
  return settings.novelai.model.trim();
}

/**
 * 基于上下文与人物配置构建运行时请求
 * @param context Prompt LLM 运行时上下文
 * @param settings LLM 配置
 * @param presetSettings 消息预设集合
 * @param promptProfiles 提示词Profile设置
 * @param schemaFields JSON Schema 字段配置
 * @param triggerContext 显式触发上下文
 * @param account 指定本次请求的账号；缺省时取首个可用账号（不推进负载均衡轮询，供测试页构建快照）
 * @returns generateRaw 请求体
 */
export async function buildPromptLlmRuntimeRequestFromContext(
  context: PromptLlmContext,
  settings: PromptLlmSettings,
  presetSettings: PromptLlmMessagePresetSettings,
  promptProfiles: PromptProfilesSettings,
  schemaFields: PromptLlmOutputFields | null = DEFAULT_PROMPT_LLM_OUTPUT_FIELDS,
  triggerContext?: PromptLlmTriggerContext,
  account?: PromptLlmAccount,
): Promise<TavernHelperGenerateRawConfig> {
  const runtimeContent = await buildPromptLlmRuntimeContent(context, promptProfiles, settings);
  return buildPromptLlmRuntimeRequest(settings, presetSettings, runtimeContent, schemaFields, triggerContext, account);
}

/**
 * 使用运行时内容构建请求
 * @param settings LLM 配置
 * @param presetSettings 消息预设集合
 * @param runtimeContent 运行时替换内容
 * @param schemaFields JSON Schema 字段配置
 * @param triggerContext 显式触发上下文
 * @param account 指定本次请求的账号；缺省时取首个可用账号（不推进负载均衡轮询，供测试页构建快照）
 * @returns generateRaw 请求体
 */
export async function buildPromptLlmRuntimeRequest(
  settings: PromptLlmSettings,
  presetSettings: PromptLlmMessagePresetSettings,
  runtimeContent: PromptLlmRuntimeContent,
  schemaFields: PromptLlmOutputFields | null = DEFAULT_PROMPT_LLM_OUTPUT_FIELDS,
  triggerContext?: PromptLlmTriggerContext,
  account?: PromptLlmAccount,
): Promise<TavernHelperGenerateRawConfig> {
  const orderedPrompts = await buildPromptLlmOrderedPrompts(presetSettings, runtimeContent, triggerContext);
  const schema = schemaFields ? buildJsonSchema(schemaFields) : undefined;
  const requestAccount = account ?? getAvailablePromptLlmAccounts(settings)[0];
  return buildGenerateRawMessagesRequest(orderedPrompts, buildCustomApi(settings, requestAccount), schema, settings.shouldStream);
}

/**
 * 组装启用的 LLM 消息列表
 * @param presetSettings 消息预设集合
 * @param runtimeContent 运行时替换内容
 * @param triggerContext 显式触发上下文
 * @returns 可发送消息数组
 */
export async function buildPromptLlmOrderedPrompts(
  presetSettings: PromptLlmMessagePresetSettings,
  runtimeContent: PromptLlmRuntimeContent,
  triggerContext?: PromptLlmTriggerContext,
): Promise<TavernHelperRolePrompt[]> {
  const messages = getActivePromptLlmPreset(presetSettings).messages.filter(message =>
    canSendPromptLlmMessage(message, runtimeContent, triggerContext),
  );
  const prompts = await Promise.all(
    messages.map(async message => ({
      role: message.role,
      content: await resolvePromptLlmMessageContent(message, runtimeContent),
    })),
  );
  return prompts.filter(prompt => prompt.content.trim());
}

/**
 * 判断 LLM 条目是否应进入本次请求
 * @param message LLM 条目
 * @param runtimeContent 运行时替换内容
 * @param triggerContext 显式触发上下文
 * @returns 是否应发送
 */
function canSendPromptLlmMessage(
  message: ReturnType<typeof getActivePromptLlmPreset>['messages'][number],
  runtimeContent: PromptLlmRuntimeContent,
  triggerContext?: PromptLlmTriggerContext,
): boolean {
  if (message.enabled === false) return false;
  return shouldSendPromptLlmMessage(message, mergePromptLlmTriggerContext(runtimeContent.historyContent, triggerContext));
}

/**
 * 基于上下文发送 LLM 请求并返回原始文本
 * @param context Prompt LLM 运行时上下文
 * @param settings LLM 配置
 * @param presetSettings 消息预设集合
 * @param promptProfiles 提示词Profile设置
 * @param schemaFields JSON Schema 字段配置
 * @returns LLM 原始响应文本
 */
async function generatePromptTextFromRuntimeContext(
  context: PromptLlmContext,
  settings: PromptLlmSettings,
  presetSettings: PromptLlmMessagePresetSettings,
  promptProfiles: PromptProfilesSettings,
  schemaFields: PromptLlmOutputFields | null = DEFAULT_PROMPT_LLM_OUTPUT_FIELDS,
  options: PromptLlmGenerateOptions = {},
): Promise<string> {
  const tavernHelper = getTavernHelper({ silent: false });
  if (!tavernHelper) {
    throw new Error('TavernHelper 不可用,无法生成提示词');
  }
  try {
    const result = await requestPromptLlmWithAccounts(
      tavernHelper,
      settings,
      options,
      account =>
        buildPromptLlmRuntimeRequestFromContext(
          context,
          settings,
          presetSettings,
          promptProfiles,
          schemaFields,
          options.triggerContext,
          account,
        ),
    );
    return result.rawText;
  } catch (error) {
    throw new Error(`提示词生成失败: ${(error as Error).message}`);
  }
}

/** 提示词 LLM 多账号请求上下文 */
export interface PromptLlmAccountsRequestContext {
  generationId?: string;
  timeoutSeconds?: number;
}

/** 提示词 LLM 多账号请求结果 */
export interface PromptLlmRawRequestResult {
  rawText: string;
  accountName: string;
}

/**
 * 按路由顺序逐账号发送请求，失败自动切换下一个（故障转移）
 * 每个账号独立决定走酒馆代理预设还是自填地址密钥
 * @param tavernHelper 酒馆助手实例
 * @param settings LLM 配置
 * @param context 请求控制选项
 * @param buildRequest 按候选账号构建 generateRaw 请求体
 * @returns LLM 原始响应文本与实际成功的账号名
 */
export async function requestPromptLlmWithAccounts(
  tavernHelper: NonNullable<typeof TavernHelper>,
  settings: PromptLlmSettings,
  context: PromptLlmAccountsRequestContext,
  buildRequest: (account?: PromptLlmAccount) => Promise<TavernHelperGenerateRawConfig>,
): Promise<PromptLlmRawRequestResult> {
  const accounts = getPromptLlmRequestAccounts(settings);
  if (!accounts.length) {
    throw new Error('没有可用的 LLM 账号，请先启用至少一组填写完整接口信息的账号');
  }
  const errors: string[] = [];
  for (const [index, account] of accounts.entries()) {
    try {
      const request = await buildRequest(account);
      const rawText = await requestTavernHelperGenerateRaw(tavernHelper, buildSilentGenerateRawRequest(request, context), {
        timeoutSeconds: context.timeoutSeconds ?? settings.timeout,
      });
      return { rawText, accountName: getPromptLlmAccountDisplayName(account) };
    } catch (error) {
      errors.push(formatPromptLlmAccountError(account, error));
      if (index < accounts.length - 1) {
        console.warn(`[PromptLlm] ${getPromptLlmAccountDisplayName(account)} 请求失败，尝试下一个账号`, error);
      }
    }
  }
  throw new Error(`已尝试多组账号但均失败: ${errors.join('； ')}`);
}

/**
 * 组装单个账号的失败摘要
 * @param account 本次尝试账号
 * @param error 失败原因
 * @returns 用户可见的单账号错误行
 */
function formatPromptLlmAccountError(account: PromptLlmAccount, error: unknown): string {
  const reason = error instanceof Error ? error.message : '未知错误';
  const name = getPromptLlmAccountDisplayName(account);
  const endpoint = account.proxyPreset.trim() ? `预设 ${account.proxyPreset.trim()}` : account.apiUrl.trim();
  return `${name} (${endpoint}) 失败: ${reason}`;
}

/**
 * 构建静默 generateRaw 请求
 * @param request 原始请求
 * @param options 生成选项
 * @returns 可发送给 TavernHelper 的请求
 */
function buildSilentGenerateRawRequest(
  request: TavernHelperGenerateRawConfig,
  options: PromptLlmAccountsRequestContext,
): TavernHelperGenerateRawConfig {
  return { ...request, should_silence: true, generation_id: options.generationId };
}

/**
 * 从 LLM 原始文本提取并校验提示词,所有生图渠道共用的统一入口
 * 空输出、无法解析、正向提示词为空时均抛出结构化提取错误
 * @param rawText LLM 原始响应文本
 * @param settings LLM 配置
 * @param schemaFields JSON Schema 字段配置
 * @returns 正负提示词与角色提示词
 */
export function extractPromptLlmResult(
  rawText: string,
  settings: PromptLlmSettings,
  schemaFields: PromptLlmOutputFields | null = DEFAULT_PROMPT_LLM_OUTPUT_FIELDS,
): PromptLlmExtractionResult {
  if (!rawText.trim()) {
    throw createExtractionError('empty_output', rawText);
  }

  const output = readPromptLlmOutputWithRules(rawText, settings, schemaFields);
  if (!output) {
    throw createExtractionError(detectExtractionFailureType(rawText, settings, schemaFields), rawText);
  }

  // 验证正面提示词提取成功（null/undefined/空字符串均视为提取失败）
  if (!output.positivePrompt?.trim()) {
    throw createExtractionError('invalid_format', rawText);
  }

  return { output, characterPrompts: readCharacterPrompts(rawText, settings) };
}

/**
 * 基于上下文发送 LLM 请求并解析正负提示词。主要用于添加段落生图流程。
 * 如果 LLM 返回值无法解析，则直接将 LLM 原始响应内容抛出。
 * @param context Prompt LLM 运行时上下文
 * @param settings LLM 配置
 * @param presetSettings 消息预设集合
 * @param promptProfiles 提示词Profile设置
 * @param schemaFields JSON Schema 字段配置
 * @returns 正负提示词与角色提示词
 */
export async function generatePromptFromRuntimeContext(
  context: PromptLlmContext,
  settings: PromptLlmSettings,
  presetSettings: PromptLlmMessagePresetSettings,
  promptProfiles: PromptProfilesSettings,
  schemaFields: PromptLlmOutputFields | null = DEFAULT_PROMPT_LLM_OUTPUT_FIELDS,
  options: PromptLlmGenerateOptions = {},
): Promise<PromptLlmExtractionResult> {
  const rawText = await generatePromptTextFromRuntimeContext(
    context,
    settings,
    presetSettings,
    promptProfiles,
    schemaFields,
    options,
  );
  return extractPromptLlmResult(rawText, settings, schemaFields);
}

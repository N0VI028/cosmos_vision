import { DEFAULT_PROMPT_LLM_OUTPUT_FIELDS } from '@/constants/default-settings';
import type { CosmosVisionSettings } from '@/constants/novelai';
import type {
  PromptLlmContext,
  PromptLlmMessagePresetSettings,
  PromptLlmOutputFields,
  PromptLlmSettings,
  PromptProfilesSettings,
} from '@/constants/prompt-llm';
import type { ImageSource } from '@/constants/comfyui';
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
 * @returns generateRaw 请求体
 */
export async function buildPromptLlmRuntimeRequestFromContext(
  context: PromptLlmContext,
  settings: PromptLlmSettings,
  presetSettings: PromptLlmMessagePresetSettings,
  promptProfiles: PromptProfilesSettings,
  schemaFields: PromptLlmOutputFields | null = DEFAULT_PROMPT_LLM_OUTPUT_FIELDS,
  triggerContext?: PromptLlmTriggerContext,
): Promise<TavernHelperGenerateRawConfig> {
  const runtimeContent = await buildPromptLlmRuntimeContent(context, promptProfiles);
  return buildPromptLlmRuntimeRequest(settings, presetSettings, runtimeContent, schemaFields, triggerContext);
}

/**
 * 使用运行时内容构建请求
 * @param settings LLM 配置
 * @param presetSettings 消息预设集合
 * @param runtimeContent 运行时替换内容
 * @param schemaFields JSON Schema 字段配置
 * @param triggerContext 显式触发上下文
 * @returns generateRaw 请求体
 */
export async function buildPromptLlmRuntimeRequest(
  settings: PromptLlmSettings,
  presetSettings: PromptLlmMessagePresetSettings,
  runtimeContent: PromptLlmRuntimeContent,
  schemaFields: PromptLlmOutputFields | null = DEFAULT_PROMPT_LLM_OUTPUT_FIELDS,
  triggerContext?: PromptLlmTriggerContext,
): Promise<TavernHelperGenerateRawConfig> {
  const orderedPrompts = await buildPromptLlmOrderedPrompts(presetSettings, runtimeContent, triggerContext);
  const schema = schemaFields ? buildJsonSchema(schemaFields) : undefined;
  return buildGenerateRawMessagesRequest(orderedPrompts, buildCustomApi(settings), schema, settings.shouldStream);
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
  const request = await buildPromptLlmRuntimeRequestFromContext(
    context,
    settings,
    presetSettings,
    promptProfiles,
    schemaFields,
    options.triggerContext,
  );
  try {
    return requestTavernHelperGenerateRaw(tavernHelper, buildSilentGenerateRawRequest(request, options), {
      timeoutSeconds: settings.timeout,
    });
  } catch (error) {
    throw new Error(`提示词生成失败: ${(error as Error).message}`);
  }
}

/**
 * 构建静默 generateRaw 请求
 * @param request 原始请求
 * @param options 生成选项
 * @returns 可发送给 TavernHelper 的请求
 */
function buildSilentGenerateRawRequest(
  request: TavernHelperGenerateRawConfig,
  options: PromptLlmGenerateOptions,
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

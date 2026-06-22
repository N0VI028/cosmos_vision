import { DEFAULT_PROMPT_LLM_OUTPUT_FIELDS } from '@/constants/default-settings';
import type {
  PromptLlmContext,
  PromptLlmMessagePresetSettings,
  PromptLlmOutputFields,
  PromptLlmSettings,
  PromptProfilesSettings,
} from '@/constants/novelai';
import {
  getActivePromptLlmPreset,
  resolvePromptLlmMessageContent,
  type PromptLlmRuntimeContent,
} from '@/services/prompt-llm/message-preset';
import { buildPromptLlmRuntimeContent } from '@/services/prompt-profiles/runtime';
import { getTavernHelper } from '@/services/tavern-helper/availability';
import {
  buildCustomApi,
  buildGenerateRawMessagesRequest,
  buildJsonSchema,
  formatPromptLlmRawResult,
  readPromptLlmOutputWithRules,
  type PromptLlmOutput,
  type TavernHelperGenerateRawConfig,
  type TavernHelperRolePrompt,
} from '@/services/tavern-helper/prompt-llm';

/** Prompt LLM 运行时生成选项 */
export interface PromptLlmGenerateOptions {
  generationId?: string;
}

/**
 * 基于上下文与人物配置构建运行时请求
 * @param context Prompt LLM 运行时上下文
 * @param settings LLM 配置
 * @param presetSettings 消息预设集合
 * @param promptProfiles 提示词Profile设置
 * @param schemaFields JSON Schema 字段配置
 * @returns generateRaw 请求体
 */
export async function buildPromptLlmRuntimeRequestFromContext(
  context: PromptLlmContext,
  settings: PromptLlmSettings,
  presetSettings: PromptLlmMessagePresetSettings,
  promptProfiles: PromptProfilesSettings,
  schemaFields: PromptLlmOutputFields | null = DEFAULT_PROMPT_LLM_OUTPUT_FIELDS,
): Promise<TavernHelperGenerateRawConfig> {
  const runtimeContent = await buildPromptLlmRuntimeContent(context, promptProfiles);
  return buildPromptLlmRuntimeRequest(settings, presetSettings, runtimeContent, schemaFields);
}

/**
 * 使用运行时内容构建请求
 * @param settings LLM 配置
 * @param presetSettings 消息预设集合
 * @param runtimeContent 运行时替换内容
 * @param schemaFields JSON Schema 字段配置
 * @returns generateRaw 请求体
 */
export function buildPromptLlmRuntimeRequest(
  settings: PromptLlmSettings,
  presetSettings: PromptLlmMessagePresetSettings,
  runtimeContent: PromptLlmRuntimeContent,
  schemaFields: PromptLlmOutputFields | null = DEFAULT_PROMPT_LLM_OUTPUT_FIELDS,
): TavernHelperGenerateRawConfig {
  const orderedPrompts = buildPromptLlmOrderedPrompts(presetSettings, runtimeContent);
  const schema = schemaFields ? buildJsonSchema(schemaFields) : undefined;
  return buildGenerateRawMessagesRequest(orderedPrompts, buildCustomApi(settings), schema);
}

/**
 * 组装启用的 LLM 消息列表
 * @param presetSettings 消息预设集合
 * @param runtimeContent 运行时替换内容
 * @returns 可发送消息数组
 */
export function buildPromptLlmOrderedPrompts(
  presetSettings: PromptLlmMessagePresetSettings,
  runtimeContent: PromptLlmRuntimeContent,
): TavernHelperRolePrompt[] {
  return getActivePromptLlmPreset(presetSettings)
    .messages.filter(message => message.enabled !== false)
    .map(message => ({
      role: message.role,
      content: resolvePromptLlmMessageContent(message, runtimeContent),
    }))
    .filter(prompt => prompt.content.trim());
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
export async function generatePromptTextFromRuntimeContext(
  context: PromptLlmContext,
  settings: PromptLlmSettings,
  presetSettings: PromptLlmMessagePresetSettings,
  promptProfiles: PromptProfilesSettings,
  schemaFields: PromptLlmOutputFields | null = DEFAULT_PROMPT_LLM_OUTPUT_FIELDS,
  options: PromptLlmGenerateOptions = {},
): Promise<string> {
  const tavernHelper = getTavernHelper();
  if (!tavernHelper) {
    throw new Error('TavernHelper 不可用,无法生成提示词');
  }
  const request = await buildPromptLlmRuntimeRequestFromContext(
    context,
    settings,
    presetSettings,
    promptProfiles,
    schemaFields,
  );
  try {
    return formatPromptLlmRawResult(await tavernHelper.generateRaw(buildSilentGenerateRawRequest(request, options)));
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
 * 基于上下文发送 LLM 请求并解析正负提示词
 * @param context Prompt LLM 运行时上下文
 * @param settings LLM 配置
 * @param presetSettings 消息预设集合
 * @param promptProfiles 提示词Profile设置
 * @param schemaFields JSON Schema 字段配置
 * @returns 正负提示词
 */
export async function generatePromptFromRuntimeContext(
  context: PromptLlmContext,
  settings: PromptLlmSettings,
  presetSettings: PromptLlmMessagePresetSettings,
  promptProfiles: PromptProfilesSettings,
  schemaFields: PromptLlmOutputFields | null = DEFAULT_PROMPT_LLM_OUTPUT_FIELDS,
  options: PromptLlmGenerateOptions = {},
): Promise<PromptLlmOutput> {
  const rawText = await generatePromptTextFromRuntimeContext(
    context,
    settings,
    presetSettings,
    promptProfiles,
    schemaFields,
    options,
  );
  const output = readPromptLlmOutputWithRules(rawText, settings, schemaFields);
  if (!output) {
    throw new Error('LLM 返回值无法提取正负提示词');
  }
  return output;
}

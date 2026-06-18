import { DEFAULT_PROMPT_LLM_OUTPUT_FIELDS } from '@/constants/default-settings';
import type {
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

/**
 * 基于上下文与人物配置构建运行时请求
 * @param contextParagraphs 焦点上下文段落
 * @param settings LLM 配置
 * @param presetSettings 消息预设集合
 * @param promptProfiles 提示词Profile设置
 * @param schemaFields JSON Schema 字段配置
 * @returns generateRaw 请求体
 */
export async function buildPromptLlmRuntimeRequestFromContext(
  contextParagraphs: string[],
  settings: PromptLlmSettings,
  presetSettings: PromptLlmMessagePresetSettings,
  promptProfiles: PromptProfilesSettings,
  schemaFields: PromptLlmOutputFields | null = DEFAULT_PROMPT_LLM_OUTPUT_FIELDS,
): Promise<TavernHelperGenerateRawConfig> {
  const runtimeContent = await buildPromptLlmRuntimeContent(contextParagraphs, promptProfiles);
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
 * @param contextParagraphs 焦点上下文段落
 * @param settings LLM 配置
 * @param presetSettings 消息预设集合
 * @param promptProfiles 提示词Profile设置
 * @param schemaFields JSON Schema 字段配置
 * @returns LLM 原始响应文本
 */
export async function generatePromptTextFromRuntimeContext(
  contextParagraphs: string[],
  settings: PromptLlmSettings,
  presetSettings: PromptLlmMessagePresetSettings,
  promptProfiles: PromptProfilesSettings,
  schemaFields: PromptLlmOutputFields | null = DEFAULT_PROMPT_LLM_OUTPUT_FIELDS,
): Promise<string> {
  const tavernHelper = getTavernHelper();
  if (!tavernHelper) {
    throw new Error('TavernHelper 不可用,无法生成提示词');
  }
  const request = await buildPromptLlmRuntimeRequestFromContext(
    contextParagraphs,
    settings,
    presetSettings,
    promptProfiles,
    schemaFields,
  );
  try {
    return formatPromptLlmRawResult(await tavernHelper.generateRaw({ ...request, should_silence: true }));
  } catch (error) {
    throw new Error(`提示词生成失败: ${(error as Error).message}`);
  }
}

/**
 * 基于上下文发送 LLM 请求并解析正负提示词
 * @param contextParagraphs 焦点上下文段落
 * @param settings LLM 配置
 * @param presetSettings 消息预设集合
 * @param promptProfiles 提示词Profile设置
 * @param schemaFields JSON Schema 字段配置
 * @returns 正负提示词
 */
export async function generatePromptFromRuntimeContext(
  contextParagraphs: string[],
  settings: PromptLlmSettings,
  presetSettings: PromptLlmMessagePresetSettings,
  promptProfiles: PromptProfilesSettings,
  schemaFields: PromptLlmOutputFields | null = DEFAULT_PROMPT_LLM_OUTPUT_FIELDS,
): Promise<PromptLlmOutput> {
  const rawText = await generatePromptTextFromRuntimeContext(
    contextParagraphs,
    settings,
    presetSettings,
    promptProfiles,
    schemaFields,
  );
  const output = readPromptLlmOutputWithRules(rawText, settings, schemaFields);
  if (!output) {
    throw new Error('LLM 返回值无法提取正负提示词');
  }
  return output;
}

import { DEFAULT_PROMPT_LLM_OUTPUT_FIELDS } from '@/constants/default-settings';
import type { PromptLlmMessagePresetSettings, PromptLlmSettings, PromptPerson } from '@/constants/novelai';
import type { PromptLlmRuntimeContent } from '@/services/prompt-llm/message-preset';
import { buildPromptLlmRuntimeRequest } from '@/services/prompt-llm/runtime-request';
import { renderPromptPersonTemplate } from '@/services/prompt-profiles/runtime';
import { getTavernHelper } from '@/services/tavern-helper/availability';
import { formatPromptLlmRawResult, parsePromptLlmOutput } from '@/services/tavern-helper/prompt-llm';

/**
 * 从人物模板条目解析固定 tag
 * @param person 人物配置
 * @param settings LLM 配置
 * @param presetSettings LLM 消息预设集合
 * @returns 可保存到 staticTags 的 tag 文本
 */
export async function parsePromptPersonStaticTags(
  person: PromptPerson,
  settings: PromptLlmSettings,
  presetSettings: PromptLlmMessagePresetSettings,
): Promise<string> {
  const sourceText = await renderPromptPersonTemplate(person);
  return parsePromptPersonStaticTagsFromText(person.name, sourceText, settings, presetSettings);
}

/**
 * 从用户输入文本解析固定 tag
 * @param personName 人物名称
 * @param sourceText 人物资料
 * @param settings LLM 配置
 * @param presetSettings LLM 消息预设集合
 * @returns 可保存到 staticTags 的 tag 文本
 */
export async function parsePromptPersonStaticTagsFromText(
  personName: string,
  sourceText: string,
  settings: PromptLlmSettings,
  presetSettings: PromptLlmMessagePresetSettings,
): Promise<string> {
  const contextText = buildPromptPersonTagContext(personName, sourceText);
  if (!contextText) throw new Error('没有可解析的人物资料，请先添加有效资料条目');
  const rawText = await requestPromptPersonTags(contextText, settings, presetSettings);
  const output = parsePromptLlmOutput(rawText, DEFAULT_PROMPT_LLM_OUTPUT_FIELDS);
  if (!output.positivePrompt.trim()) throw new Error('LLM 返回值无法提取人物 tag');
  return output.positivePrompt.trim();
}

/**
 * 请求 LLM 消息预设解析人物 tag
 * @param contextText 人物资料上下文
 * @param settings LLM 配置
 * @param presetSettings LLM 消息预设集合
 * @returns LLM 原始响应文本
 */
async function requestPromptPersonTags(
  contextText: string,
  settings: PromptLlmSettings,
  presetSettings: PromptLlmMessagePresetSettings,
): Promise<string> {
  const tavernHelper = getTavernHelper();
  if (!tavernHelper) throw new Error('TavernHelper 不可用，无法解析人物 tag');
  const request = buildPromptLlmRuntimeRequest(settings, presetSettings, buildPromptPersonRuntimeContent(contextText));
  try {
    return formatPromptLlmRawResult(await tavernHelper.generateRaw({ ...request, should_silence: true }));
  } catch (error) {
    throw new Error(`提示词生成失败: ${(error as Error).message}`);
  }
}

/**
 * 构建无历史消息的人物运行时内容
 * @param contextText 人物资料上下文
 * @returns LLM 预设运行时内容
 */
function buildPromptPersonRuntimeContent(contextText: string): PromptLlmRuntimeContent {
  return {
    historyContent: '',
    participantContent: contextText,
    focusParagraphContent: '',
  };
}

/**
 * 构建固定 tag 生成上下文
 * @param personName 人物名称
 * @param sourceText 人物资料
 * @returns 发送给 LLM 预设的上下文
 */
function buildPromptPersonTagContext(personName: string, sourceText: string): string {
  const source = sourceText.trim();
  if (!source) return '';
  const name = personName.trim() || '未命名人物';
  return [`人物：${name}`, '请根据以下人物资料生成固定人物 tag，只保留可复用的正面提示词部分', source].join('\n\n');
}

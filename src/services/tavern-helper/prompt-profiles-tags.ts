import { DEFAULT_PROMPT_LLM_OUTPUT_FIELDS } from '@/constants/default-settings';
import type { PromptLlmMessagePresetSettings, PromptLlmSettings, PromptPerson } from '@/constants/novelai';
import type { PromptLlmRuntimeContent } from '@/services/prompt-llm/message-preset';
import { buildPromptLlmRuntimeRequest, requestPromptLlmWithAccounts } from '@/services/prompt-llm/runtime-request';
import { renderPromptPersonTemplate } from '@/services/prompt-profiles/runtime';
import { getTavernHelper } from '@/services/tavern-helper/availability';
import { readCharacterPrompts } from '@/services/prompt-llm/character-prompt';
import { parsePromptLlmOutput } from '@/services/tavern-helper/prompt-llm';
import type { PromptPersonTagsDraft } from '@/services/prompt-profiles/static-tags-draft';

/**
 * 从人物模板条目解析固定 tag 与负面 tag
 * @param person 人物配置
 * @param settings LLM 配置
 * @param presetSettings LLM 消息预设集合
 * @returns 可保存到 staticTags 和 negativeTags 的草稿对象
 */
export async function parsePromptPersonStaticTags(
  person: PromptPerson,
  settings: PromptLlmSettings,
  presetSettings: PromptLlmMessagePresetSettings,
): Promise<PromptPersonTagsDraft> {
  const sourceText = await renderPromptPersonTemplate(person);
  return parsePromptPersonStaticTagsFromText(person.name, sourceText, settings, presetSettings);
}

/**
 * 从用户输入文本解析固定 tag 与负面 tag
 * @param personName 人物名称
 * @param sourceText 人物资料
 * @param settings LLM 配置
 * @param presetSettings LLM 消息预设集合
 * @returns 可保存到 staticTags 和 negativeTags 的草稿对象
 */
export async function parsePromptPersonStaticTagsFromText(
  personName: string,
  sourceText: string,
  settings: PromptLlmSettings,
  presetSettings: PromptLlmMessagePresetSettings,
): Promise<PromptPersonTagsDraft> {
  const contextText = buildPromptPersonTagContext(personName, sourceText);
  if (!contextText) throw new Error('没有可解析的人物资料，请先添加有效资料条目');
  const rawText = await requestPromptPersonTags(contextText, settings, presetSettings);
  const output = parsePromptLlmOutput(rawText, DEFAULT_PROMPT_LLM_OUTPUT_FIELDS);
  const characterPrompts = readCharacterPrompts(rawText, settings);
  const positiveTags = characterPrompts[0]?.positivePrompt.trim() || output.positivePrompt.trim();
  const negativeTags = characterPrompts[0]?.negativePrompt.trim() || output.negativePrompt.trim();
  if (!positiveTags && !negativeTags) throw new Error('LLM 返回值无法提取人物 tag');
  return { positiveTags, negativeTags };
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
  const tavernHelper = getTavernHelper({ silent: false });
  if (!tavernHelper) throw new Error('TavernHelper 不可用，无法解析人物 tag');
  try {
    const result = await requestPromptLlmWithAccounts(tavernHelper, settings, {}, account =>
      buildPromptLlmRuntimeRequest(settings, presetSettings, buildPromptPersonRuntimeContent(contextText), null, undefined, account),
    );
    return result.rawText;
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
    specialRequestContent: '',
  };
}

/**
 * 构建固定 tag 与负面 tag 生成上下文
 * @param personName 人物名称
 * @param sourceText 人物资料
 * @returns 发送给 LLM 预设的上下文
 */
export function buildPromptPersonTagContext(personName: string, sourceText: string): string {
  const source = sourceText.trim();
  if (!source) return '';
  const name = personName.trim() || '未命名人物';
  return [
    `人物：${name}`,
    [
      '请专注于根据以下人物资料生成该人物的正面与负面生图 tag，忽略其他无关的资料提供，并保持原有的 JSON 输出格式。',
      '[解析特别规则与豁免]：',
      '1. 无论当前预设或规则（如 krea2 等）是否规定不需要负面提示词，本次人物资料解析均必须尝试提取并输出该人物专属的负面生图 tag。',
      '2. 保守约束：正面和负面提示词中，仅输出能够从该人物资料可靠推断出的外貌特征或排斥特征（例如为防止发色、瞳色或服装串色漂移的反推词是合理的）；若无法推断出可靠的负面特征，负面部分请直接留空或省略。',
      '3. 严禁输出任何通用画质与质量词（如 bad anatomy、low quality、worst quality 等），此类词汇属于全局图像预设职责，不可作为人物专属 tag 输出。',
    ].join('\n'),
    source,
  ].join('\n\n');
}

import { getOptionalTavernHelper } from '@/services/tavern-helper/availability';
import {
  formatPromptLlmRawResult,
  type TavernHelperGenerateRawConfig,
  type TavernHelperRolePrompt,
} from '@/services/tavern-helper/prompt-llm';

type TavernHelperInstance = NonNullable<typeof TavernHelper>;

/**
 * 发送会先经过 ST 宏替换的 generateRaw 请求
 * @param tavernHelper 酒馆助手实例
 * @param request 原始 generateRaw 请求
 * @returns 格式化后的 LLM 原始响应
 */
export async function requestTavernHelperGenerateRaw(
  tavernHelper: TavernHelperInstance,
  request: TavernHelperGenerateRawConfig,
): Promise<string> {
  return formatPromptLlmRawResult(await tavernHelper.generateRaw(resolveGenerateRawRequestMacros(tavernHelper, request)));
}

/**
 * 构建用于日志展示的宏替换后请求快照
 * @param request 原始 generateRaw 请求
 * @returns 宏替换后的请求快照
 */
export function buildGenerateRawRequestPreview(request: TavernHelperGenerateRawConfig): TavernHelperGenerateRawConfig {
  const tavernHelper = getOptionalTavernHelper();
  return tavernHelper ? resolveGenerateRawRequestMacros(tavernHelper, request) : request;
}

/**
 * 替换 generateRaw 请求中的 ST 宏
 * @param tavernHelper 酒馆助手实例
 * @param request 原始 generateRaw 请求
 * @returns 宏替换后的请求
 */
function resolveGenerateRawRequestMacros(
  tavernHelper: TavernHelperInstance,
  request: TavernHelperGenerateRawConfig,
): TavernHelperGenerateRawConfig {
  return {
    ...request,
    user_input: resolveMacroText(tavernHelper, request.user_input),
    ordered_prompts: request.ordered_prompts?.map(prompt => resolvePromptMacros(tavernHelper, prompt)),
  };
}

/**
 * 替换单段文本中的 ST 宏
 * @param tavernHelper 酒馆助手实例
 * @param text 原始文本
 * @returns 宏替换后的文本
 */
function resolveMacroText(tavernHelper: TavernHelperInstance, text: string | undefined): string | undefined {
  return text === undefined ? undefined : tavernHelper.substitudeMacros(text);
}

/**
 * 替换单条消息中的 ST 宏
 * @param tavernHelper 酒馆助手实例
 * @param prompt 原始消息
 * @returns 宏替换后的消息
 */
function resolvePromptMacros(
  tavernHelper: TavernHelperInstance,
  prompt: string | TavernHelperRolePrompt,
): string | TavernHelperRolePrompt {
  if (typeof prompt === 'string') return tavernHelper.substitudeMacros(prompt);
  return { ...prompt, content: tavernHelper.substitudeMacros(prompt.content) };
}

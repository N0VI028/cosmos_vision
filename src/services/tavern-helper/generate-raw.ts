import { getOptionalTavernHelper } from '@/services/tavern-helper/availability';
import { stopTavernHelperGeneration } from '@/services/tavern-helper/generation-control';
import {
  formatPromptLlmRawResult,
  type TavernHelperGenerateRawConfig,
  type TavernHelperRolePrompt,
} from '@/services/tavern-helper/prompt-llm';

type TavernHelperInstance = NonNullable<typeof TavernHelper>;

/** TavernHelper generateRaw 请求控制选项 */
export interface TavernHelperGenerateRawOptions {
  timeoutSeconds?: number;
}

/**
 * 发送会先经过 ST 宏替换的 generateRaw 请求
 * @param tavernHelper 酒馆助手实例
 * @param request 原始 generateRaw 请求
 * @param options 请求控制选项
 * @returns 格式化后的 LLM 原始响应
 */
export async function requestTavernHelperGenerateRaw(
  tavernHelper: TavernHelperInstance,
  request: TavernHelperGenerateRawConfig,
  options: TavernHelperGenerateRawOptions = {},
): Promise<string> {
  const generationId = request.generation_id || createGenerateRawGenerationId();
  const resolvedRequest = resolveGenerateRawRequestMacros(tavernHelper, { ...request, generation_id: generationId });
  const result = await requestGenerateRawWithTimeout(tavernHelper, resolvedRequest, generationId, options.timeoutSeconds);
  return formatPromptLlmRawResult(result);
}

/**
 * 为 generateRaw 请求执行本地超时与终止控制
 * @param tavernHelper 酒馆助手实例
 * @param request 已完成宏替换的请求
 * @param generationId 请求唯一标识
 * @param timeoutSeconds 请求总超时秒数
 * @returns TavernHelper 原始响应
 */
async function requestGenerateRawWithTimeout(
  tavernHelper: TavernHelperInstance,
  request: TavernHelperGenerateRawConfig,
  generationId: string,
  timeoutSeconds: number | undefined,
): Promise<Awaited<ReturnType<TavernHelperInstance['generateRaw']>>> {
  if (!timeoutSeconds) return tavernHelper.generateRaw(request);
  let timer = 0;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = window.setTimeout(() => {
      stopTavernHelperGeneration(generationId);
      reject(new Error(`Prompt LLM 请求超时（${timeoutSeconds} 秒）`));
    }, timeoutSeconds * 1000);
  });
  try {
    return await Promise.race([tavernHelper.generateRaw(request), timeout]);
  } finally {
    window.clearTimeout(timer);
  }
}

/**
 * 创建用于精确终止的 TavernHelper 请求标识
 * @returns 本次 generateRaw 请求 ID
 */
function createGenerateRawGenerationId(): string {
  return `cosmos-vision-llm-${Date.now()}-${Math.random().toString(36).slice(2)}`;
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

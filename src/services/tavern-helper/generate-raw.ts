import { getOptionalTavernHelper } from '@/services/tavern-helper/availability';
import { stopTavernHelperGeneration } from '@/services/tavern-helper/generation-control';
import {
  readGenerateRawOutcome,
  type TavernHelperGenerateRawConfig,
  type TavernHelperGenerateRawOutcome,
  type TavernHelperRolePrompt,
} from '@/services/tavern-helper/prompt-llm';

type TavernHelperInstance = NonNullable<typeof TavernHelper>;

/** TavernHelper generateRaw 请求控制选项 */
export interface TavernHelperGenerateRawOptions {
  timeoutSeconds?: number;
  /** 调用方取消信号，触发时终止本次 generateRaw 请求 */
  signal?: AbortSignal;
}

/** generateRaw 请求的终止控制句柄 */
interface GenerateRawAbortHandle {
  /** 终止触发时 reject 的等待 Promise */
  promise: Promise<never>;
  /** 释放定时器或事件监听 */
  dispose: () => void;
}

/**
 * 发送会先经过 ST 宏替换的 generateRaw 请求
 * @param tavernHelper 酒馆助手实例
 * @param request 原始 generateRaw 请求
 * @param options 请求控制选项
 * @returns 正文读取结果
 */
export async function requestTavernHelperGenerateRaw(
  tavernHelper: TavernHelperInstance,
  request: TavernHelperGenerateRawConfig,
  options: TavernHelperGenerateRawOptions = {},
): Promise<TavernHelperGenerateRawOutcome> {
  const generationId = request.generation_id || createGenerateRawGenerationId();
  const resolvedRequest = resolveGenerateRawRequestMacros(tavernHelper, { ...request, generation_id: generationId });
  const result = await requestGenerateRawWithTimeout(tavernHelper, resolvedRequest, generationId, options);
  return readGenerateRawOutcome(result);
}

/**
 * 为 generateRaw 请求执行本地超时与取消控制
 * 两种终止均先按 generationId 停止底层请求，再以中文错误 reject
 * @param tavernHelper 酒馆助手实例
 * @param request 已完成宏替换的请求
 * @param generationId 请求唯一标识
 * @param options 请求控制选项
 * @returns TavernHelper 原始响应
 */
async function requestGenerateRawWithTimeout(
  tavernHelper: TavernHelperInstance,
  request: TavernHelperGenerateRawConfig,
  generationId: string,
  options: TavernHelperGenerateRawOptions,
): Promise<Awaited<ReturnType<TavernHelperInstance['generateRaw']>>> {
  const { timeoutSeconds, signal } = options;
  const pending = tavernHelper.generateRaw(request);
  if (!timeoutSeconds && !signal) return pending;
  const handles = [
    ...(timeoutSeconds ? [createGenerateRawTimeoutHandle(timeoutSeconds, generationId)] : []),
    ...(signal ? [createGenerateRawAbortHandle(signal, generationId)] : []),
  ];
  try {
    return await Promise.race([pending, ...handles.map(handle => handle.promise)]);
  } finally {
    handles.forEach(handle => handle.dispose());
  }
}

/**
 * 创建超时终止句柄
 * @param timeoutSeconds 请求总超时秒数
 * @param generationId 请求唯一标识
 * @returns 终止句柄
 */
function createGenerateRawTimeoutHandle(timeoutSeconds: number, generationId: string): GenerateRawAbortHandle {
  let timer = 0;
  const promise = new Promise<never>((_resolve, reject) => {
    timer = window.setTimeout(() => {
      stopTavernHelperGeneration(generationId);
      reject(new Error(`Prompt LLM 请求超时（${timeoutSeconds} 秒）`));
    }, timeoutSeconds * 1000);
  });
  return { promise, dispose: () => window.clearTimeout(timer) };
}

/**
 * 创建调用方取消终止句柄
 * @param signal 调用方取消信号
 * @param generationId 请求唯一标识
 * @returns 终止句柄
 */
function createGenerateRawAbortHandle(signal: AbortSignal, generationId: string): GenerateRawAbortHandle {
  let dispose = () => {};
  const promise = new Promise<never>((_resolve, reject) => {
    const onAbort = () => {
      stopTavernHelperGeneration(generationId);
      reject(new Error('请求已取消'));
    };
    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener('abort', onAbort, { once: true });
    dispose = () => signal.removeEventListener('abort', onAbort);
  });
  return { promise, dispose };
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

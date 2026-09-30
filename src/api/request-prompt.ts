import type { PromptLlmContext } from '@/constants/prompt-llm';
import { buildLlmInspectorLabel } from '@/services/prompt-llm/llm-inspector';
import { generatePromptTextFromRuntimeContext } from '@/services/prompt-llm/runtime-request';
import { buildPromptLlmSchemaFields } from '@/services/tavern-helper/prompt-llm';
import { buildLlmInspectorStoreHooks } from '@/store/llm-inspector';
import { useSettingsStore } from '@/store/settings';
import type { RequestPromptOptions, RequestPromptResult } from './types';

/** 外部调用缺省 requestId 的模块级自增序号 */
let requestSequence = 0;

/**
 * 生成外部调用缺省的 requestId
 * @returns 形如 cv-api-1 的请求标识
 */
export function createApiRequestId(): string {
  requestSequence += 1;
  return `cv-api-${requestSequence}`;
}

/**
 * 按插件当前 Prompt LLM 配置生成提示词原始文本（不做提取）
 * 上下文完全由调用方给定，插件不收集 DOM/楼层；请求写入 LLM 请求监视弹窗，标签带"外部调用"
 * requestId 同时作为监视器 generation_id，缺省时模块级自增；错误原样 reject，不 catch 不包装
 * @param options 结构化上下文、可选 requestId 与取消信号
 * @returns requestId 与 LLM 原始回复全文（含推理内容）
 */
export async function requestPrompt(options: RequestPromptOptions): Promise<RequestPromptResult> {
  const { context } = options;
  if (!context.focusParagraph.trim()) throw new Error('未找到目标段落文本');
  const requestId = options.requestId ?? createApiRequestId();
  const runtimeContext: PromptLlmContext = {
    historyParagraphs: context.historyParagraphs,
    focusParagraph: context.focusParagraph,
    specialRequest: context.specialRequest ?? '',
    messageIndex: null,
  };
  const { savedSettings } = useSettingsStore();
  const result = await generatePromptTextFromRuntimeContext(
    runtimeContext,
    savedSettings.promptLlm,
    savedSettings.promptLlmMessagePresets,
    savedSettings.promptProfiles,
    buildPromptLlmSchemaFields(savedSettings.promptLlm),
    {
      generationId: requestId,
      signal: options.signal,
      inspector: buildLlmInspectorStoreHooks(requestId, buildLlmInspectorLabel(runtimeContext), true),
    },
  );
  return { requestId, text: result.rawText, reasoning: result.reasoning };
}

import { type PromptLlmSettings } from '@/constants/novelai';
import { findProxyPreset } from '@/services/sillytavern/openai-config';
import { getTavernHelper } from '@/services/tavern-helper/availability';
import { buildGenerateRawRequestPreview, requestTavernHelperGenerateRaw } from '@/services/tavern-helper/generate-raw';
import { type TavernHelperGenerateRawConfig } from '@/services/tavern-helper/prompt-llm';

export interface PromptLlmLogParams {
  connectionType: string;
  apiUrl: string;
  apiKey: string;
  source: string;
  model: string;
  temperature: number;
  maxTokens: number;
  topP: number;
  topK: number;
}

/** 测试页参数展示行 */
export interface PromptLlmParamRow {
  label: string;
  value: string;
  code?: boolean;
}

/** Prompt LLM 测试请求选项 */
export interface PromptLlmRawRequestOptions {
  generationId?: string;
}

/**
 * 调用 TavernHelper 发送测试请求
 * @param request generateRaw 请求体
 * @param options 请求控制选项
 * @returns 格式化后的原始响应文本
 */
export async function requestPromptLlmRaw(
  request: TavernHelperGenerateRawConfig,
  options: PromptLlmRawRequestOptions = {},
): Promise<string> {
  const tavernHelper = getTavernHelper({ silent: false });
  if (!tavernHelper) {
    throw new Error('TavernHelper 不可用，请确保酒馆环境正常加载');
  }

  return requestTavernHelperGenerateRaw(tavernHelper, {
    ...request,
    should_silence: true,
    generation_id: options.generationId ?? request.generation_id,
  });
}

/**
 * 构建当前 LLM 参数日志
 * @param settings LLM 配置
 * @returns 日志字段
 */
export function buildPromptLlmLogParams(settings: PromptLlmSettings): PromptLlmLogParams {
  const proxyPreset = findProxyPreset(settings.proxyPreset);
  const apiUrl = proxyPreset?.url ?? settings.apiUrl;
  const apiKey = proxyPreset?.password ?? settings.apiKey;

  return {
    connectionType: proxyPreset ? `酒馆代理预设 (${proxyPreset.name})` : '手动填写配置',
    apiUrl: apiUrl.trim() || '(未填写)',
    apiKey: maskApiKey(apiKey),
    source: settings.source || '(未填写)',
    model: settings.model || '(未选择/未填写)',
    temperature: settings.temperature,
    maxTokens: settings.maxTokens,
    topP: settings.topP,
    topK: settings.topK,
  };
}

/**
 * 构建 LLM 参数配置展示行
 * @param params 日志参数
 * @returns 参数行列表
 */
export function buildPromptLlmParamRows(params: PromptLlmLogParams): PromptLlmParamRow[] {
  return [
    { label: '连接方式', value: params.connectionType },
    { label: '接口地址', value: params.apiUrl, code: true },
    { label: '接口密钥', value: params.apiKey, code: true },
    { label: '来源标识', value: params.source },
    { label: '使用模型', value: params.model, code: true },
    { label: '温度', value: String(params.temperature) },
    { label: '最大输出令牌数', value: String(params.maxTokens) },
    { label: 'Top P', value: String(params.topP) },
    { label: 'Top K', value: String(params.topK) },
  ];
}

/**
 * 格式化发送前请求快照
 * @param request generateRaw 请求体
 * @returns 脱敏后的请求内容
 */
export function formatPromptLlmRequestLog(request: TavernHelperGenerateRawConfig): string {
  return JSON.stringify(buildRequestLogSnapshot(request), null, 2);
}

/**
 * 构建脱敏请求日志快照
 * @param request generateRaw 请求体
 * @returns 可展示的请求体
 */
function buildRequestLogSnapshot(request: TavernHelperGenerateRawConfig): TavernHelperGenerateRawConfig {
  const previewRequest = buildGenerateRawRequestPreview(request);
  return {
    ...previewRequest,
    custom_api: previewRequest.custom_api
      ? {
          ...previewRequest.custom_api,
          key: previewRequest.custom_api.key ? maskApiKey(previewRequest.custom_api.key) : undefined,
        }
      : undefined,
  };
}

/**
 * 脱敏显示 API Key
 * @param apiKey 原始密钥
 * @returns 脱敏后的密钥
 */
function maskApiKey(apiKey: string): string {
  const trimmed = apiKey.trim();
  if (!trimmed) return '(未配置)';
  if (trimmed.length <= 8) return '********';
  return `${trimmed.slice(0, 4)}...${trimmed.slice(-4)}`;
}

import { type PromptLlmSettings } from '@/constants/novelai';
import { findProxyPreset } from '@/services/sillytavern/openai-config';
import { getTavernHelper } from '@/services/tavern-helper/availability';
import { formatPromptLlmRawResult, type TavernHelperGenerateRawConfig } from '@/services/tavern-helper/prompt-llm';

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

/**
 * 调用 TavernHelper 发送测试请求
 * @param request generateRaw 请求体
 * @returns 格式化后的原始响应文本
 */
export async function requestPromptLlmRaw(request: TavernHelperGenerateRawConfig): Promise<string> {
  const tavernHelper = getTavernHelper();
  if (!tavernHelper) {
    throw new Error('TavernHelper 不可用，请确保酒馆环境正常加载');
  }

  return formatPromptLlmRawResult(await tavernHelper.generateRaw({ ...request, should_silence: true }));
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
  return {
    ...request,
    custom_api: request.custom_api
      ? {
          ...request.custom_api,
          key: request.custom_api.key ? maskApiKey(request.custom_api.key) : undefined,
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

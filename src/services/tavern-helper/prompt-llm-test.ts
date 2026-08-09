import { getPromptLlmAccountDisplayName, type PromptLlmAccount, type PromptLlmSettings } from '@/constants/prompt-llm';
import { getPromptLlmRequestAccounts } from '@/services/prompt-llm/router';
import { requestPromptLlmWithAccounts, type PromptLlmRawRequestResult } from '@/services/prompt-llm/runtime-request';
import { findProxyPreset } from '@/services/sillytavern/openai-config';
import { getTavernHelper } from '@/services/tavern-helper/availability';
import { buildGenerateRawRequestPreview } from '@/services/tavern-helper/generate-raw';
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
  timeoutSeconds?: number;
}

/** Prompt LLM 测试请求结果 */
export type PromptLlmRawTestResult = PromptLlmRawRequestResult;

/** 按账号构建测试请求体回调 */
export type PromptLlmTestRequestBuilder = (account?: PromptLlmAccount) => Promise<TavernHelperGenerateRawConfig>;

/**
 * 按路由规则发送测试请求
 * 走路由轮换，失败自动切换下一个账号，与实际生图流程一致
 * @param settings LLM 配置
 * @param buildRequest 按候选账号构建 generateRaw 请求体
 * @param options 请求控制选项
 * @returns 原始响应文本与实际成功的账号名
 */
export async function requestPromptLlmRaw(
  settings: PromptLlmSettings,
  buildRequest: PromptLlmTestRequestBuilder,
  options: PromptLlmRawRequestOptions = {},
): Promise<PromptLlmRawRequestResult> {
  const tavernHelper = getTavernHelper({ silent: false });
  if (!tavernHelper) {
    throw new Error('TavernHelper 不可用，请确保酒馆环境正常加载');
  }
  return requestPromptLlmWithAccounts(tavernHelper, settings, options, buildRequest);
}

/**
 * 构建当前 LLM 参数日志
 * 连接信息展示路由后首个可用账号（测试请求与实际首试账号一致）
 * @param settings LLM 配置
 * @returns 日志字段
 */
export function buildPromptLlmLogParams(settings: PromptLlmSettings): PromptLlmLogParams {
  const firstAccount = getPromptLlmRequestAccounts(settings)[0];
  const proxyPreset = findProxyPreset(firstAccount?.proxyPreset ?? '');
  const apiUrl = proxyPreset?.url ?? firstAccount?.apiUrl ?? '';
  const apiKey = proxyPreset?.password ?? firstAccount?.apiKey ?? '';
  const accountName = getPromptLlmAccountDisplayName(firstAccount);

  return {
    connectionType: firstAccount
      ? proxyPreset
        ? `${accountName}（酒馆代理预设 ${proxyPreset.name}）`
        : `${accountName}（自定义接口）`
      : '无可用账号',
    apiUrl: apiUrl.trim() || '(未填写)',
    apiKey: maskApiKey(apiKey),
    source: firstAccount?.source.trim() || '(未填写)',
    model: firstAccount?.model.trim() || '(未选择/未填写)',
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

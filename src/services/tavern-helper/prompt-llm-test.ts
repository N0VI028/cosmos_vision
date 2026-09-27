import { getPromptLlmAccountDisplayName, type PromptLlmAccount, type PromptLlmSettings } from '@/constants/prompt-llm';
import {
  requestPromptLlmWithAccounts,
  type PromptLlmInspectorHooks,
  type PromptLlmRawRequestResult,
} from '@/services/prompt-llm/runtime-request';
import { findProxyPreset } from '@/services/sillytavern/openai-config';
import { getTavernHelper } from '@/services/tavern-helper/availability';
import { buildGenerateRawRequestPreview } from '@/services/tavern-helper/generate-raw';
import { type TavernHelperGenerateRawConfig } from '@/services/tavern-helper/prompt-llm';
import { maskApiKey } from '@/utils/secret';

/** 测试页与监视器账号参数展示行 */
export interface PromptLlmParamRow {
  label: string;
  value: string;
  code?: boolean;
}

/** Prompt LLM 测试请求选项 */
export interface PromptLlmRawRequestOptions {
  generationId?: string;
  timeoutSeconds?: number;
  inspector?: PromptLlmInspectorHooks;
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

/** 无账号时的空参数展示行 */
const EMPTY_ACCOUNT_PARAM_ROWS: PromptLlmParamRow[] = [
  { label: '连接方式', value: '无可用账号' },
  { label: '接口地址', value: '(未填写)', code: true },
  { label: '接口密钥', value: '(未配置)', code: true },
  { label: '来源标识', value: '(未填写)' },
  { label: '使用模型', value: '(未选择/未填写)', code: true },
  { label: '温度', value: '--' },
  { label: '最大输出令牌数', value: '--' },
  { label: 'Top P', value: '--' },
  { label: 'Top K', value: '--' },
  { label: '流式请求', value: '--' },
];

/**
 * 按单个账号构建参数行列表
 * @param account 提示词 LLM 账号条目
 * @returns 参数展示行列表
 */
export function buildPromptLlmAccountParamRows(account?: PromptLlmAccount): PromptLlmParamRow[] {
  if (!account) return EMPTY_ACCOUNT_PARAM_ROWS;
  const proxyPreset = findProxyPreset(account.proxyPreset);
  const apiUrl = (proxyPreset?.url ?? account.apiUrl ?? '').trim() || '(未填写)';
  const apiKey = proxyPreset?.password ?? account.apiKey ?? '';
  const accountName = getPromptLlmAccountDisplayName(account);
  const connectionType = proxyPreset
    ? `${accountName}（酒馆代理预设 ${proxyPreset.name}）`
    : `${accountName}（自定义接口）`;

  return [
    { label: '连接方式', value: connectionType },
    { label: '接口地址', value: apiUrl, code: true },
    { label: '接口密钥', value: maskApiKey(apiKey), code: true },
    { label: '来源标识', value: account.source.trim() || '(未填写)' },
    { label: '使用模型', value: account.model.trim() || '(未选择/未填写)', code: true },
    { label: '温度', value: String(account.temperature) },
    { label: '最大输出令牌数', value: String(account.maxTokens) },
    { label: 'Top P', value: String(account.topP) },
    { label: 'Top K', value: String(account.topK) },
    { label: '流式请求', value: account.shouldStream ? '开启' : '关闭' },
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

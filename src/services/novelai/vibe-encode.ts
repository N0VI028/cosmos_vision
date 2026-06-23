import type { NovelAIAccount, NovelAIModel } from '@/constants/novelai';
import { arrayBufferToBase64 } from '@/services/novelai/vibe-file';

/** NovelAI encode-vibe 请求控制选项 */
export interface NovelAIVibeEncodeOptions {
  signal?: AbortSignal;
}

/** NovelAI encode-vibe 请求体 */
interface NovelAIVibeEncodePayload {
  image: string;
  information_extracted: number;
  model: NovelAIModel;
}

/**
 * 使用候选账号解析 NovelAI vibe
 * @param accounts 候选 NovelAI 账号
 * @param imageBase64 原图 base64
 * @param model 当前模型
 * @param informationExtracted 信息提取强度
 * @param options 请求控制选项
 * @returns encodedData base64
 */
export async function encodeNovelAIVibeWithAccounts(
  accounts: NovelAIAccount[],
  imageBase64: string,
  model: NovelAIModel,
  informationExtracted: number,
  options: NovelAIVibeEncodeOptions = {},
): Promise<string> {
  if (!accounts.length) throw new Error('没有可用的 NovelAI 账号，无法解析 vibe');
  const errors: string[] = [];
  for (const [index, account] of accounts.entries()) {
    try {
      return await encodeNovelAIVibe(account, imageBase64, model, informationExtracted, options);
    } catch (error) {
      if (options.signal?.aborted) throw new Error('已取消生成');
      errors.push(formatEncodeAccountError(index, account, error));
    }
  }
  throw new Error(`vibe 解析失败: ${errors.join('； ')}`);
}

/**
 * 使用单个账号解析 NovelAI vibe
 * @param account NovelAI 账号
 * @param imageBase64 原图 base64
 * @param model 当前模型
 * @param informationExtracted 信息提取强度
 * @param options 请求控制选项
 * @returns encodedData base64
 */
async function encodeNovelAIVibe(
  account: NovelAIAccount,
  imageBase64: string,
  model: NovelAIModel,
  informationExtracted: number,
  options: NovelAIVibeEncodeOptions,
): Promise<string> {
  const response = await requestEncodeVibeResponse(account, { image: imageBase64, information_extracted: informationExtracted, model }, options);
  return arrayBufferToBase64(await response.arrayBuffer());
}

/**
 * 请求 NovelAI encode-vibe 原始响应
 * @param account NovelAI 账号
 * @param payload 请求体
 * @param options 请求控制选项
 * @returns 官方响应
 */
async function requestEncodeVibeResponse(
  account: NovelAIAccount,
  payload: NovelAIVibeEncodePayload,
  options: NovelAIVibeEncodeOptions,
): Promise<Response> {
  const response = await fetch(buildEncodeEndpoint(account.url), {
    method: 'POST',
    headers: buildHeaders(account.apiKey),
    body: JSON.stringify(payload),
    signal: options.signal,
  }).catch(error => {
    throw new Error(`[fetch] ${(error as Error).message}`);
  });
  await ensureEncodeSuccess(response);
  return response;
}

/**
 * 构建 encode-vibe 端点
 * @param url 账号 URL
 * @returns 官方端点
 */
function buildEncodeEndpoint(url: string): string {
  return `${url.replace(/\/+$/, '')}/ai/encode-vibe`;
}

/**
 * 构建 NovelAI 授权头
 * @param apiKey NovelAI API Key
 * @returns 请求头
 */
function buildHeaders(apiKey: string): HeadersInit {
  return { Authorization: `Bearer ${apiKey.trim()}`, 'Content-Type': 'application/json' };
}

/**
 * 组装单个账号的解析失败摘要
 * @param index 账号序号
 * @param account 失败账号
 * @param error 失败原因
 * @returns 脱敏错误摘要
 */
function formatEncodeAccountError(index: number, account: NovelAIAccount, error: unknown): string {
  const reason = error instanceof Error ? error.message : '未知错误';
  return `账号 ${index + 1} (${buildEncodeEndpoint(account.url)}) 失败: ${reason}`;
}

/**
 * 校验 encode-vibe HTTP 响应
 * @param response 官方响应
 */
async function ensureEncodeSuccess(response: Response): Promise<void> {
  if (response.ok) return;
  const detail = await response.text().catch(() => '');
  throw new Error(`NovelAI vibe 解析失败: ${response.status}${formatDetail(detail)}`);
}

/**
 * 截断错误详情
 * @param detail 原始错误文本
 * @returns 可展示详情
 */
function formatDetail(detail: string): string {
  return detail.trim() ? ` ${detail.slice(0, 160)}` : '';
}

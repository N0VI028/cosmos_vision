import { NOVELAI_TIERS, type NovelAIAccount, type NovelAITierLabel } from '@/constants/novelai';

/** NovelAI 订阅接口固定端点 */
const SUBSCRIPTION_ENDPOINT = 'https://api.novelai.net/user/subscription';

/** NovelAI 官方订阅响应中本扩展关心的字段 */
interface NovelAISubscriptionRaw {
  tier: number;
  active: boolean;
  expiresAt: number;
  trainingStepsLeft: {
    fixedTrainingStepsLeft: number;
    purchasedTrainingSteps: number;
  };
}

/** 卡片消费形态:与 UI 一一对应,避免组件再做映射 */
export interface SubscriptionInfo {
  tier: number;
  tierLabel: NovelAITierLabel;
  accent: string;
  active: boolean;
  expiresAt: number;
  fixedAnlas: number;
  purchasedAnlas: number;
  totalAnlas: number;
}

/**
 * 规范化代理 host 前缀(防呆)
 * 规则:trim → 缺协议头自动补 https:// → 去掉末尾斜杠避免双斜杠
 * @param input 用户原始输入
 * @returns 规范化后的 host 前缀(空输入返回空字符串)
 */
export function normalizeProxyPrefix(input: string): string {
  let prefix = input.trim();
  if (!prefix) return prefix;
  if (!/^https?:\/\//i.test(prefix)) prefix = `https://${prefix}`;
  return prefix.replace(/\/+$/, '');
}

/**
 * 拼接 CORS 代理请求 URL(主机重写模式)
 * 规则:规范化前缀 + 目标端点的 path(订阅端点的 host 由代理替换)
 * @param proxyPrefix 代理 host 前缀(非空,内部会规范化)
 * @returns 最终请求 URL
 */
export function buildProxiedUrl(proxyPrefix: string): string {
  const normalized = normalizeProxyPrefix(proxyPrefix);
  const path = new URL(SUBSCRIPTION_ENDPOINT).pathname;
  const result = `${normalized}${path}`;
  try {
    new URL(result);
  } catch {
    throw new Error('代理 URL 无效,请检查格式');
  }
  return result;
}

/**
 * 请求 NovelAI 官方订阅接口(经用户配置的 CORS 代理)并规整为 UI 消费结构
 * @param account NovelAI 账号
 * @param corsProxy CORS 代理 URL 前缀(非空,空值由 composable 拦截)
 * @returns 订阅信息(已规整 tier 标签与 Anlas 汇总)
 */
export async function fetchNovelAISubscription(account: NovelAIAccount, corsProxy: string): Promise<SubscriptionInfo> {
  const trimmedKey = account.apiKey.trim();
  if (!trimmedKey) throw new Error('请先填写一组可用的 NovelAI 账号');
  const trimmedProxy = corsProxy.trim();
  if (!trimmedProxy) throw new Error('代理 URL 未配置');
  const requestUrl = buildProxiedUrl(trimmedProxy);
  const response = await fetch(requestUrl, {
    headers: { Authorization: `Bearer ${trimmedKey}` },
  }).catch(err => {
    const detail = err instanceof Error && err.message ? `: ${err.message}` : '';
    throw new Error(`通过代理连接 NovelAI 失败${detail}`);
  });
  await ensureSuccess(response);
  return normalize((await response.json()) as NovelAISubscriptionRaw);
}

/** 将官方响应规整为卡片消费形态 */
function normalize(raw: NovelAISubscriptionRaw): SubscriptionInfo {
  const meta = NOVELAI_TIERS.find(item => item.tier === raw.tier) ?? NOVELAI_TIERS[0];
  const fixed = raw.trainingStepsLeft?.fixedTrainingStepsLeft ?? 0;
  const purchased = raw.trainingStepsLeft?.purchasedTrainingSteps ?? 0;
  return {
    tier: raw.tier,
    tierLabel: meta.label,
    accent: meta.accent,
    active: Boolean(raw.active),
    expiresAt: raw.expiresAt ?? 0,
    fixedAnlas: fixed,
    purchasedAnlas: purchased,
    totalAnlas: fixed + purchased,
  };
}

/** 将常见 HTTP 错误规整为用户可读文案 */
async function ensureSuccess(response: Response): Promise<void> {
  if (response.ok) return;
  if (response.status === 401) throw new Error('API Key 无效或已过期');
  if (response.status === 429) throw new Error('请求过于频繁,请稍后再试');
  const detail = await response.text().catch(() => '');
  throw new Error(`NovelAI 订阅查询失败: ${response.status}${formatDetail(detail)}`);
}

/** 截断错误详情,避免长 HTML 撑爆 toast */
function formatDetail(detail: string): string {
  return detail.trim() ? ` ${detail.slice(0, 160)}` : '';
}

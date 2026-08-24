import { NOVELAI_TIERS, type NovelAIAccount, type NovelAITierLabel } from '@/constants/novelai';

/** NovelAI 订阅接口固定端点 */
const SUBSCRIPTION_ENDPOINT = 'https://api.novelai.net/user/subscription';

/** 换算系数：每 1% ≈ 17.3 张（参考官网实测校准值） */
export const V5_IMAGES_PER_PERCENT = 17.3;

/** NovelAI 官方订阅响应中本扩展关心的字段 */
interface NovelAISubscriptionRaw {
  tier: number;
  active: boolean;
  expiresAt: number;
  trainingStepsLeft?: {
    fixedTrainingStepsLeft?: number;
    purchasedTrainingSteps?: number;
  };
  usage?: {
    percent?: number;
    isNegative?: boolean;
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
  /** V5 滚动额度百分比（>100 表示累积未用，随时间恢复） */
  v5UsagePercent: number | null;
  /** V5 额度是否透支超额 */
  v5UsageNegative: boolean;
  /** V5 预估剩余生成张数 */
  v5EstimatedImages: number;
}

/**
 * 估算 V5 剩余可生成张数（负值视为 0）
 * @param percent V5 剩余额度百分比
 * @returns 预估张数
 */
export function estimateV5Images(percent: number | null | undefined): number {
  return Math.max(0, Math.round((percent ?? 0) * V5_IMAGES_PER_PERCENT));
}

/**
 * 根据百分比获取 V5 进度条色彩类名
 * @param percent 剩余百分比
 * @param negative 是否透支
 * @returns CSS 样式类名
 */
export function getV5BarClass(percent: number | null | undefined, negative?: boolean): string {
  const p = percent ?? 0;
  if (negative || p <= 0) return 'bg-[var(--cvp-red-500,#ef4444)]';
  return 'bg-(--cv-primary-container)';
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
  const percent = typeof raw.usage?.percent === 'number' ? raw.usage.percent : null;
  const isNegative = Boolean(raw.usage?.isNegative);
  return {
    tier: raw.tier,
    tierLabel: meta.label,
    accent: meta.accent,
    active: Boolean(raw.active),
    expiresAt: raw.expiresAt ?? 0,
    fixedAnlas: fixed,
    purchasedAnlas: purchased,
    totalAnlas: fixed + purchased,
    v5UsagePercent: percent,
    v5UsageNegative: isNegative,
    v5EstimatedImages: estimateV5Images(percent),
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

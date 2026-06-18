import type { NovelAIAccount, NovelAISettings } from '@/constants/novelai';

let lastLoadBalanceAccountId = '';

/**
 * 读取当前请求可尝试的 NovelAI 账号列表
 * @param settings NovelAI 设置
 * @returns 已按路由模式排好序的账号列表
 */
export function getNovelAIRequestAccounts(settings: NovelAISettings): NovelAIAccount[] {
  const accounts = getAvailableNovelAIAccounts(settings);
  if (settings.routingMode !== 'load_balance') return accounts;
  return reorderLoadBalanceAccounts(accounts);
}

/**
 * 读取订阅查询使用的 NovelAI 账号
 * @param settings NovelAI 设置
 * @returns 首个可用账号或 null
 */
export function getNovelAISubscriptionAccount(settings: NovelAISettings): NovelAIAccount | null {
  return getAvailableNovelAIAccounts(settings)[0] ?? null;
}

/**
 * 过滤掉未填写完整的 NovelAI 账号
 * @param settings NovelAI 设置
 * @returns 可用账号列表
 */
export function getAvailableNovelAIAccounts(settings: NovelAISettings): NovelAIAccount[] {
  return settings.accounts.filter(account => isNovelAIAccountAvailable(account));
}

/**
 * 判断账号是否已具备请求条件
 * @param account NovelAI 账号
 * @returns 是否可直接发起请求
 */
function isNovelAIAccountAvailable(account: NovelAIAccount): boolean {
  return Boolean(account.url.trim() && account.apiKey.trim());
}

/**
 * 生成负载均衡模式下的账号尝试顺序
 * @param accounts 已可用的账号列表
 * @returns 本次请求的候选顺序
 */
function reorderLoadBalanceAccounts(accounts: NovelAIAccount[]): NovelAIAccount[] {
  if (accounts.length <= 1) {
    lastLoadBalanceAccountId = accounts[0]?.id ?? '';
    return accounts;
  }
  const lastIndex = accounts.findIndex(account => account.id === lastLoadBalanceAccountId);
  const nextIndex = lastIndex < 0 ? 0 : (lastIndex + 1) % accounts.length;
  const ordered = [...accounts.slice(nextIndex), ...accounts.slice(0, nextIndex)];
  lastLoadBalanceAccountId = ordered[0]?.id ?? '';
  return ordered;
}

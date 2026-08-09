import type { PromptLlmAccount, PromptLlmSettings } from '@/constants/prompt-llm';

let lastLoadBalanceAccountId = '';

/**
 * 读取当前请求可尝试的提示词 LLM 账号列表
 * @param settings 提示词 LLM 设置
 * @returns 已按路由模式排好序的账号列表
 */
export function getPromptLlmRequestAccounts(settings: PromptLlmSettings): PromptLlmAccount[] {
  const accounts = getAvailablePromptLlmAccounts(settings);
  if (settings.routingMode !== 'load_balance') return accounts;
  return reorderLoadBalanceAccounts(accounts);
}

/**
 * 过滤掉未填写完整的提示词 LLM 账号
 * @param settings 提示词 LLM 设置
 * @returns 可用账号列表
 */
export function getAvailablePromptLlmAccounts(settings: PromptLlmSettings): PromptLlmAccount[] {
  return settings.accounts.filter(account => isPromptLlmAccountAvailable(account));
}

/**
 * 判断账号是否已具备请求条件
 * 需启用并填好来源与模型；预设型账号选了酒馆代理预设即可，自定义型需填齐接口地址与密钥
 * @param account 提示词 LLM 账号
 * @returns 是否可直接发起请求
 */
function isPromptLlmAccountAvailable(account: PromptLlmAccount): boolean {
  if (!account.enabled || !account.source.trim() || !account.model.trim()) return false;
  if (account.proxyPreset.trim()) return true;
  return Boolean(account.apiUrl.trim() && account.apiKey.trim());
}

/**
 * 生成负载均衡模式下的账号尝试顺序
 * @param accounts 已可用的账号列表
 * @returns 本次请求的候选顺序
 */
function reorderLoadBalanceAccounts(accounts: PromptLlmAccount[]): PromptLlmAccount[] {
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

/**
 * 酒馆助手变量作用域类型
 */
export type VariableScopeType = 'global' | 'character' | 'chat' | 'message';

/**
 * 变量作用域元数据
 */
export interface VariableScopeMeta {
  type: VariableScopeType;
  label: string;
  option: {
    type: VariableScopeType;
    message_id?: string | number;
  };
}

/**
 * 变量读取结果
 */
export interface ScopeVariableFetchResult {
  data: Record<string, unknown> | null;
  error: string | null;
}

/**
 * 预定义的四个变量作用域配置
 */
export const VARIABLE_SCOPES: readonly VariableScopeMeta[] = [
  { type: 'global', label: '全局', option: { type: 'global' } },
  { type: 'character', label: '角色', option: { type: 'character' } },
  { type: 'chat', label: '聊天', option: { type: 'chat' } },
  {
    type: 'message',
    label: '楼层',
    option: { type: 'message', message_id: 'latest' },
  },
] as const;

/**
 * 安全从酒馆助手读取指定作用域的变量快照
 * @param scope 作用域类型
 * @returns 变量快照与错误消息
 */
export function fetchScopeVariables(scope: VariableScopeType): ScopeVariableFetchResult {
  const meta = VARIABLE_SCOPES.find((item) => item.type === scope);
  if (!meta) {
    return { data: null, error: '未知作用域类型' };
  }
  if (typeof TavernHelper === 'undefined' || typeof TavernHelper.getVariables !== 'function') {
    return { data: null, error: '酒馆助手不可用' };
  }
  try {
    const raw = TavernHelper.getVariables(meta.option);
    if (!raw || typeof raw !== 'object') {
      return { data: null, error: null };
    }
    return { data: raw, error: null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : '读取变量失败';
    return { data: null, error: msg };
  }
}

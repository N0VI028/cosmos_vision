import { getTavernHelper } from '@/services/tavern-helper/availability';

/**
 * 获取当前角色绑定 key
 * @returns 当前角色名或 null
 */
export function getCurrentCharacterKey(): string | null {
  const tavernHelper = getTavernHelper();
  const characterName = tavernHelper?.getCurrentCharacterName?.();
  return normalizeBindingKey(characterName);
}

/**
 * 获取当前用户人设 绑定 key
 * @returns 当前 persona key 或 null
 */
export function getCurrentUserPersonaKey(): string | null {
  const tavernHelper = getTavernHelper();
  if (!tavernHelper) return null;
  return (
    readPersonaGetter(() => tavernHelper.getCurrentPersonaName()) ??
    readPersonaGetter(() => tavernHelper.getCurrentPersonaId())
  );
}

/**
 * 规范化绑定 key
 * @param value 原始绑定值
 * @returns 去空白后的绑定值或 null
 */
function normalizeBindingKey(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/**
 * 安全读取 persona 字符串字段
 * @param getter persona 全局读取函数
 * @returns 标准化后的字段值或 null
 */
function readPersonaGetter(getter: () => string | null): string | null {
  try {
    return normalizeBindingKey(getter());
  } catch (error) {
    console.error('[CosmosVision] 读取当前 persona 失败', error);
    return null;
  }
}

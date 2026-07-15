import type { ComfyUILinkRef } from '@/services/comfyui/types';

/**
 * 判断值是否为连线引用
 * @param value 待判断值
 * @returns 是否为 [nodeId, outputIndex] 形式
 */
export function isLinkRef(value: unknown): value is ComfyUILinkRef {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    (typeof value[0] === 'string' || typeof value[0] === 'number') &&
    typeof value[1] === 'number' &&
    Number.isFinite(value[1])
  );
}

/**
 * 判断输入是否为可写标量
 * @param value 输入值
 * @returns 是否为普通可写标量
 */
export function isWritableScalar(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (isLinkRef(value)) return false;
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

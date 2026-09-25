/** resolution_json 中的宽高对 */
export interface ResolutionJsonSize {
  width: number;
  height: number;
}

/**
 * 解析 resolution_json 字符串中的宽高
 * @param value resolution_json 原始字符串
 * @returns 宽高对；解析失败或宽高非有限数字时返回 null
 */
export function parseResolutionJson(value: string): ResolutionJsonSize | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const { width, height } = parsed as Partial<ResolutionJsonSize>;
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
  return { width: width as number, height: height as number };
}

/**
 * 以指定宽高重建 resolution_json 字符串（保留其余字段与键序，紧凑序列化）
 * @param value 原始字符串
 * @param width 新宽度
 * @param height 新高度
 * @returns 重建的 JSON 字符串；原串解析失败时以 {"version":1,"width":W,"height":H} 兜底
 */
export function buildResolutionJson(value: string, width: number, height: number): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    parsed = null;
  }
  const base = typeof parsed === 'object' && parsed !== null ? parsed : { version: 1 };
  return JSON.stringify(Object.assign(base, { width, height }));
}

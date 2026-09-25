/**
 * 判断是否为图片文件名
 * @param name 文件名
 * @returns 是否为图片文件格式
 */
export function isImageFilename(name: unknown): boolean {
  if (typeof name !== 'string') return false;
  return /\.(png|jpe?g|webp|bmp|gif|avif)$/i.test(name.trim());
}

/**
 * 判断是否为 ComfyUI 通配/泛型端口类型
 * @param type 端口类型名
 * @returns 是否为通配（任意类型穿透）或匹配类型
 */
export function isGenericPortType(type: string): boolean {
  return type === '*' || type.startsWith('COMFY_MATCHTYPE');
}

/**
 * 判断端口是否可能承载图片
 * @param type 端口类型名
 * @returns 是否为 IMAGE 或通配/泛型端口
 */
export function isImageCapablePortType(type: string): boolean {
  return type === 'IMAGE' || isGenericPortType(type);
}

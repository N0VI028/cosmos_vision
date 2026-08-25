/**
 * 判断是否为图片文件名
 * @param name 文件名
 * @returns 是否为图片文件格式
 */
export function isImageFilename(name: unknown): boolean {
  if (typeof name !== 'string') return false;
  return /\.(png|jpe?g|webp|bmp|gif|avif)$/i.test(name.trim());
}

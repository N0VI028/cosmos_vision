import {
  getAvatarPath,
  readAvatarFile,
  validateImageFile,
  type TavernAvatarSource,
} from '@/services/tavern-helper/avatar';
import type { WdImageSource } from './types';

/**
 * 读取指定头像来源的当前路径
 * @param source 图片来源
 * @returns 可读取的头像路径或 null
 */
export function getWdAvatarPath(source: Exclude<WdImageSource, 'upload'>): string | null {
  return getAvatarPath(source as TavernAvatarSource);
}

/**
 * 将头像路径读取为临时图片文件
 * @param source 头像来源
 * @param fetchImpl 可注入的请求方法
 * @returns 当前头像对应的图片文件
 */
export async function readWdAvatarFile(
  source: Exclude<WdImageSource, 'upload'>,
  fetchImpl: typeof fetch = fetch,
): Promise<File> {
  return readAvatarFile(source as TavernAvatarSource, fetchImpl);
}

/**
 * 校验用户选择的图片文件
 * @param file 用户选择的文件
 * @returns 可上传的图片文件
 */
export function validateWdImageFile(file: File | null): File {
  return validateImageFile(file);
}

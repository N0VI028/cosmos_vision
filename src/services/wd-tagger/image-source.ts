import { getTavernHelper } from '@/services/tavern-helper/availability';
import type { WdImageSource } from './types';

/**
 * 读取指定头像来源的当前路径
 * @param source 图片来源
 * @returns 可读取的头像路径或 null
 */
export function getWdAvatarPath(source: Exclude<WdImageSource, 'upload'>): string | null {
  const tavernHelper = getTavernHelper({ silent: true });
  if (!tavernHelper) return null;
  const path =
    source === 'user-avatar' ? tavernHelper.getPersonaAvatarPath('current') : tavernHelper.getCharAvatarPath('current');
  return path?.trim() || null;
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
  const path = getWdAvatarPath(source);
  if (!path) throw new Error('当前头像不可用，请改为上传图片');
  const response = await fetchImpl(path);
  if (!response.ok) throw new Error('无法读取当前头像，请改为上传图片');
  const blob = await response.blob();
  if (!blob.type.startsWith('image/')) throw new Error('当前头像不是有效图片');
  return new File([blob], `${source}.png`, { type: blob.type });
}

/**
 * 校验用户选择的图片文件
 * @param file 用户选择的文件
 * @returns 可上传的图片文件
 */
export function validateWdImageFile(file: File | null): File {
  if (!file) throw new Error('请先选择图片');
  if (!file.type.startsWith('image/')) throw new Error('请选择图片文件');
  return file;
}

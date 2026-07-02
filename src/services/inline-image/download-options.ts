export const IMAGE_DOWNLOAD_OPTIONS_REQUEST_KEY = 'requestImageDownloadOptions';

export type InlineImageDownloadFormat = 'png' | 'jpg';

export interface InlineImageDownloadOptions {
  format: InlineImageDownloadFormat;
  cleanMetadata: boolean;
  jpgQuality: number;
}

/**
 * 创建默认下载配置
 * @returns 默认下载配置
 */
export function createDefaultInlineImageDownloadOptions(): InlineImageDownloadOptions {
  return {
    format: 'png',
    cleanMetadata: true,
    jpgQuality: 0.92,
  };
}

/**
 * 复制下载配置,避免跨层共享同一个响应式对象
 * @param options 原始下载配置
 * @returns 纯下载配置对象
 */
export function cloneInlineImageDownloadOptions(
  options: InlineImageDownloadOptions,
): InlineImageDownloadOptions {
  return {
    format: options.format,
    cleanMetadata: options.cleanMetadata,
    jpgQuality: options.jpgQuality,
  };
}

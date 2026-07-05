/** 官网官方 vibe 文件扩展名 */
export const OFFICIAL_NOVELAI_VIBE_FILE_NAME_PATTERN = /\.naiv4vibe(?:bundle)?(?:\.json)?$/i;

/** 已解析官网 vibe 的标准展示扩展名 */
export const ENCODED_NOVELAI_VIBE_FILE_NAME_PATTERN = /\.naiv4vibe$/i;

/**
 * 去掉 NovelAI vibe 文件扩展名
 * @param fileName 原始文件名
 * @returns 去扩展名后的文件名
 */
export function stripNovelAIVibeFileExtension(fileName: string): string {
  return fileName.replace(/(?:\.naiv4vibe(?:bundle)?(?:\.json)?|\.[^.\\/]+)$/i, '');
}

/**
 * 计算文本 SHA-256 hash
 * @param value 原始文本
 * @returns 十六进制 hash
 */
export async function sha256Text(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return formatHexDigest(digest);
}

/**
 * 计算二进制 SHA-256 hash
 * @param buffer 二进制数据
 * @returns 十六进制 hash
 */
export async function hashArrayBuffer(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return formatHexDigest(digest);
}

/**
 * 将摘要二进制格式化为十六进制文本
 * @param digest SHA-256 摘要
 * @returns 十六进制文本
 */
function formatHexDigest(digest: ArrayBuffer): string {
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

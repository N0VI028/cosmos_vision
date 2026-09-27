/**
 * 敏感信息脱敏与处理工具函数
 */

/**
 * 脱敏显示 API Key
 * @param apiKey 原始密钥
 * @returns 脱敏后的密钥
 */
export function maskApiKey(apiKey: string): string {
  const trimmed = apiKey.trim();
  if (!trimmed) return '(未配置)';
  if (trimmed.length <= 8) return '********';
  return `${trimmed.slice(0, 4)}...${trimmed.slice(-4)}`;
}

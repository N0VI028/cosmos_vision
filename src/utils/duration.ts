/**
 * 格式化耗时毫秒数为易读字符串
 * @param durationMs 耗时毫秒数
 * @returns 格式化后的耗时字符串（如 '1.2s', '1m05s'）
 */
export function formatDurationMs(durationMs: number): string {
  const seconds = durationMs / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m${String(Math.floor(seconds % 60)).padStart(2, '0')}s`;
}

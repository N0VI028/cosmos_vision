/**
 * 复制文本到系统剪贴板（失败静默）
 * @param text 待复制内容
 */
export async function copyToClipboard(text: string): Promise<void> {
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // 失败静默
  }
}

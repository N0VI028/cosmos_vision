/**
 * 复制文本到系统剪贴板
 * 优先使用 navigator.clipboard（安全上下文），不可用或失败时回退到 execCommand('copy')
 * @param text 待复制内容
 * @returns 是否复制成功
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // 安全上下文 API 失败，回退到 execCommand
    }
  }

  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const success = document.execCommand('copy');
    document.body.removeChild(textarea);
    return Boolean(success);
  } catch {
    return false;
  }
}

/**
 * 复制文本并使用 toastr 提示结果
 * 适用于 HTTP 局域网等非安全上下文环境，内部自动回退到 execCommand
 * @param text 待复制内容
 * @param successMessage 复制成功时的提示文案，默认为「已复制」
 * @returns 是否复制成功
 */
export async function copyWithToast(text: string, successMessage = '已复制'): Promise<boolean> {
  const success = await copyToClipboard(text);
  if (success) {
    toastr.success(successMessage);
  } else {
    toastr.error('复制失败，请手动复制');
  }
  return success;
}

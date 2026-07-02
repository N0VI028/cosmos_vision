const OBJECT_URL_REVOKE_DELAY_MS = 1000;

/**
 * 触发浏览器下载
 * @param blob 文件内容
 * @param fileName 下载文件名
 */
export function triggerBrowserDownload(blob: Blob, fileName: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = fileName;
  anchor.style.display = 'none';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), OBJECT_URL_REVOKE_DELAY_MS);
}

export interface ConfirmOptions {
  title?: string;
  message: string;
  acceptLabel?: string;
  cancelLabel?: string;
  severity?: string;
}

export type ShowConfirm = (options: ConfirmOptions) => Promise<boolean>;

/**
 * 显示确认弹窗，缺少设置面板上下文时回退浏览器原生确认
 * @param showConfirm 设置面板确认函数
 * @param options 确认弹窗配置
 * @returns 用户是否确认
 */
export async function requestConfirmation(
  showConfirm: ShowConfirm | undefined,
  options: ConfirmOptions,
): Promise<boolean> {
  if (showConfirm) return showConfirm(options);
  return confirm(options.message);
}
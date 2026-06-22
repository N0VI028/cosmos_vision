import { POPUP_TYPE, callGenericPopup } from '@sillytavern/scripts/popup';

interface TextInputPopupOptions {
  message: string;
  defaultValue?: string;
  rows?: number;
  okButton?: string;
}

/**
 * 调用 ST 原生输入弹窗并标准化返回值
 * 空字符串表示用户确认了空输入，null 表示用户取消
 * @param options 弹窗配置
 * @returns 标准化后的输入结果
 */
export async function showTextInputPopup(options: TextInputPopupOptions): Promise<string | null> {
  const value = await callGenericPopup(options.message, POPUP_TYPE.INPUT, options.defaultValue ?? '', {
    rows: options.rows ?? 4,
    okButton: options.okButton ?? '确定',
  });
  if (value === '') return '';
  return value ? String(value).trim() : null;
}

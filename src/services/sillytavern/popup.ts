import { POPUP_TYPE, callGenericPopup } from '@sillytavern/scripts/popup';

interface TextInputPopupOptions {
  message: string;
  defaultValue?: string;
  rows?: number;
  okButton?: string;
}

/** 判断是否为触摸优先设备（移动端） */
const isTouchPrimary = (): boolean => window.matchMedia('(pointer: coarse)').matches;

/**
 * 调用 ST 原生输入弹窗并标准化返回值
 * 空字符串表示用户确认了空输入，null 表示用户取消
 * 移动端：弹窗打开后主动 blur 输入框，防止虚拟键盘被自动唤起
 * @param options 弹窗配置
 * @returns 标准化后的输入结果
 */
export async function showTextInputPopup(options: TextInputPopupOptions): Promise<string | null> {
  if (isTouchPrimary()) {
    // 双 rAF：确保覆盖 ST 弹窗的 autofocus / .focus() 两种聚焦路径
    requestAnimationFrame(() => requestAnimationFrame(() => {
      (document.querySelector<HTMLElement>('.popup-input'))?.blur();
    }));
  }

  const value = await callGenericPopup(options.message, POPUP_TYPE.INPUT, options.defaultValue ?? '', {
    rows: options.rows ?? 4,
    okButton: options.okButton ?? '确定',
  });
  if (value === '') return '';
  return value ? String(value).trim() : null;
}

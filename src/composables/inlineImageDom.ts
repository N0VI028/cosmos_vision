import { DARK_CLASS } from '@/constants/theme';
import { render } from 'vue';

export interface InlineActionButtonSpec {
  label?: string;
  icon: string;
  severity?: 'secondary' | 'danger';
  variant?: 'outlined';
  onClick: () => void;
}

/**
 * 阻止聊天内联控件事件冒泡到底层 ST 消息区
 * @param host 内联控件根节点
 */
export function preventInlineEventBubbling(host: HTMLElement): void {
  const events = ['pointerdown', 'mousedown', 'touchstart', 'pointerup', 'mouseup', 'touchend', 'click'];
  events.forEach(evt => host.addEventListener(evt, e => e.stopPropagation()));
}

/**
 * 构建内联操作宿主的主题作用域 class
 * @param hostClass 原始宿主 class
 * @param darkMode 是否为深色模式
 * @returns 追加 CosmosVision 作用域后的 class
 */
export function buildInlineActionHostClass(hostClass: string, darkMode: boolean): string {
  return darkMode ? `${hostClass} cosmos-vision-root ${DARK_CLASS}` : `${hostClass} cosmos-vision-root`;
}

/**
 * 构建内联 PrimeVue Button 属性
 * @param action 操作按钮配置
 * @returns Button props
 */
export function buildInlineActionButtonProps(action: InlineActionButtonSpec): Record<string, unknown> {
  return {
    class: 'cv-inline-action-button',
    icon: action.icon,
    label: action.label,
    severity: action.severity,
    size: 'small',
    variant: action.variant,
    onClick: action.onClick,
  };
}

/**
 * 卸载并移除 Vue 按钮宿主
 * @param host 按钮宿主元素
 */
export function removeInlineVueHost(host: HTMLElement | null): void {
  if (!host) return;
  render(null, host);
  host.remove();
}

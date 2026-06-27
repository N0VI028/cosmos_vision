import { DARK_CLASS } from '@/constants/theme';
import Button from 'primevue/button';
import type { AppContext } from 'vue';
import { h, render } from 'vue';

export interface InlineActionButtonSpec {
  label?: string;
  icon: string;
  severity?: 'secondary' | 'danger';
  variant?: 'outlined';
  onClick: () => void;
}

interface InlineActionHostOptions {
  appContext?: AppContext;
  hostClass: string;
  darkMode: boolean;
  actions: InlineActionButtonSpec[];
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
 * 创建聊天内联 PrimeVue 操作按钮宿主
 * @param options 渲染参数
 * @returns 已挂载 Vue 按钮的宿主元素
 */
export function createInlineActionHost(options: InlineActionHostOptions): HTMLElement {
  const host = document.createElement('div');
  host.className = buildInlineActionHostClass(options.hostClass, options.darkMode);
  preventInlineEventBubbling(host);
  renderInlineActions(host, options);
  return host;
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

/**
 * 渲染内联操作按钮行
 * @param host 宿主元素
 * @param options 渲染参数
 */
function renderInlineActions(host: HTMLElement, options: InlineActionHostOptions): void {
  const vnode = h(
    'div',
    { class: 'cv-inline-button-row' },
    options.actions.map(action => h(Button, buildInlineActionButtonProps(action))),
  );
  if (options.appContext) vnode.appContext = options.appContext;
  render(vnode, host);
}

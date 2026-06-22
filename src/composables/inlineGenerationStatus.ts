import { DARK_CLASS } from '@/constants/theme';
import Message from 'primevue/message';
import ProgressSpinner from 'primevue/progressspinner';
import type { AppContext } from 'vue';
import { h, render } from 'vue';

export type InlineGenerationStatusMode = 'running' | 'error';

/** 段落内生成状态句柄 */
export interface InlineGenerationStatusHandle {
  host: HTMLElement;
  setStatus: (text: string, mode?: InlineGenerationStatusMode, onRetry?: () => void) => void;
  remove: () => void;
}

interface InlineGenerationStatusOptions {
  appContext?: AppContext;
  darkMode: boolean;
  initialText: string;
  onCancel: () => void;
}

interface InlineGenerationStatusState {
  text: string;
  mode: InlineGenerationStatusMode;
  onRetry?: () => void;
}

/** Message severity 映射:running 用基础中性底, error 用错误色 */
const MODE_SEVERITY: Record<InlineGenerationStatusMode, 'secondary' | 'error'> = {
  running: 'secondary',
  error: 'error',
};

/** 关闭按钮文案映射:running 为取消, error 为关闭 */
const MODE_CLOSE_LABEL: Record<InlineGenerationStatusMode, string> = {
  running: '取消',
  error: '关闭',
};

/**
 * 创建段落下方的生成状态条
 * @param options 状态条配置
 * @returns 状态条句柄
 */
export function createInlineGenerationStatus(options: InlineGenerationStatusOptions): InlineGenerationStatusHandle {
  const host = document.createElement('div');
  host.className = buildStatusClass(options.darkMode);
  preventStatusBubbling(host);
  let removed = false;
  let state: InlineGenerationStatusState = { text: options.initialText, mode: 'running' };

  function remove(): void {
    if (removed) return;
    removed = true;
    render(null, host);
    host.remove();
  }

  function setStatus(text: string, mode: InlineGenerationStatusMode = 'running', onRetry?: () => void): void {
    state = { text, mode, onRetry };
    renderStatus(host, state, options, remove);
  }

  setStatus(options.initialText);
  return { host, setStatus, remove };
}

/**
 * 组装状态条主题 class
 * @param darkMode 是否为暗色模式
 * @returns class 字符串
 */
function buildStatusClass(darkMode: boolean): string {
  const base = 'cv-inline-generation-status cosmos-vision-root';
  return darkMode ? `${base} ${DARK_CLASS}` : base;
}

/**
 * 阻止状态条交互冒泡到底层聊天
 * @param host 状态条宿主元素
 */
function preventStatusBubbling(host: HTMLElement): void {
  const events = ['pointerdown', 'mousedown', 'touchstart', 'pointerup', 'mouseup', 'touchend', 'click'];
  events.forEach(evt => host.addEventListener(evt, e => e.stopPropagation()));
}

/**
 * 渲染状态条内容为 PrimeVue Message
 * @param host 状态条宿主元素
 * @param state 当前状态
 * @param options 状态条配置
 * @param remove 移除方法
 */
function renderStatus(
  host: HTMLElement,
  state: InlineGenerationStatusState,
  options: InlineGenerationStatusOptions,
  remove: () => void,
): void {
  const isRunning = state.mode === 'running';
  const slots: Record<string, () => ReturnType<typeof h>> = {
    default: () => h('span', { class: 'cv-inline-generation-text' }, state.text),
    // 关闭按钮文字: running=取消 / error=关闭
    closeicon: () => h('span', { class: 'cv-inline-generation-close-text' }, MODE_CLOSE_LABEL[state.mode]),
  };
  // running 态用旋转 spinner 替换默认图标; error 态沿用 Message 默认警告图标
  if (isRunning) {
    slots.icon = () => h(ProgressSpinner, { class: 'cv-inline-generation-spinner', strokeWidth: '4' });
  }
  // error 态且有重试回调: 在文本后插入重试按钮
  if (!isRunning && state.onRetry) {
    const retryFn = state.onRetry;
    slots.default = () =>
      h('span', { class: 'cv-inline-generation-error-row' }, [
        h('span', { class: 'cv-inline-generation-text' }, state.text),
        h(
          'button',
          {
            class: 'p-message-close-button cv-inline-generation-close-text',
            type: 'button',
            onClick: () => { remove(); retryFn(); },
          },
          '重试',
        ),
      ]);
  }
  const vnode = h(
    Message,
    {
      class: `cv-inline-generation-message cv-inline-generation-message--${state.mode}`,
      severity: MODE_SEVERITY[state.mode],
      closable: true,
      onClose: isRunning ? options.onCancel : remove,
    },
    slots,
  );
  if (options.appContext) vnode.appContext = options.appContext;
  render(vnode, host);
}

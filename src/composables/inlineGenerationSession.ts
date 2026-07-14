import { DARK_CLASS } from '@/constants/default-settings';
import { preventInlineEventBubbling } from '@/composables/inlineImageDom';
import { stopTavernHelperGeneration } from '@/services/tavern-helper/generation-control';
import Message from 'primevue/message';
import ProgressSpinner from 'primevue/progressspinner';
import CvMiniButton from '@/panel/components/CvMiniButton.vue';
import type { AppContext } from 'vue';
import { h, render } from 'vue';

export type InlineGenerationStatusMode = 'running' | 'error';

/** 段落内生成状态句柄 */
export interface InlineGenerationStatusHandle {
  host: HTMLElement;
  setStatus: (text: string, mode?: InlineGenerationStatusMode, onRetry?: () => void) => void;
  remove: () => void;
}

/** 内联生成会话 */
export interface InlineGenerationSession {
  requestId: string;
  paragraph: HTMLElement;
  controller: AbortController;
  promptGenerationId: string;
  status: InlineGenerationStatusHandle;
}

interface InlineGenerationSessionController {
  start: (paragraph: HTMLElement, target: HTMLElement, initialText: string, placement?: InlineGenerationStatusPlacement) => InlineGenerationSession;
  cancelByParagraph: (paragraph: HTMLElement) => void;
  cleanup: () => void;
  clear: (session: InlineGenerationSession) => void;
  ensureActive: (session: InlineGenerationSession) => void;
  handleFailure: (error: unknown, session: InlineGenerationSession, onRetry?: () => void) => void;
}

interface InlineGenerationSessionOptions {
  appContext?: AppContext;
  getDarkMode: () => boolean;
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

type InlineGenerationStatusPlacement = 'after' | 'overlay';
type ActiveInlineGenerationSessions = Map<HTMLElement, InlineGenerationSession>;
type InlineGenerationStatusSlots = Record<string, () => ReturnType<typeof h>>;

const ERROR_REMOVE_DELAY_MS = 8000;
const MODE_SEVERITY: Record<InlineGenerationStatusMode, 'secondary' | 'error'> = {
  running: 'secondary',
  error: 'error',
};
const MODE_CLOSE_LABEL: Record<InlineGenerationStatusMode, string> = {
  running: '取消',
  error: '关闭',
};

/**
 * 读取指定段落的当前活动会话
 * @param activeSessions 活动会话映射
 * @param paragraph 目标段落
 * @returns 活动会话或 null
 */
function readActiveSession(
  activeSessions: ActiveInlineGenerationSessions,
  paragraph: HTMLElement,
): InlineGenerationSession | null {
  return activeSessions.get(paragraph) ?? null;
}

/**
 * 判断会话是否仍是当前段落的活动请求
 * @param activeSessions 活动会话映射
 * @param session 待判断会话
 * @returns 是否仍有效
 */
function isCurrentSession(
  activeSessions: ActiveInlineGenerationSessions,
  session: InlineGenerationSession,
): boolean {
  return readActiveSession(activeSessions, session.paragraph)?.requestId === session.requestId;
}

/**
 * 判断会话是否已经失效
 * @param activeSessions 活动会话映射
 * @param session 待判断会话
 * @returns 是否已失效
 */
function isInactiveSession(
  activeSessions: ActiveInlineGenerationSessions,
  session: InlineGenerationSession,
): boolean {
  return session.controller.signal.aborted || !isCurrentSession(activeSessions, session);
}

/**
 * 启动段落级生成会话
 * 同段落已有旧请求时，立刻取消旧请求并替换成新请求
 * @param activeSessions 活动会话映射
 * @param options 会话控制选项
 * @param paragraph 目标段落
 * @param target 状态挂载目标
 * @param initialText 初始状态文本
 * @param placement 状态挂载位置
 * @returns 新建的生成会话
 */
function startSession(
  activeSessions: ActiveInlineGenerationSessions,
  options: InlineGenerationSessionOptions,
  paragraph: HTMLElement,
  target: HTMLElement,
  initialText: string,
  placement: InlineGenerationStatusPlacement = 'after',
): InlineGenerationSession {
  cancelParagraphSession(activeSessions, paragraph);
  const session = createSession(
    paragraph,
    target,
    initialText,
    placement,
    options,
    () => cancelParagraphSession(activeSessions, paragraph),
  );
  activeSessions.set(paragraph, session);
  return session;
}

/**
 * 取消指定段落的活动请求
 * @param activeSessions 活动会话映射
 * @param paragraph 目标段落
 */
function cancelParagraphSession(
  activeSessions: ActiveInlineGenerationSessions,
  paragraph: HTMLElement,
): void {
  const session = readActiveSession(activeSessions, paragraph);
  if (!session) return;
  session.status.remove();
  abortSession(session);
  activeSessions.delete(paragraph);
}

/**
 * 清理全部活动会话
 * @param activeSessions 活动会话映射
 */
function cleanupSessions(activeSessions: ActiveInlineGenerationSessions): void {
  activeSessions.forEach(session => {
    abortSession(session);
    session.status.remove();
  });
  activeSessions.clear();
}

/**
 * 清除已完成会话的活动标记
 * @param activeSessions 活动会话映射
 * @param session 待清理会话
 */
function clearSession(
  activeSessions: ActiveInlineGenerationSessions,
  session: InlineGenerationSession,
): void {
  if (!isCurrentSession(activeSessions, session)) return;
  activeSessions.delete(session.paragraph);
}

/**
 * 校验会话是否仍是当前段落的活动请求
 * @param activeSessions 活动会话映射
 * @param session 待校验会话
 */
function ensureSessionActive(
  activeSessions: ActiveInlineGenerationSessions,
  session: InlineGenerationSession,
): void {
  if (!isInactiveSession(activeSessions, session)) return;
  throw new Error('已取消生成');
}

/**
 * 处理生成失败或取消状态
 * 仅作用于传入会话对应的那一次请求
 * @param activeSessions 活动会话映射
 * @param error 异常对象
 * @param session 生成会话
 * @param onRetry 重试回调(可选)
 */
function handleSessionFailure(
  activeSessions: ActiveInlineGenerationSessions,
  error: unknown,
  session: InlineGenerationSession,
  onRetry?: () => void,
): void {
  if (isInactiveSession(activeSessions, session)) {
    session.status.remove();
    return;
  }
  const message = error instanceof Error ? error.message : '图片生成失败';
  session.status.setStatus(`生成失败: ${message}`, 'error', onRetry);
  if (!onRetry) scheduleStatusRemoval(session.status, ERROR_REMOVE_DELAY_MS);
  console.error('[InlineImageGeneration]', error);
}

/**
 * 创建内联生成会话控制器
 * @param options 会话控制选项
 * @returns 会话控制器
 */
export function createInlineGenerationSessionController(
  options: InlineGenerationSessionOptions,
): InlineGenerationSessionController {
  /** 段落到活动会话的映射,支持跨段落并发、同段落单活最新优先 */
  const activeSessions: ActiveInlineGenerationSessions = new Map();
  return {
    start: (paragraph, target, initialText, placement) =>
      startSession(activeSessions, options, paragraph, target, initialText, placement),
    cancelByParagraph: paragraph => cancelParagraphSession(activeSessions, paragraph),
    cleanup: () => cleanupSessions(activeSessions),
    clear: session => clearSession(activeSessions, session),
    ensureActive: session => ensureSessionActive(activeSessions, session),
    handleFailure: (error, session, onRetry) =>
      handleSessionFailure(activeSessions, error, session, onRetry),
  };
}

/**
 * 创建单次内联生成会话
 * @param paragraph 目标段落(用于会话归属与同段落单活判断)
 * @param target 状态挂载目标
 * @param initialText 初始状态文本
 * @param placement 状态挂载位置
 * @param options 会话控制选项
 * @param cancel 取消回调
 * @returns 生成会话
 */
function createSession(
  paragraph: HTMLElement,
  target: HTMLElement,
  initialText: string,
  placement: InlineGenerationStatusPlacement,
  options: InlineGenerationSessionOptions,
  cancel: () => void,
): InlineGenerationSession {
  const status = createInlineGenerationStatus({
    appContext: options.appContext,
    darkMode: options.getDarkMode(),
    initialText,
    onCancel: cancel,
  });
  mountStatusHost(target, status.host, placement);
  const requestId = createGenerationId();
  return { requestId, paragraph, controller: new AbortController(), promptGenerationId: requestId, status };
}

/**
 * 挂载状态条宿主
 * @param target 状态挂载目标
 * @param host 状态条宿主
 * @param placement 状态挂载位置
 */
function mountStatusHost(target: HTMLElement, host: HTMLElement, placement: InlineGenerationStatusPlacement): void {
  if (placement === 'overlay') {
    host.classList.add('cv-inline-generation-status--overlay');
    target.append(host);
    return;
  }
  target.after(host);
}

/**
 * 中止单次生成会话
 * @param session 生成会话
 */
function abortSession(session: InlineGenerationSession): void {
  session.controller.abort();
  stopTavernHelperGeneration(session.promptGenerationId);
}

/**
 * 创建 TavernHelper 生成请求 ID
 * @returns 生成请求 ID
 */
function createGenerationId(): string {
  return `cosmos-vision-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * 延迟移除状态条
 * @param status 状态条句柄
 * @param delay 延迟毫秒
 */
function scheduleStatusRemoval(status: InlineGenerationStatusHandle, delay: number): void {
  window.setTimeout(() => status.remove(), delay);
}

/**
 * 创建段落下方的生成状态条
 * @param options 状态条配置
 * @returns 状态条句柄
 */
function createInlineGenerationStatus(options: InlineGenerationStatusOptions): InlineGenerationStatusHandle {
  const host = document.createElement('div');
  host.className = buildStatusClass(options.darkMode);
  preventInlineEventBubbling(host);
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
  const vnode = h(
    Message,
    {
      class: `cv-inline-generation-message cv-inline-generation-message--${state.mode}`,
      severity: MODE_SEVERITY[state.mode],
      closable: false,
    },
    buildStatusSlots(state, isRunning, remove, options),
  );
  if (options.appContext) vnode.appContext = options.appContext;
  render(vnode, host);
}

/**
 * 构建状态条插槽
 * @param state 当前状态
 * @param isRunning 是否正在运行
 * @param remove 移除方法
 * @param options 状态条配置
 * @returns Message 插槽
 */
function buildStatusSlots(
  state: InlineGenerationStatusState,
  isRunning: boolean,
  remove: () => void,
  options: InlineGenerationStatusOptions,
): InlineGenerationStatusSlots {
  const retry = state.onRetry;
  const onClose = isRunning ? options.onCancel : remove;
  const closeLabel = MODE_CLOSE_LABEL[state.mode];
  const buttonTone = state.mode === 'error' ? 'error' : 'primary';

  const slots: InlineGenerationStatusSlots = {
    default: () => {
      const children: any[] = [
        h('span', { class: 'cv-inline-generation-text' }, state.text),
      ];

      // 按钮区域
      const buttons: any[] = [];

      // 如果有重试回调，并且当前不在运行中，添加重试按钮
      if (!isRunning && retry) {
        buttons.push(
          h(
            CvMiniButton,
            {
              label: '重试',
              tone: buttonTone,
              size: 'small',
              onClick: () => {
                remove();
                retry();
              },
            }
          )
        );
      }

      // 添加取消或关闭按钮
      buttons.push(
        h(
          CvMiniButton,
          {
            label: closeLabel,
            tone: buttonTone,
            size: 'small',
            onClick: onClose,
          }
        )
      );

      // 将按钮放入一行
      children.push(h('span', { class: 'cv-inline-button-row' }, buttons));

      return h('span', { class: 'cv-inline-generation-error-row' }, children);
    },
  };

  if (isRunning) {
    slots.icon = () => h(ProgressSpinner, { class: 'cv-inline-generation-spinner', strokeWidth: 4 });
  }

  return slots;
}

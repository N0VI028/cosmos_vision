import {
  createInlineGenerationStatus,
  type InlineGenerationStatusHandle,
} from '@/composables/inlineGenerationStatus';
import { stopTavernHelperGeneration } from '@/services/tavern-helper/generation-control';
import type { AppContext } from 'vue';

/** 内联生成会话 */
export interface InlineGenerationSession {
  controller: AbortController;
  promptGenerationId: string;
  status: InlineGenerationStatusHandle;
}

interface InlineGenerationSessionController {
  start: (target: HTMLElement, initialText: string, placement?: InlineGenerationStatusPlacement) => InlineGenerationSession;
  cancel: () => void;
  cleanup: () => void;
  clear: (session: InlineGenerationSession) => void;
  ensureActive: (session: InlineGenerationSession) => void;
  handleFailure: (error: unknown, session: InlineGenerationSession, onRetry?: () => void) => void;
}

interface InlineGenerationSessionOptions {
  appContext?: AppContext;
  getDarkMode: () => boolean;
}

type InlineGenerationStatusPlacement = 'after' | 'overlay';

const STATUS_REMOVE_DELAY_MS = 1200;
const ERROR_REMOVE_DELAY_MS = 8000;

/**
 * 创建内联生成会话控制器
 * @param options 会话控制选项
 * @returns 会话控制器
 */
export function createInlineGenerationSessionController(
  options: InlineGenerationSessionOptions,
): InlineGenerationSessionController {
  let activeSession: InlineGenerationSession | null = null;

  function start(
    target: HTMLElement,
    initialText: string,
    placement: InlineGenerationStatusPlacement = 'after',
  ): InlineGenerationSession {
    const session = createSession(target, initialText, placement, options, cancel);
    activeSession = session;
    return session;
  }

  function cancel(): void {
    if (!activeSession) return;
    activeSession.status.remove();
    abortSession(activeSession);
  }

  function cleanup(): void {
    if (!activeSession) return;
    abortSession(activeSession);
    activeSession.status.remove();
    activeSession = null;
  }

  function clear(session: InlineGenerationSession): void {
    if (activeSession !== session) return;
    activeSession = null;
  }

  return { start, cancel, cleanup, clear, ensureActive, handleFailure };
}

/**
 * 创建单次内联生成会话
 * @param target 状态挂载目标
 * @param initialText 初始状态文本
 * @param placement 状态挂载位置
 * @param options 会话控制选项
 * @param cancel 取消回调
 * @returns 生成会话
 */
function createSession(
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
  return { controller: new AbortController(), promptGenerationId: createGenerationId(), status };
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
 * 确保当前会话未被取消
 * @param session 生成会话
 */
function ensureActive(session: InlineGenerationSession): void {
  if (!session.controller.signal.aborted) return;
  throw new Error('已取消生成');
}

/**
 * 处理生成失败或取消状态
 * @param error 异常对象
 * @param session 生成会话
 * @param onRetry 重试回调（可选）
 */
function handleFailure(error: unknown, session: InlineGenerationSession, onRetry?: () => void): void {
  if (session.controller.signal.aborted) {
    session.status.remove();
    return;
  }
  const message = error instanceof Error ? error.message : '图片生成失败';
  session.status.setStatus(`生成失败: ${message}`, 'error', onRetry);
  if (!onRetry) scheduleStatusRemoval(session.status, ERROR_REMOVE_DELAY_MS);
  console.error('[InlineImageGeneration]', error);
}

/**
 * 延迟移除状态条
 * @param status 状态条句柄
 * @param delay 延迟毫秒
 */
function scheduleStatusRemoval(status: InlineGenerationStatusHandle, delay: number): void {
  window.setTimeout(() => status.remove(), delay);
}

/** 请求超时控制器 */
export interface RequestTimeoutController {
  signal: AbortSignal;
  isTimedOut: () => boolean;
  dispose: () => void;
}

/**
 * 合并外部取消信号与配置的总超时时间
 * @param signal 调用方取消信号
 * @param timeoutSeconds 请求总超时秒数
 * @returns 可传给请求的信号、超时状态与清理方法
 */
export function createRequestTimeoutController(
  signal: AbortSignal | undefined,
  timeoutSeconds: number,
): RequestTimeoutController {
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort();
  const timer = window.setTimeout(() => {
    timedOut = true;
    abort();
  }, timeoutSeconds * 1000);
  if (signal?.aborted) abort();
  else signal?.addEventListener('abort', abort, { once: true });

  return {
    signal: controller.signal,
    isTimedOut: () => timedOut,
    dispose: () => {
      window.clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
    },
  };
}

/**
 * 在请求因内部计时器中止后抛出统一超时错误
 * @param controller 请求超时控制器
 * @param label 请求名称
 * @param timeoutSeconds 请求总超时秒数
 */
export function throwIfRequestTimedOut(
  controller: RequestTimeoutController,
  label: string,
  timeoutSeconds: number,
): void {
  if (!controller.isTimedOut()) return;
  throw new Error(`${label} 请求超时（${timeoutSeconds} 秒）`);
}

import { onBeforeUnmount } from 'vue';

import { stopTavernHelperGeneration } from '@/services/tavern-helper/generation-control';

/** 单次测试请求会话 */
export interface TestRequestSession {
  signal: AbortSignal;
  generationId: string;
}

/**
 * 测试页请求会话：统一管理 AbortController 与 TavernHelper generation_id
 */
export function useTestRequestSession() {
  let controller: AbortController | null = null;
  let generationId: string | null = null;

  /**
   * 开启新的测试会话，自动终止上一次未完成请求
   * @returns 本次请求使用的取消信号与生成 ID
   */
  function start(): TestRequestSession {
    stop();
    controller = new AbortController();
    generationId = createTestGenerationId();
    return { signal: controller.signal, generationId };
  }

  /**
   * 终止当前测试请求
   * @returns 是否实际终止了活动会话
   */
  function stop(): boolean {
    const hadSession = controller !== null || generationId !== null;
    controller?.abort();
    if (generationId) stopTavernHelperGeneration(generationId);
    controller = null;
    generationId = null;
    return hadSession;
  }

  /**
   * 正常结束后清理会话引用（不触发中止）
   * @param session 待结束的会话；非当前会话时忽略
   */
  function finish(session: TestRequestSession): void {
    if (!isCurrent(session)) return;
    controller = null;
    generationId = null;
  }

  /**
   * 判断会话是否仍是当前活动请求
   * @param session 待判断会话
   * @returns 是否仍是当前会话
   */
  function isCurrent(session: TestRequestSession): boolean {
    return generationId === session.generationId;
  }

  /**
   * 处理请求失败：过期会话静默忽略，终止错误走 onAbort，其余走 onError
   * @param session 抛出错误时的会话
   * @param error 捕获到的异常
   * @param onAbort 用户终止时的 UI 回调
   * @param onError 业务错误时的 UI 回调
   */
  function handleError(
    session: TestRequestSession,
    error: unknown,
    onAbort: () => void,
    onError: (error: unknown) => void,
  ): void {
    if (!isCurrent(session)) return;
    if (isTestRequestAbortError(error)) {
      onAbort();
      return;
    }
    onError(error);
  }

  onBeforeUnmount(() => {
    stop();
  });

  return { start, stop, finish, isCurrent, handleError };
}

/**
 * 判断是否为用户终止请求导致的错误
 * @param error 捕获到的异常
 * @returns 是否为终止错误
 */
export function isTestRequestAbortError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'AbortError') return true;
  if (!(error instanceof Error)) return false;
  if (error.name === 'AbortError') return true;
  if (error.message === '已取消生成') return true;
  return /abort(ed|error)?/i.test(error.message);
}

/**
 * 创建测试页 TavernHelper 生成请求 ID
 * @returns 生成请求 ID
 */
function createTestGenerationId(): string {
  return `cosmos-vision-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

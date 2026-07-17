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
    generationId = `cosmos-vision-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
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
    if (generationId !== session.generationId) return;
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
   * 包装测试主流程：自动 start / finish，并把 abort 与业务错误分流给回调
   * @param work 测试主体
   * @param onAbort 用户终止时的 UI 回调
   * @param onError 业务错误时的 UI 回调
   */
  async function run(
    work: (session: TestRequestSession) => Promise<void>,
    onAbort: () => void,
    onError: (error: unknown) => void,
  ): Promise<void> {
    const session = start();
    try {
      await work(session);
    } catch (error) {
      if (generationId !== session.generationId) return;
      if (isTestRequestAbortError(error)) onAbort();
      else onError(error);
    } finally {
      finish(session);
    }
  }

  onBeforeUnmount(() => {
    stop();
  });

  return { start, stop, finish, isCurrent, run };
}

/**
 * 判断是否为用户终止请求导致的错误
 * @param error 捕获到的异常
 * @returns 是否为终止错误
 */
export function isTestRequestAbortError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.name === 'AbortError') return true;
  if (error.message === '已取消生成') return true;
  return /abort(ed|error)?/i.test(error.message);
}

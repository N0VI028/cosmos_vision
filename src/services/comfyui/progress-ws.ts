export interface ComfyUIProgress {
  value: number;
  max: number;
}

/**
 * 判断是否为普通对象
 * @param value 原始值
 * @returns 是否为对象
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * 判断是否为有限正数
 * @param val 原始值
 * @returns 是否为有限正数
 */
function isPositiveFiniteNumber(val: unknown): val is number {
  return typeof val === 'number' && Number.isFinite(val) && val > 0;
}

/**
 * 判断是否为当前 prompt 的执行完成事件
 * @param raw 原始消息对象
 * @param promptId 目标 prompt ID
 * @returns 是否执行完成
 */
function isPromptExecutionDone(raw: unknown, promptId: string): boolean {
  if (!isRecord(raw) || raw.type !== 'executing' || !isRecord(raw.data)) return false;
  if (raw.data.node !== null) return false;
  const eventPromptId = raw.data.prompt_id;
  return eventPromptId === undefined || eventPromptId === null || eventPromptId === promptId;
}

/**
 * 解析 ComfyUI WebSocket 消息中的进度事件
 * @param raw 原始消息对象
 * @param promptId 期望匹配的 prompt ID
 * @returns 进度数据或 null
 */
export function parseComfyUIProgressEvent(raw: unknown, promptId: string): ComfyUIProgress | null {
  if (!isRecord(raw) || raw.type !== 'progress' || !isRecord(raw.data)) {
    return null;
  }
  const { value, max, prompt_id: eventPromptId } = raw.data;
  if (!isPositiveFiniteNumber(value) || !isPositiveFiniteNumber(max)) {
    return null;
  }
  if (eventPromptId !== undefined && eventPromptId !== null && eventPromptId !== promptId) {
    return null;
  }
  return { value, max };
}

/**
 * 构建 ComfyUI WebSocket 连接地址
 * @param baseUrl ComfyUI 基础地址
 * @param clientId 客户端 ID
 * @returns WebSocket 连接地址
 */
function buildComfyUIWebSocketUrl(baseUrl: string, clientId: string): string {
  const wsBase = baseUrl.replace(/^http(s?):\/\//i, 'ws$1://');
  return `${wsBase}/ws?clientId=${encodeURIComponent(clientId)}`;
}

/**
 * 处理单条 WebSocket 文本消息
 * @param text 消息文本
 * @param promptId 目标 prompt ID
 * @param onProgress 进度回调
 * @param dispose 清理函数
 */
function handleWebSocketMessage(
  text: string,
  promptId: string,
  onProgress: (p: ComfyUIProgress) => void,
  dispose: () => void,
): void {
  try {
    const raw: unknown = JSON.parse(text);
    if (isPromptExecutionDone(raw, promptId)) {
      dispose();
      return;
    }
    const progress = parseComfyUIProgressEvent(raw, promptId);
    if (progress) onProgress(progress);
  } catch {
    // 忽略畸形消息
  }
}

/**
 * 监听 ComfyUI WebSocket 进度事件
 * @param baseUrl ComfyUI 基础地址
 * @param promptId 目标 prompt ID
 * @param clientId 客户端 ID
 * @param signal 请求超时与取消信号
 * @param onProgress 进度回调函数
 * @returns 销毁并清理监听的函数
 */
export function listenComfyUIProgress(
  baseUrl: string,
  promptId: string,
  clientId: string,
  signal: AbortSignal,
  onProgress: (p: ComfyUIProgress) => void,
): () => void {
  if (signal.aborted) return () => undefined;
  let disposed = false;
  let socket: WebSocket | null = null;

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    signal.removeEventListener('abort', dispose);
    if (!socket) return;
    socket.onmessage = null;
    socket.onerror = null;
    socket.onclose = null;
    socket.close();
    socket = null;
  };

  signal.addEventListener('abort', dispose, { once: true });
  try {
    socket = new WebSocket(buildComfyUIWebSocketUrl(baseUrl, clientId));
    socket.onmessage = (event: MessageEvent<unknown>) => {
      if (typeof event.data !== 'string') return;
      handleWebSocketMessage(event.data, promptId, onProgress, dispose);
    };
    socket.onerror = () => dispose();
    socket.onclose = () => dispose();
  } catch {
    dispose();
  }
  return dispose;
}

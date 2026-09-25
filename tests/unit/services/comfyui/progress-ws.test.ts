import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  listenComfyUIProgress,
  parseComfyUIProgressEvent,
} from '@/services/comfyui/progress-ws';

describe('parseComfyUIProgressEvent 纯函数', () => {
  const PROMPT_ID = 'test-prompt-id';

  it('正确解析合法的 progress 消息且 prompt_id 匹配', () => {
    const raw = {
      type: 'progress',
      data: { value: 5, max: 28, prompt_id: PROMPT_ID, node: '9' },
    };
    expect(parseComfyUIProgressEvent(raw, PROMPT_ID)).toEqual({ value: 5, max: 28 });
  });

  it('prompt_id 不匹配时返回 null（防止同服务器其他任务串台）', () => {
    const raw = {
      type: 'progress',
      data: { value: 5, max: 28, prompt_id: 'other-prompt-id' },
    };
    expect(parseComfyUIProgressEvent(raw, PROMPT_ID)).toBeNull();
  });

  it('prompt_id 缺失时予以接受（兼容老版本）', () => {
    const rawWithoutPromptId = {
      type: 'progress',
      data: { value: 12, max: 20 },
    };
    expect(parseComfyUIProgressEvent(rawWithoutPromptId, PROMPT_ID)).toEqual({ value: 12, max: 20 });

    const rawWithNullPromptId = {
      type: 'progress',
      data: { value: 14, max: 20, prompt_id: null },
    };
    expect(parseComfyUIProgressEvent(rawWithNullPromptId, PROMPT_ID)).toEqual({ value: 14, max: 20 });
  });

  it('type 非 progress 时返回 null', () => {
    expect(parseComfyUIProgressEvent({ type: 'status', data: { value: 1, max: 10 } }, PROMPT_ID)).toBeNull();
    expect(parseComfyUIProgressEvent({ type: 'executing', data: { node: null } }, PROMPT_ID)).toBeNull();
  });

  it('value 或 max 为 0、负数时返回 null', () => {
    expect(parseComfyUIProgressEvent({ type: 'progress', data: { value: 0, max: 20 } }, PROMPT_ID)).toBeNull();
    expect(parseComfyUIProgressEvent({ type: 'progress', data: { value: -1, max: 20 } }, PROMPT_ID)).toBeNull();
    expect(parseComfyUIProgressEvent({ type: 'progress', data: { value: 5, max: 0 } }, PROMPT_ID)).toBeNull();
    expect(parseComfyUIProgressEvent({ type: 'progress', data: { value: 5, max: -10 } }, PROMPT_ID)).toBeNull();
  });

  it('value 或 max 非有限数字或为 Infinity 时返回 null', () => {
    expect(parseComfyUIProgressEvent({ type: 'progress', data: { value: '5', max: 20 } }, PROMPT_ID)).toBeNull();
    expect(parseComfyUIProgressEvent({ type: 'progress', data: { value: NaN, max: 20 } }, PROMPT_ID)).toBeNull();
    expect(parseComfyUIProgressEvent({ type: 'progress', data: { value: 5, max: Infinity } }, PROMPT_ID)).toBeNull();
  });

  it('畸形输入（null、非对象、缺少 data）时返回 null', () => {
    expect(parseComfyUIProgressEvent(null, PROMPT_ID)).toBeNull();
    expect(parseComfyUIProgressEvent(undefined, PROMPT_ID)).toBeNull();
    expect(parseComfyUIProgressEvent('string-event', PROMPT_ID)).toBeNull();
    expect(parseComfyUIProgressEvent([], PROMPT_ID)).toBeNull();
    expect(parseComfyUIProgressEvent({ type: 'progress' }, PROMPT_ID)).toBeNull();
    expect(parseComfyUIProgressEvent({ type: 'progress', data: 'invalid' }, PROMPT_ID)).toBeNull();
  });
});

describe('listenComfyUIProgress WebSocket 监听', () => {
  class MockWebSocket {
    static instances: MockWebSocket[] = [];
    url: string;
    onmessage: ((event: { data: unknown }) => void) | null = null;
    onerror: (() => void) | null = null;
    onclose: (() => void) | null = null;
    close = vi.fn();

    constructor(url: string) {
      this.url = url;
      MockWebSocket.instances.push(this);
    }
  }

  beforeEach(() => {
    MockWebSocket.instances = [];
    vi.stubGlobal('WebSocket', MockWebSocket);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('建立正确地址的 WebSocket 连接并在收到合法 progress 文本帧时触发回调', () => {
    const onProgress = vi.fn();
    const controller = new AbortController();
    const disposer = listenComfyUIProgress(
      'http://127.0.0.1:8188',
      'pid-123',
      'client-abc',
      controller.signal,
      onProgress,
    );

    expect(MockWebSocket.instances).toHaveLength(1);
    const ws = MockWebSocket.instances[0];
    expect(ws.url).toBe('ws://127.0.0.1:8188/ws?clientId=client-abc');

    // 发送 progress 文本帧
    ws.onmessage?.({
      data: JSON.stringify({
        type: 'progress',
        data: { value: 10, max: 25, prompt_id: 'pid-123' },
      }),
    });
    expect(onProgress).toHaveBeenCalledWith({ value: 10, max: 25 });

    // 忽略二进制数据（如预览图）
    ws.onmessage?.({ data: new Blob() });
    expect(onProgress).toHaveBeenCalledTimes(1);

    disposer();
    expect(ws.close).toHaveBeenCalled();
  });

  it('收到本 prompt 的 executing 结束帧（data.node === null）时自动关闭并清理', () => {
    const onProgress = vi.fn();
    const controller = new AbortController();
    listenComfyUIProgress('https://example.com', 'pid-123', 'client-1', controller.signal, onProgress);
    const ws = MockWebSocket.instances[0];
    expect(ws.url).toBe('wss://example.com/ws?clientId=client-1');

    ws.onmessage?.({
      data: JSON.stringify({
        type: 'executing',
        data: { node: null, prompt_id: 'pid-123' },
      }),
    });
    expect(ws.close).toHaveBeenCalled();
  });

  it('当 signal 被中止时及时关闭 WebSocket 并清理', () => {
    const onProgress = vi.fn();
    const controller = new AbortController();
    listenComfyUIProgress('http://127.0.0.1:8188', 'pid-123', 'client-1', controller.signal, onProgress);
    const ws = MockWebSocket.instances[0];

    controller.abort();
    expect(ws.close).toHaveBeenCalled();
  });

  it('WebSocket 初始化抛错时静默捕获不影响主流程', () => {
    vi.stubGlobal('WebSocket', class {
      constructor() {
        throw new Error('Connection refused');
      }
    });

    const onProgress = vi.fn();
    const controller = new AbortController();
    expect(() => {
      const disposer = listenComfyUIProgress('http://127.0.0.1:8188', 'pid-123', 'client-1', controller.signal, onProgress);
      disposer();
    }).not.toThrow();
  });
});

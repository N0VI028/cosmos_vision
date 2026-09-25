import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { eventSource } from '@sillytavern/script';
import { useLlmInspectorStore } from '@/store/llm-inspector';
import type { LlmInspectorRequestSnapshot } from '@/services/prompt-llm/llm-inspector';

/** 构造请求快照 */
function buildSnapshot(id: string, overrides: Partial<LlmInspectorRequestSnapshot> = {}): LlmInspectorRequestSnapshot {
  return {
    id,
    label: `段落 ${id}`,
    startedAt: 1000,
    prompts: [{ role: 'system', content: '你是提示词生成器' }, { role: 'user', content: '生成图片' }],
    model: 'test-model',
    endpoint: '代理预设 测试',
    accountName: '账号一',
    streamEnabled: true,
    paramRows: [],
    ...overrides,
  };
}

describe('useLlmInspectorStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    useLlmInspectorStore().start();
  });

  it('记录请求快照并进入 running 状态', () => {
    const store = useLlmInspectorStore();
    store.recordRequest(buildSnapshot('gen-1'));
    expect(store.sessions).toHaveLength(1);
    expect(store.sessions[0]).toMatchObject({
      id: 'gen-1',
      status: 'running',
      thinkingText: '',
      contentText: '',
    });
    expect(store.hasRunningSession).toBe(true);
  });

  it('保存并传递 paramRows 到 attempts 记录', () => {
    const store = useLlmInspectorStore();
    const paramRows = [{ label: '接口地址', value: 'https://api.openai.com' }];
    store.recordRequest(buildSnapshot('gen-1', { paramRows }));
    expect(store.sessions[0]!.attempts[0]!.paramRows).toEqual(paramRows);
  });

  it('多会话新 → 旧排序且超过上限时淘汰最旧记录', () => {
    const store = useLlmInspectorStore();
    for (let index = 0; index < 55; index += 1) {
      store.recordRequest(buildSnapshot(`gen-${index}`, { startedAt: index }));
    }
    expect(store.sessions).toHaveLength(50);
    expect(store.sessions[0]!.id).toBe('gen-54');
    expect(store.sessions.at(-1)!.id).toBe('gen-5');
  });

  it('同一会话故障转移重试时更新请求侧信息并保留已流出响应', () => {
    const store = useLlmInspectorStore();
    store.recordRequest(buildSnapshot('gen-1', { accountName: '账号一' }));
    eventSource.emit('js_stream_token_received_fully', '部分响应', 'gen-1');
    expect(store.sessions[0]!.contentText).toBe('部分响应');

    store.recordRequest(buildSnapshot('gen-1', { accountName: '账号二', model: 'backup-model' }));
    expect(store.sessions).toHaveLength(1);
    expect(store.sessions[0]).toMatchObject({ accountName: '账号二', model: 'backup-model' });
    // 保留已流出的响应文本
    expect(store.sessions[0]!.contentText).toBe('部分响应');
  });

  it('流式事件按 generation_id 过滤：他家请求与已结束会话不更新', () => {
    const store = useLlmInspectorStore();
    store.recordRequest(buildSnapshot('gen-1'));
    eventSource.emit('js_stream_token_received_fully', '外部请求内容', 'other-extension');
    expect(store.sessions[0]!.contentText).toBe('');

    eventSource.emit('js_stream_token_received_fully', '自家内容', 'gen-1');
    expect(store.sessions[0]!.contentText).toBe('自家内容');

    eventSource.emit('js_generation_ended', '最终全文', 'gen-1');
    expect(store.sessions[0]!.status).toBe('completed');
    // ended 写入最终全文；之后到达的迟到流式分片不再更新
    expect(store.sessions[0]!.contentText).toBe('最终全文');
    eventSource.emit('js_stream_token_received_fully', '迟到分片', 'gen-1');
    expect(store.sessions[0]!.contentText).toBe('最终全文');
  });

  it('流式增量分离思考与正文', () => {
    const store = useLlmInspectorStore();
    store.recordRequest(buildSnapshot('gen-1'));
    eventSource.emit('js_stream_token_received_fully', '<thinking>推理中', 'gen-1');
    expect(store.sessions[0]!.thinkingText).toBe('推理中');
    expect(store.sessions[0]!.contentText).toBe('');

    eventSource.emit('js_stream_token_received_fully', '<thinking>推理完成</thinking>1girl, solo', 'gen-1');
    expect(store.sessions[0]!.thinkingText).toBe('推理完成');
    expect(store.sessions[0]!.contentText).toBe('1girl, solo');
  });

  it('ended 事件完成会话并写入最终全文（非流式路径）', () => {
    const store = useLlmInspectorStore();
    store.recordRequest(buildSnapshot('gen-1', { streamEnabled: false }));
    eventSource.emit('js_generation_ended', '{"positivePrompt": "1girl"}', 'gen-1');
    expect(store.sessions[0]).toMatchObject({
      status: 'completed',
      contentText: '{"positivePrompt": "1girl"}',
    });
    expect(store.hasRunningSession).toBe(false);
  });

  it('结束事件携带 reasoning 时思考区立即写入', () => {
    const store = useLlmInspectorStore();
    store.recordRequest(buildSnapshot('gen-1'));
    eventSource.emit('js_generation_ended', '正文内容', 'gen-1', '结束时的思考');
    expect(store.sessions[0]!.status).toBe('completed');
    expect(store.sessions[0]!.thinkingText).toBe('结束时的思考');
    expect(store.sessions[0]!.contentText).toBe('正文内容');
  });

  it('markSucceeded / markFailed 更新状态与账号信息', () => {
    const store = useLlmInspectorStore();
    store.recordRequest(buildSnapshot('gen-1'));
    store.markSucceeded('gen-1', '完整响应', '账号二');
    expect(store.sessions[0]).toMatchObject({
      status: 'completed',
      contentText: '完整响应',
      accountName: '账号二',
      finishedAt: expect.any(Number),
    });

    store.recordRequest(buildSnapshot('gen-2'));
    store.markFailed('gen-2', new Error('请求超时'));
    expect(store.sessions[0]).toMatchObject({
      status: 'failed',
      error: '请求超时',
    });
    // 未知会话 ID 静默忽略
    expect(() => store.markFailed('missing', new Error('x'))).not.toThrow();
  });

  it('故障转移逐账号留痕：失败尝试封口写错误，成功尝试不写错误', () => {
    const store = useLlmInspectorStore();
    store.recordRequest(buildSnapshot('gen-1', { accountName: '账号一', startedAt: 1000 }));
    store.appendAttemptError('gen-1', new Error('接口超时'));

    store.recordRequest(buildSnapshot('gen-1', { accountName: '账号二', startedAt: 3000 }));
    store.markSucceeded('gen-1', '备份账号响应', '账号二');

    expect(store.sessions[0]!.attempts).toHaveLength(2);
    expect(store.sessions[0]!.attempts[0]).toMatchObject({
      accountName: '账号一',
      error: '接口超时',
      startedAt: 1000,
    });
    // 单次耗时按该次尝试自身开始时刻计（2000 而非累计值）
    expect(store.sessions[0]!.attempts[0]!.durationMs).toBe(2000);
    // 成功尝试封口补耗时，error 保持为空
    expect(store.sessions[0]!.attempts[1]).toEqual({
      accountName: '账号二',
      startedAt: 3000,
      durationMs: expect.any(Number),
      paramRows: [],
    });
  });

  it('thinkingStreaming 标记思考块流式状态，闭合后复位', () => {
    const store = useLlmInspectorStore();
    store.recordRequest(buildSnapshot('gen-1'));
    expect(store.sessions[0]!.thinkingStreaming).toBe(false);

    eventSource.emit('js_stream_token_received_fully', '<thinking>推理中', 'gen-1');
    expect(store.sessions[0]!.thinkingStreaming).toBe(true);

    eventSource.emit('js_stream_token_received_fully', '<thinking>推理完成</thinking>1girl', 'gen-1');
    expect(store.sessions[0]!.thinkingStreaming).toBe(false);
  });

  it('markFailed 封口最后一次尝试并写入失败原因', () => {
    const store = useLlmInspectorStore();
    store.recordRequest(buildSnapshot('gen-1', { accountName: '账号一', startedAt: 1000 }));
    store.markFailed('gen-1', new Error('全部账号均失败'));

    expect(store.sessions[0]!.attempts[0]).toMatchObject({
      accountName: '账号一',
      error: '全部账号均失败',
      durationMs: expect.any(Number),
    });
  });

  it('reasoning 事件无条件写入思考区且独立字段优先于无标签正文', () => {
    const store = useLlmInspectorStore();
    store.recordRequest(buildSnapshot('gen-1'));

    // 1. 独立 reasoning 事件到达，写入思考过程
    eventSource.emit('js_reasoning_token_received_fully', '模型正在思考中...', 'gen-1');
    expect(store.sessions[0]!.thinkingText).toBe('模型正在思考中...');
    expect(store.sessions[0]!.thinkingStreaming).toBe(true);

    // 2. 正文流式到达（无 think 标签），不应将 thinkingText 冲刷为空
    eventSource.emit('js_stream_token_received_fully', '1girl, solo', 'gen-1');
    expect(store.sessions[0]!.thinkingText).toBe('模型正在思考中...');
    expect(store.sessions[0]!.contentText).toBe('1girl, solo');

    // 3. reasoning 事件继续增量更新
    eventSource.emit('js_reasoning_token_received_fully', '模型正在思考中...完成', 'gen-1');
    expect(store.sessions[0]!.thinkingText).toBe('模型正在思考中...完成');

    // 4. 结束事件完成
    eventSource.emit('js_generation_ended', '1girl, solo, masterpiece', 'gen-1');
    expect(store.sessions[0]!.status).toBe('completed');
    expect(store.sessions[0]!.thinkingStreaming).toBe(false);
    expect(store.sessions[0]!.thinkingText).toBe('模型正在思考中...完成');
    expect(store.sessions[0]!.contentText).toBe('1girl, solo, masterpiece');
  });

  it('独立 reasoning 模型：正文 token 流出即结束思考标记，后续 reasoning 事件自愈回 true', () => {
    const store = useLlmInspectorStore();
    store.recordRequest(buildSnapshot('gen-1'));

    // 1. reasoning 事件写入，思考中
    eventSource.emit('js_reasoning_token_received_fully', '模型正在思考中...', 'gen-1');
    expect(store.sessions[0]!.thinkingStreaming).toBe(true);

    // 2. 无思考标签的正文 token 流出，思考阶段结束
    eventSource.emit('js_stream_token_received_fully', '1girl, solo', 'gen-1');
    expect(store.sessions[0]!.thinkingStreaming).toBe(false);
    expect(store.sessions[0]!.thinkingText).toBe('模型正在思考中...');

    // 3. 模型交叉思考：reasoning 事件再次到达，回到思考中
    eventSource.emit('js_reasoning_token_received_fully', '模型正在思考中...继续', 'gen-1');
    expect(store.sessions[0]!.thinkingStreaming).toBe(true);
  });

  it('stop 之后不再接收 reasoning 事件', () => {
    const store = useLlmInspectorStore();
    store.recordRequest(buildSnapshot('gen-1'));
    store.stop();

    eventSource.emit('js_reasoning_token_received_fully', '思考内容', 'gen-1');
    expect(store.sessions[0]!.thinkingText).toBe('');
  });

  it('空 reasoning 事件无副作用（内联标签模型不受干扰）', () => {
    const store = useLlmInspectorStore();
    store.recordRequest(buildSnapshot('gen-1'));

    // 内联标签模型：正文流式分离出未闭合思考 → 思考中
    eventSource.emit('js_stream_token_received_fully', '<think>推理中', 'gen-1');
    expect(store.sessions[0]!.thinkingText).toBe('推理中');
    expect(store.sessions[0]!.thinkingStreaming).toBe(true);

    // 普通模型每帧 emit 的空 reasoning 事件不得覆盖思考区
    eventSource.emit('js_reasoning_token_received_fully', '', 'gen-1');
    expect(store.sessions[0]!.thinkingText).toBe('推理中');
    expect(store.sessions[0]!.thinkingStreaming).toBe(true);
  });
});

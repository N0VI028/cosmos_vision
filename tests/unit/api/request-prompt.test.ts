import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

vi.mock('@/services/prompt-llm/runtime-request', async importOriginal => ({
  ...(await importOriginal<typeof import('@/services/prompt-llm/runtime-request')>()),
  generatePromptTextFromRuntimeContext: vi.fn(),
}));
vi.mock('@/services/tavern-helper/prompt-llm', async importOriginal => ({
  ...(await importOriginal<typeof import('@/services/tavern-helper/prompt-llm')>()),
  buildPromptLlmSchemaFields: vi.fn(() => null),
}));
vi.mock('@/store/llm-inspector', async importOriginal => ({
  ...(await importOriginal<typeof import('@/store/llm-inspector')>()),
  buildLlmInspectorStoreHooks: vi.fn(() => ({ onRequestBuilt: vi.fn() })),
}));

import { createApiRequestId, requestPrompt } from '@/api/request-prompt';
import type { PromptLlmContext } from '@/constants/prompt-llm';
import { generatePromptTextFromRuntimeContext } from '@/services/prompt-llm/runtime-request';
import { buildPromptLlmSchemaFields } from '@/services/tavern-helper/prompt-llm';
import { buildLlmInspectorStoreHooks } from '@/store/llm-inspector';

const mockedGenerate = vi.mocked(generatePromptTextFromRuntimeContext);
const mockedBuildHooks = vi.mocked(buildLlmInspectorStoreHooks);
const mockedSchemaFields = vi.mocked(buildPromptLlmSchemaFields);

/** 读取本次底层请求的运行时上下文 */
function readContext(): PromptLlmContext {
  return mockedGenerate.mock.calls[0]![0];
}

/** 读取本次底层请求的生成选项 */
function readOptions(): NonNullable<Parameters<typeof generatePromptTextFromRuntimeContext>[5]> {
  return mockedGenerate.mock.calls[0]![5]!;
}

describe('api/request-prompt', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mockedGenerate.mockResolvedValue({ rawText: '1girl, solo', accountName: '账号A' });
  });

  it('结构化上下文原样透传，specialRequest 缺省为空串', async () => {
    await requestPrompt({ context: { historyParagraphs: ['第一段', '第二段'], focusParagraph: '焦点段落' } });

    expect(readContext()).toEqual({
      historyParagraphs: ['第一段', '第二段'],
      focusParagraph: '焦点段落',
      specialRequest: '',
      messageIndex: null,
    });
    expect(mockedSchemaFields).toHaveBeenCalled();
  });

  it('specialRequest 传入时透传', async () => {
    await requestPrompt({
      context: { historyParagraphs: [], focusParagraph: '焦点段落', specialRequest: '画成夜景' },
    });

    expect(readContext().specialRequest).toBe('画成夜景');
  });

  it('focusParagraph 为空时抛中文错误且不请求 LLM', async () => {
    await expect(
      requestPrompt({ context: { historyParagraphs: [], focusParagraph: '   ' } }),
    ).rejects.toThrow('未找到目标段落文本');
    expect(mockedGenerate).not.toHaveBeenCalled();
  });

  it('缺省 requestId 自动生成并作为监视 generation_id', async () => {
    const result = await requestPrompt({ context: { historyParagraphs: [], focusParagraph: '焦点段落' } });

    expect(result.requestId).toMatch(/^cv-api-\d+$/);
    expect(readOptions().generationId).toBe(result.requestId);
    expect(createApiRequestId()).not.toBe(result.requestId);
  });

  it('传入 requestId 时原样透传到结果与 generation_id', async () => {
    const result = await requestPrompt({
      context: { historyParagraphs: [], focusParagraph: '焦点段落' },
      requestId: 'my-plugin-req-1',
    });

    expect(result.requestId).toBe('my-plugin-req-1');
    expect(readOptions().generationId).toBe('my-plugin-req-1');
  });

  it('接线 LLM 监视钩子并标记外部调用', async () => {
    await requestPrompt({
      context: { historyParagraphs: [], focusParagraph: '焦点段落' },
      requestId: 'req-inspector',
    });

    expect(mockedBuildHooks).toHaveBeenCalledWith('req-inspector', expect.stringContaining('焦点段落'), true);
    expect(mockedBuildHooks).not.toHaveBeenCalledWith('req-inspector', expect.stringContaining('外部调用'), expect.anything());
    expect(readOptions().inspector).toBe(mockedBuildHooks.mock.results[0]!.value);
  });

  it('透传取消信号', async () => {
    const controller = new AbortController();
    await requestPrompt({
      context: { historyParagraphs: [], focusParagraph: '焦点段落' },
      signal: controller.signal,
    });

    expect(readOptions().signal).toBe(controller.signal);
  });

  it('返回推理内容', async () => {
    mockedGenerate.mockResolvedValue({ rawText: '1girl, solo', accountName: '账号A', reasoning: '思考中' });

    const result = await requestPrompt({ context: { historyParagraphs: [], focusParagraph: '焦点段落' } });

    expect(result).toEqual({ requestId: expect.any(String), text: '1girl, solo', reasoning: '思考中' });
  });

  it('底层错误原样 reject，不被包装', async () => {
    const failure = new Error('提示词生成失败: 账号全部不可用');
    mockedGenerate.mockRejectedValue(failure);

    await expect(
      requestPrompt({ context: { historyParagraphs: [], focusParagraph: '焦点段落' } }),
    ).rejects.toBe(failure);
  });
});

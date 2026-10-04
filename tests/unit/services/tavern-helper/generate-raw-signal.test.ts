import { describe, expect, it, vi } from 'vitest';

vi.mock('@/services/tavern-helper/generation-control', () => ({ stopTavernHelperGeneration: vi.fn() }));

import { stopTavernHelperGeneration } from '@/services/tavern-helper/generation-control';
import { requestTavernHelperGenerateRaw } from '@/services/tavern-helper/generate-raw';
import type { TavernHelperGenerateRawConfig } from '@/services/tavern-helper/prompt-llm';

const mockedStop = vi.mocked(stopTavernHelperGeneration);

/** 构建仅含本用例所需方法的 TavernHelper 替身 */
function createTavernHelper(generateRaw: (config: TavernHelperGenerateRawConfig) => Promise<unknown>) {
  return {
    generateRaw,
    substitudeMacros: (text: string) => text,
  } as unknown as NonNullable<typeof TavernHelper>;
}

describe('requestTavernHelperGenerateRaw 取消控制', () => {
  it('abort 触发时终止底层请求并 reject 请求已取消', async () => {
    const controller = new AbortController();
    const generateRaw = vi.fn(() => new Promise(() => {}));
    const pending = requestTavernHelperGenerateRaw(
      createTavernHelper(generateRaw),
      { generation_id: 'gen-1', ordered_prompts: ['hi'] },
      { signal: controller.signal },
    );

    controller.abort();

    await expect(pending).rejects.toThrow('请求已取消');
    expect(mockedStop).toHaveBeenCalledWith('gen-1');
  });

  it('缺省 generation_id 时按本次请求 ID 终止', async () => {
    const controller = new AbortController();
    const generateRaw = vi.fn(() => new Promise(() => {}));
    const pending = requestTavernHelperGenerateRaw(
      createTavernHelper(generateRaw),
      { ordered_prompts: ['hi'] },
      { signal: controller.signal },
    );

    controller.abort();

    await expect(pending).rejects.toThrow('请求已取消');
    expect(mockedStop).toHaveBeenCalledWith(generateRaw.mock.calls[0]![0]!.generation_id);
  });

  it('传入已 abort 的信号时立即终止', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      requestTavernHelperGenerateRaw(
        createTavernHelper(vi.fn(() => new Promise(() => {}))),
        { generation_id: 'gen-2' },
        { signal: controller.signal },
      ),
    ).rejects.toThrow('请求已取消');
    expect(mockedStop).toHaveBeenCalledWith('gen-2');
  });

  it('请求正常完成时不终止底层请求', async () => {
    const controller = new AbortController();
    const generateRaw = vi.fn(async () => '正文');

    const result = await requestTavernHelperGenerateRaw(
      createTavernHelper(generateRaw),
      { generation_id: 'gen-3' },
      { signal: controller.signal },
    );

    expect(result).toEqual({ text: '正文' });
    expect(mockedStop).not.toHaveBeenCalled();
  });
});

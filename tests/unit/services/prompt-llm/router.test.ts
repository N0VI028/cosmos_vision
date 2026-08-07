import { describe, expect, it, vi } from 'vitest';
import { createPromptLlmAccount, type PromptLlmSettings } from '@/constants/prompt-llm';
import { DEFAULT_SETTINGS } from '@/constants/default-settings';

const { requestTavernHelperGenerateRaw } = vi.hoisted(() => ({
  requestTavernHelperGenerateRaw: vi.fn(),
}));

vi.mock('@/services/tavern-helper/generate-raw', () => ({
  requestTavernHelperGenerateRaw,
}));

/**
 * 动态加载全新状态的 router 模块
 * 负载均衡轮询游标是模块级状态，每个用例需要独立的模块实例
 * @returns 全新加载的 router 模块
 */
async function loadFreshRouter() {
  vi.resetModules();
  return import('@/services/prompt-llm/router');
}

/**
 * 动态加载 runtime-request 模块
 * @returns 当前注册的 runtime-request 模块
 */
async function loadRuntimeRequest() {
  return import('@/services/prompt-llm/runtime-request');
}

/**
 * 创建启用且填写完整的自定义接口账号
 * @param id 账号 id
 * @returns 可用账号
 */
function createEnabledAccount(id: string) {
  return {
    ...createPromptLlmAccount(id, `https://api-${id}.example.com`, `key-${id}`),
    model: 'test-model',
  };
}

/**
 * 基于默认设置构建指定账号列表与路由模式的设置
 * @param accounts 账号列表
 * @param routingMode 路由模式
 * @returns 提示词 LLM 设置
 */
function buildSettings(
  accounts: ReturnType<typeof createEnabledAccount>[],
  routingMode: PromptLlmSettings['routingMode'] = 'sequential',
): PromptLlmSettings {
  return { ...DEFAULT_SETTINGS.promptLlm, accounts, routingMode };
}

describe('getAvailablePromptLlmAccounts', () => {
  it('过滤未启用或未填写完整的账号', async () => {
    const { getAvailablePromptLlmAccounts } = await loadFreshRouter();
    const incomplete = createPromptLlmAccount('incomplete');
    const disabled = { ...createEnabledAccount('disabled'), enabled: false };
    const noModel = { ...createEnabledAccount('no-model'), model: '' };
    const custom = createEnabledAccount('custom');
    const preset = {
      ...createPromptLlmAccount('preset'),
      proxyPreset: 'my-proxy',
      model: 'test-model',
    };
    const settings = buildSettings([incomplete, disabled, noModel, custom, preset]);

    expect(getAvailablePromptLlmAccounts(settings).map(account => account.id)).toEqual(['custom', 'preset']);
  });

  it('空账号列表返回空数组', async () => {
    const { getAvailablePromptLlmAccounts } = await loadFreshRouter();
    expect(getAvailablePromptLlmAccounts(buildSettings([]))).toEqual([]);
  });
});

describe('getPromptLlmRequestAccounts 故障转移模式', () => {
  it('保持账号声明顺序', async () => {
    const { getPromptLlmRequestAccounts } = await loadFreshRouter();
    const settings = buildSettings([createEnabledAccount('a'), createEnabledAccount('b')]);
    expect(getPromptLlmRequestAccounts(settings).map(account => account.id)).toEqual(['a', 'b']);
  });
});

describe('getPromptLlmRequestAccounts 负载均衡模式', () => {
  it('每次请求轮换首选账号并回绕', async () => {
    const { getPromptLlmRequestAccounts } = await loadFreshRouter();
    const settings = buildSettings(
      [createEnabledAccount('a'), createEnabledAccount('b'), createEnabledAccount('c')],
      'load_balance',
    );
    const sequences = Array.from({ length: 4 }, () =>
      getPromptLlmRequestAccounts(settings).map(account => account.id),
    );
    expect(sequences).toEqual([
      ['a', 'b', 'c'],
      ['b', 'c', 'a'],
      ['c', 'a', 'b'],
      ['a', 'b', 'c'],
    ]);
  });

  it('上次首选账号失效后回退到首个可用账号', async () => {
    const { getPromptLlmRequestAccounts } = await loadFreshRouter();
    const enabledAccounts = [createEnabledAccount('a'), createEnabledAccount('b')];
    const settings = buildSettings(enabledAccounts, 'load_balance');
    expect(getPromptLlmRequestAccounts(settings)[0].id).toBe('a');
    expect(getPromptLlmRequestAccounts(settings)[0].id).toBe('b');

    const disabled = { ...enabledAccounts[1], enabled: false };
    const degraded = buildSettings([enabledAccounts[0], disabled], 'load_balance');
    expect(getPromptLlmRequestAccounts(degraded).map(account => account.id)).toEqual(['a']);
  });

  it('单个可用账号时顺序不变', async () => {
    const { getPromptLlmRequestAccounts } = await loadFreshRouter();
    const settings = buildSettings([createEnabledAccount('a')], 'load_balance');
    expect(getPromptLlmRequestAccounts(settings).map(account => account.id)).toEqual(['a']);
    expect(getPromptLlmRequestAccounts(settings).map(account => account.id)).toEqual(['a']);
  });
});

describe('requestPromptLlmWithAccounts', () => {
  const tavernHelper = {} as NonNullable<typeof TavernHelper>;
  const buildRequest = async () => ({});

  it('首个账号成功时直接返回其原始文本与账号名', async () => {
    requestTavernHelperGenerateRaw.mockResolvedValue('raw-ok');
    const { requestPromptLlmWithAccounts } = await loadRuntimeRequest();
    const settings = buildSettings([{ ...createEnabledAccount('a'), name: '主账号' }]);

    const result = await requestPromptLlmWithAccounts(tavernHelper, settings, {}, buildRequest);

    expect(result).toEqual({ rawText: 'raw-ok', accountName: '主账号' });
    expect(requestTavernHelperGenerateRaw).toHaveBeenCalledTimes(1);
  });

  it('前序账号失败时自动切换到下一个账号', async () => {
    requestTavernHelperGenerateRaw.mockRejectedValueOnce(new Error('超时')).mockResolvedValueOnce('raw-fallback');
    const { requestPromptLlmWithAccounts } = await loadRuntimeRequest();
    const settings = buildSettings([createEnabledAccount('a'), { ...createEnabledAccount('b'), name: '备用' }]);
    const attempted: (string | undefined)[] = [];

    const result = await requestPromptLlmWithAccounts(tavernHelper, settings, {}, async account => {
      attempted.push(account?.id);
      return {};
    });

    expect(result).toEqual({ rawText: 'raw-fallback', accountName: '备用' });
    expect(attempted).toEqual(['a', 'b']);
  });

  it('无名账号回退为默认展示名而非序号', async () => {
    requestTavernHelperGenerateRaw.mockRejectedValueOnce(new Error('失败')).mockResolvedValueOnce('raw-ok');
    const { requestPromptLlmWithAccounts } = await loadRuntimeRequest();
    const settings = buildSettings([createEnabledAccount('a'), createEnabledAccount('b')]);

    const result = await requestPromptLlmWithAccounts(tavernHelper, settings, {}, buildRequest);

    expect(result.accountName).toBe('未命名账号');
  });

  it('全部账号失败时抛出聚合错误', async () => {
    requestTavernHelperGenerateRaw.mockRejectedValue(new Error('连接失败'));
    const { requestPromptLlmWithAccounts } = await loadRuntimeRequest();
    const settings = buildSettings([createEnabledAccount('a'), createEnabledAccount('b')]);

    await expect(requestPromptLlmWithAccounts(tavernHelper, settings, {}, buildRequest)).rejects.toThrow(
      /已尝试多组账号但均失败.*未命名账号.*未命名账号/s,
    );
  });

  it('没有可用账号时直接抛错且不发起请求', async () => {
    requestTavernHelperGenerateRaw.mockClear();
    const { requestPromptLlmWithAccounts } = await loadRuntimeRequest();
    const settings = buildSettings([]);

    await expect(requestPromptLlmWithAccounts(tavernHelper, settings, {}, buildRequest)).rejects.toThrow(
      '没有可用的 LLM 账号',
    );
    expect(requestTavernHelperGenerateRaw).not.toHaveBeenCalled();
  });
});

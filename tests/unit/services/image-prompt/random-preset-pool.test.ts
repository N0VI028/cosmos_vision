import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '@/constants/default-settings';
import type { ImagePromptPreset } from '@/constants/image-prompt';
import { createRandomPresetPool } from '@/constants/random-preset-pool';
import {
  getPoolsForSource,
  removePresetReferences,
  resolveFreshPresetIdOverrides,
  resolveRandomPresetId,
} from '@/services/image-prompt/random-preset-pool';

/**
 * 创建单侧预设列表
 * @param ids 预设 ID 列表
 * @returns 预设列表
 */
function createPresets(...ids: string[]): ImagePromptPreset[] {
  return ids.map(id => ({ id, name: id, text: '', placeholderOffset: 0 }));
}

describe('resolveRandomPresetId 触发矩阵', () => {
  afterEach(() => vi.restoreAllMocks());

  it('always 池两源通吃', () => {
    const pools = [createRandomPresetPool('pool-1', { presetIds: ['a'] })];
    expect(resolveRandomPresetId(pools, createPresets('a'), { imageSource: 'novelai', side: 'positive' })).toBe('a');
    expect(resolveRandomPresetId(pools, createPresets('a'), { imageSource: 'comfyui', side: 'positive' })).toBe('a');
  });

  it('model 池仅 NovelAI 生效且按模型过滤', () => {
    const pools = [
      createRandomPresetPool('pool-1', {
        triggerMode: 'model',
        triggerModels: ['nai-diffusion-4-5-full'],
        presetIds: ['a'],
      }),
    ];
    expect(
      resolveRandomPresetId(pools, createPresets('a'), {
        imageSource: 'novelai',
        side: 'positive',
        novelaiModel: 'nai-diffusion-4-5-full',
      }),
    ).toBe('a');
    expect(
      resolveRandomPresetId(pools, createPresets('a'), {
        imageSource: 'novelai',
        side: 'positive',
        novelaiModel: 'nai-diffusion-3',
      }),
    ).toBeNull();
    expect(
      resolveRandomPresetId(pools, createPresets('a'), {
        imageSource: 'comfyui',
        side: 'positive',
        comfyuiWorkflowPresetId: 'wf-1',
      }),
    ).toBeNull();
  });

  it('workflow 池仅 ComfyUI 生效且按工作流过滤', () => {
    const pools = [
      createRandomPresetPool('pool-1', {
        triggerMode: 'workflow',
        triggerWorkflowIds: ['wf-1'],
        presetIds: ['a'],
      }),
    ];
    expect(
      resolveRandomPresetId(pools, createPresets('a'), {
        imageSource: 'comfyui',
        side: 'positive',
        comfyuiWorkflowPresetId: 'wf-1',
      }),
    ).toBe('a');
    expect(
      resolveRandomPresetId(pools, createPresets('a'), {
        imageSource: 'comfyui',
        side: 'positive',
        comfyuiWorkflowPresetId: 'wf-2',
      }),
    ).toBeNull();
    expect(
      resolveRandomPresetId(pools, createPresets('a'), {
        imageSource: 'novelai',
        side: 'positive',
        novelaiModel: 'nai-diffusion-3',
      }),
    ).toBeNull();
  });

  it('禁用或范围不符的池跳过', () => {
    const pools = [
      createRandomPresetPool('pool-1', { enabled: false, presetIds: ['a'] }),
      createRandomPresetPool('pool-2', { side: 'negative', presetIds: ['b'] }),
    ];
    expect(
      resolveRandomPresetId(pools, createPresets('a', 'b'), { imageSource: 'novelai', side: 'positive' }),
    ).toBeNull();
  });

  it('多池命中合并去重后抽取', () => {
    const pools = [
      createRandomPresetPool('pool-1', { presetIds: ['a', 'b'] }),
      createRandomPresetPool('pool-2', { presetIds: ['b', 'c'] }),
    ];
    vi.spyOn(Math, 'random').mockReturnValue(0);
    // 候选合并去重为 [a, b, c]，floor(0 * 3) = 0 → 首个候选
    expect(
      resolveRandomPresetId(pools, createPresets('a', 'b', 'c'), { imageSource: 'novelai', side: 'positive' }),
    ).toBe('a');
  });

  it('悬挂预设 ID 被过滤，全部悬挂返回 null', () => {
    const pools = [createRandomPresetPool('pool-1', { presetIds: ['ghost', 'a'] })];
    expect(resolveRandomPresetId(pools, createPresets('a'), { imageSource: 'novelai', side: 'positive' })).toBe('a');
    expect(
      resolveRandomPresetId(pools, createPresets('other'), { imageSource: 'novelai', side: 'positive' }),
    ).toBeNull();
  });

  it('无候选返回 null', () => {
    expect(resolveRandomPresetId([], createPresets('a'), { imageSource: 'novelai', side: 'positive' })).toBeNull();
  });
});

describe('resolveRandomPresetId 随机抽取', () => {
  afterEach(() => vi.restoreAllMocks());

  it('按 Math.random 在候选集内均匀抽取', () => {
    const pools = [createRandomPresetPool('pool-1', { presetIds: ['a', 'b', 'c'] })];
    const presets = createPresets('a', 'b', 'c');
    const ctx = { imageSource: 'novelai' as const, side: 'positive' as const };
    const random = vi.spyOn(Math, 'random');

    random.mockReturnValue(0);
    expect(resolveRandomPresetId(pools, presets, ctx)).toBe('a');
    random.mockReturnValue(0.5);
    expect(resolveRandomPresetId(pools, presets, ctx)).toBe('b');
    random.mockReturnValue(0.99);
    expect(resolveRandomPresetId(pools, presets, ctx)).toBe('c');
  });
});

describe('removePresetReferences 级联清理', () => {
  it('只清理同侧池的引用', () => {
    const pools = [
      createRandomPresetPool('pool-1', { side: 'positive', presetIds: ['a', 'b'] }),
      createRandomPresetPool('pool-2', { side: 'negative', presetIds: ['a', 'c'] }),
    ];
    const cleaned = removePresetReferences(pools, 'positive', 'a');
    expect(cleaned[0]!.presetIds).toEqual(['b']);
    expect(cleaned[1]!.presetIds).toEqual(['a', 'c']);
  });

  it('不动未引用该预设的池', () => {
    const untouched = createRandomPresetPool('pool-1', { presetIds: ['b'] });
    const pools = [untouched, createRandomPresetPool('pool-2', { presetIds: ['a'] })];
    const cleaned = removePresetReferences(pools, 'positive', 'a');
    expect(cleaned[0]).toBe(untouched);
    expect(cleaned[1]!.presetIds).toEqual([]);
  });

  it('返回新数组且不改原池', () => {
    const pools = [createRandomPresetPool('pool-1', { presetIds: ['a'] })];
    const cleaned = removePresetReferences(pools, 'positive', 'a');
    expect(cleaned).not.toBe(pools);
    expect(pools[0]!.presetIds).toEqual(['a']);
    expect(cleaned[0]!.presetIds).toEqual([]);
  });
});

describe('lora 侧触发矩阵', () => {
  afterEach(() => vi.restoreAllMocks());

  it('lora 池在 comfyui 源按 side 命中', () => {
    const pools = [createRandomPresetPool('pool-1', { side: 'lora', presetIds: ['lora-1'] })];
    expect(resolveRandomPresetId(pools, [{ id: 'lora-1' }], { imageSource: 'comfyui', side: 'lora' })).toBe('lora-1');
  });

  it('model 模式的 lora 池在 comfyui 源不触发，novelai 链路不查询 lora 侧', () => {
    const pools = [
      createRandomPresetPool('pool-1', {
        side: 'lora',
        triggerMode: 'model',
        triggerModels: ['nai-diffusion-4-5-full'],
        presetIds: ['lora-1'],
      }),
    ];
    expect(resolveRandomPresetId(pools, [{ id: 'lora-1' }], { imageSource: 'comfyui', side: 'lora' })).toBeNull();
    // novelai 链路只解析正/负侧，model 模式 lora 池永不进入候选
    const settings = structuredClone(DEFAULT_SETTINGS);
    settings.randomPresetPools.pools = pools;
    expect(resolveFreshPresetIdOverrides(settings, 'novelai').lora).toBeUndefined();
  });
});

describe('resolveFreshPresetIdOverrides 新鲜生图解析', () => {
  it('comfyui 源返回 lora 键', () => {
    const settings = structuredClone(DEFAULT_SETTINGS);
    settings.comfyui.loraPresets.presets.push({ id: 'lora-x', name: 'x', loras: [] });
    settings.randomPresetPools.pools = [
      createRandomPresetPool('pool-1', {
        side: 'lora',
        presetIds: ['lora-x'],
      }),
    ];
    const overrides = resolveFreshPresetIdOverrides(settings, 'comfyui');
    expect(overrides.lora).toBe('lora-x');
  });

  it('novelai 源不产出 lora 键', () => {
    const settings = structuredClone(DEFAULT_SETTINGS);
    settings.randomPresetPools.pools = [
      createRandomPresetPool('pool-1', {
        side: 'lora',
        presetIds: ['lora-x'],
      }),
    ];
    const overrides = resolveFreshPresetIdOverrides(settings, 'novelai');
    expect(overrides).not.toHaveProperty('lora');
  });
});

describe('resolveFreshPresetIdOverrides 总开关', () => {
  it('enabled: false 时 novelai/comfyui 均返回空覆写（即使有匹配池）', () => {
    const settings = structuredClone(DEFAULT_SETTINGS);
    settings.randomPresetPools.enabled = false;
    settings.comfyui.loraPresets.presets.push({ id: 'lora-x', name: 'x', loras: [] });
    settings.randomPresetPools.pools = [
      createRandomPresetPool('pool-1', { presetIds: ['a'] }),
      createRandomPresetPool('pool-2', { side: 'lora', presetIds: ['lora-x'] }),
    ];

    expect(resolveFreshPresetIdOverrides(settings, 'novelai')).toEqual({ positive: undefined, negative: undefined });
    expect(resolveFreshPresetIdOverrides(settings, 'comfyui')).toEqual({
      positive: undefined,
      negative: undefined,
      lora: undefined,
    });
  });

  it('总开关不影响 getPoolsForSource 的 UI 展示过滤', () => {
    const settings = structuredClone(DEFAULT_SETTINGS);
    settings.randomPresetPools.enabled = false;
    settings.randomPresetPools.pools = [createRandomPresetPool('pool-1', { side: 'lora' })];

    expect(getPoolsForSource(settings.randomPresetPools.pools, 'comfyui')).toHaveLength(1);
  });
});

describe('getPoolsForSource 按源过滤', () => {
  const pools = [
    createRandomPresetPool('always-pos', { side: 'positive' }),
    createRandomPresetPool('always-lora', { side: 'lora' }),
    createRandomPresetPool('model', { triggerMode: 'model', triggerModels: ['nai-diffusion-3'] }),
    createRandomPresetPool('workflow', { triggerMode: 'workflow', triggerWorkflowIds: ['wf-1'] }),
  ];

  it('novelai 源：正/负侧且模式为 always/model', () => {
    expect(getPoolsForSource(pools, 'novelai').map(pool => pool.id)).toEqual(['always-pos', 'model']);
  });

  it('comfyui 源：模式为 always/workflow（side 含 lora）', () => {
    expect(getPoolsForSource(pools, 'comfyui').map(pool => pool.id)).toEqual(['always-pos', 'always-lora', 'workflow']);
  });
});

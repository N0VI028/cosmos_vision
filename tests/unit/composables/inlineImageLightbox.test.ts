import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isProxy, reactive } from 'vue';
import {
  cloneInlinePromptSnapshot,
  closeInlineImageLightbox,
  deepCloneWithoutProxy,
  handleInlineImageClick,
  inlineLightboxState,
  openInlineImageLightbox,
  type InlinePromptSnapshot,
} from '@/composables/inlineImageLightbox';

const snapshot: InlinePromptSnapshot = {
  positivePrompt: '1girl',
  negativePrompt: 'lowres',
};

describe('inlineImageLightbox 状态', () => {
  beforeEach(() => {
    closeInlineImageLightbox();
  });

  it('openInlineImageLightbox 正确写入状态字段', () => {
    const onDownload = vi.fn();
    openInlineImageLightbox('https://example.com/a.png', snapshot, { onDownload });

    expect(inlineLightboxState.open).toBe(true);
    expect(inlineLightboxState.src).toBe('https://example.com/a.png');
    expect(inlineLightboxState.snapshot).toEqual(snapshot);
    expect(inlineLightboxState.onDownload).toBe(onDownload);
  });

  it('closeInlineImageLightbox 置 open 为 false', () => {
    openInlineImageLightbox('https://example.com/a.png', snapshot);
    expect(inlineLightboxState.open).toBe(true);

    closeInlineImageLightbox();
    expect(inlineLightboxState.open).toBe(false);
  });
});

describe('handleInlineImageClick', () => {
  beforeEach(() => {
    closeInlineImageLightbox();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('运行时未启用时不打开灯箱', () => {
    const wrap = document.createElement('div');
    const img = document.createElement('img');

    handleInlineImageClick(new MouseEvent('click'), img, wrap, () => false, snapshot);

    expect(inlineLightboxState.open).toBe(false);
  });

  it('PC 端点击直接打开灯箱', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: false } as MediaQueryList);
    const wrap = document.createElement('div');
    const img = document.createElement('img');

    handleInlineImageClick(new MouseEvent('click'), img, wrap, () => true, snapshot);

    expect(inlineLightboxState.open).toBe(true);
    expect(inlineLightboxState.src).toBe(img.src);
  });

  it('移动端首次点击仅激活容器，第二次点击打开灯箱', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList);
    const wrap = document.createElement('div');
    const img = document.createElement('img');

    handleInlineImageClick(new MouseEvent('click'), img, wrap, () => true, snapshot);
    expect(wrap.classList.contains('cv-inline-img-active')).toBe(true);
    expect(inlineLightboxState.open).toBe(false);

    handleInlineImageClick(new MouseEvent('click'), img, wrap, () => true, snapshot);
    expect(inlineLightboxState.open).toBe(true);
    expect(wrap.classList.contains('cv-inline-img-active')).toBe(false);
  });
});

describe('cloneInlinePromptSnapshot', () => {
  it('带顶层快照克隆保留', () => {
    const legacySnapshot: InlinePromptSnapshot = {
      positivePrompt: '1girl, masterpiece',
      negativePrompt: 'lowres, bad quality',
      imageSource: 'novelai',
    };
    const cloned = cloneInlinePromptSnapshot(legacySnapshot);

    expect(cloned.positivePrompt).toBe('1girl, masterpiece');
    expect(cloned.negativePrompt).toBe('lowres, bad quality');
    expect(cloned.imageSource).toBe('novelai');
  });

  it('顶层空串克隆原样保留（不因 truthy 判断丢弃）', () => {
    const emptySnapshot: InlinePromptSnapshot = {
      positivePrompt: '',
      negativePrompt: '',
      imageSource: 'comfyui',
    };
    const cloned = cloneInlinePromptSnapshot(emptySnapshot);

    expect(cloned.positivePrompt).toBe('');
    expect(cloned.negativePrompt).toBe('');
    expect('positivePrompt' in cloned).toBe(true);
  });

  it('无顶层快照克隆后仍无顶层（不补空串）', () => {
    const modernSnapshot: InlinePromptSnapshot = {
      imageSource: 'comfyui',
      comfyui: {
        endpoint: 'http://127.0.0.1:8188',
        positivePrompt: 'comfyui positive',
        negativePrompt: 'comfyui negative',
        imageOutputNodeId: '9',
        promptBindings: [],
        seedValues: [],
        loras: [],
      },
    };
    const cloned = cloneInlinePromptSnapshot(modernSnapshot);

    expect(cloned.positivePrompt).toBeUndefined();
    expect(cloned.negativePrompt).toBeUndefined();
    expect('positivePrompt' in cloned).toBe(false);
    expect('negativePrompt' in cloned).toBe(false);
    expect(cloned.comfyui?.positivePrompt).toBe('comfyui positive');
  });

  it('克隆 novelaiRequest 独立对象，旧快照无该字段时输出无该字段', () => {
    const withoutRequest: InlinePromptSnapshot = {
      imageSource: 'novelai',
      positivePrompt: 'pos',
    };
    const clonedWithout = cloneInlinePromptSnapshot(withoutRequest);
    expect('novelaiRequest' in clonedWithout).toBe(false);
    expect(clonedWithout.novelaiRequest).toBeUndefined();

    const withRequest: InlinePromptSnapshot = {
      imageSource: 'novelai',
      positivePrompt: 'pos',
      novelaiRequest: {
        endpoint: 'https://image.novelai.net',
        model: 'nai-diffusion-4-full',
        width: 832,
        height: 1216,
        sampler: 'k_euler',
        seed: 123456,
        steps: 28,
        guidance: 6,
        autoSampler: true,
        varietyPlus: false,
        smea: false,
        smeaDyn: false,
        decrisp: false,
        legacyPromptMode: false,
        promptGuidanceRescale: 0,
        noiseSchedule: 'karras',
        ucPreset: 0,
        qualityPreset: 'heavy',
        imageCount: 1,
        vibes: { count: 0, referenceStrengths: [], informationExtracted: [], resolved: true },
      },
    };
    const clonedWith = cloneInlinePromptSnapshot(withRequest);
    expect(clonedWith.novelaiRequest).toEqual(withRequest.novelaiRequest);
    expect(clonedWith.novelaiRequest).not.toBe(withRequest.novelaiRequest);
  });

  it('严格深层剥离 Vue reactive Proxy，支持 structuredClone 且嵌套属性不是 Proxy', () => {
    const reactiveSnapshot = reactive<InlinePromptSnapshot>({
      imageSource: 'novelai',
      positivePrompt: 'masterpiece',
      promptParts: {
        positive: { core: '1girl', presetId: 'anime' },
        negative: { core: 'lowres', presetId: 'default' },
      },
      novelaiRequest: {
        endpoint: 'https://image.novelai.net',
        model: 'nai-diffusion-4-full',
        width: 832,
        height: 1216,
        sampler: 'k_euler',
        seed: 123456,
        steps: 28,
        guidance: 6,
        autoSampler: true,
        varietyPlus: false,
        smea: false,
        smeaDyn: false,
        decrisp: false,
        legacyPromptMode: false,
        promptGuidanceRescale: 0,
        noiseSchedule: 'karras',
        ucPreset: 0,
        qualityPreset: 'heavy',
        imageCount: 1,
        vibes: {
          count: 1,
          referenceStrengths: [0.6],
          informationExtracted: [1.0],
          resolved: true,
        },
      },
    });

    expect(isProxy(reactiveSnapshot)).toBe(true);
    expect(isProxy(reactiveSnapshot.novelaiRequest)).toBe(true);
    expect(isProxy(reactiveSnapshot.novelaiRequest?.vibes)).toBe(true);
    expect(isProxy(reactiveSnapshot.promptParts)).toBe(true);

    const cloned = cloneInlinePromptSnapshot(reactiveSnapshot);

    expect(isProxy(cloned)).toBe(false);
    expect(isProxy(cloned.novelaiRequest)).toBe(false);
    expect(isProxy(cloned.novelaiRequest?.vibes)).toBe(false);
    expect(isProxy(cloned.novelaiRequest?.vibes?.referenceStrengths)).toBe(false);
    expect(isProxy(cloned.promptParts)).toBe(false);
    expect(isProxy(cloned.promptParts?.positive)).toBe(false);

    // 验证能够成功结构化克隆，绝不抛出 DataCloneError
    expect(() => structuredClone(cloned)).not.toThrow();
  });

  it('保留 Blob 等特殊结构化克隆兼容对象不被破坏', () => {
    const testBlob = new Blob(['test-image-data'], { type: 'image/png' });
    const rawObj = {
      imageBlob: testBlob,
      nested: {
        date: new Date('2026-01-01'),
        buffer: new ArrayBuffer(8),
      },
    };
    const cloned = deepCloneWithoutProxy(rawObj);
    expect(cloned.imageBlob).toBe(testBlob);
    expect(cloned.nested.date).toBe(rawObj.nested.date);
    expect(cloned.nested.buffer).toBe(rawObj.nested.buffer);
    expect(() => structuredClone(cloned)).not.toThrow();
  });
});


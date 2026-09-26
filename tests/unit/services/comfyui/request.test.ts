import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '@/constants/default-settings';
import { DEFAULT_COMFYUI_WORKFLOW_K2_ANIMA_JSON } from '@/constants/comfyui';
import { buildComfyUIResolvedRequest } from '@/services/comfyui/request';
import { clearComfyUIObjectInfoCache, fetchComfyUIObjectInfo } from '@/services/comfyui/object-info';
import { createMockFetch } from '../../../helpers/fetch-mocks';

/** 构建只含 LoRA 加载节点的激活 LoRA 预设 */
function createLoraPreset(name: string) {
  return {
    activePresetId: 'lora-1',
    presets: [{ id: 'lora-1', name: '组', loras: [{ id: 'l1', name, strength: 1, enabled: true }] }],
  };
}

describe('comfyui request builder', () => {
  afterEach(() => {
    clearComfyUIObjectInfoCache();
    vi.unstubAllGlobals();
  });
  it('builds resolved request with workflow and prompt replacements', () => {
    const settings = structuredClone(DEFAULT_SETTINGS.comfyui);
    settings.workflowPresets.presets = [
      {
        id: 'preset-1',
        name: 'SDXL Workflow',
        workflowJson: JSON.stringify({
          '6': {
            class_type: 'CLIPTextEncode',
            inputs: { text: 'positive placeholder' },
            _meta: { cosmosVision: { promptBindings: { text: 'positive' }, imageOutput: true } },
          },
        }),
        favoriteNodeIds: [],
      },
    ];
    settings.workflowPresets.activePresetId = 'preset-1';

    const imagePromptPresets = DEFAULT_SETTINGS.imagePromptPresets;

    const resolved = buildComfyUIResolvedRequest(settings, imagePromptPresets, {
      positivePrompt: 'masterpiece, 1girl',
      negativePrompt: 'low quality',
    });

    expect(resolved.snapshot.positivePrompt).toContain('masterpiece, 1girl');
    expect(resolved.imageOutputNodeId).toBe('6');
    expect(resolved.workflow['6'].inputs.text).toContain('masterpiece, 1girl');
  });

  it('prepends the passed lora trigger words to the positive prompt', () => {
    const settings = structuredClone(DEFAULT_SETTINGS.comfyui);
    settings.workflowPresets.presets = [
      {
        id: 'preset-1',
        name: 'SDXL Workflow',
        workflowJson: JSON.stringify({
          '6': {
            class_type: 'CLIPTextEncode',
            inputs: { text: 'positive placeholder' },
            _meta: { cosmosVision: { promptBindings: { text: 'positive' }, imageOutput: true } },
          },
          '10': {
            class_type: 'Lora Loader (LoraManager)',
            inputs: {
              text: '<lora:stale_lora:1.0>',
              loras: {
                __value__: [
                  { name: 'stale_lora', strength: 1.0, active: true, clipStrength: 1.0, expanded: false },
                ],
              },
            },
          },
        }),
        favoriteNodeIds: [],
      },
    ];
    settings.workflowPresets.activePresetId = 'preset-1';
    settings.loraPresets = createLoraPreset('a.safetensors');

    const resolved = buildComfyUIResolvedRequest(
      settings,
      DEFAULT_SETTINGS.imagePromptPresets,
      { positivePrompt: 'masterpiece, 1girl', negativePrompt: 'low quality' },
      ['triggerA'],
    );

    expect(resolved.snapshot.positivePrompt).toContain('masterpiece, 1girl');
    expect(resolved.snapshot.positivePrompt.startsWith('triggerA, ')).toBe(true);
    expect(String(resolved.workflow['6'].inputs.text).startsWith('triggerA, ')).toBe(true);
  });

  it('does not inject trigger words when none are passed', () => {
    const settings = structuredClone(DEFAULT_SETTINGS.comfyui);
    settings.workflowPresets.presets = [
      {
        id: 'preset-1',
        name: 'SDXL Workflow',
        workflowJson: JSON.stringify({
          '6': {
            class_type: 'CLIPTextEncode',
            inputs: { text: 'positive placeholder' },
            _meta: { cosmosVision: { promptBindings: { text: 'positive' }, imageOutput: true } },
          },
          '10': {
            class_type: 'Lora Loader (LoraManager)',
            inputs: { text: '', loras: { __value__: [] } },
          },
        }),
        favoriteNodeIds: [],
      },
    ];
    settings.workflowPresets.activePresetId = 'preset-1';
    settings.loraPresets = createLoraPreset('a.safetensors');

    const resolved = buildComfyUIResolvedRequest(settings, DEFAULT_SETTINGS.imagePromptPresets, {
      positivePrompt: 'masterpiece, 1girl',
      negativePrompt: 'low quality',
    });

    expect(resolved.snapshot.positivePrompt).toBe('masterpiece, 1girl');
  });

  it('throws error when active preset is missing', () => {
    const settings = structuredClone(DEFAULT_SETTINGS.comfyui);
    settings.workflowPresets.presets = [];
    settings.workflowPresets.activePresetId = 'non-existent';

    expect(() =>
      buildComfyUIResolvedRequest(settings, DEFAULT_SETTINGS.imagePromptPresets, {
        positivePrompt: '',
        negativePrompt: '',
      }),
    ).toThrow();
  });

  it('overwrites the workflow lora node with the active lora preset before sending', () => {
    const settings = structuredClone(DEFAULT_SETTINGS.comfyui);
    settings.workflowPresets.presets = [
      {
        id: 'preset-1',
        name: 'SDXL Workflow',
        workflowJson: JSON.stringify({
          '6': {
            class_type: 'CLIPTextEncode',
            inputs: { text: 'positive placeholder' },
            _meta: { cosmosVision: { promptBindings: { text: 'positive' }, imageOutput: true } },
          },
          '10': {
            class_type: 'Lora Loader (LoraManager)',
            inputs: {
              text: '<lora:stale_lora:1.0>',
              loras: {
                __value__: [
                  { name: 'stale_lora', strength: 1.0, active: true, clipStrength: 1.0, expanded: false },
                ],
              },
            },
          },
        }),
        favoriteNodeIds: [],
      },
    ];
    settings.workflowPresets.activePresetId = 'preset-1';
    settings.loraPresets = {
      activePresetId: 'lora-1',
      presets: [
        {
          id: 'lora-1',
          name: '当前组',
          loras: [{ id: 'l1', name: 'fresh_lora.safetensors', strength: 0.8, enabled: true }],
        },
      ],
    };

    const resolved = buildComfyUIResolvedRequest(settings, DEFAULT_SETTINGS.imagePromptPresets, {
      positivePrompt: 'masterpiece, 1girl',
      negativePrompt: 'low quality',
    });

    const loraNode = resolved.workflow['10'] as unknown as { inputs: { text: string } };
    expect(String(loraNode.inputs.text)).toContain('<lora:fresh_lora:0.8>');
    expect(String(loraNode.inputs.text)).not.toContain('stale_lora');
    expect(resolved.snapshot.loras).toEqual([{ name: 'fresh_lora', strength: 0.8 }]);
  });

  it('overwrites workflow lora node and snapshot when loraPreset passed', () => {
    const settings = structuredClone(DEFAULT_SETTINGS.comfyui);
    settings.workflowPresets.presets = [
      {
        id: 'preset-1',
        name: 'SDXL Workflow',
        workflowJson: JSON.stringify({
          '6': {
            class_type: 'CLIPTextEncode',
            inputs: { text: 'positive placeholder' },
            _meta: { cosmosVision: { promptBindings: { text: 'positive' }, imageOutput: true } },
          },
          '10': {
            class_type: 'Lora Loader (LoraManager)',
            inputs: { text: '', loras: { __value__: [] } },
          },
        }),
        favoriteNodeIds: [],
      },
    ];
    settings.workflowPresets.activePresetId = 'preset-1';
    const loraPreset = {
      id: 'lora-preset-random',
      name: 'random',
      loras: [{ id: 'lora-1', name: 'test-lora.safetensors', strength: 0.8, enabled: true }],
    };

    const resolved = buildComfyUIResolvedRequest(
      settings,
      DEFAULT_SETTINGS.imagePromptPresets,
      { positivePrompt: '1girl', negativePrompt: '' },
      [],
      undefined,
      loraPreset,
    );

    expect(resolved.workflow['10'].inputs.text).toBe('<lora:test-lora:0.8>');
    expect(resolved.snapshot.loras).toEqual([{ name: 'test-lora', strength: 0.8 }]);
  });

  it('does not prepend trigger words when the workflow has no lora node', () => {
    const settings = structuredClone(DEFAULT_SETTINGS.comfyui);
    settings.workflowPresets.presets = [
      {
        id: 'preset-1',
        name: 'SDXL Workflow',
        workflowJson: JSON.stringify({
          '6': {
            class_type: 'CLIPTextEncode',
            inputs: { text: 'positive placeholder' },
            _meta: { cosmosVision: { promptBindings: { text: 'positive' }, imageOutput: true } },
          },
        }),
        favoriteNodeIds: [],
      },
    ];
    settings.workflowPresets.activePresetId = 'preset-1';
    settings.loraPresets = createLoraPreset('a.safetensors');

    const resolved = buildComfyUIResolvedRequest(
      settings,
      DEFAULT_SETTINGS.imagePromptPresets,
      { positivePrompt: 'masterpiece, 1girl', negativePrompt: 'low quality' },
      ['triggerA'],
    );

    expect(resolved.snapshot.positivePrompt).toBe('masterpiece, 1girl');
    expect(resolved.snapshot.loras).toEqual([]);
  });

  it('overwrites workflow with explicit snapshot loras array on playback', () => {
    const settings = structuredClone(DEFAULT_SETTINGS.comfyui);
    settings.workflowPresets.presets = [
      {
        id: 'preset-1',
        name: 'SDXL Workflow',
        workflowJson: JSON.stringify({
          '6': {
            class_type: 'CLIPTextEncode',
            inputs: { text: 'positive placeholder' },
            _meta: { cosmosVision: { promptBindings: { text: 'positive' }, imageOutput: true } },
          },
          '10': {
            class_type: 'Lora Loader (LoraManager)',
            inputs: { text: '<lora:old_panel:1.0>', loras: { __value__: [] } },
          },
        }),
        favoriteNodeIds: [],
      },
    ];
    settings.workflowPresets.activePresetId = 'preset-1';
    // 面板激活组为 other_lora
    settings.loraPresets = createLoraPreset('other_lora.safetensors');

    // 显式传入快照 LoRA 列表，回放特定 LoRA
    const resolved = buildComfyUIResolvedRequest(
      settings,
      DEFAULT_SETTINGS.imagePromptPresets,
      { positivePrompt: '1girl', negativePrompt: '' },
      ['playTrigger'],
      undefined,
      [{ name: 'playback_lora', strength: 0.6 }],
    );

    expect(resolved.workflow['10'].inputs.text).toBe('<lora:playback_lora:0.6>');
    expect(resolved.snapshot.loras).toEqual([{ name: 'playback_lora', strength: 0.6 }]);
    expect(resolved.snapshot.positivePrompt).toBe('playTrigger, 1girl');
  });

  it('explicit empty loras array clears node and does not leak panel active preset', () => {
    const settings = structuredClone(DEFAULT_SETTINGS.comfyui);
    settings.workflowPresets.presets = [
      {
        id: 'preset-1',
        name: 'SDXL Workflow',
        workflowJson: JSON.stringify({
          '6': {
            class_type: 'CLIPTextEncode',
            inputs: { text: 'positive placeholder' },
            _meta: { cosmosVision: { promptBindings: { text: 'positive' }, imageOutput: true } },
          },
          '10': {
            class_type: 'Lora Loader (LoraManager)',
            inputs: { text: '<lora:leftover:1.0>', loras: { __value__: [] } },
          },
        }),
        favoriteNodeIds: [],
      },
    ];
    settings.workflowPresets.activePresetId = 'preset-1';
    // 面板激活组包含 active_lora
    settings.loraPresets = createLoraPreset('active_lora.safetensors');

    // 显式传入 []（快照中没有 LoRA）
    const resolved = buildComfyUIResolvedRequest(
      settings,
      DEFAULT_SETTINGS.imagePromptPresets,
      { positivePrompt: '1girl', negativePrompt: '' },
      [],
      undefined,
      [],
    );

    // 节点被清空，快照记录为空，面板激活组未混入
    expect(resolved.workflow['10'].inputs.text).toBe('');
    expect(resolved.snapshot.loras).toEqual([]);
  });

  it('injects preview export node when bound output node is non-output image node', async () => {
    const rawObjectInfo = {
      CLIPTextEncode: {
        output_node: false,
        input: { required: { text: ['STRING', { multiline: true }] } },
        output: ['CONDITIONING'],
      },
      VAEDecodeTiled: {
        output_node: false,
        input: { required: {} },
        output: ['IMAGE'],
      },
    };
    vi.stubGlobal('fetch', createMockFetch(() => ({ json: rawObjectInfo })));
    await fetchComfyUIObjectInfo('http://127.0.0.1:8188');

    const settings = structuredClone(DEFAULT_SETTINGS.comfyui);
    settings.url = 'http://127.0.0.1:8188';
    settings.workflowPresets.presets = [
      {
        id: 'preset-1',
        name: 'Tiled Workflow',
        workflowJson: JSON.stringify({
          '6': {
            class_type: 'CLIPTextEncode',
            inputs: { text: 'positive placeholder' },
            _meta: { cosmosVision: { promptBindings: { text: 'positive' } } },
          },
          '8': {
            class_type: 'VAEDecodeTiled',
            inputs: {},
            _meta: { cosmosVision: { imageOutput: true } },
          },
        }),
        favoriteNodeIds: [],
      },
    ];
    settings.workflowPresets.activePresetId = 'preset-1';

    const resolved = buildComfyUIResolvedRequest(
      settings,
      DEFAULT_SETTINGS.imagePromptPresets,
      { positivePrompt: 'masterpiece', negativePrompt: '' },
    );

    expect(resolved.imageOutputNodeId).toBe('cosmos_vision_export');
    expect(resolved.snapshot.imageOutputNodeId).toBe('8');
    expect(resolved.workflow.cosmos_vision_export).toEqual({
      class_type: 'PreviewImage',
      inputs: { images: ['8', 0] },
    });
  });

  it('fills modelMatch node string with the main model name and strips private meta', () => {
    const settings = structuredClone(DEFAULT_SETTINGS.comfyui);
    settings.workflowPresets.presets = [
      {
        id: 'preset-newgen',
        name: 'Newgen Workflow',
        workflowJson: DEFAULT_COMFYUI_WORKFLOW_K2_ANIMA_JSON,
        favoriteNodeIds: [],
      },
    ];
    settings.workflowPresets.activePresetId = 'preset-newgen';

    const resolved = buildComfyUIResolvedRequest(
      settings,
      DEFAULT_SETTINGS.imagePromptPresets,
      { positivePrompt: 'masterpiece, 1girl', negativePrompt: 'low quality' },
    );

    expect(resolved.workflow['11'].inputs.string).toBe('krea2_turbo_int8_convrot.safetensors');
    expect(resolved.workflow['11']._meta?.cosmosVision).toBeUndefined();
    expect(resolved.workflow['33']._meta?.cosmosVision).toBeUndefined();
    expect(resolved.workflow['20'].inputs.text).toContain('masterpiece, 1girl');
  });
});

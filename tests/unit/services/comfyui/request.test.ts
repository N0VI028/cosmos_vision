import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '@/constants/default-settings';
import { buildComfyUIResolvedRequest } from '@/services/comfyui/request';

/** 构建只含 LoRA 加载节点的激活 LoRA 预设 */
function createLoraPreset(name: string) {
  return {
    activePresetId: 'lora-1',
    presets: [{ id: 'lora-1', name: '组', loras: [{ id: 'l1', name, strength: 1, enabled: true }] }],
  };
}

describe('comfyui request builder', () => {
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
});

import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '@/constants/default-settings';
import { buildComfyUIResolvedRequest } from '@/services/comfyui/request';

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
});

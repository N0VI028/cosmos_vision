import { describe, expect, it } from 'vitest';
import { DEFAULT_COMFYUI_WORKFLOW_JSON } from '@/constants/comfyui';
import { buildComfyUIResolvedRequestFromPrompts } from '@/services/comfyui/request';
import { parseComfyUIWorkflow } from '@/services/comfyui/parse';
import { readImageOutputNodeId, readPromptBindings, readSeedModes } from '@/services/comfyui/meta';

describe('comfyui request builder', () => {
  it('default workflow has bindings, output and seed mode metadata', () => {
    const workflow = parseComfyUIWorkflow(DEFAULT_COMFYUI_WORKFLOW_JSON);
    expect(
      readPromptBindings(workflow)
        .map(item => `${item.nodeId}:${item.binding}`)
        .sort(),
    ).toEqual(['64:positive', '66:negative']);
    expect(readImageOutputNodeId(workflow)).toBe('14');
    expect(readSeedModes(workflow)[0]).toMatchObject({ nodeId: '3', inputName: 'seed', mode: 'randomize' });
  });

  it('writes prompts to bindings, resolves seed and strips private meta', () => {
    const request = buildComfyUIResolvedRequestFromPrompts(
      {
        url: 'http://127.0.0.1:8188/',
        workflowPresets: {
          activePresetId: 'test-workflow',
          presets: [
            { id: 'inactive', name: '未选工作流', workflowJson: '{}' },
            { id: 'test-workflow', name: '测试工作流', workflowJson: DEFAULT_COMFYUI_WORKFLOW_JSON },
          ],
        },
        loraPresets: { activePresetId: 'x', presets: [{ id: 'x', name: 'x', loras: [] }] },
        positivePromptPresetId: 'p',
        negativePromptPresetId: 'n',
      },
      { positivePrompt: 'cat', negativePrompt: 'blur' },
    );

    expect(request.imageOutputNodeId).toBe('14');
    expect(request.workflow['64'].inputs.text).toBe('cat');
    expect(request.workflow['66'].inputs.text).toBe('blur');
    expect(request.workflow['3']._meta?.cosmosVision).toBeUndefined();
    expect(request.snapshot.endpoint).toBe('http://127.0.0.1:8188');
    expect(request.snapshot.seedValues[0]?.mode).toBe('randomize');
  });
});

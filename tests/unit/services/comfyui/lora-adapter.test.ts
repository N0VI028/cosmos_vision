import { describe, expect, it } from 'vitest';
import {
  isSupportedLoraNode,
  readLoraSnapshotsFromWorkflow,
  writeLoraPresetToNode,
} from '@/services/comfyui/lora-adapter';

describe('comfyui lora-adapter', () => {
  const sampleWorkflow = {
    '10': {
      class_type: 'Lora Loader (LoraManager)',
      inputs: {
        text: '<lora:old_lora.safetensors:1.0:1.0>',
        loras: {
          __value__: [
            { name: 'old_lora.safetensors', strength: 1.0, active: true, clipStrength: 1.0, expanded: false },
          ],
        },
      },
    },
  };

  it('checks if node supports lora panel', () => {
    expect(isSupportedLoraNode(sampleWorkflow['10'])).toBe(true);
    expect(isSupportedLoraNode(undefined)).toBe(false);
  });

  it('extracts lora snapshot from workflow object', () => {
    const loras = readLoraSnapshotsFromWorkflow(sampleWorkflow);
    expect(loras).toHaveLength(1);
    expect(loras[0].name).toBe('old_lora.safetensors');
    expect(loras[0].strength).toBe(1.0);
  });

  it('writes lora preset to workflow node', () => {
    const preset = {
      id: 'p1',
      name: 'Preset 1',
      loras: [
        { id: 'l1', name: 'new_lora_a.safetensors', strength: 0.8, enabled: true as const },
      ],
    };
    const node = structuredClone(sampleWorkflow['10']);
    writeLoraPresetToNode(node, preset);

    expect(node.inputs.text).toContain('<lora:new_lora_a:0.8>');
  });
});

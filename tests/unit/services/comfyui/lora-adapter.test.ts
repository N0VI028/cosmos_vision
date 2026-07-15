import { describe, expect, it } from 'vitest';
import { createComfyUILoraPreset, createComfyUILoraSetting } from '@/constants/comfyui';
import {
  findLoraNodeAdapter,
  isSupportedLoraNode,
  readLoraSnapshotsFromWorkflow,
  writeLoraPresetToNode,
} from '@/services/comfyui/lora-adapter';
import type { ComfyUIWorkflowNode } from '@/services/comfyui/types';

describe('comfyui lora adapter', () => {
  it('supports only LoraManager loader', () => {
    expect(findLoraNodeAdapter('Lora Loader (LoraManager)')?.classType).toBe('Lora Loader (LoraManager)');
    expect(findLoraNodeAdapter('LoraLoader')).toBeNull();
    expect(isSupportedLoraNode({ class_type: 'Other', inputs: {} })).toBe(false);
  });

  it('writes empty and multi lora entries with fixed clipStrength', () => {
    const node: ComfyUIWorkflowNode = {
      class_type: 'Lora Loader (LoraManager)',
      inputs: { text: 'old', loras: { __value__: [] } },
    };
    const empty = createComfyUILoraPreset('p1', 'empty', []);
    writeLoraPresetToNode(node, empty);
    expect(node.inputs.text).toBe('');
    expect(node.inputs.loras).toEqual({ __value__: [] });

    const multi = createComfyUILoraPreset('p2', 'multi', [
      createComfyUILoraSetting('1', { name: 'a.safetensors', strength: 0.8, enabled: true }),
      createComfyUILoraSetting('2', { name: 'b.safetensors', strength: 1.25, enabled: false }),
      createComfyUILoraSetting('3', { name: '', strength: 1, enabled: true }),
    ]);
    writeLoraPresetToNode(node, multi);
    expect(node.inputs.text).toBe('<lora:a.safetensors:0.8>');
    const entries = (node.inputs.loras as { __value__: Array<Record<string, unknown>> }).__value__;
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      name: 'a.safetensors',
      strength: 0.8,
      active: true,
      expanded: false,
      clipStrength: 1,
    });
    expect(entries[1].active).toBe(false);
    expect(readLoraSnapshotsFromWorkflow({ '1': node })).toEqual([
      { name: 'a.safetensors', strength: 0.8 },
    ]);
  });
});

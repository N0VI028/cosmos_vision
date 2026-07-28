import { afterEach, describe, expect, it } from 'vitest';
import { applySeedModes, clearSeedRuntimeCounters } from '@/services/comfyui/seed-runtime';
import { setSeedMode } from '@/services/comfyui/meta';
import type { ComfyUIWorkflow } from '@/services/comfyui/types';

describe('comfyui seed-runtime', () => {
  afterEach(() => {
    clearSeedRuntimeCounters();
  });

  it('applies fixed, randomize, increment, and decrement seed modes', () => {
    const workflow: ComfyUIWorkflow = {
      '1': {
        class_type: 'KSampler',
        inputs: { seed: 100 },
      },
    };

    setSeedMode(workflow, '1', 'seed', 'fixed');
    const fixedRes = applySeedModes(structuredClone(workflow), 'fp1');
    expect(fixedRes[0].value).toBe(100);

    setSeedMode(workflow, '1', 'seed', 'randomize');
    const randRes = applySeedModes(structuredClone(workflow), 'fp1');
    expect(randRes[0].value).toBeGreaterThanOrEqual(0);

    setSeedMode(workflow, '1', 'seed', 'increment');
    const inc1 = applySeedModes(structuredClone(workflow), 'fp1');
    const inc2 = applySeedModes(structuredClone(workflow), 'fp1');
    expect(inc1[0].value).toBe(100);
    expect(inc2[0].value).toBe(101);

    setSeedMode(workflow, '1', 'seed', 'decrement');
    const dec1 = applySeedModes(structuredClone(workflow), 'fp2');
    const dec2 = applySeedModes(structuredClone(workflow), 'fp2');
    expect(dec1[0].value).toBe(100);
    expect(dec2[0].value).toBe(99);
  });
});

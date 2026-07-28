import { describe, expect, it } from 'vitest';
import {
  findComfyUIWorkflowPreset,
  getActiveComfyUIWorkflowPreset,
  toggleFavoriteNodeId,
} from '@/services/comfyui/workflow-presets';

describe('comfyui workflow-presets helper', () => {
  const presetsState = {
    activePresetId: 'w1',
    presets: [
      { id: 'w1', name: 'Preset 1', workflowJson: '{}', favoriteNodeIds: ['node-1'] },
      { id: 'w2', name: 'Preset 2', workflowJson: '{}', favoriteNodeIds: [] },
    ],
  };

  it('finds active workflow preset correctly', () => {
    const preset = getActiveComfyUIWorkflowPreset(presetsState);
    expect(preset.id).toBe('w1');
    expect(preset.name).toBe('Preset 1');
  });

  it('finds specific workflow preset by id', () => {
    const preset = findComfyUIWorkflowPreset(presetsState, 'w2');
    expect(preset?.id).toBe('w2');
  });

  it('toggles favorite node id state', () => {
    const added = toggleFavoriteNodeId(['node-1'], 'node-2', true);
    expect(added).toContain('node-2');

    const removed = toggleFavoriteNodeId(added, 'node-2', true);
    expect(removed).not.toContain('node-2');
  });
});

import { describe, expect, it } from 'vitest';
import { layoutWorkflow, extractGraphEdges, extractGraphNodes } from '@/services/comfyui/layout';
import type { ComfyUIWorkflow } from '@/services/comfyui/types';

const branched: ComfyUIWorkflow = {
  a: { class_type: 'A', inputs: {} },
  b: { class_type: 'B', inputs: { in: ['a', 0] } },
  c: { class_type: 'C', inputs: { in: ['a', 0] } },
  d: { class_type: 'D', inputs: { left: ['b', 0], right: ['c', 0] } },
  orphan: { class_type: 'O', inputs: {} },
};

const cyclic: ComfyUIWorkflow = {
  x: { class_type: 'X', inputs: { in: ['y', 0] } },
  y: { class_type: 'Y', inputs: { in: ['x', 0] } },
};

describe('comfyui layout', () => {
  it('builds stable layered layout for branches and orphans', () => {
    const first = layoutWorkflow(branched);
    const second = layoutWorkflow(branched);
    expect(first.nodes.map(node => node.id)).toEqual(second.nodes.map(node => node.id));
    expect(first.nodes.map(node => `${node.id}:${node.x}:${node.y}`)).toEqual(
      second.nodes.map(node => `${node.id}:${node.x}:${node.y}`),
    );
    expect(extractGraphNodes(branched)).toHaveLength(5);
    expect(extractGraphEdges(branched).length).toBeGreaterThan(0);
    expect(first.nodes.find(node => node.id === 'orphan')).toBeTruthy();
  });

  it('places cyclic nodes deterministically', () => {
    const layout = layoutWorkflow(cyclic);
    expect(layout.nodes).toHaveLength(2);
    expect(layout.width).toBeGreaterThan(0);
    expect(layout.height).toBeGreaterThan(0);
  });
});

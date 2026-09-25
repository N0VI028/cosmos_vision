import { describe, expect, it } from 'vitest';
import { ensureImageExportNode } from '@/services/comfyui/export-node';
import type { ComfyUIObjectInfoMap, ComfyUIWorkflow } from '@/services/comfyui/types';

describe('comfyui export-node', () => {
  const mockObjectInfo: ComfyUIObjectInfoMap = {
    SaveImage: {
      classType: 'SaveImage',
      outputNode: true,
      inputs: [{ name: 'images', type: 'IMAGE', required: true }],
      outputs: [],
    },
    PreviewImage: {
      classType: 'PreviewImage',
      outputNode: true,
      inputs: [{ name: 'images', type: 'IMAGE', required: true }],
      outputs: [],
    },
    VAEDecodeTiled: {
      classType: 'VAEDecodeTiled',
      outputNode: false,
      inputs: [],
      outputs: [{ index: 0, name: 'IMAGE', type: 'IMAGE', isList: false }],
    },
    MultiOutputNode: {
      classType: 'MultiOutputNode',
      outputNode: false,
      inputs: [],
      outputs: [
        { index: 0, name: 'LATENT', type: 'LATENT', isList: false },
        { index: 1, name: 'IMAGE', type: 'IMAGE', isList: false },
      ],
    },
    NoImageNode: {
      classType: 'NoImageNode',
      outputNode: false,
      inputs: [],
      outputs: [{ index: 0, name: 'LATENT', type: 'LATENT', isList: false }],
    },
    GenericOutputNode: {
      classType: 'GenericOutputNode',
      outputNode: false,
      inputs: [],
      outputs: [{ index: 0, name: 'output', type: 'COMFY_MATCHTYPE_V3', isList: false }],
    },
    StarAndImageNode: {
      classType: 'StarAndImageNode',
      outputNode: false,
      inputs: [],
      outputs: [
        { index: 0, name: '*', type: '*', isList: false },
        { index: 1, name: 'IMAGE', type: 'IMAGE', isList: false },
      ],
    },
  };

  it('returns original nodeId when node is already an output node', () => {
    const workflow: ComfyUIWorkflow = {
      '9': {
        class_type: 'SaveImage',
        inputs: {},
      },
    };

    const result = ensureImageExportNode(workflow, '9', mockObjectInfo);
    expect(result).toBe('9');
    expect(Object.keys(workflow)).toEqual(['9']);
  });

  it('injects PreviewImage when node is non-output node with index 0 IMAGE output', () => {
    const workflow: ComfyUIWorkflow = {
      '8': {
        class_type: 'VAEDecodeTiled',
        inputs: {},
      },
    };

    const result = ensureImageExportNode(workflow, '8', mockObjectInfo);
    expect(result).toBe('cosmos_vision_export');
    expect(workflow.cosmos_vision_export).toEqual({
      class_type: 'PreviewImage',
      inputs: { images: ['8', 0] },
    });
    expect(workflow.cosmos_vision_export._meta).toBeUndefined();
  });

  it('injects PreviewImage with non-zero output index for multi-output nodes', () => {
    const workflow: ComfyUIWorkflow = {
      '12': {
        class_type: 'MultiOutputNode',
        inputs: {},
      },
    };

    const result = ensureImageExportNode(workflow, '12', mockObjectInfo);
    expect(result).toBe('cosmos_vision_export');
    expect(workflow.cosmos_vision_export).toEqual({
      class_type: 'PreviewImage',
      inputs: { images: ['12', 1] },
    });
  });

  it('injects PreviewImage on generic output port when node has no IMAGE output', () => {
    const workflow: ComfyUIWorkflow = {
      '21': {
        class_type: 'GenericOutputNode',
        inputs: {},
      },
    };

    const result = ensureImageExportNode(workflow, '21', mockObjectInfo);
    expect(result).toBe('cosmos_vision_export');
    expect(workflow.cosmos_vision_export).toEqual({
      class_type: 'PreviewImage',
      inputs: { images: ['21', 0] },
    });
  });

  it('prefers IMAGE output port over earlier generic port', () => {
    const workflow: ComfyUIWorkflow = {
      '22': {
        class_type: 'StarAndImageNode',
        inputs: {},
      },
    };

    const result = ensureImageExportNode(workflow, '22', mockObjectInfo);
    expect(result).toBe('cosmos_vision_export');
    expect(workflow.cosmos_vision_export).toEqual({
      class_type: 'PreviewImage',
      inputs: { images: ['22', 1] },
    });
  });

  it('throws an error when non-output node does not have IMAGE output', () => {
    const workflow: ComfyUIWorkflow = {
      '15': {
        class_type: 'NoImageNode',
        inputs: {},
      },
    };

    expect(() => ensureImageExportNode(workflow, '15', mockObjectInfo)).toThrowError(
      '段落生图结果节点 15（NoImageNode）不产出 IMAGE，无法导出图片',
    );
  });

  it('returns original nodeId when objectInfo is null or node is not found', () => {
    const workflow: ComfyUIWorkflow = {
      '8': {
        class_type: 'VAEDecodeTiled',
        inputs: {},
      },
    };

    expect(ensureImageExportNode(workflow, '8', null)).toBe('8');
    expect(ensureImageExportNode(workflow, 'missing_node', mockObjectInfo)).toBe('missing_node');
    expect(
      ensureImageExportNode(
        { '99': { class_type: 'UnknownNode', inputs: {} } },
        '99',
        mockObjectInfo,
      ),
    ).toBe('99');
  });

  it('appends underscores when export node id already exists in workflow', () => {
    const workflow: ComfyUIWorkflow = {
      '8': {
        class_type: 'VAEDecodeTiled',
        inputs: {},
      },
      cosmos_vision_export: {
        class_type: 'PreviewImage',
        inputs: { images: ['old', 0] },
      },
      cosmos_vision_export_: {
        class_type: 'PreviewImage',
        inputs: { images: ['old2', 0] },
      },
    };

    const result = ensureImageExportNode(workflow, '8', mockObjectInfo);
    expect(result).toBe('cosmos_vision_export__');
    expect(workflow.cosmos_vision_export__).toEqual({
      class_type: 'PreviewImage',
      inputs: { images: ['8', 0] },
    });
  });
});

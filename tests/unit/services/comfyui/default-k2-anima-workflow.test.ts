import { describe, expect, it } from 'vitest';
import {
  DEFAULT_COMFYUI_WORKFLOW_K2_ANIMA_JSON,
  DEFAULT_COMFYUI_WORKFLOW_PRESET_ID,
  DEFAULT_COMFYUI_WORKFLOW_PRESET_ID_K2_ANIMA,
  createComfyUIWorkflowPresetSettings,
} from '@/constants/comfyui';
import { validateImageOutput, validatePromptBindings } from '@/services/comfyui/meta';
import { parseComfyUIWorkflow } from '@/services/comfyui/parse';
import type { ComfyUIWorkflow } from '@/services/comfyui/types';

/** 解析新一代默认工作流 */
function parseK2AnimaWorkflow(): ComfyUIWorkflow {
  return parseComfyUIWorkflow(DEFAULT_COMFYUI_WORKFLOW_K2_ANIMA_JSON);
}

describe('comfyui k2-anima default workflow', () => {
  it('is valid api format json', () => {
    const workflow = parseK2AnimaWorkflow();
    expect(Object.keys(workflow)).toContain('10');
    expect(workflow['10'].class_type).toBe('UNETLoader');
  });

  it('contains a single lora manager loader node', () => {
    const workflow = parseK2AnimaWorkflow();
    const loraNodes = Object.values(workflow).filter(node => node.class_type === 'Lora Loader (LoraManager)');
    expect(loraNodes).toHaveLength(1);
  });

  it('marks exactly one modelMatch node as RegexMatch', () => {
    const workflow = parseK2AnimaWorkflow();
    const matches = Object.entries(workflow).filter(([, node]) => node._meta?.cosmosVision?.modelMatch);
    expect(matches).toHaveLength(1);
    expect(matches[0][1].class_type).toBe('RegexMatch');
  });

  it('routes all switch nodes from the regex match node', () => {
    const workflow = parseK2AnimaWorkflow();
    // 节点表 14/23/26/29/36/39 六个分流：文本编码器、负面条件、步数、CFG、采样器、调度器
    const switches = Object.values(workflow).filter(node => node.class_type === 'ComfySwitchNode');
    expect(switches).toHaveLength(6);
    for (const node of switches) expect(node.inputs.switch).toEqual(['11', 0]);
  });

  it('links ksampler steps and cfg instead of literal values', () => {
    const workflow = parseK2AnimaWorkflow();
    expect(workflow['30'].inputs.steps).toEqual(['26', 0]);
    expect(workflow['30'].inputs.cfg).toEqual(['29', 0]);
  });

  it('links ksampler sampler_name to the euler/er_sde switch', () => {
    const workflow = parseK2AnimaWorkflow();
    expect(workflow['30'].inputs.sampler_name).toEqual(['36', 0]);
    expect(workflow['30'].inputs.scheduler).toEqual(['39', 0]);
    expect(workflow['34'].class_type).toBe('PrimitiveString');
    expect(workflow['34'].inputs.value).toBe('euler');
    expect(workflow['35'].class_type).toBe('PrimitiveString');
    expect(workflow['35'].inputs.value).toBe('er_sde');
    expect(workflow['36'].class_type).toBe('ComfySwitchNode');
    expect(workflow['36'].inputs.on_true).toEqual(['34', 0]);
    expect(workflow['36'].inputs.on_false).toEqual(['35', 0]);
    expect(workflow['37'].class_type).toBe('PrimitiveString');
    expect(workflow['37'].inputs.value).toBe('simple');
    expect(workflow['38'].class_type).toBe('PrimitiveString');
    expect(workflow['38'].inputs.value).toBe('simple');
    expect(workflow['39'].class_type).toBe('ComfySwitchNode');
    expect(workflow['39'].inputs.on_true).toEqual(['37', 0]);
    expect(workflow['39'].inputs.on_false).toEqual(['38', 0]);
  });

  it('passes prompt binding and image output validation', () => {
    const workflow = parseK2AnimaWorkflow();
    expect(validatePromptBindings(workflow)).toBeNull();
    expect(validateImageOutput(workflow)).toBeNull();
  });

  it('is registered as the second default preset without stealing the active one', () => {
    const settings = createComfyUIWorkflowPresetSettings();
    expect(settings.presets.map(preset => preset.id)).toEqual([
      DEFAULT_COMFYUI_WORKFLOW_PRESET_ID,
      DEFAULT_COMFYUI_WORKFLOW_PRESET_ID_K2_ANIMA,
    ]);
    expect(settings.activePresetId).toBe(DEFAULT_COMFYUI_WORKFLOW_PRESET_ID);
    expect(settings.presets[1].workflowJson).toBe(DEFAULT_COMFYUI_WORKFLOW_K2_ANIMA_JSON);
  });
});

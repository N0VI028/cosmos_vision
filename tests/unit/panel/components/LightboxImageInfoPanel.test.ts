import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import type { InlinePromptSnapshot } from '@/composables/inlineImageLightbox';
import LightboxImageInfoPanel from '@/panel/components/LightboxImageInfoPanel.vue';

describe('LightboxImageInfoPanel 组件', () => {
  it('无参数快照时展示未知徽章与暂无生成信息', () => {
    const wrapper = mount(LightboxImageInfoPanel, {
      props: {
        snapshot: undefined,
      },
    });

    expect(wrapper.find('.cv-lightbox-image-info-badge').text()).toBe('未知');
    expect(wrapper.find('.cv-lightbox-image-info-badge').classes()).toContain('badge-unknown');
    expect(wrapper.find('.cv-lightbox-image-info-empty').text()).toBe('暂无生成信息');
    expect(wrapper.findAll('.cv-lightbox-param-row')).toHaveLength(0);
  });

  it('展示 NovelAI 生图元数据行与徽章', () => {
    const snapshot: InlinePromptSnapshot = {
      imageSource: 'novelai',
      novelaiRequest: {
        endpoint: 'https://image.novelai.net',
        accountName: '测试账号',
        model: 'nai-diffusion-4-full',
        width: 832,
        height: 1216,
        sampler: 'k_euler',
        seed: 123456,
        steps: 28,
        guidance: 6,
        autoSampler: true,
        varietyPlus: false,
        smea: true,
        smeaDyn: false,
        decrisp: false,
        legacyPromptMode: false,
        promptGuidanceRescale: 0,
        noiseSchedule: 'karras',
        ucPreset: 0,
        qualityPreset: 'heavy',
        imageCount: 1,
        vibes: {
          count: 1,
          referenceStrengths: [0.7],
          informationExtracted: [1.0],
          resolved: true,
        },
      },
    };

    const wrapper = mount(LightboxImageInfoPanel, {
      props: { snapshot },
    });

    expect(wrapper.find('.cv-lightbox-image-info-badge').text()).toBe('NovelAI');
    expect(wrapper.find('.cv-lightbox-image-info-badge').classes()).toContain('badge-novelai');

    const rows = wrapper.findAll('.cv-lightbox-param-row');
    expect(rows.length).toBeGreaterThan(10);

    const rowTexts = rows.map(r => ({
      label: r.find('.cv-lightbox-param-label').text(),
      value: r.find('.cv-lightbox-param-value').text(),
    }));

    expect(rowTexts).toContainEqual({ label: '账号名称', value: '测试账号' });
    expect(rowTexts).toContainEqual({ label: '模型', value: 'nai-diffusion-4-full' });
    expect(rowTexts).toContainEqual({ label: '图像尺寸', value: '832x1216' });
    expect(rowTexts).toContainEqual({ label: 'Seed', value: '123456' });
    expect(rowTexts).toContainEqual({ label: 'SMEA', value: '开启' });
    expect(rowTexts).toContainEqual({ label: 'DYN', value: '关闭' });
    expect(rowTexts).toContainEqual({ label: 'Vibe', value: '1 个（已解析）' });
  });

  it('展示 ComfyUI 生图元数据行与徽章', () => {
    const snapshot: InlinePromptSnapshot = {
      imageSource: 'comfyui',
      comfyui: {
        endpoint: 'http://127.0.0.1:8188',
        positivePrompt: 'comfy pos',
        negativePrompt: 'comfy neg',
        imageOutputNodeId: '9',
        promptBindings: [{ nodeId: '6', inputName: 'text', binding: 'positive' }],
        seedValues: [{ nodeId: '3', inputName: 'seed', mode: 'fixed', value: 42 }],
        imageBindings: [],
        loras: [{ name: 'test_lora.safetensors', strength: 0.8 }],
        loraPresetId: 'preset-1',
      },
    };

    const wrapper = mount(LightboxImageInfoPanel, {
      props: { snapshot },
    });

    expect(wrapper.find('.cv-lightbox-image-info-badge').text()).toBe('ComfyUI');
    expect(wrapper.find('.cv-lightbox-image-info-badge').classes()).toContain('badge-comfyui');

    const rows = wrapper.findAll('.cv-lightbox-param-row');
    const rowTexts = rows.map(r => ({
      label: r.find('.cv-lightbox-param-label').text(),
      value: r.find('.cv-lightbox-param-value').text(),
    }));

    expect(rowTexts).toContainEqual({ label: '接口地址', value: 'http://127.0.0.1:8188/prompt' });
    expect(rowTexts).toContainEqual({ label: '段落生图结果节点', value: '9' });
    expect(rowTexts).toContainEqual({ label: '提示词绑定', value: '6.text=positive' });
    expect(rowTexts).toContainEqual({ label: 'Seed', value: '3.seed:fixed=42' });
    expect(rowTexts).toContainEqual({ label: '启用 LoRA', value: 'test_lora (0.8)' });
    expect(rowTexts).toContainEqual({ label: 'LoRA 预设组 ID', value: 'preset-1' });
  });
});

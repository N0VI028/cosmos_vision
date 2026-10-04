import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import {
  closeInlineImageLightbox,
  inlineLightboxState,
  openInlineImageLightbox,
  type InlinePromptSnapshot,
} from '@/composables/inlineImageLightbox';
import InlineImageLightbox from '@/panel/components/InlineImageLightbox.vue';

const snapshot: InlinePromptSnapshot = {
  positivePrompt: '1girl, masterpiece',
  negativePrompt: 'lowres',
};

let currentWrapper: ReturnType<typeof mount> | null = null;

/**
 * 挂载灯箱组件（含 Pinia 与 Teleport 处理）
 */
function mountLightbox() {
  currentWrapper?.unmount();
  currentWrapper = mount(InlineImageLightbox, {
    global: {
      stubs: { teleport: true },
    },
  });
  return currentWrapper;
}

describe('InlineImageLightbox 组件', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    closeInlineImageLightbox();
  });

  afterEach(async () => {
    currentWrapper?.unmount();
    currentWrapper = null;
    closeInlineImageLightbox();
    await nextTick();
    vi.restoreAllMocks();
  });

  it('关闭状态不渲染灯箱内容', () => {
    const wrapper = mountLightbox();
    expect(wrapper.find('.cv-lightbox-overlay').exists()).toBe(false);
  });

  it('打开后渲染图片与缩放按钮', async () => {
    const wrapper = mountLightbox();
    openInlineImageLightbox('https://example.com/a.png', snapshot);
    await wrapper.vm.$nextTick();

    const img = wrapper.find('img');
    expect(img.exists()).toBe(true);
    expect(img.attributes('src')).toBe('https://example.com/a.png');
    expect(wrapper.findAll('.p-gallery-action')).toHaveLength(2);
  });

  it('点击关闭按钮后状态置为关闭', async () => {
    const wrapper = mountLightbox();
    openInlineImageLightbox('https://example.com/a.png', snapshot);
    await wrapper.vm.$nextTick();

    await wrapper.find('.cv-lightbox-close').trigger('click');
    expect(inlineLightboxState.open).toBe(false);
  });

  it('复制按钮调用剪贴板写入', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    const wrapper = mountLightbox();
    openInlineImageLightbox('https://example.com/a.png', snapshot);
    await wrapper.vm.$nextTick();

    // 面板默认折叠，先展开再点击正面提示词复制按钮
    await wrapper.find('.cv-lightbox-toggle-btn').trigger('click');
    const copyBtns = wrapper.findAll('.cv-lightbox-copy-btn');
    await copyBtns[0].trigger('click');

    expect(writeText).toHaveBeenCalledWith('1girl, masterpiece');
  });

  it('zoom 按钮初始态：zoom-out 禁用、zoom-in 可用', async () => {
    const wrapper = mountLightbox();
    openInlineImageLightbox('https://example.com/a.png', snapshot);
    await wrapper.vm.$nextTick();

    const actions = wrapper.findAll('.p-gallery-action');
    const zoomIn = actions.find(a => a.attributes('data-action') === 'zoom-in')!;
    const zoomOut = actions.find(a => a.attributes('data-action') === 'zoom-out')!;

    expect(zoomIn.attributes('disabled')).toBeUndefined();
    expect(zoomOut.attributes('disabled')).toBeDefined();
  });

  it('ComfyUI 新快照（无顶层字段）正确从 comfyui 子对象回显提示词', async () => {
    const modernSnapshot: InlinePromptSnapshot = {
      imageSource: 'comfyui',
      comfyui: {
        endpoint: 'http://127.0.0.1:8188',
        positivePrompt: 'comfyui modern positive',
        negativePrompt: 'comfyui modern negative',
        imageOutputNodeId: '9',
        promptBindings: [],
        seedValues: [],
        imageBindings: [],
        loras: [],
      },
    };

    const wrapper = mountLightbox();
    openInlineImageLightbox('https://example.com/a.png', modernSnapshot);
    await wrapper.vm.$nextTick();

    await wrapper.find('.cv-lightbox-toggle-btn').trigger('click');
    const promptContents = wrapper.findAll('.cv-lightbox-prompt-content');
    expect(promptContents[0].text()).toBe('comfyui modern positive');
    expect(promptContents[1].text()).toBe('comfyui modern negative');
  });

  it('点击图片信息按钮切换元数据面板显隐，重新打开灯箱时重置为隐藏', async () => {
    const wrapper = mountLightbox();
    openInlineImageLightbox('https://example.com/a.png', snapshot);
    await wrapper.vm.$nextTick();

    const infoBtn = wrapper.find('.cv-lightbox-info-toggle');
    expect(infoBtn.exists()).toBe(true);
    expect(wrapper.findComponent({ name: 'LightboxImageInfoPanel' }).exists()).toBe(false);

    await infoBtn.trigger('click');
    expect(wrapper.findComponent({ name: 'LightboxImageInfoPanel' }).exists()).toBe(true);
    expect(infoBtn.classes()).toContain('active');

    await infoBtn.trigger('click');
    expect(wrapper.findComponent({ name: 'LightboxImageInfoPanel' }).exists()).toBe(false);
    expect(infoBtn.classes()).not.toContain('active');

    // 重新打开灯箱重置为隐藏
    await infoBtn.trigger('click');
    expect(wrapper.findComponent({ name: 'LightboxImageInfoPanel' }).exists()).toBe(true);
    closeInlineImageLightbox();
    await wrapper.vm.$nextTick();
    openInlineImageLightbox('https://example.com/b.png', snapshot);
    await wrapper.vm.$nextTick();
    expect(wrapper.findComponent({ name: 'LightboxImageInfoPanel' }).exists()).toBe(false);
  });

  it('信息面板展开时按 ESC 优先关闭面板，面板已关闭时按 ESC 关闭灯箱', async () => {
    const wrapper = mountLightbox();
    openInlineImageLightbox('https://example.com/a.png', snapshot);
    await wrapper.vm.$nextTick();

    // 展开信息面板
    await wrapper.find('.cv-lightbox-info-toggle').trigger('click');
    expect(wrapper.findComponent({ name: 'LightboxImageInfoPanel' }).exists()).toBe(true);

    // 首次按 ESC：仅关闭信息面板，灯箱保持开启
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await wrapper.vm.$nextTick();
    expect(wrapper.findComponent({ name: 'LightboxImageInfoPanel' }).exists()).toBe(false);
    expect(inlineLightboxState.open).toBe(true);

    // 再次按 ESC：关闭灯箱
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await wrapper.vm.$nextTick();
    expect(inlineLightboxState.open).toBe(false);
  });
});

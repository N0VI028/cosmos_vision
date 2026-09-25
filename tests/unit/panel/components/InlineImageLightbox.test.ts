import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

/**
 * 挂载灯箱组件（含 Pinia 与 Teleport 处理）
 */
function mountLightbox() {
  return mount(InlineImageLightbox, {
    global: {
      stubs: { teleport: true },
    },
  });
}

describe('InlineImageLightbox 组件', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    closeInlineImageLightbox();
  });

  afterEach(() => {
    closeInlineImageLightbox();
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
});

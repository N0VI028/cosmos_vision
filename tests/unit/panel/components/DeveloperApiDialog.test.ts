import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import PrimeVue from 'primevue/config';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';

import { API_DOC_MARKDOWN } from '@/api/doc';
import DeveloperApiDialog from '@/panel/components/onboarding/DeveloperApiDialog.vue';
import { MINIMUM_TAVERN_HELPER_VERSION } from '@/services/tavern-helper/availability';

describe('DeveloperApiDialog 组件', () => {
  const originalTavernHelper = (globalThis as any).TavernHelper;

  beforeEach(() => {
    setActivePinia(createPinia());
    vi.useFakeTimers();
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    (globalThis as any).TavernHelper = originalTavernHelper;
  });

  it('TavernHelper 可用时通过 v-html 容器渲染其 formatAsDisplayedMessage 返回值', async () => {
    const mockHtml = '<div class="st-rendered-doc"><h1 id="title">CosmosVision 对外 API 文档</h1><p>正文内容</p></div>';
    const formatAsDisplayedMessage = vi.fn().mockReturnValue(mockHtml);
    (globalThis as any).TavernHelper = {
      getTavernHelperVersion: () => MINIMUM_TAVERN_HELPER_VERSION,
      formatAsDisplayedMessage,
    };

    const wrapper = mount(DeveloperApiDialog, {
      props: {
        visible: true,
      },
      attachTo: document.body,
      global: {
        plugins: [PrimeVue],
      },
    });
    await nextTick();

    expect(formatAsDisplayedMessage).toHaveBeenCalledWith(API_DOC_MARKDOWN);

    const renderedContainer = document.body.querySelector('.cv-developer-api-content');
    expect(renderedContainer).not.toBeNull();
    expect(renderedContainer?.innerHTML).toBe(mockHtml);

    // 回退的 pre 元素不应被渲染
    const pre = document.body.querySelector('pre');
    expect(pre).toBeNull();

    wrapper.unmount();
  });

  it('TavernHelper 不可用时回退渲染 pre 元素显示 markdown 源文本', async () => {
    delete (globalThis as any).TavernHelper;

    const wrapper = mount(DeveloperApiDialog, {
      props: {
        visible: true,
      },
      attachTo: document.body,
      global: {
        plugins: [PrimeVue],
      },
    });
    await nextTick();

    const renderedContainer = document.body.querySelector('.cv-developer-api-content');
    expect(renderedContainer).toBeNull();

    const pre = document.body.querySelector('pre');
    expect(pre).not.toBeNull();
    expect(pre?.textContent).toBe(API_DOC_MARKDOWN);
    wrapper.unmount();
  });

  it('点击复制按钮触发剪贴板写入并展示 1.5s 状态反馈', async () => {
    const wrapper = mount(DeveloperApiDialog, {
      props: {
        visible: true,
      },
      attachTo: document.body,
      global: {
        plugins: [PrimeVue],
      },
    });
    await nextTick();

    const copyBtn = document.body.querySelector<HTMLButtonElement>('.cv-developer-api-copy-btn');
    expect(copyBtn).not.toBeNull();
    expect(copyBtn?.textContent).toContain('一键复制全部');

    copyBtn?.click();
    await flushPromises();

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(API_DOC_MARKDOWN);
    expect(copyBtn?.textContent).toContain('已复制');

    // 1500ms 后恢复
    vi.advanceTimersByTime(1500);
    await nextTick();
    expect(copyBtn?.textContent).toContain('一键复制全部');

    wrapper.unmount();
  });
});

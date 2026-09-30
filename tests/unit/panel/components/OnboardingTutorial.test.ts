import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import PrimeVue from 'primevue/config';
import { beforeEach, describe, expect, it } from 'vitest';
import { nextTick } from 'vue';

import OnboardingTutorial from '@/panel/components/onboarding/OnboardingTutorial.vue';
import type { TutorialStep } from '@/panel/components/onboarding/tutorial-steps';

const mockSelectionStep: TutorialStep = {
  id: 'source-selection',
  title: '选择主要生图图源',
  description: '请选择你想主要使用的生图后端',
  scene: { kind: 'selection' },
  target: { selectors: ['body'] },
};

describe('OnboardingTutorial 选择界面与开发者入口', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  async function mountTutorial(props: Partial<InstanceType<typeof OnboardingTutorial>['$props']> = {}) {
    const wrapper = mount(OnboardingTutorial, {
      props: {
        step: mockSelectionStep,
        selectedSource: null,
        stepNumber: 1,
        totalSteps: 10,
        canPrevious: false,
        canNext: true,
        isLastStep: false,
        darkMode: false,
        ...props,
      },
      attachTo: document.body,
      global: {
        plugins: [PrimeVue],
      },
    });
    // 等待两次 requestAnimationFrame 动画帧使 layoutReady 变为 true
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    await nextTick();
    return wrapper;
  }

  it('首屏选择界面存在 API 接口选项且带有 fa-code 图标与正确的 aria-label', async () => {
    const wrapper = await mountTutorial();
    const devBtn = document.body.querySelector<HTMLButtonElement>('.cv-onboarding__developer-btn');
    expect(devBtn).not.toBeNull();
    expect(devBtn?.textContent).toContain('API接口');
    expect(devBtn?.getAttribute('aria-label')).toBe('API 接口文档');

    const icon = devBtn?.querySelector('.fa-code');
    expect(icon).not.toBeNull();
    wrapper.unmount();
  });

  it('点击 API 接口选项触发 open-api-doc 事件且不触发 select-source 事件', async () => {
    const wrapper = await mountTutorial();
    const devBtn = document.body.querySelector<HTMLButtonElement>('.cv-onboarding__developer-btn');
    expect(devBtn).not.toBeNull();

    devBtn?.click();
    await nextTick();

    // 触发 open-api-doc 事件通知宿主退出教程并打开文档弹窗
    expect(wrapper.emitted('open-api-doc')).toBeDefined();
    expect(wrapper.emitted('open-api-doc')?.length).toBe(1);

    // 不进入教程步骤，不修改任何源配置（无 select-source emit）
    expect(wrapper.emitted('select-source')).toBeUndefined();

    wrapper.unmount();
  });

  it('点击 NovelAI / ComfyUI 选项仍正常触发 select-source 事件', async () => {
    const wrapper = await mountTutorial();
    const buttons = Array.from(document.body.querySelectorAll<HTMLButtonElement>('button'));
    const novelAiBtn = buttons.find(b => b.textContent?.includes('NovelAI'));
    expect(novelAiBtn).toBeDefined();

    novelAiBtn?.click();
    await nextTick();
    expect(wrapper.emitted('select-source')).toEqual([['novelai']]);

    wrapper.unmount();
  });
});

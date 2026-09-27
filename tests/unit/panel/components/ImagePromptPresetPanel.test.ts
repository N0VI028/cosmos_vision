import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import PrimeVue from 'primevue/config';
import { beforeEach, describe, expect, it } from 'vitest';
import { nextTick } from 'vue';
import { DEFAULT_NEGATIVE_PROMPT_PRESET_ID, DEFAULT_POSITIVE_PROMPT_PRESET_ID, DEFAULT_SETTINGS } from '@/constants/default-settings';
import type { ImagePromptPresetSettings } from '@/constants/image-prompt';
import ImagePromptPresetPanel from '@/panel/components/ImagePromptPresetPanel.vue';

/**
 * 挂载生图提示词预设面板
 * @param presetSettings 面板接收的预设设置
 * @returns 挂载后的包装器
 */
function mountPanel(presetSettings: ImagePromptPresetSettings = DEFAULT_SETTINGS.imagePromptPresets) {
  return mount(ImagePromptPresetPanel, {
    props: {
      presetSettings,
      positivePresetId: DEFAULT_POSITIVE_PROMPT_PRESET_ID,
      negativePresetId: DEFAULT_NEGATIVE_PROMPT_PRESET_ID,
    },
    attachTo: document.body,
    global: {
      plugins: [PrimeVue],
    },
  });
}

/**
 * 读取面板最近一次提交的预设设置
 * @param wrapper 面板包装器
 * @returns 提交的预设设置
 */
function lastEmittedSettings(wrapper: ReturnType<typeof mountPanel>): ImagePromptPresetSettings {
  return wrapper.emitted('update:presetSettings')!.at(-1)![0] as ImagePromptPresetSettings;
}

describe('ImagePromptPresetPanel 预设删除', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('删除默认预设不再被拦截', async () => {
    const wrapper = mountPanel();
    await nextTick();

    (wrapper.vm as any).deletePromptPreset('positive', DEFAULT_POSITIVE_PROMPT_PRESET_ID);

    expect(lastEmittedSettings(wrapper).positive).toEqual([]);
    expect((globalThis as any).toastr.warning).not.toHaveBeenCalledWith('默认预设不能删除');
  });
});

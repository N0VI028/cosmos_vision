import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import PrimeVue from 'primevue/config';
import { beforeEach, describe, expect, it } from 'vitest';
import { nextTick } from 'vue';
import { createImagePromptPreset } from '@/constants/image-prompt';
import TextInputDialog from '@/panel/components/TextInputDialog.vue';
import { useSettingsStore } from '@/store/settings';

/**
 * 挂载文本输入弹窗组件
 * @param props 覆盖属性
 * @returns 挂载后的包装器
 */
function mountDialog(props: Record<string, any> = {}) {
  return mount(TextInputDialog, {
    props: {
      visible: true,
      value: 'template one, pristine pos',
      secondaryValue: 'pristine neg, no bad stuff',
      positivePresetId: 'P1',
      negativePresetId: 'N1',
      positiveCore: 'pristine pos',
      negativeCore: 'pristine neg',
      title: '编辑提示词后生图',
      message: '测试弹窗',
      primaryLabel: '正面提示词',
      secondaryLabel: '负面提示词',
      enablePresetSelector: true,
      ...props,
    },
    attachTo: document.body,
    global: {
      plugins: [PrimeVue],
    },
  });
}

describe('TextInputDialog 弹窗预设切换与整体文本联动', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    const { settings } = useSettingsStore();
    settings.imagePromptPresets.positive = [
      createImagePromptPreset('P1', 'P1', 'template one, '),
      createImagePromptPreset('P2', 'P2', 'template two, '),
    ];
    settings.imagePromptPresets.negative = [
      { id: 'N1', name: 'N1', text: ', no bad stuff', placeholderOffset: 0 },
      { id: 'N2', name: 'N2', text: ', other bad stuff', placeholderOffset: 0 },
    ];
  });

  it('切换正面预设下拉后正面 Textarea 值变为「新模板 + pristine core」', async () => {
    const wrapper = mountDialog();
    await nextTick();

    const textareas = document.querySelectorAll<HTMLTextAreaElement>('textarea');
    expect(textareas.length).toBeGreaterThanOrEqual(2);
    expect(textareas[0].value).toBe('template one, pristine pos');

    // 切换正面预设为 P2
    await wrapper.setProps({ positivePresetId: 'P2' });
    await nextTick();

    expect(textareas[0].value).toBe('template two, pristine pos');
    expect(wrapper.emitted('update:value')?.at(-1)).toEqual(['template two, pristine pos']);
  });

  it('正面预设切回原样变回裸 core', async () => {
    const wrapper = mountDialog();
    await nextTick();

    const textareas = document.querySelectorAll<HTMLTextAreaElement>('textarea');

    // 切回原样（空字符串）
    await wrapper.setProps({ positivePresetId: '' });
    await nextTick();

    expect(textareas[0].value).toBe('pristine pos');
    expect(wrapper.emitted('update:value')?.at(-1)).toEqual(['pristine pos']);
  });

  it('负面侧对称：切换负面预设变为新模板+pristine，切回原样变回裸 core', async () => {
    const wrapper = mountDialog();
    await nextTick();

    const textareas = document.querySelectorAll<HTMLTextAreaElement>('textarea');
    expect(textareas.length).toBeGreaterThanOrEqual(2);
    expect(textareas[1].value).toBe('pristine neg, no bad stuff');

    // 切换负面预设为 N2
    await wrapper.setProps({ negativePresetId: 'N2' });
    await nextTick();

    expect(textareas[1].value).toBe('pristine neg, other bad stuff');
    expect(wrapper.emitted('update:secondaryValue')?.at(-1)).toEqual(['pristine neg, other bad stuff']);

    // 切回原样
    await wrapper.setProps({ negativePresetId: '' });
    await nextTick();

    expect(textareas[1].value).toBe('pristine neg');
    expect(wrapper.emitted('update:secondaryValue')?.at(-1)).toEqual(['pristine neg']);
  });

  it('单字段流程（无预设选择器）下预设 id 重置为空不清空已回填的 value', async () => {
    const wrapper = mountDialog({
      enablePresetSelector: false,
      positivePresetId: 'P1',
      positiveCore: '',
      value: '上次追加要求',
    });
    await nextTick();

    const textareas = document.querySelectorAll<HTMLTextAreaElement>('textarea');
    expect(textareas[0].value).toBe('上次追加要求');

    // 父组件重置弹窗 state，positivePresetId 从 'P1' 变为 ''
    await wrapper.setProps({ positivePresetId: '' });
    await nextTick();

    expect(textareas[0].value).toBe('上次追加要求');
  });
});

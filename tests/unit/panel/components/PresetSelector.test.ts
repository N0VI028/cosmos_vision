import { mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import { describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import PresetSelector from '@/panel/components/PresetSelector.vue';

/**
 * 挂载预设选择器
 * @param props 覆盖属性
 * @param showConfirm 二次确认实现
 * @returns 挂载后的包装器
 */
function mountSelector(props: Record<string, unknown> = {}, showConfirm = vi.fn().mockResolvedValue(true)) {
  return mount(PresetSelector, {
    props: {
      presets: [
        { id: 'default-preset', name: '默认预设' },
        { id: 'custom-preset', name: '自定义预设' },
      ],
      activePresetId: 'default-preset',
      showPortability: true,
      ...props,
    },
    attachTo: document.body,
    global: {
      plugins: [PrimeVue],
      provide: { showConfirm },
    },
  });
}

/**
 * 点击工具条上指定 title 的迷你按钮
 * @param title 按钮 title
 */
async function clickAction(title: string): Promise<void> {
  const button = [...document.body.querySelectorAll('button')].find(item => item.title === title);
  if (!button) throw new Error(`未找到按钮：${title}`);
  button.click();
  await nextTick();
  await nextTick();
}

describe('PresetSelector 预设工具条', () => {
  it('默认预设不再受删除保护，确认后抛出删除事件', async () => {
    const showConfirm = vi.fn().mockResolvedValue(true);
    const wrapper = mountSelector({ activePresetId: 'default-preset' }, showConfirm);

    await clickAction('删除当前预设');

    expect(showConfirm).toHaveBeenCalled();
    expect(wrapper.emitted('delete-preset')).toEqual([['default-preset']]);
  });

  it('取消二次确认时不删除预设', async () => {
    const wrapper = mountSelector({}, vi.fn().mockResolvedValue(false));

    await clickAction('删除当前预设');

    expect(wrapper.emitted('delete-preset')).toBeUndefined();
  });

  it('仅剩一个预设时保留至少一个的约束', async () => {
    const showConfirm = vi.fn().mockResolvedValue(true);
    const wrapper = mountSelector(
      { presets: [{ id: 'default-preset', name: '默认预设' }], activePresetId: 'default-preset' },
      showConfirm,
    );

    await clickAction('删除当前预设');

    expect(showConfirm).not.toHaveBeenCalled();
    expect(wrapper.emitted('delete-preset')).toBeUndefined();
    expect((globalThis as any).toastr.warning).toHaveBeenCalledWith('至少保留一个预设');
  });

  it('弹窗模式下点击导入按钮抛出 import-click 事件而非文件选择器', async () => {
    const wrapper = mountSelector({ importViaDialog: true });
    const clickSpy = vi.spyOn(wrapper.find('input[type="file"]').element as HTMLInputElement, 'click').mockImplementation(() => {});

    await clickAction('导入预设');

    expect(wrapper.emitted('import-click')).toHaveLength(1);
    expect(clickSpy).not.toHaveBeenCalled();
  });

  it('文件模式下点击导入按钮调起本地文件选择器', async () => {
    const wrapper = mountSelector({ importViaDialog: false });
    const clickSpy = vi.spyOn(wrapper.find('input[type="file"]').element as HTMLInputElement, 'click').mockImplementation(() => {});

    await clickAction('导入预设');

    expect(clickSpy).toHaveBeenCalled();
    expect(wrapper.emitted('import-click')).toBeUndefined();
  });
});

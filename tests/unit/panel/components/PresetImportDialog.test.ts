import { mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import { describe, expect, it } from 'vitest';
import { nextTick } from 'vue';
import PresetImportDialog from '@/panel/components/PresetImportDialog.vue';

const DEFAULTS = [
  { id: 'default-a', name: '默认预设 A', description: '示例模板' },
  { id: 'default-b', name: '默认预设 B' },
];

/**
 * 挂载导入预设弹窗（内容经 Teleport 渲染到 body）
 * @param props 覆盖属性
 * @returns 挂载后的包装器
 */
function mountDialog(props: Record<string, unknown> = {}) {
  return mount(PresetImportDialog, {
    props: {
      visible: true,
      title: '导入测试预设',
      defaults: DEFAULTS,
      existingIds: [],
      ...props,
    },
    attachTo: document.body,
    global: {
      plugins: [PrimeVue],
    },
  });
}

/**
 * 读取弹窗内的全部文本
 * @returns 弹窗文本
 */
function dialogText(): string {
  return document.body.textContent ?? '';
}

/**
 * 按文本查找弹窗内的按钮
 * @param text 按钮文本片段
 * @returns 按钮元素
 */
function findButton(text: string): HTMLButtonElement {
  const button = [...document.body.querySelectorAll('button')].find(item => item.textContent?.includes(text));
  if (!button) throw new Error(`未找到按钮：${text}`);
  return button;
}

describe('PresetImportDialog 导入预设弹窗', () => {
  it('入口态展示导入文件与导入默认预设两个按钮', async () => {
    mountDialog();
    await nextTick();

    expect(dialogText()).toContain('导入文件');
    expect(dialogText()).toContain('导入默认预设');
  });

  it('点击导入默认预设进入列表态，默认只勾选当前不存在的默认预设', async () => {
    mountDialog({ existingIds: ['default-b'] });
    await nextTick();

    findButton('导入默认预设').click();
    await nextTick();

    expect(dialogText()).toContain('已选 1 / 共 2');
    expect(dialogText()).toContain('已存在，导入将恢复初始内容');
    // 已存在条目的副标题被恢复提示取代，未存在条目回退到描述或内置文案
    expect(dialogText()).toContain('示例模板');
  });

  it('缺少描述的默认预设回退到内置默认预设文案', async () => {
    mountDialog();
    await nextTick();

    findButton('导入默认预设').click();
    await nextTick();

    expect(dialogText()).toContain('内置默认预设');
  });

  it('确认后抛出勾选的默认预设 ID 并关闭弹窗', async () => {
    const wrapper = mountDialog({ existingIds: ['default-a'] });
    await nextTick();
    findButton('导入默认预设').click();
    await nextTick();

    findButton('导入所选').click();
    await nextTick();

    expect(wrapper.emitted('import-defaults')).toEqual([[['default-b']]]);
    expect(wrapper.emitted('update:visible')).toEqual([[false]]);
  });

  it('未勾选任何条目时确认按钮禁用', async () => {
    mountDialog({ existingIds: ['default-a', 'default-b'] });
    await nextTick();
    findButton('导入默认预设').click();
    await nextTick();

    expect(dialogText()).toContain('已选 0 / 共 2');
    expect(findButton('导入所选').disabled).toBe(true);
  });

  it('勾选已存在的默认预设后可一并导入以恢复初始内容', async () => {
    const wrapper = mountDialog({ existingIds: ['default-a'] });
    await nextTick();
    findButton('导入默认预设').click();
    await nextTick();

    const selectAll = [...document.body.querySelectorAll('input[type="checkbox"]')][0] as HTMLInputElement;
    selectAll.click();
    await nextTick();

    findButton('导入所选').click();
    await nextTick();

    expect(wrapper.emitted('import-defaults')).toEqual([[['default-a', 'default-b']]]);
  });

  it('选择本地文件后抛出文件并关闭弹窗', async () => {
    const wrapper = mountDialog();
    await nextTick();

    const file = new File(['{}'], 'preset.json', { type: 'application/json' });
    const input = document.body.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change'));
    await nextTick();

    expect(wrapper.emitted('import-file')).toEqual([[file]]);
    expect(wrapper.emitted('update:visible')).toEqual([[false]]);
  });

  it('重新打开弹窗时回到入口态', async () => {
    const wrapper = mountDialog();
    await nextTick();
    findButton('导入默认预设').click();
    await nextTick();
    expect(dialogText()).toContain('全选');

    await wrapper.setProps({ visible: false });
    await wrapper.setProps({ visible: true });
    await nextTick();

    expect(dialogText()).not.toContain('全选');
    expect(dialogText()).toContain('导入文件');
  });
});

import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import PrimeVue from 'primevue/config';
import { beforeEach, describe, expect, it } from 'vitest';
import { nextTick } from 'vue';
import { createRandomPresetPool } from '@/constants/random-preset-pool';
import RandomPresetPoolPanel from '@/panel/components/RandomPresetPoolPanel.vue';
import { useSettingsStore } from '@/store/settings';

/**
 * 挂载随机预设池面板
 * @param source 图像源（默认 comfyui，可覆盖全部池类型与选项）
 * @returns 组件包装器
 */
function mountPanel(source: 'novelai' | 'comfyui' = 'comfyui') {
  return mount(RandomPresetPoolPanel, {
    props: { source },
    global: {
      plugins: [PrimeVue],
    },
  });
}

describe('RandomPresetPoolPanel 组件', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('空池时仍展示添加预设池按钮', () => {
    const { settings } = useSettingsStore();
    settings.randomPresetPools.pools = [];
    const wrapper = mountPanel();

    expect(wrapper.text()).toContain('添加预设池');
  });

  it('点击添加按钮后向 settings.randomPresetPools.pools 添加新池', async () => {
    const { settings } = useSettingsStore();
    settings.randomPresetPools.pools = [];
    const wrapper = mountPanel();

    const addBtn = wrapper.findComponent({ name: 'CvAddEntryButton' });
    expect(addBtn.exists()).toBe(true);
    await addBtn.trigger('click');

    expect(settings.randomPresetPools.pools).toHaveLength(1);
    expect(settings.randomPresetPools.pools[0].name).toBe('新预设池');
    expect(settings.randomPresetPools.pools[0].side).toBe('positive');
  });

  it('删除预设池时正确移除指定条目', async () => {
    const { settings } = useSettingsStore();
    const pool1 = createRandomPresetPool('pool-1', { name: 'Pool 1' });
    const pool2 = createRandomPresetPool('pool-2', { name: 'Pool 2' });
    settings.randomPresetPools.pools = [pool1, pool2];

    const wrapper = mountPanel();
    // title 经 $attrs 透传落在内部原生 button 上，按 title 过滤出删除按钮（标题行还有重命名按钮）
    const deleteBtns = wrapper.findAll('button').filter(btn => btn.attributes('title') === '删除预设池');
    expect(deleteBtns.length).toBe(2);

    // 删除第一个池
    await deleteBtns[0].trigger('click');
    expect(settings.randomPresetPools.pools).toHaveLength(1);
    expect(settings.randomPresetPools.pools[0].id).toBe('pool-2');
  });

  it('切换范围时自动剔除非当前范围的预设 ID', async () => {
    const { settings } = useSettingsStore();
    settings.imagePromptPresets.positive = [{ id: 'pos-1', name: 'Pos 1', text: 'prompt 1', placeholderOffset: 0 }];
    settings.imagePromptPresets.negative = [{ id: 'neg-1', name: 'Neg 1', text: 'neg 1', placeholderOffset: 0 }];
    const pool = createRandomPresetPool('pool-1', {
      name: 'Pool 1',
      side: 'positive',
      presetIds: ['pos-1'],
    });
    settings.randomPresetPools.pools = [pool];

    const wrapper = mountPanel();
    // 切换到 negative
    (wrapper.vm as any).handleSideChange(pool, 'negative');

    expect(pool.side).toBe('negative');
    expect(pool.presetIds).toEqual([]);
  });

  it('标题行重命名：点击笔按钮进入编辑，回车后写回名称且不翻转折叠状态', async () => {
    const { settings } = useSettingsStore();
    const pool = createRandomPresetPool('pool-1', { name: '旧名称' });
    settings.randomPresetPools.pools = [pool];

    const wrapper = mountPanel();
    // 展开面板（改名入口在标题行，折叠状态也可改名，但断言需要面板内容可见）
    (wrapper.vm as any).togglePool(pool.id);
    await nextTick();

    const renameBtn = wrapper.findAll('button').find(btn => btn.attributes('title') === '重命名');
    await renameBtn!.trigger('click');

    const input = wrapper.findComponent({ name: 'InputText' });
    expect(input.exists()).toBe(true);
    await input.vm.$emit('update:modelValue', '新名称');
    await input.trigger('keydown', { key: 'Enter' });

    expect(pool.name).toBe('新名称');
    // 回车事件已 .stop：不应冒泡到 AccordionHeader 翻转折叠
    expect((wrapper.vm as any).expandedIds.has(pool.id)).toBe(true);
  });

  it('删除正在重命名的预设池时清理编辑状态', async () => {
    const { settings } = useSettingsStore();
    const pool = createRandomPresetPool('pool-1', { name: 'Pool 1' });
    settings.randomPresetPools.pools = [pool];

    const wrapper = mountPanel();
    const renameBtn = wrapper.findAll('button').find(btn => btn.attributes('title') === '重命名');
    await renameBtn!.trigger('click');

    const deleteBtn = wrapper.findAll('button').find(btn => btn.attributes('title') === '删除预设池');
    await deleteBtn!.trigger('click');

    expect(settings.randomPresetPools.pools).toHaveLength(0);
    expect((wrapper.vm as any).editingPoolId).toBeNull();
  });

  it('novelai 源不显示按工作流触发的池，comfyui 源显示', () => {
    const { settings } = useSettingsStore();
    const wfPool = createRandomPresetPool('wf-1', { name: 'WF Pool', triggerMode: 'workflow' });
    settings.randomPresetPools.pools = [wfPool];

    const novelaiText = mountPanel('novelai').text();
    expect(novelaiText).not.toContain('WF Pool');
    expect(mountPanel('comfyui').text()).toContain('WF Pool');
  });

  it('comfyui 源下 lora 侧池的包含预设 MultiSelect 选项来自 LoRA 预设组且直接写入 presetIds', async () => {
    const { settings } = useSettingsStore();
    settings.comfyui.loraPresets.presets = [{ id: 'lora-1', name: 'Lora A', loras: [] }];
    const pool = createRandomPresetPool('pool-1', { side: 'lora', presetIds: ['lora-1'] });
    settings.randomPresetPools.pools = [pool];

    const wrapper = mountPanel('comfyui');
    const multiselect = wrapper.findComponent({ name: 'MultiSelect' });
    expect(multiselect.exists()).toBe(true);
    expect(multiselect.props('options')).toEqual([{ id: 'lora-1', name: 'Lora A', loras: [] }]);
    expect(multiselect.props('modelValue')).toEqual(['lora-1']);

    await multiselect.vm.$emit('update:modelValue', ['lora-1', 'ghost']);
    expect(pool.presetIds).toEqual(['lora-1', 'ghost']);
  });

  it('渲染随机预设池总开关且切换后写入 settings.randomPresetPools.enabled', async () => {
    const { settings } = useSettingsStore();
    settings.randomPresetPools.enabled = true;
    const wrapper = mountPanel();

    expect(wrapper.text()).toContain('启用随机提示词预设池');
    const toggle = wrapper.findComponent({ name: 'ToggleSwitch' });
    expect(toggle.exists()).toBe(true);

    await toggle.vm.$emit('update:modelValue', false);
    expect(settings.randomPresetPools.enabled).toBe(false);
  });

  it('novelai 源的范围与触发模式选项不含 lora 与按工作流', () => {
    const vm = mountPanel('novelai').vm as any;

    expect(vm.sideOptions.map((option: { value: string }) => option.value)).toEqual(['positive', 'negative']);
    expect(vm.triggerModeOptions.map((option: { value: string }) => option.value)).toEqual(['always', 'model']);
  });

  it('comfyui 源的范围含 LoRA 且触发模式选项不含按模型', () => {
    const vm = mountPanel('comfyui').vm as any;

    expect(vm.sideOptions.map((option: { value: string }) => option.value)).toContain('lora');
    expect(vm.triggerModeOptions.map((option: { value: string }) => option.value)).toEqual(['always', 'workflow']);
  });
});

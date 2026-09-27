import { mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import { describe, expect, it } from 'vitest';
import { nextTick } from 'vue';
import ComfyUILoraImportDialog from '@/panel/components/comfyui/ComfyUILoraImportDialog.vue';

/**
 * 挂载 LoRA 导入弹窗（内容经 Teleport 渲染到 body）
 * @param props 覆盖属性
 * @returns 挂载后的包装器
 */
function mountDialog(props: Record<string, unknown> = {}) {
  return mount(ComfyUILoraImportDialog, {
    props: {
      visible: true,
      comfyuiUrl: 'http://127.0.0.1:8188',
      loraOptions: [],
      ...props,
    },
    attachTo: document.body,
    global: {
      plugins: [PrimeVue],
    },
  });
}

describe('ComfyUILoraImportDialog 配方导入入口', () => {
  it('入口态提供导入文件与从 LoRA Manager 导入两个按钮', async () => {
    mountDialog();
    await nextTick();

    const text = document.body.textContent ?? '';
    expect(text).toContain('导入文件');
    expect(text).toContain('从 LoRA Manager 导入');
  });
});

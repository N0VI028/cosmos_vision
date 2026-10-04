import { mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import { describe, expect, it } from 'vitest';
import PromptPlaceholderEditor from '@/panel/components/PromptPlaceholderEditor.vue';

type EditorModelValue = { text: string; placeholderOffset: number };

/**
 * 挂载提示词占位符编辑器组件
 * @param props 覆盖属性
 * @returns 挂载后的包装器
 */
function mountEditor(props: Record<string, any> = {}) {
  return mount(PromptPlaceholderEditor, {
    props: {
      modelValue: { text: '固定A', placeholderOffset: 3 },
      ...props,
    },
    attachTo: document.body,
    global: {
      plugins: [PrimeVue],
    },
  });
}

describe('PromptPlaceholderEditor 边界与自愈行为', () => {
  it('根级文本节点插在 beforeEl 之前，正确计入 before 段并触发 DOM 规范化自愈', async () => {
    const wrapper = mountEditor({
      modelValue: { text: '固定A', placeholderOffset: 1 },
    });
    const editor = wrapper.find<HTMLDivElement>('[contenteditable]').element;
    const beforeEl = editor.children[0] as HTMLSpanElement;

    // 模拟 Chrome 在 span 前插入根级文本节点
    editor.insertBefore(document.createTextNode('前缀,'), beforeEl);
    await wrapper.find('[contenteditable]').trigger('input');

    expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toEqual({
      text: '前缀,固定A',
      placeholderOffset: 4,
    });
  });

  it('根级文本节点插在 tokenEl 与 afterEl 之间，计入 after 段且占位符偏移不变', async () => {
    const wrapper = mountEditor();
    const editor = wrapper.find<HTMLDivElement>('[contenteditable]').element;
    const afterEl = editor.children[2] as HTMLSpanElement;

    // 在徽章之后插入游离文本节点
    editor.insertBefore(document.createTextNode('后缀'), afterEl);
    await wrapper.find('[contenteditable]').trigger('input');

    expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toEqual({
      text: '固定A后缀',
      placeholderOffset: 3,
    });
  });

  it('删除 beforeEl 残留 BR 时被视为占位符不计换行，且 DOM 自愈为规范三节点', async () => {
    const wrapper = mountEditor();
    const editor = wrapper.find<HTMLDivElement>('[contenteditable]').element;
    const beforeEl = editor.children[0] as HTMLSpanElement;
    const tokenEl = editor.children[1] as HTMLSpanElement;
    const afterEl = editor.children[2] as HTMLSpanElement;

    // 模拟全选删除后残余根级 BR 占位符
    editor.removeChild(beforeEl);
    editor.insertBefore(document.createElement('br'), tokenEl);
    await wrapper.find('[contenteditable]').trigger('input');

    const lastEmitted = wrapper.emitted('update:modelValue')?.at(-1)?.[0] as EditorModelValue | undefined;
    expect(lastEmitted?.text).toBe('');
    expect(lastEmitted?.placeholderOffset).toBe(0);
    expect([...editor.childNodes]).toEqual([beforeEl, tokenEl, afterEl]);
  });

  it('beforeEl 内追加 BR 且 afterEl 有文本时，BR 正确计为换行符', async () => {
    const wrapper = mountEditor({
      modelValue: { text: '固定A', placeholderOffset: 1 },
    });
    const editor = wrapper.find<HTMLDivElement>('[contenteditable]').element;
    const beforeEl = editor.children[0] as HTMLSpanElement;

    beforeEl.append(document.createElement('br'));
    await wrapper.find('[contenteditable]').trigger('input');

    const lastEmitted = wrapper.emitted('update:modelValue')?.at(-1)?.[0] as EditorModelValue | undefined;
    expect(lastEmitted?.text).toContain('\n');
    expect(lastEmitted).toEqual({
      text: '固\n定A',
      placeholderOffset: 2,
    });
  });

  it('结构规范时触发 input 不重建 DOM 且保留原文本节点引用', async () => {
    const wrapper = mountEditor();
    const editor = wrapper.find<HTMLDivElement>('[contenteditable]').element;
    const beforeEl = editor.children[0] as HTMLSpanElement;
    const textNode = beforeEl.firstChild;
    expect(textNode).toBeTruthy();

    await wrapper.find('[contenteditable]').trigger('input');

    // 规范结构下未触发 replaceChildren，节点引用应保持联通
    expect(textNode?.isConnected).toBe(true);
    expect(textNode?.parentNode).toBe(beforeEl);
  });

  it('外部 setProps 更新 modelValue 时全量重建并清除游离根级节点', async () => {
    const wrapper = mountEditor();
    const editor = wrapper.find<HTMLDivElement>('[contenteditable]').element;
    const stray = document.createTextNode('游离根级文本');
    editor.appendChild(stray);
    expect(stray.isConnected).toBe(true);

    await wrapper.setProps({
      modelValue: { text: '新文本', placeholderOffset: 2 },
    });

    expect(stray.isConnected).toBe(false);
    const beforeEl = editor.children[0] as HTMLSpanElement;
    const afterEl = editor.children[2] as HTMLSpanElement;
    expect(beforeEl.textContent).toBe('新文');
    expect(afterEl.textContent).toBe('本');
  });

  it('结构规范时 renderValue 只改文本不重挂节点（保住拖拽的 pointer capture）', async () => {
    const wrapper = mountEditor();
    const editor = wrapper.find<HTMLDivElement>('[contenteditable]').element;
    const observer = new MutationObserver(() => {});
    observer.observe(editor, { childList: true, subtree: true });

    await wrapper.setProps({ modelValue: { text: '更换文本', placeholderOffset: 2 } });

    // replaceChildren 重挂三节点会以 editor 为 target 产生 childList 记录；仅改文本时变动只发生在 span 内部。
    // 重挂会隐式释放徽章上的 pointer capture，导致拖拽中断
    const rebound = observer.takeRecords().some(record => record.target === editor);
    expect(rebound).toBe(false);
    expect((editor.children[0] as HTMLSpanElement).textContent).toBe('更换');
    observer.disconnect();
  });

  it('编辑器内按键不冒泡（防 ST 宿主全局快捷键误触发）', async () => {
    const wrapper = mountEditor();
    let bubbled = false;
    document.addEventListener('keydown', () => (bubbled = true));

    await wrapper.find('[contenteditable]').trigger('keydown', { key: 'ArrowUp' });

    expect(bubbled).toBe(false);
  });
});

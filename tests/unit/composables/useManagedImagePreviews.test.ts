import { mount } from '@vue/test-utils';
import { defineComponent, ref } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useManagedImagePreviews } from '@/composables/useManagedImagePreviews';
import type { ManagedImageItem } from '@/services/inline-image/managed-images';

const mocks = vi.hoisted(() => ({ loadImageBlob: vi.fn() }));
vi.mock('@/services/inline-image/managed-images', () => ({ loadImageBlob: mocks.loadImageBlob }));

/** 构造最小可用的管理项 */
function buildItem(id: string): ManagedImageItem {
  return {
    key: `favorite:${id}`,
    kind: 'favorite',
    sourceId: id,
    slotId: `slot-${id}`,
    characterKey: 'char',
    chatId: 'chat',
    createdAt: 1,
    filePath: `/fav/${id}.png`,
    promptSnapshot: {} as ManagedImageItem['promptSnapshot'],
  };
}

/** 挂载宿主组件并返回可控的 items/visibleKeys 引用 */
function mountPreviews(initialItems: ManagedImageItem[], initialVisibleKeys: string[]) {
  const items = ref(initialItems);
  const visibleKeys = ref(initialVisibleKeys);
  let api!: ReturnType<typeof useManagedImagePreviews>;
  const wrapper = mount(
    defineComponent({
      setup() {
        api = useManagedImagePreviews(items, visibleKeys);
        return () => null;
      },
    }),
  );
  return { wrapper, api, items, visibleKeys };
}

/** 刷新微任务队列，让按需加载完成 */
function flushMicrotasks(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}

describe('useManagedImagePreviews', () => {
  let urlSequence = 0;
  const createObjectURL = vi.fn(() => `blob:mock-${++urlSequence}`);
  const revokeObjectURL = vi.fn();

  beforeEach(() => {
    urlSequence = 0;
    vi.clearAllMocks();
    mocks.loadImageBlob.mockReset();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    Object.assign(URL, { createObjectURL, revokeObjectURL });
  });

  it('仅可见项触发按需加载并暴露 ready 状态', async () => {
    const items = [buildItem('a'), buildItem('b')];
    mocks.loadImageBlob.mockResolvedValue(new Blob(['img']));
    const { api } = mountPreviews(items, ['favorite:a']);
    await flushMicrotasks();

    expect(mocks.loadImageBlob).toHaveBeenCalledTimes(1);
    expect(mocks.loadImageBlob).toHaveBeenCalledWith(items[0]);
    expect(api.previewStatus('favorite:a')).toBe('ready');
    expect(api.previewUrls.value['favorite:a']).toBe('blob:mock-1');
    expect(api.previewStatus('favorite:b')).toBe('loading');
  });

  it('滚出可见窗口即回收 object URL 与状态', async () => {
    mocks.loadImageBlob.mockResolvedValue(new Blob(['img']));
    const { api, visibleKeys } = mountPreviews([buildItem('a')], ['favorite:a']);
    await flushMicrotasks();
    const createdUrl = api.previewUrls.value['favorite:a'];
    expect(createdUrl).toBeTruthy();

    visibleKeys.value = [];
    await flushMicrotasks();
    expect(revokeObjectURL).toHaveBeenCalledWith(createdUrl);
    expect(api.previewUrls.value['favorite:a']).toBeUndefined();
  });

  it('加载失败时降级为 error 状态', async () => {
    mocks.loadImageBlob.mockRejectedValue(new Error('missing'));
    const { api } = mountPreviews([buildItem('a')], ['favorite:a']);
    await flushMicrotasks();

    expect(api.previewStatus('favorite:a')).toBe('error');
    expect(api.previewUrls.value['favorite:a']).toBeUndefined();
  });

  it('加载完成时已滚出窗口则立即回收，不登记 URL', async () => {
    let resolveLoad!: (blob: Blob) => void;
    mocks.loadImageBlob.mockReturnValue(new Promise<Blob>(resolve => (resolveLoad = resolve)));
    const { api, visibleKeys } = mountPreviews([buildItem('a')], ['favorite:a']);

    // 加载在途时滚出窗口
    visibleKeys.value = [];
    await flushMicrotasks();
    resolveLoad(new Blob(['late']));
    await flushMicrotasks();

    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-1');
    expect(api.previewUrls.value['favorite:a']).toBeUndefined();
  });

  it('卸载时在途请求完成后立即回收，不登记 URL', async () => {
    let resolveLoad!: (blob: Blob) => void;
    mocks.loadImageBlob.mockReturnValue(new Promise<Blob>(resolve => (resolveLoad = resolve)));
    const { wrapper, api } = mountPreviews([buildItem('a')], ['favorite:a']);
    await flushMicrotasks();
    expect(mocks.loadImageBlob).toHaveBeenCalledTimes(1);

    wrapper.unmount();
    resolveLoad(new Blob(['late']));
    await flushMicrotasks();

    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-1');
    expect(api.previewUrls.value['favorite:a']).toBeUndefined();
  });

  it('组件卸载时回收全部 object URL', async () => {
    mocks.loadImageBlob.mockResolvedValue(new Blob(['img']));
    const { wrapper, api } = mountPreviews([buildItem('a'), buildItem('b')], ['favorite:a', 'favorite:b']);
    await flushMicrotasks();
    expect(Object.keys(api.previewUrls.value)).toHaveLength(2);

    wrapper.unmount();
    expect(revokeObjectURL).toHaveBeenCalledTimes(2);
  });
});

import { loadImageBlob, type ManagedImageItem } from '@/services/inline-image/managed-images';

/** 缩略图预览状态：加载中 / 就绪 / 失败 */
export type ManagedImagePreviewStatus = 'loading' | 'ready' | 'error';

/**
 * 可见窗口驱动的缩略图预览管理
 *
 * 进入窗口的卡片按需 loadImageBlob 建 object URL，滚出窗口即回收；
 * 卸载组件时回收全部。加载失败保留错误态由卡片降级展示。
 *
 * @param items 全量管理项（提供按 key 加载所需定位信息）
 * @param visibleKeys 当前可见窗口内的复合 key 列表（来自虚拟网格）
 * @returns 预览 URL 表与状态查询
 */
export function useManagedImagePreviews(
  items: MaybeRefOrGetter<readonly ManagedImageItem[]>,
  visibleKeys: MaybeRefOrGetter<readonly string[]>,
): { previewUrls: Ref<Record<string, string>>; previewStatus: (key: string) => ManagedImagePreviewStatus } {
  const previewUrls = ref<Record<string, string>>({});
  const previewStatuses = ref<Record<string, ManagedImagePreviewStatus>>({});
  const objectUrls = new Map<string, string>();
  const pendingKeys = new Set<string>();
  let disposed = false;

  watch([() => toValue(items), () => toValue(visibleKeys)], syncPreviews, { immediate: true });

  onScopeDispose(() => {
    disposed = true;
    objectUrls.forEach(url => URL.revokeObjectURL(url));
    objectUrls.clear();
  });

  /**
   * 查询预览状态（未同步过的 key 视为加载中）
   * @param key 复合 key
   */
  function previewStatus(key: string): ManagedImagePreviewStatus {
    return previewStatuses.value[key] ?? 'loading';
  }

  /**
   * 对齐可见窗口：回收滚出项、为新可见项发起按需加载
   */
  function syncPreviews(): void {
    const itemMap = new Map(toValue(items).map(item => [item.key, item]));
    const wanted = new Set(toValue(visibleKeys).filter(key => itemMap.has(key)));
    retireUnwantedPreviews(wanted);
    wanted.forEach(key => {
      if (objectUrls.has(key) || pendingKeys.has(key)) return;
      void startPreviewLoad(itemMap.get(key)!, key);
    });
  }

  /**
   * 回收不在窗口内的 URL 并清理其状态
   * @param wanted 当前可见 key 集合
   */
  function retireUnwantedPreviews(wanted: Set<string>): void {
    for (const key of [...objectUrls.keys()]) {
      if (!wanted.has(key)) revokePreview(key);
    }
    const nextStatuses: Record<string, ManagedImagePreviewStatus> = {};
    Object.entries(previewStatuses.value).forEach(([key, status]) => {
      if (wanted.has(key)) nextStatuses[key] = status;
    });
    previewStatuses.value = nextStatuses;
  }

  /**
   * 加载单张缩略图并登记 URL（加载完成时已滚出则立即回收）
   * @param item 管理项
   * @param key 复合 key
   */
  async function startPreviewLoad(item: ManagedImageItem, key: string): Promise<void> {
    pendingKeys.add(key);
    setPreviewStatus(key, 'loading');
    try {
      const objectUrl = URL.createObjectURL(await loadImageBlob(item));
      // 加载完成时组件已销毁或已滚出窗口：立即回收，不登记
      if (disposed || !isKeyVisible(key)) {
        URL.revokeObjectURL(objectUrl);
        return;
      }
      objectUrls.set(key, objectUrl);
      previewUrls.value = { ...previewUrls.value, [key]: objectUrl };
      setPreviewStatus(key, 'ready');
    } catch (error) {
      if (isKeyVisible(key)) setPreviewStatus(key, 'error');
      console.warn(`[CosmosVision] 缩略图加载失败：${key}`, error);
    } finally {
      pendingKeys.delete(key);
    }
  }

  /**
   * 判断 key 是否仍在可见窗口内
   * @param key 复合 key
   */
  function isKeyVisible(key: string): boolean {
    return toValue(visibleKeys).includes(key);
  }

  /**
   * 写入预览状态
   * @param key 复合 key
   * @param status 目标状态
   */
  function setPreviewStatus(key: string, status: ManagedImagePreviewStatus): void {
    previewStatuses.value = { ...previewStatuses.value, [key]: status };
  }

  /**
   * 回收指定 key 的 object URL 并从预览表中移除
   * @param key 复合 key
   */
  function revokePreview(key: string): void {
    const url = objectUrls.get(key);
    if (url) URL.revokeObjectURL(url);
    objectUrls.delete(key);
    if (!previewUrls.value[key]) return;
    const nextUrls = { ...previewUrls.value };
    delete nextUrls[key];
    previewUrls.value = nextUrls;
  }

  return { previewUrls, previewStatus };
}

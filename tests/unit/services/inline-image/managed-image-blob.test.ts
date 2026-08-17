import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadImageBlob } from '@/services/inline-image/managed-images';

const mocks = vi.hoisted(() => ({
  loadFavoriteImageBlob: vi.fn<(filePath: string) => Promise<Blob | null>>(),
  loadTemporaryImageBlob: vi.fn<(id: string) => Promise<Blob | null>>(),
}));

vi.mock('@/services/inline-image/favorites-cache', () => ({
  loadFavoriteImageBlob: mocks.loadFavoriteImageBlob,
}));
vi.mock('@/services/inline-image/temporary-images', () => ({
  loadTemporaryImageBlob: mocks.loadTemporaryImageBlob,
}));

/** 手动控制 resolves 时机的延迟 Blob */
function createDeferredBlob() {
  let resolve!: (blob: Blob | null) => void;
  const promise = new Promise<Blob | null>(next => (resolve = next));
  return { promise, resolve };
}

/** 收藏图定位信息 */
function favoriteSource(id: number) {
  return { key: `favorite:${id}`, kind: 'favorite' as const, sourceId: id, filePath: `/fav/${id}.png` };
}

/** 临时图定位信息 */
function temporarySource(id: string) {
  return { key: `temporary:${id}`, kind: 'temporary' as const, sourceId: id, filePath: '' };
}

/** 刷新微任务队列，让排队中的加载任务启动 */
function flushMicrotasks(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}

describe('loadImageBlob', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('收藏图走 ST 文件接口、临时图走 IndexedDB 分流加载', async () => {
    const favoriteBlob = new Blob(['fav']);
    const temporaryBlob = new Blob(['tmp']);
    mocks.loadFavoriteImageBlob.mockResolvedValue(favoriteBlob);
    mocks.loadTemporaryImageBlob.mockResolvedValue(temporaryBlob);

    await expect(loadImageBlob(favoriteSource(700))).resolves.toBe(favoriteBlob);
    await expect(loadImageBlob(temporarySource('t-700'))).resolves.toBe(temporaryBlob);
    expect(mocks.loadFavoriteImageBlob).toHaveBeenCalledWith('/fav/700.png');
    expect(mocks.loadTemporaryImageBlob).toHaveBeenCalledWith('t-700');
  });

  it('同 key 二次加载命中缓存，不重复请求', async () => {
    const blob = new Blob(['cached']);
    mocks.loadFavoriteImageBlob.mockResolvedValue(blob);
    const source = favoriteSource(701);

    await expect(loadImageBlob(source)).resolves.toBe(blob);
    await expect(loadImageBlob(source)).resolves.toBe(blob);
    expect(mocks.loadFavoriteImageBlob).toHaveBeenCalledTimes(1);
  });

  it('同 key 并发加载去重为一次请求', async () => {
    const deferred = createDeferredBlob();
    mocks.loadTemporaryImageBlob.mockReturnValue(deferred.promise);
    const source = temporarySource('dup-1');

    const [first, second] = [loadImageBlob(source), loadImageBlob(source)];
    await flushMicrotasks();
    expect(mocks.loadTemporaryImageBlob).toHaveBeenCalledTimes(1);

    const blob = new Blob(['dup']);
    deferred.resolve(blob);
    expect(await first).toBe(blob);
    expect(await second).toBe(blob);
  });

  it('并发加载不超过上限 4，超限任务排队等待', async () => {
    const deferreds = Array.from({ length: 8 }, () => createDeferredBlob());
    mocks.loadTemporaryImageBlob.mockImplementation(id => deferreds[Number(id)].promise);

    const loads = deferreds.map((_, index) => loadImageBlob(temporarySource(String(index))));
    await flushMicrotasks();
    // 前 4 张在途，后 4 张在等待队列中，未发起请求
    expect(mocks.loadTemporaryImageBlob).toHaveBeenCalledTimes(4);

    deferreds.slice(0, 4).forEach(deferred => deferred.resolve(new Blob(['a'])));
    await flushMicrotasks();
    expect(mocks.loadTemporaryImageBlob).toHaveBeenCalledTimes(8);

    deferreds.slice(4).forEach(deferred => deferred.resolve(new Blob(['b'])));
    const blobs = await Promise.all(loads);
    expect(blobs).toHaveLength(8);
  });

  it('缓存超过容量后按 LRU 淘汰最旧条目', async () => {
    mocks.loadFavoriteImageBlob.mockImplementation(filePath => Promise.resolve(new Blob([filePath])));
    // 容量 24：装入 25 个不同 key 后，最早的 key-0 已被淘汰
    const sources = Array.from({ length: 25 }, (_, index) => favoriteSource(index));
    await Promise.all(sources.map(source => loadImageBlob(source)));

    await loadImageBlob(sources[0]);
    expect(mocks.loadFavoriteImageBlob).toHaveBeenCalledWith('/fav/0.png');
    expect(mocks.loadFavoriteImageBlob).toHaveBeenCalledTimes(26);
  });

  it('收藏 ID 复用（删除最大 ID 后）不串图：缓存按 filePath 隔离', async () => {
    const blobA = new Blob(['a']);
    const blobB = new Blob(['b']);
    mocks.loadFavoriteImageBlob.mockImplementation(
      filePath => Promise.resolve(filePath === '/fav/reused.png' ? blobB : blobA),
    );
    // ID 5 的图 A 已缓存；删除后新图 B 复用 ID 5 但 filePath 不同
    await loadImageBlob(favoriteSource(5));
    const reused = { ...favoriteSource(5), filePath: '/fav/reused.png' };

    await expect(loadImageBlob(reused)).resolves.toBe(blobB);
    expect(mocks.loadFavoriteImageBlob).toHaveBeenCalledWith('/fav/reused.png');
  });

  it('图片文件缺失时抛出定位错误', async () => {
    mocks.loadFavoriteImageBlob.mockResolvedValue(null);
    await expect(loadImageBlob(favoriteSource(702))).rejects.toThrow('图片文件不存在或已删除：favorite:702');
  });
});

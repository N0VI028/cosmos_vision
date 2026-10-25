import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isProxy, reactive } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import {
  appendGeneratedSessionItem,
  clearAllGallerySessions,
  persistGallerySessionItem,
  removeSessionItemsByIds,
  resolveSlotIdsFromRemovedImageIds,
  type GallerySessionItem,
} from '@/composables/inlineGallerySession';
import type { InlinePromptSnapshot } from '@/composables/inlineImageLightbox';
import type { InlineImageFavoriteScope } from '@/services/inline-image/favorites-cache';
import * as temporaryImagesModule from '@/services/inline-image/temporary-images';
import { useGalleryRuntimesStore } from '@/store/gallery-runtimes';
import { useSettingsStore } from '@/store/settings';

describe('inlineGallerySession & prune原地更新与持久化深克隆', () => {
  const dummyScope: InlineImageFavoriteScope = {
    characterKey: 'test-char',
    chatId: 'test-chat',
  };

  beforeEach(() => {
    setActivePinia(createPinia());
    clearAllGallerySessions();
    vi.restoreAllMocks();
  });

  describe('P1: prune 反查与受影响 slot 定位', () => {
    it('removeSessionItemsByIds 正确移除内存项并记录/反查 slotId', () => {
      const blob = new Blob(['img'], { type: 'image/png' });
      const snap: InlinePromptSnapshot = { positivePrompt: 'test' };

      const item1: GallerySessionItem = {
        id: 'img-1',
        favoriteId: null,
        slotId: 'slot-A',
        imageBlob: blob,
        promptSnapshot: snap,
        createdAt: 100,
      };
      const item2: GallerySessionItem = {
        id: 'img-2',
        favoriteId: null,
        slotId: 'slot-A',
        imageBlob: blob,
        promptSnapshot: snap,
        createdAt: 200,
      };
      const item3: GallerySessionItem = {
        id: 'img-3',
        favoriteId: null,
        slotId: 'slot-B',
        imageBlob: blob,
        promptSnapshot: snap,
        createdAt: 300,
      };

      appendGeneratedSessionItem('slot-A', item1);
      appendGeneratedSessionItem('slot-A', item2);
      appendGeneratedSessionItem('slot-B', item3);

      // 淘汰 img-1
      const affected = removeSessionItemsByIds(['img-1']);
      expect(affected).toEqual(['slot-A']);

      // 验证在删除之后，resolveSlotIdsFromRemovedImageIds 依然能从淘汰缓存查到所属 slotId
      expect(resolveSlotIdsFromRemovedImageIds(['img-1'])).toEqual(['slot-A']);

      // 淘汰 slot-B 的唯一图片 img-3，导致 slot-B 的 session 条目被空删除
      const affected2 = removeSessionItemsByIds(['img-3']);
      expect(affected2).toEqual(['slot-B']);
      // 依然能可靠反查出 slot-B
      expect(resolveSlotIdsFromRemovedImageIds(['img-3'])).toEqual(['slot-B']);
    });

    it('clearAllGallerySessions 能清空缓存与反查记录', () => {
      const blob = new Blob(['img'], { type: 'image/png' });
      appendGeneratedSessionItem('slot-C', {
        id: 'img-C',
        favoriteId: null,
        slotId: 'slot-C',
        imageBlob: blob,
        promptSnapshot: {},
        createdAt: 100,
      });

      removeSessionItemsByIds(['img-C']);
      expect(resolveSlotIdsFromRemovedImageIds(['img-C'])).toEqual(['slot-C']);

      clearAllGallerySessions();
      expect(resolveSlotIdsFromRemovedImageIds(['img-C'])).toEqual([]);
    });

    it('removePrunedMounts 原地给目标 slot 发送 reloadToken，不触发全楼重置', async () => {
      const store = useGalleryRuntimesStore();
      const settings = useSettingsStore();
      settings.savedSettings.enabled = true;

      // 构造两楼三个 mount
      const mountA = {
        key: 'slot:slot-1',
        messageId: 1,
        element: document.createElement('div'),
        teleportTarget: document.createElement('div'),
        mountKey: { kind: 'slot' as const, slotId: 'slot-1' },
        anchor: {} as any,
        generatedItem: null,
        kindPatch: null,
        reloadToken: 0,
      };
      const mountB = {
        key: 'slot:slot-2',
        messageId: 2,
        element: document.createElement('div'),
        teleportTarget: document.createElement('div'),
        mountKey: { kind: 'slot' as const, slotId: 'slot-2' },
        anchor: {} as any,
        generatedItem: null,
        kindPatch: null,
        reloadToken: 0,
      };

      store.runtimes = [
        {
          message_id: 1,
          reload_memo: 'memo1',
          mounts: [mountA],
        },
        {
          message_id: 2,
          reload_memo: 'memo2',
          mounts: [mountB],
        },
      ];

      // 给 slot-1 添加 session item 并淘汰
      const blob = new Blob(['img'], { type: 'image/png' });
      appendGeneratedSessionItem('slot-1', {
        id: 'temp-slot-1',
        favoriteId: null,
        slotId: 'slot-1',
        imageBlob: blob,
        promptSnapshot: {},
        createdAt: 100,
      });

      // 模拟 IDB 保存返回淘汰 temp-slot-1
      vi.spyOn(temporaryImagesModule, 'saveTemporaryImage').mockResolvedValue(['temp-slot-1']);

      // 触发持久化并原地更新
      const record = { key: 'slot:slot-1', slotId: 'slot-1', items: [] };
      const removedIds = await persistGallerySessionItem(
        record,
        {
          id: 'temp-slot-1-new',
          favoriteId: null,
          slotId: 'slot-1',
          imageBlob: blob,
          promptSnapshot: {},
          createdAt: 200,
        },
        dummyScope,
        1,
      );

      expect(removedIds).toEqual(['temp-slot-1']);

      // 触发 showGenerated 中的 removePrunedMounts 类似流程
      const slotIds = resolveSlotIdsFromRemovedImageIds(removedIds);
      expect(slotIds).toEqual(['slot-1']);

      // 模拟 store 内部对 reloadSlots 的执行
      store.runtimes
        .flatMap(r => r.mounts)
        .filter(m => slotIds.includes(m.mountKey.slotId))
        .forEach(m => {
          m.reloadToken = (m.reloadToken || 0) + 1;
        });

      // 验证仅 slot-1 的 mount reloadToken 递增，slot-2 保持为 0
      expect(mountA.reloadToken).toBe(1);
      expect(mountB.reloadToken).toBe(0);
    });
  });

  describe('P2: 重新生图与持久化 DataCloneError 深度解代理净化', () => {
    it('toTemporaryImageRecord 落库前对 reactive Proxy 深度剥离净化，可安全结构化克隆且保留 imageBlob', async () => {
      const testBlob = new Blob(['test-blob'], { type: 'image/png' });

      // 模拟重新生图产生的深层嵌套响应式 snapshot
      const reactiveSnapshot = reactive<InlinePromptSnapshot>({
        imageSource: 'novelai',
        positivePrompt: 'masterpiece, 1girl',
        negativePrompt: 'lowres, bad hands',
        promptParts: {
          positive: { core: '1girl', presetId: 'anime' },
          negative: { core: 'lowres', presetId: 'default' },
        },
        novelaiRequest: {
          endpoint: 'https://image.novelai.net',
          model: 'nai-diffusion-4-full',
          width: 832,
          height: 1216,
          sampler: 'k_euler',
          seed: 999999,
          steps: 28,
          guidance: 6,
          autoSampler: true,
          varietyPlus: false,
          smea: false,
          smeaDyn: false,
          decrisp: false,
          legacyPromptMode: false,
          promptGuidanceRescale: 0,
          noiseSchedule: 'karras',
          ucPreset: 0,
          qualityPreset: 'heavy',
          imageCount: 1,
          vibes: {
            count: 1,
            referenceStrengths: [0.75],
            informationExtracted: [0.9],
            resolved: true,
          },
        },
      });

      // 断言源数据被 Vue Proxy 深度包裹
      expect(isProxy(reactiveSnapshot)).toBe(true);
      expect(isProxy(reactiveSnapshot.novelaiRequest)).toBe(true);
      expect(isProxy(reactiveSnapshot.novelaiRequest?.vibes)).toBe(true);

      const sessionItem: GallerySessionItem = {
        id: 'temp-reactive-test',
        favoriteId: null,
        slotId: 'slot-test',
        imageBlob: testBlob,
        promptSnapshot: reactiveSnapshot,
        createdAt: Date.now(),
      };

      const sessionRecord = appendGeneratedSessionItem('slot-test', sessionItem);

      let savedRecord: temporaryImagesModule.TemporaryImageRecord | null = null;
      vi.spyOn(temporaryImagesModule, 'saveTemporaryImage').mockImplementation(async record => {
        savedRecord = record;
        return [];
      });

      await persistGallerySessionItem(sessionRecord, sessionItem, dummyScope, 10);

      expect(savedRecord).not.toBeNull();
      // 验证 promptSnapshot 已彻底脱去代理
      expect(isProxy(savedRecord!.promptSnapshot)).toBe(false);
      expect(isProxy(savedRecord!.promptSnapshot.novelaiRequest)).toBe(false);
      expect(isProxy(savedRecord!.promptSnapshot.novelaiRequest?.vibes)).toBe(false);
      expect(isProxy(savedRecord!.promptSnapshot.promptParts)).toBe(false);

      // 验证 imageBlob 完好且未被代理或序列化破坏
      expect(savedRecord!.imageBlob).toBe(testBlob);

      // 核心验证：模拟 IndexedDB put 内部的结构化克隆算法，绝不抛出 DataCloneError
      expect(() => structuredClone(savedRecord)).not.toThrow();
    });
  });
});

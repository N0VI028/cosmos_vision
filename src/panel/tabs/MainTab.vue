<template>
  <div class="flex flex-col gap-0">
    <!-- 通用子 tab -->
    <template v-if="subTab === 'general'">
      <h2 class="cv-section-title">基础设置</h2>
      <div class="cv-section-body">
        <div class="cv-field-inline">
          <span>启用图像扩展</span>
          <ToggleSwitch v-model="settings.enabled" />
        </div>
        <label class="cv-field" data-cv-tutorial="image-source">
          <span>图像来源</span>
          <Select
            v-model="settings.imageSource"
            :options="imageSourceOptions"
            option-label="label"
            option-value="value"
            fluid
          />
        </label>
        <label class="cv-field">
          <span>临时图片最大数量</span>
          <div class="cv-field-control">
            <InputNumber v-model="settings.temporaryImageLimit" :min="1" :step="1" :use-grouping="false" />
            <div class="cv-field-hint">未收藏的临时图片仅存储于浏览器中，超过上限后按创建时间自动删除最旧图片。</div>
          </div>
        </label>
      </div>

      <h2 class="cv-section-title flex items-center justify-between">
        <span>关于插件</span>
        <Tag
          :value="'v' + manifest.version"
          severity="primary"
          rounded
          class="h-auto! px-(--cv-space-md)! py-(--cv-space-sm)! text-(length:--cv-font-size-xs)! leading-none! font-(--cv-font-headline)!"
        />
      </h2>
      <div class="cv-section-body">
        <div class="cv-field-inline">
          <span>作者</span>
          <span class="text-right text-(--cv-on-surface-variant)">{{ manifest.author }}</span>
        </div>
        <div class="cv-field-inline">
          <span>相关链接</span>
          <div class="-mr-(--cv-space-xs) inline-flex items-center justify-end gap-(--cv-space-md)">
            <i
              v-for="link in relatedLinks"
              :key="link.title"
              :class="[
                link.iconClass,
                'cursor-pointer p-(--cv-space-xs) text-(length:--cv-font-size-lg) text-(--cv-on-surface-variant) transition-colors duration-150 hover:text-(--cvp-primary-color)',
              ]"
              :title="link.title"
              @click="openUrl(link.url)"
            />
          </div>
        </div>
      </div>
    </template>

    <!-- 数据子 tab -->
    <template v-else-if="subTab === 'data'">
      <NovelAIVibeDataPanel
        :items="vibeRows"
        :loading="isVibeRowsLoading"
        :busy="isVibeActionBusy"
        @download-item="downloadVibe"
        @delete-item="deleteVibe"
        @download-items="downloadSelectedVibes"
        @delete-items="deleteSelectedVibes"
      />

      <InlineFavoriteDataPanel
        :items="managedImageItems"
        :loading="isManagedImagesLoading"
        :busy="isManagedImagesBusy"
        @download-items="downloadManagedItems"
        @delete-items="deleteManagedItems"
        @toggle-kind="toggleManagedItemKind"
      />
    </template>

    <!-- 导入导出子 tab -->
    <template v-else-if="subTab === 'portability'">
      <DataPortabilityPanel @refresh-data="refreshDataRows" />
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, ref, watch } from 'vue';
import { appendGeneratedSessionItem, removeSessionItemsByIds } from '@/composables/inlineGallerySession';
import { IMAGE_SOURCES } from '@/constants/comfyui';
import DataPortabilityPanel from '@/panel/components/DataPortabilityPanel.vue';
import InlineFavoriteDataPanel from '@/panel/components/InlineFavoriteDataPanel.vue';
import NovelAIVibeDataPanel from '@/panel/components/NovelAIVibeDataPanel.vue';
import {
  IMAGE_DOWNLOAD_OPTIONS_REQUEST_KEY,
  type InlineImageDownloadOptions,
} from '@/services/inline-image/download-options';
import {
  deleteInlineImageFavorite,
  listInlineImageFavoriteGroups,
  type InlineImageFavoriteGroup,
} from '@/services/inline-image/favorites-cache';
import {
  downloadInlineImageBlobItems,
  downloadInlineImageFavoriteItems,
} from '@/services/inline-image/favorites-download';
import { convertManagedImageKind, type ConvertImageKindResult } from '@/services/inline-image/managed-kind-toggle';
import {
  mergeManagedImageItems,
  parseManagedImageKey,
  removeManagedFavoriteId,
  toManagedFavoriteItems,
  toManagedTemporaryItems,
  toTemporaryRecordFromManaged,
  upsertManagedFavoriteGroup,
  type ManagedImageItem,
} from '@/services/inline-image/managed-images';
import {
  deleteTemporaryImage,
  listAllTemporaryImages,
  type TemporaryImageRecord,
} from '@/services/inline-image/temporary-images';
import {
  deleteNovelAIVibeSource,
  getNovelAIVibeDownloadPayload,
  listNovelAIVibeCacheItems,
} from '@/services/novelai/vibe-cache';
import { downloadAllNovelAIVibes, downloadNovelAIVibe } from '@/services/novelai/vibe-download';
import type { NovelAIVibeCacheListItem } from '@/services/novelai/vibe-types';
import { useGalleryRuntimesStore } from '@/store/gallery-runtimes';
import { useSettingsStore } from '@/store/settings';
import manifest from '../../../manifest.json';

const props = defineProps<{ subTab: 'general' | 'data' | 'portability' }>();

const { settings } = useSettingsStore();
const imageSourceOptions = [...IMAGE_SOURCES];

/** 相关链接列表项 */
interface RelatedLink {
  title: string;
  iconClass: string;
  url: string;
}

/** 关于插件中的相关链接配置 */
const relatedLinks: RelatedLink[] = [
  {
    title: 'GitHub',
    iconClass: 'fa-brands fa-github',
    url: 'https://github.com/N0VI028/cosmos_vision',
  },
  {
    title: 'Discord',
    iconClass: 'fa-brands fa-discord',
    url: 'https://discord.gg/sillytavern',
  },
];
const vibeRows = ref<NovelAIVibeCacheListItem[]>([]);
const isVibeRowsLoading = ref(false);
const isVibeActionBusy = ref(false);
const favoriteGroups = ref<InlineImageFavoriteGroup[]>([]);
const temporaryRecords = ref<TemporaryImageRecord[]>([]);
const isManagedImagesLoading = ref(false);
const isManagedImagesBusy = ref(false);
const managedImageItems = computed(() =>
  mergeManagedImageItems(toManagedFavoriteItems(favoriteGroups.value), toManagedTemporaryItems(temporaryRecords.value)),
);

const showConfirm =
  inject<
    (options: {
      title?: string;
      message: string;
      acceptLabel?: string;
      cancelLabel?: string;
      severity?: string;
    }) => Promise<boolean>
  >('showConfirm');
const requestImageDownloadOptions = inject<() => Promise<InlineImageDownloadOptions | null>>(
  IMAGE_DOWNLOAD_OPTIONS_REQUEST_KEY,
);

watch(
  () => props.subTab,
  subTab => {
    if (subTab !== 'data') return;
    void refreshDataRows();
  },
  { immediate: true },
);

/**
 * 刷新数据页全部缓存数据
 */
async function refreshDataRows(): Promise<void> {
  await Promise.all([refreshVibeRows(), refreshManagedImages()]);
}

/**
 * 刷新表格中的 vibe 数据
 */
async function refreshVibeRows(): Promise<void> {
  isVibeRowsLoading.value = true;
  try {
    vibeRows.value = await listNovelAIVibeCacheItems();
  } catch (error) {
    vibeRows.value = [];
    toastr.error('读取 vibe 数据失败');
    console.error('读取 vibe 数据失败', error);
  } finally {
    isVibeRowsLoading.value = false;
  }
}

/**
 * 并行刷新收藏与临时图片管理数据
 */
async function refreshManagedImages(): Promise<void> {
  isManagedImagesLoading.value = true;
  try {
    await Promise.all([refreshManagedFavorites(), refreshManagedTemporaries()]);
  } finally {
    isManagedImagesLoading.value = false;
  }
}

/** 独立刷新收藏图片，失败不影响临时图片 */
async function refreshManagedFavorites(): Promise<void> {
  try {
    favoriteGroups.value = await listInlineImageFavoriteGroups();
  } catch (error) {
    favoriteGroups.value = [];
    toastr.error('读取收藏图片数据失败');
    console.error('读取收藏图片数据失败', error);
  }
}

/** 独立刷新临时图片，失败不影响收藏图片 */
async function refreshManagedTemporaries(): Promise<void> {
  try {
    temporaryRecords.value = await listAllTemporaryImages();
  } catch (error) {
    temporaryRecords.value = [];
    toastr.error('读取临时图片数据失败');
    console.error('读取临时图片数据失败', error);
  }
}

/**
 * 下载单行 vibe 原始文件
 * @param row vibe 列表行
 */
async function downloadVibe(row: NovelAIVibeCacheListItem): Promise<void> {
  await runVibeAction(async () => {
    const payload = await getNovelAIVibeDownloadPayload(row.sourceHash);
    if (!payload) {
      toastr.warning('未找到可下载的 vibe 数据');
      await refreshVibeRows();
      return;
    }
    await downloadNovelAIVibe(payload);
  }, '下载 vibe 数据失败');
}

/**
 * 批量下载选中 vibe
 */
async function downloadSelectedVibes(hashes: string[]): Promise<void> {
  if (!hashes.length) return;
  await runVibeAction(async () => {
    const payloads = (await Promise.all(hashes.map(getNovelAIVibeDownloadPayload))).filter(
      (p): p is NonNullable<typeof p> => Boolean(p),
    );
    if (!payloads.length) {
      toastr.warning('未找到可下载的 vibe 数据');
      return;
    }
    await downloadAllNovelAIVibes(payloads);
  }, '下载选中 vibe 数据失败');
}

/**
 * 批量删除选中 vibe
 */
async function deleteSelectedVibes(hashes: string[]): Promise<void> {
  if (!hashes.length) return;
  const confirmed = await confirmDangerAction(
    '删除选中 vibe 数据',
    `确定要删除选中的 ${hashes.length} 个 Vibe 本地文件吗？预设引用会保留并显示为失效。`,
    '删除',
  );
  if (!confirmed) return;
  await runVibeAction(async () => {
    await Promise.all(hashes.map(deleteNovelAIVibeSource));
    await refreshVibeRows();
    toastr.success('已删除选中 vibe 数据');
  }, '删除选中 vibe 数据失败');
}

/**
 * 删除单行 Vibe 本地文件
 * @param row vibe 列表行
 */
async function deleteVibe(row: NovelAIVibeCacheListItem): Promise<void> {
  const fileName = row.fileName;
  const confirmed = await confirmDangerAction(
    '删除 vibe 数据',
    `确定要删除“${fileName}”的本地文件吗？预设引用会保留并显示为失效。`,
    '删除',
  );
  if (!confirmed) return;
  await runVibeAction(async () => {
    await deleteNovelAIVibeSource(row.sourceHash);
    await refreshVibeRows();
    toastr.success('已删除 vibe 数据');
  }, '删除 vibe 数据失败');
}

/**
 * 互换单张管理图片的收藏/临时状态
 * @param key 复合 key
 */
async function toggleManagedItemKind(key: string): Promise<void> {
  const item = managedImageItems.value.find(candidate => candidate.key === key);
  if (!item) return;
  await runManagedAction(async () => {
    const result = await convertManagedImageKind(item, settings.temporaryImageLimit);
    applyManagedKindLocalPatch(item, result);
    syncManagedKindSession(item, result);
    useGalleryRuntimesStore().patchSlotKind(
      item.slotId,
      result.to === 'favorite'
        ? {
            to: 'favorite',
            temporaryId: result.temporaryId,
            favoriteId: result.favoriteId,
            createdAt: result.createdAt,
          }
        : {
            to: 'temporary',
            favoriteId: result.favoriteId,
            temporaryId: result.temporaryId,
            createdAt: result.createdAt,
          },
    );
    toastr.success(result.to === 'favorite' ? '已转为收藏' : '已转为临时');
  }, '切换图片状态失败');
}

/**
 * 用已知 blob 就地更新管理列表（避免并行 refresh 中间态）
 * @param item 原管理项
 * @param result 互换结果
 */
function applyManagedKindLocalPatch(item: ManagedImageItem, result: ConvertImageKindResult): void {
  if (result.from === 'temporary') {
    temporaryRecords.value = temporaryRecords.value.filter(record => record.id !== result.temporaryId);
    favoriteGroups.value = upsertManagedFavoriteGroup(favoriteGroups.value, item, result.favoriteId, result.filePath);
    return;
  }
  favoriteGroups.value = removeManagedFavoriteId(favoriteGroups.value, result.favoriteId);
  temporaryRecords.value = [
    toTemporaryRecordFromManaged(item, result.temporaryId, result.createdAt),
    ...temporaryRecords.value.filter(record => record.id !== result.temporaryId),
  ];
}

/**
 * 管理页类型互换后同步会话覆盖层
 * @param item 原管理项
 * @param result 互换结果
 */
function syncManagedKindSession(item: ManagedImageItem, result: ConvertImageKindResult): void {
  if (result.from === 'temporary') {
    removeSessionItemsByIds([result.temporaryId]);
    return;
  }
  appendGeneratedSessionItem(item.slotId, {
    id: result.temporaryId,
    favoriteId: null,
    slotId: item.slotId,
    imageBlob: item.imageBlob,
    promptSnapshot: item.promptSnapshot,
    createdAt: result.createdAt,
  });
}

/**
 * 批量下载选中的管理图片（按类型分桶）
 * @param keys 复合 key 列表
 */
async function downloadManagedItems(keys: string[]): Promise<void> {
  const buckets = partitionManagedKeys(keys, managedImageItems.value);
  if (!buckets.favoriteIds.length && !buckets.temporaryItems.length) return;
  const options = await requestInlineImageDownloadOptions();
  if (!options) return;
  await runManagedAction(async () => {
    const errors = await downloadManagedBuckets(buckets, options);
    toastManagedErrors('下载', errors);
  }, '下载选中图片失败');
}

/**
 * 请求统一的图片下载配置
 * @returns 用户确认后的下载配置
 */
async function requestInlineImageDownloadOptions(): Promise<InlineImageDownloadOptions | null> {
  return requestImageDownloadOptions ? requestImageDownloadOptions() : null;
}

/**
 * 按类型分桶下载，失败标签汇总
 * @param buckets 分桶结果
 * @param options 下载配置
 */
async function downloadManagedBuckets(
  buckets: ManagedKeyBuckets,
  options: InlineImageDownloadOptions,
): Promise<string[]> {
  const errors: string[] = [];
  await pushManagedStepError(errors, '收藏', '下载选中收藏图片失败', buckets.favoriteIds.length, () =>
    downloadInlineImageFavoriteItems(buckets.favoriteIds, favoriteGroups.value, options),
  );
  await pushManagedStepError(errors, '临时', '下载选中临时图片失败', buckets.temporaryItems.length, () =>
    downloadInlineImageBlobItems(buckets.temporaryItems, options, 'cosmos-vision-selected-temporary.zip'),
  );
  return errors;
}

/**
 * 批量删除选中的管理图片（按类型分桶）
 * @param keys 复合 key 列表
 */
async function deleteManagedItems(keys: string[]): Promise<void> {
  const buckets = partitionManagedKeys(keys, managedImageItems.value);
  if (!buckets.favoriteIds.length && !buckets.temporaryIds.length) return;
  const confirmed = await confirmDangerAction(
    '删除图片',
    buildManagedDeleteMessage(buckets.favoriteIds.length, buckets.temporaryIds.length),
    '删除',
  );
  if (!confirmed) return;
  await runManagedAction(() => executeManagedDelete(buckets), '删除选中图片失败');
}

/**
 * 执行分桶删除并提示结果
 * @param buckets 分桶结果
 */
async function executeManagedDelete(buckets: ManagedKeyBuckets): Promise<void> {
  const result = await deleteManagedBuckets(buckets);
  applyManagedDeleteLocalPatch(result);
  if (result.errors.length) {
    toastManagedErrors('删除', result.errors);
    return;
  }
  toastr.success(`已删除 ${buckets.favoriteIds.length + buckets.temporaryIds.length} 张图片`);
}

/**
 * 按类型分桶删除，失败标签汇总
 * @param buckets 分桶结果
 */
async function deleteManagedBuckets(buckets: ManagedKeyBuckets): Promise<ManagedDeleteResult> {
  const [favorites, temporaries] = await Promise.all([
    deleteManagedFavoriteIds(buckets.favoriteIds),
    deleteManagedTemporaryIds(buckets.temporaryIds),
  ]);
  return {
    favoriteIds: favorites.deletedIds,
    temporaryIds: temporaries.deletedIds,
    errors: [favorites, temporaries].filter(result => result.failed).map(result => result.label),
  };
}

/** 删除收藏图片并保留失败项 */
async function deleteManagedFavoriteIds(ids: number[]): Promise<ManagedDeleteStepResult<number>> {
  const results = await Promise.allSettled(ids.map(id => deleteInlineImageFavorite(id)));
  return collectManagedDeleteStepResult('收藏', ids, results);
}

/**
 * 删除临时图：IDB + 内存会话同步 + 内嵌画廊刷新
 * @param ids 临时图 ID
 */
async function deleteManagedTemporaryIds(ids: string[]): Promise<ManagedDeleteStepResult<string>> {
  const results = await Promise.allSettled(ids.map(id => deleteTemporaryImage(id)));
  const result = collectManagedDeleteStepResult('临时', ids, results);
  const { deletedIds } = result;
  if (deletedIds.length) {
    removeSessionItemsByIds(deletedIds);
    await useGalleryRuntimesStore().restoreAll();
  }
  return result;
}

/**
 * 收集单类图片删除结果
 * @param label 图片类型标签
 * @param ids 待删除 ID
 * @param results 删除结果
 * @returns 成功 ID 与失败状态
 */
function collectManagedDeleteStepResult<T>(
  label: string,
  ids: T[],
  results: PromiseSettledResult<void>[],
): ManagedDeleteStepResult<T> {
  const deletedIds = ids.filter((_, index) => results[index]?.status === 'fulfilled');
  return { label, deletedIds, failed: deletedIds.length !== ids.length };
}

/** 将成功删除的图片从当前管理列表就地移除 */
function applyManagedDeleteLocalPatch(result: ManagedDeleteResult): void {
  favoriteGroups.value = result.favoriteIds.reduce(removeManagedFavoriteId, favoriteGroups.value);
  temporaryRecords.value = temporaryRecords.value.filter(record => !result.temporaryIds.includes(record.id));
}

/**
 * 有任务时执行管理步骤，失败则写入类型标签
 * @param errors 失败标签列表
 * @param label 类型标签
 * @param logMessage 控制台错误文案
 * @param count 待处理数量（0 则跳过）
 * @param action 异步操作
 */
async function pushManagedStepError(
  errors: string[],
  label: string,
  logMessage: string,
  count: number,
  action: () => Promise<unknown>,
): Promise<void> {
  if (!count) return;
  try {
    await action();
  } catch (error) {
    console.error(logMessage, error);
    errors.push(label);
  }
}

/**
 * 提示分桶操作中的失败类型（另一类型可能已成功）
 * @param actionLabel 操作名
 * @param errors 失败类型标签
 */
function toastManagedErrors(actionLabel: string, errors: string[]): void {
  if (!errors.length) return;
  toastr.warning(`${actionLabel}失败：${errors.join('、')}（另一类型可能已成功）`);
}

/**
 * 构建删除确认文案
 * @param favoriteCount 收藏数量
 * @param temporaryCount 临时数量
 */
function buildManagedDeleteMessage(favoriteCount: number, temporaryCount: number): string {
  if (favoriteCount && temporaryCount) {
    return `确定要删除选中的 ${favoriteCount} 张收藏与 ${temporaryCount} 张临时图片吗？`;
  }
  if (temporaryCount) return `确定要删除选中的 ${temporaryCount} 张临时图片吗？`;
  return `确定要删除选中的 ${favoriteCount} 张收藏图片吗？`;
}

interface ManagedKeyBuckets {
  favoriteIds: number[];
  temporaryIds: string[];
  temporaryItems: ManagedImageItem[];
}

interface ManagedDeleteStepResult<T> {
  label: string;
  deletedIds: T[];
  failed: boolean;
}

interface ManagedDeleteResult {
  favoriteIds: number[];
  temporaryIds: string[];
  errors: string[];
}

/**
 * 将复合 key 分桶为收藏 ID 与临时项
 * @param keys 复合 key
 * @param items 当前管理项（用于取临时图 blob）
 */
function partitionManagedKeys(keys: string[], items: ManagedImageItem[]): ManagedKeyBuckets {
  const itemMap = new Map(items.map(item => [item.key, item]));
  const buckets: ManagedKeyBuckets = { favoriteIds: [], temporaryIds: [], temporaryItems: [] };
  keys.forEach(key => appendPartitionedKey(key, itemMap, buckets));
  return buckets;
}

/**
 * 解析单个复合 key 并写入分桶
 * @param key 复合 key
 * @param itemMap 当前管理项索引
 * @param buckets 分桶结果
 */
function appendPartitionedKey(key: string, itemMap: Map<string, ManagedImageItem>, buckets: ManagedKeyBuckets): void {
  const parsed = parseManagedImageKey(key);
  if (!parsed) return;
  if (parsed.kind === 'favorite') {
    buckets.favoriteIds.push(Number(parsed.sourceId));
    return;
  }
  buckets.temporaryIds.push(String(parsed.sourceId));
  const item = itemMap.get(key);
  if (item) buckets.temporaryItems.push(item);
}

/**
 * 执行 vibe 操作并统一处理忙碌态
 * @param action 要执行的异步操作
 * @param errorMessage 失败提示
 */
async function runVibeAction(action: () => Promise<void>, errorMessage: string): Promise<void> {
  if (isVibeActionBusy.value) return;
  isVibeActionBusy.value = true;
  try {
    await action();
  } catch (error) {
    toastr.error(errorMessage);
    console.error(`${errorMessage}`, error);
  } finally {
    isVibeActionBusy.value = false;
  }
}

/**
 * 执行图片管理操作并统一处理忙碌态
 * @param action 要执行的异步操作
 * @param errorMessage 失败提示
 */
async function runManagedAction(action: () => Promise<void>, errorMessage: string): Promise<void> {
  if (isManagedImagesBusy.value) return;
  isManagedImagesBusy.value = true;
  try {
    await action();
  } catch (error) {
    const detail = error instanceof Error ? error.message : '';
    toastr.error(detail || errorMessage);
    console.error(errorMessage, error);
  } finally {
    isManagedImagesBusy.value = false;
  }
}

/**
 * 确认危险操作
 * @param title 弹窗标题
 * @param message 确认文案
 * @param acceptLabel 确认按钮文案
 * @returns 用户是否确认
 */
async function confirmDangerAction(title: string, message: string, acceptLabel: string): Promise<boolean> {
  if (showConfirm) {
    return showConfirm({ title, message, acceptLabel, cancelLabel: '取消', severity: 'danger' });
  }
  return confirm(message);
}

/**
 * 在新窗口中打开指定 URL
 * @param url 要打开的链接
 */
function openUrl(url: string): void {
  window.open(url, '_blank');
}
</script>

<style scoped>
@reference '../../global.css';
</style>

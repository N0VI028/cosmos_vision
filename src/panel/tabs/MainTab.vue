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
        <label class="cv-field">
          <span>图像来源</span>
          <Select
            v-model="settings.imageSource"
            :options="imageSourceOptions"
            option-label="label"
            option-value="value"
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
        <Tag :value="'v' + manifest.version" class="font-(--cv-font-headline)! text-(length:--cv-font-size-xs)! bg-(--p-primary-color)! py-(--cv-space-sm)! px-(--cv-space-md)! leading-none! h-auto! text-(--cv-background)!" rounded />
      </h2>
      <div class="cv-section-body">
        <div class="cv-field-inline">
          <span>作者</span>
          <span class="text-right text-(--p-button-secondary-color)">{{ manifest.author }}</span>
        </div>
        <div class="cv-field-inline">
          <span>相关链接</span>
          <div class="inline-flex items-center justify-end gap-(--cv-space-md) -mr-(--cv-space-xs)">
            <i
              class="fa-brands fa-github cursor-pointer transition-colors duration-150 text-[1.25rem] text-(--p-button-secondary-color) p-(--cv-space-xs) hover:text-(--p-primary-color)"
              title="GitHub"
              @click="openUrl('https://github.com/N0VI028/cosmos_vision')"
            />
            <i
              class="fa-brands fa-discord cursor-pointer transition-colors duration-150 text-[1.25rem] text-(--p-button-secondary-color) p-(--cv-space-xs) hover:text-(--p-primary-color)"
              title="Discord"
              @click="openUrl('https://discord.gg/sillytavern')"
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
        :groups="favoriteGroups"
        :loading="isFavoriteGroupsLoading"
        :busy="isFavoriteActionBusy"
        @download-items="downloadFavoriteItems"
        @delete-items="deleteFavoriteItems"
      />
    </template>

    <!-- 导入导出子 tab -->
    <template v-else-if="subTab === 'portability'">
      <DataPortabilityPanel @refresh-data="refreshDataRows" />
    </template>
  </div>
</template>

<script setup lang="ts">
import { inject, ref, watch } from 'vue';
import { IMAGE_SOURCES } from '@/constants/comfyui';
import DataPortabilityPanel from '@/panel/components/DataPortabilityPanel.vue';
import InlineFavoriteDataPanel from '@/panel/components/InlineFavoriteDataPanel.vue';
import NovelAIVibeDataPanel from '@/panel/components/NovelAIVibeDataPanel.vue';
import {
  IMAGE_DOWNLOAD_OPTIONS_REQUEST_KEY,
  type InlineImageDownloadOptions,
} from '@/services/inline-image/download-options';
import { useSettingsStore } from '@/store/settings';
import {
  deleteInlineImageFavorite,
  listInlineImageFavoriteGroups,
  type InlineImageFavoriteGroup,
} from '@/services/inline-image/favorites-cache';
import {
  downloadInlineImageFavoriteItems,
} from '@/services/inline-image/favorites-download';
import {
  deleteNovelAIVibeSource,
  getNovelAIVibeDownloadPayload,
  listNovelAIVibeCacheItems,
} from '@/services/novelai/vibe-cache';
import { downloadAllNovelAIVibes, downloadNovelAIVibe } from '@/services/novelai/vibe-download';
import type { NovelAIVibeCacheListItem } from '@/services/novelai/vibe-types';
import manifest from '../../../manifest.json';

const props = defineProps<{ subTab: 'general' | 'data' | 'portability' }>();

const { settings } = useSettingsStore();
const imageSourceOptions = [...IMAGE_SOURCES];
const vibeRows = ref<NovelAIVibeCacheListItem[]>([]);
const isVibeRowsLoading = ref(false);
const isVibeActionBusy = ref(false);
const favoriteGroups = ref<InlineImageFavoriteGroup[]>([]);
const isFavoriteGroupsLoading = ref(false);
const isFavoriteActionBusy = ref(false);

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
  await Promise.all([refreshVibeRows(), refreshFavoriteGroups()]);
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
 * 刷新收藏图片管理分组
 */
async function refreshFavoriteGroups(): Promise<void> {
  isFavoriteGroupsLoading.value = true;
  try {
    favoriteGroups.value = await listInlineImageFavoriteGroups();
  } catch (error) {
    favoriteGroups.value = [];
    toastr.error('读取收藏图片数据失败');
    console.error('读取收藏图片数据失败', error);
  } finally {
    isFavoriteGroupsLoading.value = false;
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
 * 批量下载选中的收藏图片
 * @param ids 选中的收藏记录 ID 列表
 */
async function downloadFavoriteItems(ids: number[]): Promise<void> {
  const options = await requestInlineImageDownloadOptions();
  if (!options) return;
  await runFavoriteAction(async () => {
    await downloadInlineImageFavoriteItems(ids, favoriteGroups.value, options);
  }, '下载选中收藏图片失败');
}

/**
 * 请求统一的图片下载配置
 * @returns 用户确认后的下载配置
 */
async function requestInlineImageDownloadOptions(): Promise<InlineImageDownloadOptions | null> {
  return requestImageDownloadOptions ? requestImageDownloadOptions() : null;
}

/**
 * 批量删除选中的收藏图片
 * @param ids 选中的收藏记录 ID 列表
 */
async function deleteFavoriteItems(ids: number[]): Promise<void> {
  const confirmed = await confirmDangerAction('删除收藏图片', `确定要删除选中的 ${ids.length} 张收藏图片吗？`, '删除');
  if (!confirmed) return;
  await runFavoriteAction(async () => {
    await Promise.all(ids.map(id => deleteInlineImageFavorite(id)));
    await refreshFavoriteGroups();
    toastr.success(`已删除 ${ids.length} 张收藏图片`);
  }, '删除选中收藏图片失败');
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
 * 执行收藏图片操作并统一处理忙碌态
 * @param action 要执行的异步操作
 * @param errorMessage 失败提示
 */
async function runFavoriteAction(action: () => Promise<void>, errorMessage: string): Promise<void> {
  if (isFavoriteActionBusy.value) return;
  isFavoriteActionBusy.value = true;
  try {
    await action();
  } catch (error) {
    toastr.error(errorMessage);
    console.error(`${errorMessage}`, error);
  } finally {
    isFavoriteActionBusy.value = false;
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

<template>
  <div class="cv-tab-content">
    <!-- 通用子 tab -->
    <template v-if="subTab === 'general'">
      <h2 class="cv-section-title">基础设置</h2>
      <div class="cv-field-inline">
        <span>启用图像扩展</span>
        <ToggleSwitch v-model="settings.enabled" />
      </div>
      <label class="cv-field">
        <span>图像来源</span>
        <Select v-model="settings.imageSource" :options="imageSourceOptions" option-label="label" option-value="value" />
      </label>

      <div class="cv-about-title-row">
        <h2 class="cv-section-title">关于插件</h2>
        <Tag :value="'v' + manifest.version" class="cv-version-tag" rounded/>
      </div>
      <div class="cv-field-inline">
        <span>作者</span>
        <span class="cv-about-text">{{ manifest.author }}</span>
      </div>
      <div class="cv-field-inline">
        <span>相关链接</span>
        <div class="cv-links-container">
          <Button
            icon="fa-brands fa-github"
            severity="secondary"
            text
            rounded
            aria-label="GitHub"
            @click="openUrl('https://github.com/N0VI028/cosmos_vision')"
          />
          <Button
            icon="fa-brands fa-discord"
            severity="secondary"
            text
            rounded
            aria-label="Discord"
            @click="openUrl('https://discord.gg/sillytavern')"
          />
        </div>
      </div>
    </template>

    <!-- 数据子 tab -->
    <template v-else-if="subTab === 'data'">
      <div class="cv-vibe-title-row">
        <h2 class="cv-section-title">Vibe 数据</h2>
        <div class="cv-vibe-title-actions">
          <Button
            label="下载全部"
            icon="fa-solid fa-download"
            size="small"
            text
            :fluid="false"
            :disabled="isVibeActionDisabled"
            :loading="isVibeActionBusy"
            @click="downloadAllVibes"
          />
          <Button
            label="删除全部"
            icon="fa-solid fa-trash"
            severity="danger"
            size="small"
            text
            :fluid="false"
            :disabled="isVibeActionDisabled"
            :loading="isVibeActionBusy"
            @click="deleteAllVibes"
          />
        </div>
      </div>
      <DataTable :value="vibeRows" :loading="isVibeRowsLoading" data-key="sourceHash" class="cv-vibe-table" scrollable scroll-height="18rem">
        <Column header="预览" style="width: 4rem; min-width: 4rem">
          <template #body="{ data }">
            <div class="cv-vibe-thumb">
              <img v-if="data.thumbnailData" :src="data.thumbnailData" alt="" />
              <i v-else class="fa-solid fa-image" />
            </div>
          </template>
        </Column>
        <Column field="fileName" header="名称" style="min-width: 0">
          <template #body="{ data }">
            <div class="cv-vibe-name">{{ getDisplayFileName(data) }}</div>
          </template>
        </Column>
        <Column header="操作" style="width: 6rem; min-width: 6rem">
          <template #body="{ data }">
            <div class="cv-vibe-actions">
              <Button
                icon="fa-solid fa-download"
                severity="secondary"
                text
                rounded
                size="small"
                aria-label="下载"
                :fluid="false"
                :disabled="isVibeActionBusy"
                @click="downloadVibe(data)"
              />
              <Button
                icon="fa-solid fa-trash"
                severity="danger"
                text
                rounded
                size="small"
                aria-label="删除"
                :fluid="false"
                :disabled="isVibeActionBusy"
                @click="deleteVibe(data)"
              />
            </div>
          </template>
        </Column>
        <template #empty>暂无 vibe 数据</template>
      </DataTable>

      <h2 class="cv-section-title">重置设置</h2>
      <div class="cv-field">
        <Button
          label="重置为默认设置"
          icon="fa-solid fa-rotate-left"
          severity="danger"
          size="small"
          @click="handleReset"
        />
        <div class="cv-field-hint">将所有设置恢复为默认值，此操作不可撤销</div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, ref, watch } from 'vue';
import { IMAGE_SOURCES } from '@/constants/comfyui';
import { useSettingsStore } from '@/store/settings';
import {
  clearNovelAIVibeCache,
  deleteNovelAIVibeSource,
  getNovelAIVibeDownloadPayload,
  listNovelAIVibeCacheItems,
  listNovelAIVibeDownloadPayloads,
} from '@/services/novelai/vibe-cache';
import { getNovelAIVibeDisplayFileName } from '@/services/novelai/vibe-display';
import { downloadAllNovelAIVibes, downloadNovelAIVibe } from '@/services/novelai/vibe-download';
import type { NovelAIVibeCacheListItem } from '@/services/novelai/vibe-types';
import manifest from '../../../manifest.json';

const props = defineProps<{ subTab: 'general' | 'data' }>();

const { settings, resetToDefaults } = useSettingsStore();
const imageSourceOptions = [...IMAGE_SOURCES];
const vibeRows = ref<NovelAIVibeCacheListItem[]>([]);
const isVibeRowsLoading = ref(false);
const isVibeActionBusy = ref(false);
const isVibeActionDisabled = computed(() => isVibeRowsLoading.value || isVibeActionBusy.value || !vibeRows.value.length);

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

watch(
  () => props.subTab,
  subTab => {
    if (subTab !== 'data') return;
    void refreshVibeRows();
  },
  { immediate: true },
);

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
    console.error('[MainTab] 读取 vibe 数据失败', error);
  } finally {
    isVibeRowsLoading.value = false;
  }
}

/**
 * 读取表格中的 vibe 展示文件名
 * @param row vibe 列表行
 * @returns 展示名称
 */
function getDisplayFileName(row: NovelAIVibeCacheListItem): string {
  return getNovelAIVibeDisplayFileName(row);
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
 * 下载全部 vibe 原始文件
 */
async function downloadAllVibes(): Promise<void> {
  await runVibeAction(async () => {
    const payloads = await listNovelAIVibeDownloadPayloads();
    if (!payloads.length) {
      toastr.warning('暂无可下载的 vibe 数据');
      await refreshVibeRows();
      return;
    }
    await downloadAllNovelAIVibes(payloads);
  }, '下载全部 vibe 数据失败');
}

/**
 * 删除单行 vibe 浏览器缓存
 * @param row vibe 列表行
 */
async function deleteVibe(row: NovelAIVibeCacheListItem): Promise<void> {
  const fileName = getDisplayFileName(row);
  const confirmed = await confirmDangerAction('删除 vibe 数据', `确定要删除“${fileName}”的浏览器缓存吗？预设引用会保留并显示为失效。`, '删除');
  if (!confirmed) return;
  await runVibeAction(async () => {
    await deleteNovelAIVibeSource(row.sourceHash);
    await refreshVibeRows();
    toastr.success('已删除 vibe 数据');
  }, '删除 vibe 数据失败');
}

/**
 * 删除全部 vibe 浏览器缓存
 */
async function deleteAllVibes(): Promise<void> {
  const confirmed = await confirmDangerAction('删除全部 vibe 数据', '确定要删除全部 vibe 浏览器缓存吗？预设引用会保留并显示为失效。', '删除全部');
  if (!confirmed) return;
  await runVibeAction(async () => {
    await clearNovelAIVibeCache();
    await refreshVibeRows();
    toastr.success('已删除全部 vibe 数据');
  }, '删除全部 vibe 数据失败');
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
    console.error(`[MainTab] ${errorMessage}`, error);
  } finally {
    isVibeActionBusy.value = false;
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
 * 确认后重置所有设置
 */
async function handleReset(): Promise<void> {
  const confirmed = await confirmDangerAction('重置设置', '确定要重置所有设置为默认值吗？此操作不可撤销。', '确定');
  if (confirmed) resetToDefaults();
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

.cv-tab-content {
  @apply flex flex-col gap-0;
}

.cv-about-title-row {
  @apply flex items-center justify-between;
  margin: var(--cv-space-10xl) 0 var(--cv-space-3xl) 0;
}

.cv-about-title-row > .cv-section-title {
  @apply m-0;
}

.cv-vibe-title-row {
  @apply flex items-center justify-between;
  margin: 0 0 0 0;
}

.cv-vibe-title-row > .cv-section-title {
  @apply m-0;
}

.cv-vibe-title-actions {
  @apply flex items-center;
  gap: var(--cv-space-xs);
}

.cv-version-tag {
  font-family: var(--cv-font-headline) !important;
  font-size: var(--cv-font-size-xs) !important;
  font-weight: 700 !important;
  background: var(--p-primary-color) !important;
  color: var(--p-primary-contrast-color) !important;
  padding: 0.05rem 0.25rem !important;
  line-height: 1 !important;
  height: auto !important;
}

.cv-about-text {
  @apply text-right;
  color: var(--cv-on-surface-variant);
  color: var(--p-button-secondary-color);
}

.cv-links-container {
  @apply inline-flex items-center justify-end;
  gap: var(--cv-space-xs);
}

.cv-vibe-table {
  margin: 0 0 var(--cv-space-2xl) 0;
  border-radius: var(--cv-radius-sm);
  overflow: hidden;
}

.cv-vibe-table :deep(.p-datatable-table-container) {
  overflow-x: hidden;
  overflow-y: auto;
}

.cv-vibe-table :deep(.p-datatable-table) {
  table-layout: fixed;
  width: 100%;
}

.cv-vibe-thumb {
  @apply flex items-center justify-center shrink-0;
  width: 3rem;
  height: 3rem;
  border-radius: var(--cv-radius-sm);
  background: var(--cv-surface-container-high);
  color: var(--cv-on-surface-variant);
  font-size: var(--cv-font-size-2xl);
}

.cv-vibe-thumb > img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: inherit;
}

@media (max-width: 66.6667em) {
  .cv-vibe-thumb {
    width: 2.5rem;
    height: 2.5rem;
  }
}

.cv-vibe-name {
  @apply overflow-hidden whitespace-nowrap text-ellipsis;
  max-width: 100%;
}

.cv-vibe-actions {
  @apply inline-flex items-center;
  gap: var(--cv-space-xs);
}
</style>

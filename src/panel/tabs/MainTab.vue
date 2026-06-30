<template>
  <div class="cv-tab-content">
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
      </div>

      <div class="cv-about-title-row">
        <h2 class="cv-section-title">关于插件</h2>
        <Tag :value="'v' + manifest.version" class="cv-version-tag" rounded />
      </div>
      <div class="cv-section-body">
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
      </div>
    </template>

    <!-- 数据子 tab -->
    <template v-else-if="subTab === 'data'">
      <h2 class="cv-section-title">数据管理</h2>
      <div class="cv-data-management">
        <CollapsiblePanelItem
          title="Vibe 数据"
          :collapsed="vibeCollapsed"
          @toggle="vibeCollapsed = !vibeCollapsed"
        >
        <template #actions>
          <CvMiniButton
            label="下载全部"
            icon="fa-solid fa-download"
            :disabled="isVibeActionDisabled"
            :loading="isVibeActionBusy"
            size="small"
            @click="downloadAllVibes"
          />
          <CvMiniButton
            label="删除全部"
            icon="fa-solid fa-trash"
            tone="error"
            :disabled="isVibeActionDisabled"
            :loading="isVibeActionBusy"
            size="small"
            @click="deleteAllVibes"
          />
        </template>

        <DataTable
          v-model:selection="selectedVibeRows"
          :value="vibeRows"
          :loading="isVibeRowsLoading"
          data-key="sourceHash"
          class="cv-vibe-table"
          scrollable
          scroll-height="18rem"
        >
          <template #header>
            <div class="cv-vibe-batch-bar">
              <span class="cv-vibe-batch-count">
                {{ selectedVibeRows.length ? `已选 ${selectedVibeRows.length} 个` : `共 ${vibeRows.length} 个` }}
              </span>
              <div class="cv-vibe-batch-actions">
                <CvMiniButton
                  label="下载选中"
                  :disabled="!selectedVibeRows.length || isVibeActionBusy"
                  size="small"
                  @click="downloadSelectedVibes"
                />
                <CvMiniButton
                  label="删除选中"
                  tone="error"
                  :disabled="!selectedVibeRows.length || isVibeActionBusy"
                  size="small"
                  @click="deleteSelectedVibes"
                />
              </div>
            </div>
          </template>
            <Column selection-mode="multiple" style="width: 2.5rem; min-width: 2.5rem" />
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
                  <CvMiniButton
                    icon="fa-solid fa-download"
                    aria-label="下载"
                    :disabled="isVibeActionBusy"
                    @click="downloadVibe(data)"
                  />
                  <CvMiniButton
                    icon="fa-solid fa-trash"
                    tone="error"
                    aria-label="删除"
                    :disabled="isVibeActionBusy"
                    @click="deleteVibe(data)"
                  />
                </div>
              </template>
            </Column>
            <template #empty>暂无 vibe 数据</template>
          </DataTable>
      </CollapsiblePanelItem>

      <InlineFavoriteDataPanel
        :groups="favoriteGroups"
        :loading="isFavoriteGroupsLoading"
        :busy="isFavoriteActionBusy"
        @download-all="downloadAllFavorites"
        @delete-all="deleteAllFavorites"
        @download-group="downloadFavoriteGroup"
        @delete-group="deleteFavoriteGroup"
        @download-items="downloadFavoriteItems"
        @delete-items="deleteFavoriteItems"
      />
      </div>

      <h2 class="cv-section-title">重置设置</h2>
      <div class="cv-section-body">
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
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, ref, watch } from 'vue';
import { IMAGE_SOURCES } from '@/constants/comfyui';
import CvMiniButton from '@/panel/components/CvMiniButton.vue';
import CollapsiblePanelItem from '@/panel/components/CollapsiblePanelItem.vue';
import InlineFavoriteDataPanel from '@/panel/components/InlineFavoriteDataPanel.vue';
import { useSettingsStore } from '@/store/settings';
import {
  clearInlineImageFavorites,
  deleteInlineImageFavorite,
  deleteInlineImageFavoriteScope,
  listInlineImageFavoriteGroups,
  type InlineImageFavoriteGroup,
} from '@/services/inline-image/favorites-cache';
import {
  downloadAllInlineImageFavoriteGroups,
  downloadInlineImageFavoriteGroup,
  downloadInlineImageFavoriteItems,
} from '@/services/inline-image/favorites-download';
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
const vibeCollapsed = ref(true);
const vibeRows = ref<NovelAIVibeCacheListItem[]>([]);
const selectedVibeRows = ref<NovelAIVibeCacheListItem[]>([]);
const isVibeRowsLoading = ref(false);
const isVibeActionBusy = ref(false);
const isVibeActionDisabled = computed(
  () => isVibeRowsLoading.value || isVibeActionBusy.value || !vibeRows.value.length,
);
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
    console.error('[MainTab] 读取 vibe 数据失败', error);
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
    console.error('[MainTab] 读取收藏图片数据失败', error);
  } finally {
    isFavoriteGroupsLoading.value = false;
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
 * 批量下载选中 vibe
 */
async function downloadSelectedVibes(): Promise<void> {
  if (!selectedVibeRows.value.length) return;
  await runVibeAction(async () => {
    const hashes = selectedVibeRows.value.map(row => row.sourceHash);
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
async function deleteSelectedVibes(): Promise<void> {
  if (!selectedVibeRows.value.length) return;
  const confirmed = await confirmDangerAction(
    '删除选中 vibe 数据',
    `确定要删除选中的 ${selectedVibeRows.value.length} 个 vibe 浏览器缓存吗？预设引用会保留并显示为失效。`,
    '删除',
  );
  if (!confirmed) return;
  await runVibeAction(async () => {
    await Promise.all(selectedVibeRows.value.map(row => deleteNovelAIVibeSource(row.sourceHash)));
    selectedVibeRows.value = [];
    await refreshVibeRows();
    toastr.success('已删除选中 vibe 数据');
  }, '删除选中 vibe 数据失败');
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
  const confirmed = await confirmDangerAction(
    '删除 vibe 数据',
    `确定要删除“${fileName}”的浏览器缓存吗？预设引用会保留并显示为失效。`,
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
 * 删除全部 vibe 浏览器缓存
 */
async function deleteAllVibes(): Promise<void> {
  const confirmed = await confirmDangerAction(
    '删除全部 vibe 数据',
    '确定要删除全部 vibe 浏览器缓存吗？预设引用会保留并显示为失效。',
    '删除全部',
  );
  if (!confirmed) return;
  await runVibeAction(async () => {
    await clearNovelAIVibeCache();
    await refreshVibeRows();
    toastr.success('已删除全部 vibe 数据');
  }, '删除全部 vibe 数据失败');
}

/**
 * 下载单个收藏图片分组
 * @param group 收藏图片分组
 */
async function downloadFavoriteGroup(group: InlineImageFavoriteGroup): Promise<void> {
  await runFavoriteAction(async () => {
    await downloadInlineImageFavoriteGroup(group);
  }, '下载收藏图片失败');
}

/**
 * 下载全部收藏图片分组
 */
async function downloadAllFavorites(): Promise<void> {
  await runFavoriteAction(async () => {
    if (!favoriteGroups.value.length) {
      toastr.warning('暂无可下载的收藏图片');
      await refreshFavoriteGroups();
      return;
    }
    await downloadAllInlineImageFavoriteGroups(favoriteGroups.value);
  }, '下载全部收藏图片失败');
}

/**
 * 删除单个收藏图片分组
 * @param group 收藏图片分组
 */
async function deleteFavoriteGroup(group: InlineImageFavoriteGroup): Promise<void> {
  const confirmed = await confirmDangerAction('删除收藏图片', buildDeleteFavoriteGroupMessage(group), '删除');
  if (!confirmed) return;
  await runFavoriteAction(async () => {
    await deleteInlineImageFavoriteScope(group);
    await refreshFavoriteGroups();
    toastr.success('已删除收藏图片');
  }, '删除收藏图片失败');
}

/**
 * 删除全部收藏图片
 */
async function deleteAllFavorites(): Promise<void> {
  const confirmed = await confirmDangerAction('删除全部收藏图片', buildDeleteAllFavoritesMessage(), '删除全部');
  if (!confirmed) return;
  await runFavoriteAction(async () => {
    await clearInlineImageFavorites();
    await refreshFavoriteGroups();
    toastr.success('已删除全部收藏图片');
  }, '删除全部收藏图片失败');
}

/**
 * 批量下载选中的收藏图片
 * @param ids 选中的收藏记录 ID 列表
 */
async function downloadFavoriteItems(ids: number[]): Promise<void> {
  await runFavoriteAction(async () => {
    await downloadInlineImageFavoriteItems(ids, favoriteGroups.value);
  }, '下载选中收藏图片失败');
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
    console.error(`[MainTab] ${errorMessage}`, error);
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
    console.error(`[MainTab] ${errorMessage}`, error);
  } finally {
    isFavoriteActionBusy.value = false;
  }
}

/**
 * 构建单组收藏删除确认文案
 * @param group 收藏图片分组
 * @returns 确认文案
 */
function buildDeleteFavoriteGroupMessage(group: InlineImageFavoriteGroup): string {
  return `确定要删除角色“${group.characterKey}”在聊天“${group.chatId}”下的 ${group.count} 张收藏图片吗？`;
}

/**
 * 构建全部收藏删除确认文案
 * @returns 确认文案
 */
function buildDeleteAllFavoritesMessage(): string {
  const count = favoriteGroups.value.reduce((sum, group) => sum + group.count, 0);
  return `确定要删除全部 ${count} 张收藏图片吗？所有角色和聊天文件下的收藏图片都会被清空。`;
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

.cv-data-management {
  @apply flex flex-col;
  gap: var(--cv-space-2xl);
}

.cv-vibe-batch-bar {
  @apply flex flex-wrap items-center justify-between;
  gap: var(--cv-space-md);
}

.cv-vibe-batch-count {
  color: var(--cv-on-surface-variant);
  font-size: var(--cv-font-size-xs);
}

.cv-vibe-batch-actions {
  @apply flex flex-wrap items-center justify-end;
  gap: var(--cv-space-3xl);
}

.cv-vibe-table {
  margin: 0 0 var(--cv-space-2xl) 0;
  border-radius: var(--cv-radius-sm);
  overflow: hidden;
  padding-inline: 0!important;
}

.cv-vibe-table :deep(.p-datatable-table-container) {
  overflow-x: hidden;
  overflow-y: auto;
}

.cv-vibe-table :deep(.p-datatable-table) {
  table-layout: fixed;
  width: 100%;
}

/* vibe 表格无表头内容，隐藏避免空白行 */
.cv-vibe-table :deep(.p-datatable-thead) {
  display: none;
}

.cv-vibe-thumb {
  @apply flex shrink-0 items-center justify-center;
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
  @apply overflow-hidden text-ellipsis whitespace-nowrap;
  max-width: 100%;
}

.cv-vibe-actions {
  @apply inline-flex items-center;
  gap: var(--cv-space-2xl);
}

/* 下载按钮（第一个操作按钮）使用次要前景色 */
.cv-vibe-actions > :first-child :deep(.cv-prime-icon) {
  color: var(--cv-on-surface-variant);
}
</style>

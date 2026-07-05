<template>
  <div class="cv-field cv-vibe-panel">
    <div class="cv-vibe-toolbar">
      <Button label="添加" icon="fa-solid fa-plus" size="small" :disabled="isAppendingFiles" @click="triggerFileInput" />
      <input
        ref="fileInput"
        type="file"
        accept="image/*,.naiv4vibe"
        multiple
        class="hidden"
        @change="handleFileChange"
      />
      <input
        ref="thumbnailFileInput"
        type="file"
        accept="image/*"
        class="hidden"
        @change="handleThumbnailFileChange"
      />
    </div>

    <div v-if="!vibes.length" class="cv-vibe-empty">暂无 vibe</div>
    <div v-else class="cv-vibe-list">
      <CollapsiblePanelItem
        v-for="vibe in vibes"
        :key="vibe.id"
        :title="getDisplayFileName(vibe)"
        :collapsed="vibe.id !== activeVibeId"
        :disabled="!vibe.enabled"
        @toggle="toggleVibe(vibe.id)"
      >
        <template #title-extra>
          <Tag
            v-if="isVibeMissing(vibe)"
            value="失效"
            severity="danger"
            rounded
            class="cv-vibe-missing-tag"
          />
        </template>

        <template #actions>
          <div
            v-if="showParseButton(vibe)"
            class="cv-vibe-parse"
            :class="{ 'cv-vibe-parse-busy': isParsing(vibe.id) }"
            role="button"
            tabindex="0"
            aria-label="解析 vibe"
            @click="parseVibe(vibe)"
            @keydown.enter="parseVibe(vibe)"
          >
            <i :class="isParsing(vibe.id) ? 'fa-solid fa-spinner fa-spin' : 'fa-solid fa-wand-magic-sparkles'" />
            <span>解析</span>
          </div>
          <ToggleSwitch
            :model-value="vibe.enabled"
            :aria-label="getEnabledLabel(vibe)"
            @update:model-value="updateVibe(vibe.id, { enabled: Boolean($event) })"
          />
          <CvMiniButton
            icon="fa-solid fa-trash"
            tone="error"
            aria-label="删除 vibe"
            @click="removeVibe(vibe.id)"
          />
        </template>

        <section class="cv-vibe-editor">
          <button
            type="button"
            class="cv-vibe-thumbnail"
            :aria-label="`${getDisplayFileName(vibe)} 缩略图`"
            @click="triggerThumbnailInput(vibe)"
          >
            <img v-if="getThumbnailData(vibe)" :src="getThumbnailData(vibe)" alt="" />
            <span v-else class="cv-vibe-thumbnail-placeholder">
              <i class="fa-solid fa-image" />
            </span>
            <span class="cv-vibe-thumbnail-action">上传缩略图</span>
          </button>

          <div class="cv-vibe-controls">
            <label v-for="field in VIBE_NUMBER_FIELDS" :key="field.key" class="cv-vibe-control">
              <span>{{ field.label }}</span>
              <InputNumber
                :model-value="vibe[field.key]"
                :min="0"
                :max="1"
                :step="0.01"
                :min-fraction-digits="2"
                :max-fraction-digits="2"
                @update:model-value="updateNumber(vibe.id, field.key, $event)"
              />
            </label>
          </div>
        </section>
      </CollapsiblePanelItem>
    </div>
  </div>
</template>

<script setup lang="ts">
import { uuidv4 } from '@sillytavern/scripts/utils';

import {
  DEFAULT_IMAGE_PROMPT_VIBE_INFORMATION_EXTRACTED,
  DEFAULT_IMAGE_PROMPT_VIBE_REFERENCE_STRENGTH,
  MAX_NOVELAI_VIBES_PER_PRESET,
  type ImagePromptVibeRef,
} from '@/constants/novelai-vibe';
import { isNovelAIV3Model, type NovelAISettings } from '@/constants/novelai';
import CollapsiblePanelItem from '@/panel/components/CollapsiblePanelItem.vue';
import CvMiniButton from '@/panel/components/CvMiniButton.vue';
import { getNovelAIRequestAccounts } from '@/services/novelai/router';
import {
  saveNovelAIVibeFilePayload,
  saveNovelAIVibeThumbnailData,
  summarizeNovelAIVibeCache,
} from '@/services/novelai/vibe-cache';
import { getNovelAIVibeDisplayFileName } from '@/services/novelai/vibe-display';
import { parseNovelAIVibeFile, parseNovelAIVibeThumbnailFile } from '@/services/novelai/vibe-file';
import { resolveNovelAIVibeParameters } from '@/services/novelai/vibe-parameters';
import type { NovelAIVibeCacheSummary, ParsedNovelAIVibeFile } from '@/services/novelai/vibe-types';

type VibeNumberKey = 'referenceStrength' | 'informationExtracted';

const VIBE_NUMBER_FIELDS: Array<{ key: VibeNumberKey; label: string }> = [
  { key: 'referenceStrength', label: '参考强度' },
  { key: 'informationExtracted', label: '信息提取' },
];

const props = defineProps<{
  vibes: ImagePromptVibeRef[];
  settings: NovelAISettings;
}>();

const emit = defineEmits<{
  'update:vibes': [vibes: ImagePromptVibeRef[]];
}>();

const fileInput = ref<HTMLInputElement | null>(null);
const thumbnailFileInput = ref<HTMLInputElement | null>(null);
const thumbnailTargetVibeId = ref('');
const activeVibeId = ref('');
const summaries = ref<Record<string, NovelAIVibeCacheSummary>>({});
const parsingIds = ref<string[]>([]);
const isAppendingFiles = ref(false);
const refreshSections = inject<(() => void) | undefined>('refreshSections');

watch(
  () => createSummaryRefreshKey(props.vibes, props.settings.model),
  () => void refreshSummaries(),
  { immediate: true },
);

watch(
  () => props.vibes.map(vibe => vibe.id),
  ids => {
    if (!ids.includes(activeVibeId.value)) activeVibeId.value = '';
  },
);

/**
 * 打开文件选择器
 */
function triggerFileInput(): void {
  fileInput.value?.click();
}

/**
 * 打开缩略图文件选择器
 * @param vibe vibe 引用
 */
function triggerThumbnailInput(vibe: ImagePromptVibeRef): void {
  thumbnailTargetVibeId.value = vibe.id;
  thumbnailFileInput.value?.click();
}

/**
 * 处理 vibe 文件上传
 * @param event 文件选择事件
 */
async function handleFileChange(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const files = [...(input.files ?? [])];
  if (!files.length) return;
  if (isAppendingFiles.value) {
    input.value = '';
    toastr.warning('正在添加 vibe，请稍候');
    return;
  }
  isAppendingFiles.value = true;
  try {
    const addedCount = await appendUploadedFiles(files);
    if (addedCount) toastr.success(`已添加 ${addedCount} 个 vibe`);
  } catch (error) {
    handleVibeError(error, '添加 vibe 失败');
  } finally {
    isAppendingFiles.value = false;
    input.value = '';
  }
}

/**
 * 处理缩略图文件上传
 * @param event 文件选择事件
 */
async function handleThumbnailFileChange(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  try {
    if (file) await saveThumbnailFile(file);
  } catch (error) {
    handleVibeError(error, '保存缩略图失败');
  } finally {
    input.value = '';
    thumbnailTargetVibeId.value = '';
  }
}

/**
 * 保存缩略图文件到浏览器缓存
 * @param file 缩略图文件
 */
async function saveThumbnailFile(file: File): Promise<void> {
  const vibe = props.vibes.find(item => item.id === thumbnailTargetVibeId.value);
  if (!vibe) return;
  const thumbnailData = await parseNovelAIVibeThumbnailFile(file);
  await saveNovelAIVibeThumbnailData(vibe.sourceHash, thumbnailData);
  toastr.success('缩略图已保存');
  await refreshSummaries();
}

/**
 * 追加上传文件到当前预设
 * @param files 上传文件列表
 * @returns 实际添加数量
 */
async function appendUploadedFiles(files: File[]): Promise<number> {
  const acceptedFiles = takeAppendableFiles(files);
  const payloads = await Promise.all(acceptedFiles.map(parseAndCacheFile));
  const nextVibes = buildNextVibes(payloads);
  emitVibes(nextVibes);
  return nextVibes.length - props.vibes.length;
}

/**
 * 计算当前还可追加的文件列表
 * @param files 用户上传文件
 * @returns 允许追加的文件列表
 */
function takeAppendableFiles(files: File[]): File[] {
  const availableCount = MAX_NOVELAI_VIBES_PER_PRESET - props.vibes.length;
  if (availableCount <= 0) throw new Error(`单个 Vibe 组最多只能添加 ${MAX_NOVELAI_VIBES_PER_PRESET} 个 vibe`);
  if (files.length <= availableCount) return files;
  toastr.warning(`单个 Vibe 组最多支持 ${MAX_NOVELAI_VIBES_PER_PRESET} 个 vibe，已忽略多余文件`);
  return files.slice(0, availableCount);
}

/**
 * 根据当前剩余额度生成新的 vibe 列表
 * @param payloads 已解析文件载荷
 * @returns 最终可写入的 vibe 列表
 */
function buildNextVibes(payloads: ParsedNovelAIVibeFile[]): ImagePromptVibeRef[] {
  const nextRefs = payloads.map(createVibeRef);
  const availableCount = MAX_NOVELAI_VIBES_PER_PRESET - props.vibes.length;
  if (nextRefs.length <= availableCount) return [...props.vibes, ...nextRefs];
  toastr.warning(`单个 Vibe 组最多支持 ${MAX_NOVELAI_VIBES_PER_PRESET} 个 vibe，已忽略多余文件`);
  return [...props.vibes, ...nextRefs.slice(0, Math.max(availableCount, 0))];
}

/**
 * 解析并缓存单个上传文件
 * @param file 上传文件
 * @returns 解析载荷
 */
async function parseAndCacheFile(file: File): Promise<ParsedNovelAIVibeFile> {
  const payload = await parseNovelAIVibeFile(file);
  await saveNovelAIVibeFilePayload(
    payload,
    payload.model ?? props.settings.model,
    payload.informationExtracted ?? DEFAULT_IMAGE_PROMPT_VIBE_INFORMATION_EXTRACTED,
  );
  return payload;
}

/**
 * 创建新 vibe 引用
 * @param payload 文件载荷
 * @returns 轻量 vibe 引用
 */
function createVibeRef(payload: ParsedNovelAIVibeFile): ImagePromptVibeRef {
  return {
    id: uuidv4(),
    sourceHash: payload.sourceHash,
    enabled: true,
    referenceStrength: payload.referenceStrength ?? DEFAULT_IMAGE_PROMPT_VIBE_REFERENCE_STRENGTH,
    informationExtracted: payload.informationExtracted ?? DEFAULT_IMAGE_PROMPT_VIBE_INFORMATION_EXTRACTED,
    temporary: payload.sourceType === 'image',
  };
}

/**
 * 手动解析单个 vibe
 * @param vibe vibe 引用
 */
async function parseVibe(vibe: ImagePromptVibeRef): Promise<void> {
  setParsing(vibe.id, true);
  try {
    await resolveNovelAIVibeParameters(props.settings, [vibe], getNovelAIRequestAccounts(props.settings));
    toastr.success('vibe 已解析');
  } catch (error) {
    handleVibeError(error, 'vibe 解析失败');
  } finally {
    setParsing(vibe.id, false);
    await refreshSummaries();
  }
}

/**
 * 切换 vibe 面板折叠状态
 * @param id vibe ID
 */
function toggleVibe(id: string): void {
  activeVibeId.value = activeVibeId.value === id ? '' : id;
}

/**
 * 更新单个 vibe 字段
 * @param id vibe ID
 * @param patch 更新字段
 */
function updateVibe(id: string, patch: Partial<ImagePromptVibeRef>): void {
  emitVibes(props.vibes.map(vibe => (vibe.id === id ? { ...vibe, ...patch } : vibe)));
}

/**
 * 更新 vibe 数值字段
 * @param id vibe ID
 * @param key 数值字段
 * @param value PrimeVue 输入值
 */
function updateNumber(id: string, key: VibeNumberKey, value: number | null): void {
  if (typeof value !== 'number') return;
  updateVibe(id, { [key]: clamp01(value) });
}

/**
 * 删除单个 vibe
 * @param id vibe ID
 */
function removeVibe(id: string): void {
  emitVibes(props.vibes.filter(vibe => vibe.id !== id));
}

/**
 * 提交 vibe 列表并刷新 section 定位
 * @param nextVibes 新列表
 */
function emitVibes(nextVibes: ImagePromptVibeRef[]): void {
  emit('update:vibes', nextVibes);
  nextTick(() => refreshSections?.());
}

/**
 * 生成刷新缓存摘要所需的浅签名
 * @param vibes 当前 vibe 列表
 * @param model 当前 NovelAI 模型
 * @returns 仅与摘要相关的依赖键
 */
function createSummaryRefreshKey(vibes: readonly ImagePromptVibeRef[], model: NovelAISettings['model']): string {
  return `${model}|${vibes.map(vibe => `${vibe.id}:${vibe.sourceHash}:${vibe.informationExtracted}`).join('|')}`;
}

/**
 * 刷新全部缓存摘要
 */
async function refreshSummaries(): Promise<void> {
  try {
    const entries = await Promise.all(props.vibes.map(loadSummaryEntry));
    summaries.value = Object.fromEntries(entries);
  } catch (error) {
    console.error('[NovelAIVibePanel] 刷新 vibe 缓存状态失败', error);
  }
}

/**
 * 加载单个 vibe 缓存摘要
 * @param vibe vibe 引用
 * @returns 摘要映射项
 */
async function loadSummaryEntry(vibe: ImagePromptVibeRef): Promise<[string, NovelAIVibeCacheSummary]> {
  return [vibe.id, await summarizeNovelAIVibeCache(vibe.sourceHash, props.settings.model, vibe.informationExtracted)];
}

/**
 * 读取展示文件名
 * @param vibe vibe 引用
 * @returns 文件名
 */
function getDisplayFileName(vibe: ImagePromptVibeRef): string {
  const summary = summaries.value[vibe.id];
  if (isMissingSummary(summary)) return getNovelAIVibeDisplayFileName({ fileName: getFallbackFileName(vibe), hasEncoded: true });
  return getNovelAIVibeDisplayFileName(summary ?? { fileName: vibe.sourceHash.slice(0, 8), hasEncoded: false });
}

/**
 * 读取失效 vibe 的兜底文件名
 * @param vibe vibe 引用
 * @returns 兜底文件名
 */
function getFallbackFileName(vibe: ImagePromptVibeRef): string {
  return `${vibe.sourceHash.slice(0, 8)}.naiv4vibe`;
}

/**
 * 读取 vibe 缩略图
 * @param vibe vibe 引用
 * @returns 缩略图 data URL 或 undefined
 */
function getThumbnailData(vibe: ImagePromptVibeRef): string | undefined {
  return summaries.value[vibe.id]?.thumbnailData;
}

/**
 * 读取启用状态文案
 * @param vibe vibe 引用
 * @returns 可访问名称
 */
function getEnabledLabel(vibe: ImagePromptVibeRef): string {
  return vibe.enabled ? '禁用 vibe' : '启用 vibe';
}

/**
 * 判断 vibe 缓存是否已经丢失
 * @param vibe vibe 引用
 * @returns 是否失效
 */
function isVibeMissing(vibe: ImagePromptVibeRef): boolean {
  return isMissingSummary(summaries.value[vibe.id]);
}

/**
 * 判断缓存摘要是否代表失效 vibe
 * @param summary 缓存摘要
 * @returns 是否失效
 */
function isMissingSummary(summary: NovelAIVibeCacheSummary | undefined): boolean {
  return Boolean(summary && !summary.hasImage && !summary.hasEncoded);
}

/**
 * 判断是否显示手动解析按钮
 * @param vibe vibe 引用
 * @returns 是否显示
 */
function showParseButton(vibe: ImagePromptVibeRef): boolean {
  const summary = summaries.value[vibe.id];
  return Boolean(
    summary?.hasImage &&
      summary.hasImage &&
      !summary.hasEncoded &&
      !isNovelAIV3Model(props.settings.model),
  );
}

/**
 * 判断是否正在解析
 * @param id vibe ID
 * @returns 是否解析中
 */
function isParsing(id: string): boolean {
  return parsingIds.value.includes(id);
}

/**
 * 更新解析中状态
 * @param id vibe ID
 * @param active 是否解析中
 */
function setParsing(id: string, active: boolean): void {
  parsingIds.value = active ? [...parsingIds.value, id] : parsingIds.value.filter(item => item !== id);
}

/**
 * 约束 0 到 1 的数值
 * @param value 原始值
 * @returns 合法值
 */
function clamp01(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

/**
 * 处理 vibe UI 错误
 * @param error 捕获错误
 * @param fallback 默认文案
 */
function handleVibeError(error: unknown, fallback: string): void {
  const message = error instanceof Error ? error.message : fallback;
  toastr.error(message);
  console.error('[NovelAIVibePanel]', error);
}
</script>

<style scoped>
@reference '../../global.css';

.cv-vibe-panel {
  gap: var(--cv-space-2xl);
}

.cv-vibe-toolbar {
  @apply flex flex-col items-start justify-start;
  gap: var(--cv-space-xl);
  font-weight: 600;
}

.cv-vibe-empty {
  @apply text-center;
  padding: var(--cv-space-2xl);
  border: var(--cv-border-width) dashed var(--cv-surface-variant);
  border-radius: var(--cv-radius-sm);
  color: var(--cv-on-surface-variant);
}

.cv-vibe-list {
  @apply flex flex-col;
  gap: var(--cv-space-xl);
}

.cv-vibe-parse {
  @apply inline-flex cursor-pointer select-none items-center;
  gap: var(--cv-space-sm);
  padding: 0 var(--cv-space-sm);
  color: var(--cv-on-surface-variant);
  font-size: var(--cv-font-size-xs);
}

.cv-vibe-parse:hover {
  color: var(--cv-on-surface);
}

.cv-vibe-parse-busy {
  @apply pointer-events-none;
  opacity: 0.6;
}

.cv-vibe-missing-tag {
  flex: 0 0 auto;
  font-size: var(--cv-font-size-2xs) !important;
  line-height: 1 !important;
  padding: 0.08rem 0.32rem !important;
}

.cv-vibe-editor {
  @apply grid;
  grid-template-columns: minmax(7.5rem, 10rem) minmax(0, 1fr);
  gap: var(--cv-space-2xl);
  padding: var(--cv-space-2xl);
  border-top: var(--cv-border-width) solid var(--cv-surface-variant);
}

.cv-vibe-thumbnail {
  @apply relative w-full cursor-pointer overflow-hidden p-0;
  aspect-ratio: 1 / 1;
  border: var(--cv-border-width) solid var(--cv-surface-variant);
  border-radius: var(--cv-radius-sm);
  background: var(--cv-surface-container-high);
  color: var(--cv-on-surface-variant);
}

.cv-vibe-thumbnail > img,
.cv-vibe-thumbnail-placeholder {
  @apply size-full;
}

.cv-vibe-thumbnail > img {
  @apply block object-cover;
}

.cv-vibe-thumbnail-placeholder {
  @apply flex items-center justify-center;
  font-size: var(--cv-font-size-3xl);
}

.cv-vibe-thumbnail-action {
  @apply absolute right-0 bottom-0 left-0 text-center;
  padding: var(--cv-space-sm);
  background: color-mix(in srgb, var(--cv-surface-container-high) 86%, transparent);
  color: var(--cv-on-surface);
  font-size: var(--cv-font-size-xs);
}

.cv-vibe-controls {
  @apply flex min-w-0 flex-col justify-center;
  gap: var(--cv-space-xl);
}

.cv-vibe-control {
  @apply flex min-w-0 flex-col;
  gap: var(--cv-space-md);
  color: var(--cv-on-surface);
  font-size: var(--cv-font-size-md);
}

@media (max-width: 38rem) {
  .cv-vibe-editor {
    grid-template-columns: minmax(6rem, 8rem) minmax(0, 1fr);
  }
}
</style>

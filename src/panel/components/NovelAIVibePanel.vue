<template>
  <div class="cv-field">
    <div class="flex flex-col items-start justify-start gap-(--cv-space-xl) font-semibold">
      <Button label="添加" icon="fa-solid fa-plus" :disabled="isAppendingFiles" @click="triggerFileInput" />
      <input
        ref="fileInput"
        type="file"
        accept="image/*,.json,.naiv4vibe,.naiv4vibebundle"
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

    <div
      v-if="!vibes.length"
      class="rounded-(--cv-radius-sm) border-(length:--cv-border-width) border-dashed border-(--cv-surface-variant) p-(--cv-space-2xl) text-center text-(--cv-on-surface-variant)"
    >
      暂无 vibe
    </div>
    <div v-else class="flex flex-col gap-(--cv-space-xl)">
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
            class="shrink-0 leading-none"
          />
        </template>

        <template #actions>
          <div
            v-if="showParseButton(vibe)"
            class="inline-flex cursor-pointer select-none items-center gap-(--cv-space-sm) px-(--cv-space-sm) text-(length:--cv-font-size-xs) text-(--cv-on-surface-variant) hover:text-(--cv-on-surface)"
            :class="{ 'pointer-events-none opacity-60': isParsing(vibe.id) }"
            role="button"
            tabindex="0"
            aria-label="解析 vibe"
            @click="parseVibe(vibe)"
            @keydown.enter="parseVibe(vibe)"
          >
            <i :class="isParsing(vibe.id) ? 'fa-solid fa-spinner fa-spin' : 'fa-solid fa-wand-magic-sparkles'" />
            <span>解析</span>
          </div>
          <CvMiniToggleSwitch
            :model-value="vibe.enabled"
            :aria-label="getEnabledLabel(vibe)"
            @update:model-value="updateVibe(vibe.id, { enabled: Boolean($event) })"
          />
          <CvMiniButton
            icon="fa-regular fa-trash"
            tone="error"
            aria-label="删除 vibe"
            @click="removeVibe(vibe.id)"
          />
        </template>

        <section
          class="grid grid-cols-[minmax(7.5rem,10rem)_minmax(0,1fr)] gap-(--cv-space-2xl) p-(--cv-space-2xl) max-[38rem]:grid-cols-[minmax(6rem,8rem)_minmax(0,1fr)]"
        >
          <button
            type="button"
            class="relative aspect-square w-full cursor-pointer overflow-hidden rounded-(--cv-radius-sm) border-(length:--cv-border-width) border-solid border-(--cv-surface-variant) bg-(--cv-surface-container-high) p-0 text-(--cv-on-surface-variant)"
            :aria-label="`${getDisplayFileName(vibe)} 缩略图`"
            @click="triggerThumbnailInput(vibe)"
          >
            <img v-if="getThumbnailData(vibe)" :src="getThumbnailData(vibe)" alt="" class="block size-full object-cover" />
            <span
              v-else
              class="flex size-full items-center justify-center text-(length:--cv-font-size-2xl)"
            >
              <i class="fa-solid fa-image" />
            </span>
            <span
              class="absolute right-0 bottom-0 left-0 bg-[color-mix(in_srgb,var(--cv-surface-container-high)_86%,transparent)] p-(--cv-space-sm) text-center text-(length:--cv-font-size-xs) text-(--cv-on-surface)"
              >上传缩略图</span
            >
          </button>

          <div class="flex min-w-0 flex-col justify-center gap-(--cv-space-xl)">
            <label
              v-for="field in VIBE_NUMBER_FIELDS"
              :key="field.key"
              class="flex min-w-0 flex-col gap-(--cv-space-md) text-(length:--cv-font-size-base) text-(--cv-on-surface)"
            >
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
import {
  DEFAULT_IMAGE_PROMPT_VIBE_INFORMATION_EXTRACTED,
  type ImagePromptVibeRef,
} from '@/constants/novelai-vibe';
import { isNovelAIV3Model, isNovelAIV5Model, type NovelAISettings } from '@/constants/novelai';
import CollapsiblePanelItem from '@/panel/components/CollapsiblePanelItem.vue';
import CvMiniButton from '@/panel/components/CvMiniButton.vue';
import CvMiniToggleSwitch from '@/panel/components/CvMiniToggleSwitch.vue';
import { getNovelAIRequestAccounts } from '@/services/novelai/router';
import { saveNovelAIVibeThumbnailData, summarizeNovelAIVibeCache } from '@/services/novelai/vibe-cache';
import { getNovelAIVibeDisplayFileName } from '@/services/novelai/vibe-display';
import { parseNovelAIVibeFiles, parseNovelAIVibeThumbnailFile } from '@/services/novelai/vibe-file';
import {
  createNovelAIVibeRefs,
  limitNovelAIVibePayloads,
  saveNovelAIVibePayloads,
} from '@/services/novelai/vibe-import';
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
    else toastr.warning('文件中没有可用的 NovelAI vibe');
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
 * 保存缩略图文件到 SillyTavern 本地文件
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
  const payloads = await parseUploadedFiles(files);
  const limited = limitNovelAIVibePayloads(payloads, props.vibes.length);
  if (limited.skipped) reportSkippedVibes(limited.skipped);
  await saveNovelAIVibePayloads(limited.payloads, getImportDefaults());
  return appendPayloadRefs(limited.payloads);
}

/**
 * 解析用户选择的全部文件
 * @param files 用户上传文件
 * @returns 展开后的 vibe 载荷
 */
async function parseUploadedFiles(files: File[]): Promise<ParsedNovelAIVibeFile[]> {
  const payloadGroups = await Promise.all(files.map(parseNovelAIVibeFiles));
  return payloadGroups.flat();
}

/**
 * 报告超出上限的 vibe 数量
 * @param skipped 跳过数量
 */
function reportSkippedVibes(skipped: number): void {
  toastr.warning(`已忽略 ${skipped} 个超出上限的 vibe`);
}

/**
 * 读取导入默认参数
 * @returns 默认模型和信息提取强度
 */
function getImportDefaults(): { model: NovelAISettings['model']; informationExtracted: number } {
  return {
    model: props.settings.model,
    informationExtracted: DEFAULT_IMAGE_PROMPT_VIBE_INFORMATION_EXTRACTED,
  };
}

/**
 * 追加载荷引用到当前预设
 * @param payloads 已写入缓存的 vibe 载荷
 * @returns 新增数量
 */
function appendPayloadRefs(payloads: ParsedNovelAIVibeFile[]): number {
  const nextRefs = createNovelAIVibeRefs(payloads);
  activeVibeId.value = nextRefs[0]?.id ?? activeVibeId.value;
  emitVibes([...props.vibes, ...nextRefs]);
  return nextRefs.length;
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
      !isNovelAIV3Model(props.settings.model) &&
      !isNovelAIV5Model(props.settings.model),
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

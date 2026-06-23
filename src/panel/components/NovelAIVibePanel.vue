<template>
  <div class="cv-field cv-vibe-panel">
    <div class="cv-vibe-toolbar">
      <span>vibe</span>
      <Button label="添加" icon="fa-solid fa-plus" size="small" @click="triggerFileInput" />
      <input
        ref="fileInput"
        type="file"
        accept="image/*,.vibe,.vibe40,.vibe42"
        multiple
        class="hidden"
        @change="handleFileChange"
      />
    </div>
    <div v-if="!vibes.length" class="cv-vibe-empty">暂无 vibe</div>
    <div v-else class="cv-vibe-list">
      <details v-for="vibe in vibes" :key="vibe.id" class="cv-vibe-item">
        <summary class="cv-vibe-summary">
          <Checkbox
            :model-value="vibe.enabled"
            binary
            :aria-label="`${getFileName(vibe)} 启用状态`"
            @click.stop
            @update:model-value="updateVibe(vibe.id, { enabled: Boolean($event) })"
          />
          <span class="cv-vibe-name">{{ getFileName(vibe) }}</span>
          <span class="cv-vibe-status">{{ getStatusText(vibe) }}</span>
          <Button
            v-if="showParseButton(vibe)"
            icon="fa-solid fa-wand-magic-sparkles"
            label="解析"
            size="small"
            text
            :loading="isParsing(vibe.id)"
            @click.prevent.stop="parseVibe(vibe)"
          />
          <Button
            icon="fa-solid fa-trash"
            severity="danger"
            size="small"
            text
            aria-label="删除 vibe"
            @click.prevent.stop="removeVibe(vibe.id)"
          />
        </summary>
        <div class="cv-vibe-controls">
          <label class="cv-vibe-control">
            <span>参考强度</span>
            <InputNumber
              :model-value="vibe.referenceStrength"
              :min="0"
              :max="1"
              :step="0.01"
              :min-fraction-digits="2"
              :max-fraction-digits="2"
              @update:model-value="updateNumber(vibe.id, 'referenceStrength', $event)"
            />
          </label>
          <label class="cv-vibe-control">
            <span>信息提取</span>
            <InputNumber
              :model-value="vibe.informationExtracted"
              :min="0"
              :max="1"
              :step="0.01"
              :min-fraction-digits="2"
              :max-fraction-digits="2"
              @update:model-value="updateNumber(vibe.id, 'informationExtracted', $event)"
            />
          </label>
        </div>
      </details>
    </div>
  </div>
</template>

<script setup lang="ts">
import { uuidv4 } from '@sillytavern/scripts/utils';

import {
  DEFAULT_IMAGE_PROMPT_VIBE_INFORMATION_EXTRACTED,
  DEFAULT_IMAGE_PROMPT_VIBE_REFERENCE_STRENGTH,
  type ImagePromptVibeRef,
} from '@/constants/image-prompt';
import { isNovelAIV3Model, type NovelAISettings } from '@/constants/novelai';
import { getNovelAIRequestAccounts } from '@/services/novelai/router';
import { saveNovelAIVibeFilePayload, summarizeNovelAIVibeCache } from '@/services/novelai/vibe-cache';
import { parseNovelAIVibeFile } from '@/services/novelai/vibe-file';
import { resolveNovelAIVibeParameters } from '@/services/novelai/vibe-parameters';
import type { NovelAIVibeCacheSummary, ParsedNovelAIVibeFile } from '@/services/novelai/vibe-types';

type VibeNumberKey = 'referenceStrength' | 'informationExtracted';

const props = defineProps<{
  vibes: ImagePromptVibeRef[];
  settings: NovelAISettings;
}>();

const emit = defineEmits<{
  'update:vibes': [vibes: ImagePromptVibeRef[]];
}>();

const fileInput = ref<HTMLInputElement | null>(null);
const summaries = ref<Record<string, NovelAIVibeCacheSummary>>({});
const parsingIds = ref<string[]>([]);
const refreshSections = inject<(() => void) | undefined>('refreshSections');

watch(
  () => [props.vibes, props.settings.model] as const,
  () => void refreshSummaries(),
  { deep: true, immediate: true },
);

/**
 * 打开文件选择器
 */
function triggerFileInput(): void {
  fileInput.value?.click();
}

/**
 * 处理 vibe 文件上传
 * @param event 文件选择事件
 */
async function handleFileChange(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const files = [...(input.files ?? [])];
  if (!files.length) return;
  try {
    await appendUploadedFiles(files);
    toastr.success(`已添加 ${files.length} 个 vibe`);
  } catch (error) {
    handleVibeError(error, '添加 vibe 失败');
  } finally {
    input.value = '';
  }
}

/**
 * 追加上传文件到当前预设
 * @param files 上传文件列表
 */
async function appendUploadedFiles(files: File[]): Promise<void> {
  const payloads = await Promise.all(files.map(parseAndCacheFile));
  emitVibes([...props.vibes, ...payloads.map(createVibeRef)]);
}

/**
 * 解析并缓存单个上传文件
 * @param file 上传文件
 * @returns 解析载荷
 */
async function parseAndCacheFile(file: File): Promise<ParsedNovelAIVibeFile> {
  const payload = await parseNovelAIVibeFile(file);
  await saveNovelAIVibeFilePayload(payload, props.settings.model, DEFAULT_IMAGE_PROMPT_VIBE_INFORMATION_EXTRACTED);
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
    referenceStrength: DEFAULT_IMAGE_PROMPT_VIBE_REFERENCE_STRENGTH,
    informationExtracted: DEFAULT_IMAGE_PROMPT_VIBE_INFORMATION_EXTRACTED,
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
 * 读取 vibe 文件名
 * @param vibe vibe 引用
 * @returns 文件名
 */
function getFileName(vibe: ImagePromptVibeRef): string {
  return summaries.value[vibe.id]?.fileName ?? vibe.sourceHash.slice(0, 8);
}

/**
 * 读取当前解析状态文本
 * @param vibe vibe 引用
 * @returns 状态文本
 */
function getStatusText(vibe: ImagePromptVibeRef): string {
  if (isParsing(vibe.id)) return '解析中';
  const summary = summaries.value[vibe.id];
  if (!summary) return '检查中';
  return isNovelAIV3Model(props.settings.model) ? getV3StatusText(summary) : getV4StatusText(summary);
}

/**
 * 读取 V3 模型下的 vibe 状态
 * @param summary 缓存摘要
 * @returns 状态文本
 */
function getV3StatusText(summary: NovelAIVibeCacheSummary): string {
  return summary.hasImage ? 'V3 原图' : 'V3 需原图';
}

/**
 * 读取 V4/V4.5 模型下的 vibe 状态
 * @param summary 缓存摘要
 * @returns 状态文本
 */
function getV4StatusText(summary: NovelAIVibeCacheSummary): string {
  if (summary.hasExactEncoded || (!summary.hasImage && summary.hasEncoded)) return '已解析';
  return summary.hasImage ? '待解析' : '缓存缺失';
}

/**
 * 判断是否显示手动解析按钮
 * @param vibe vibe 引用
 * @returns 是否显示
 */
function showParseButton(vibe: ImagePromptVibeRef): boolean {
  const summary = summaries.value[vibe.id];
  return Boolean(summary?.hasImage && !summary.hasExactEncoded && !isNovelAIV3Model(props.settings.model));
}

/**
 * 判断 vibe 是否正在解析
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
.cv-vibe-panel {
  gap: var(--cv-space-2xl);
}

.cv-vibe-toolbar {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: flex-start;
  gap: var(--cv-space-xl);
  font-weight: 600;
}

.cv-vibe-empty {
  padding: var(--cv-space-2xl);
  border: var(--cv-border-width) dashed var(--cv-surface-variant);
  border-radius: var(--cv-radius-sm);
  color: var(--cv-on-surface-variant);
  text-align: center;
}

.cv-vibe-list {
  display: flex;
  flex-direction: column;
  gap: var(--cv-space-lg);
}

.cv-vibe-item {
  border: var(--cv-border-width) solid var(--cv-surface-variant);
  border-radius: var(--cv-radius-sm);
  background: color-mix(in srgb, var(--cv-surface-container-low) 56%, transparent);
}

.cv-vibe-summary {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto auto auto;
  align-items: center;
  gap: var(--cv-space-lg);
  padding: var(--cv-space-lg);
  cursor: pointer;
}

.cv-vibe-name {
  min-width: 0;
  overflow: hidden;
  color: var(--cv-on-surface);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cv-vibe-status {
  color: var(--cv-on-surface-variant);
  font-size: calc(var(--mainFontSize) * 0.85);
  white-space: nowrap;
}

.cv-vibe-controls {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--cv-space-xl);
  padding: 0 var(--cv-space-lg) var(--cv-space-lg);
}

.cv-vibe-control {
  display: flex;
  flex-direction: column;
  gap: var(--cv-space-md);
  min-width: 0;
  color: var(--cv-on-surface);
  font-size: calc(var(--mainFontSize) * 0.9);
}

@media (max-width: 38rem) {
  .cv-vibe-summary {
    grid-template-columns: auto minmax(0, 1fr) auto auto;
  }

  .cv-vibe-status {
    grid-column: 2 / -1;
  }

  .cv-vibe-controls {
    grid-template-columns: 1fr;
  }
}
</style>

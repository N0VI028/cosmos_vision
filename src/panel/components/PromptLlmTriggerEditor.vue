<template>
  <label class="cv-field cv-trigger-mode-field">
    <span>触发模式</span>
    <Select
      :model-value="topMode"
      :options="TOP_MODE_OPTIONS"
      option-label="label"
      option-value="value"
      class="cv-trigger-mode-select"
      @update:model-value="updateTopMode"
    />
  </label>

  <label v-if="showConditionEditor" class="cv-field cv-trigger-match-field">
    <span>匹配方式</span>
    <Select
      :model-value="conditionMatchMode"
      :options="CONDITION_MATCH_MODE_OPTIONS"
      option-label="label"
      option-value="value"
      class="cv-trigger-mode-select"
      @update:model-value="updateConditionMatchMode"
    />
  </label>

  <div v-if="showConditionEditor" class="cv-field cv-trigger-conditions-field">
    <span>触发条件</span>

    <div v-if="!conditionRows.length" class="cv-field-hint">无条件时四种匹配方式均不发送；始终触发忽略条件</div>

    <div v-for="(row, index) in conditionRows" :key="row.id" class="cv-trigger-condition-row">
      <Select
        :model-value="row.type"
        :options="buildTypeOptions()"
        option-label="label"
        option-value="value"
        class="cv-trigger-type-select"
        @update:model-value="value => updateRowType(index, value)"
      />

      <InputTags
        v-if="row.type === 'keyword'"
        :model-value="row.keywords"
        :allow-duplicate="false"
        add-on-blur
        delimiter=","
        class="cv-trigger-inputchips"
        @update:model-value="value => updateKeywordRow(index, value)"
      />

      <div v-else-if="row.type === 'model'" class="cv-trigger-model-control">
        <Select
          :model-value="row.value || null"
          :options="buildModelOptions(row.value)"
          option-label="label"
          option-value="value"
          placeholder="选择或输入模型 ID"
          filter
          editable
          class="cv-trigger-model-select"
          @update:model-value="value => updateModelRow(index, value)"
        />
        <Button
          icon="fa-solid fa-rotate"
          severity="secondary"
          outlined
          rounded
          :loading="isLoadingCheckpoints"
          aria-label="同步 ComfyUI checkpoint"
          @click="syncCheckpoints"
        />
      </div>

      <Select
        v-else
        :model-value="row.value || null"
        :options="IMAGE_SOURCE_OPTIONS"
        option-label="label"
        option-value="value"
        placeholder="选择生图源"
        class="cv-trigger-source-select"
        @update:model-value="value => updateImageSourceRow(index, value)"
      />

      <Button
        icon="fa-solid fa-trash"
        severity="danger"
        text
        size="small"
        aria-label="删除条件"
        @click="removeConditionRow(index)"
      />
    </div>

    <button type="button" class="cv-add-condition-btn-flat-wide" @click="addConditionRow">
      <i class="fa-solid fa-plus" /> 新增条件
    </button>
  </div>
</template>

<script setup lang="ts">
import { IMAGE_SOURCES, type ImageSource } from '@/constants/comfyui';
import { NOVELAI_MODELS, type PromptLlmMessage, type PromptLlmMessageTriggerMatchMode } from '@/constants/novelai';
import { fetchComfyUICheckpointNames } from '@/services/comfyui/api';
import {
  normalizePromptLlmMessageImageSources,
  normalizePromptLlmMessageKeywordGroups,
  normalizePromptLlmMessageKeywords,
  normalizePromptLlmMessageModels,
  resolvePromptLlmMessageTriggerMatchMode,
} from '@/services/prompt-llm/message-trigger';
import { useSettingsStore } from '@/store/settings';

type TopMode = 'always' | 'condition';
type ConditionType = 'keyword' | 'model' | 'image_source';
type ConditionMatchMode = Exclude<PromptLlmMessageTriggerMatchMode, 'always'>;

interface ConditionRow {
  id: string;
  type: ConditionType;
  keywords: string[];
  value: string;
}

interface TypeOption {
  label: string;
  value: ConditionType;
}

interface TextOption {
  label: string;
  value: string;
}

const TOP_MODE_OPTIONS: Array<{ label: string; value: TopMode }> = [
  { label: '始终触发', value: 'always' },
  { label: '条件触发', value: 'condition' },
];

const CONDITION_MATCH_MODE_OPTIONS: Array<{ label: string; value: ConditionMatchMode }> = [
  { label: '全部命中', value: 'all_match' },
  { label: '任一命中', value: 'any_match' },
  { label: '全部未命中', value: 'all_mismatch' },
  { label: '任一未命中', value: 'any_mismatch' },
];

const DEFAULT_CONDITION_MATCH_MODE: ConditionMatchMode = 'all_match';
const IMAGE_SOURCE_OPTIONS = IMAGE_SOURCES.map(item => ({ label: item.label, value: item.value }));
const NAI_MODEL_OPTIONS: TextOption[] = NOVELAI_MODELS.map(item => ({ label: item.label, value: item.value }));

const message = defineModel<PromptLlmMessage>({ required: true });
const { settings } = useSettingsStore();

const checkpointNames = ref<string[]>([]);
const isLoadingCheckpoints = ref(false);
let rowIdSeed = 0;
const conditionRows = ref<ConditionRow[]>(readConditionRowsFromMessage(message.value));

const matchMode = computed(() => resolvePromptLlmMessageTriggerMatchMode(message.value));
const topMode = computed<TopMode>(() => (matchMode.value === 'always' ? 'always' : 'condition'));
const showConditionEditor = computed(() => topMode.value === 'condition');
const conditionMatchMode = computed<ConditionMatchMode>(() =>
  matchMode.value === 'always' ? DEFAULT_CONDITION_MATCH_MODE : matchMode.value,
);

/** 外部草稿切换时重载条件行；编辑中以本地行为准 */
watch(
  () => message.value.id,
  () => {
    conditionRows.value = readConditionRowsFromMessage(message.value);
  },
);

/**
 * 更新一级触发模式（始终 / 条件）
 * @param value 一级模式
 */
function updateTopMode(value: TopMode | null | undefined): void {
  if (!value) return;
  if (value === 'always') {
    message.value.triggerMatchMode = 'always';
  } else if (matchMode.value === 'always') {
    message.value.triggerMatchMode = DEFAULT_CONDITION_MATCH_MODE;
  }
}

/**
 * 更新四种条件匹配方式
 * @param value 匹配方式
 */
function updateConditionMatchMode(value: ConditionMatchMode | null | undefined): void {
  if (!value) return;
  message.value.triggerMatchMode = value;
}

/**
 * 新增条件行，默认关键词；可再改为模型/生图源
 */
function addConditionRow(): void {
  conditionRows.value.push(createKeywordRow([]));
  writeConditionRows(conditionRows.value);
}

/**
 * 删除条件行
 * @param index 行下标
 */
function removeConditionRow(index: number): void {
  conditionRows.value.splice(index, 1);
  writeConditionRows(conditionRows.value);
}

/**
 * 切换条件行类型
 * @param index 行下标
 * @param type 新类型
 */
function updateRowType(index: number, type: ConditionType | null | undefined): void {
  if (!type) return;
  const current = conditionRows.value[index];
  if (!current) return;
  conditionRows.value[index] =
    type === 'keyword'
      ? { ...createKeywordRow(current.type === 'keyword' ? current.keywords : []), id: current.id }
      : { ...createValueRow(type, current.type === type ? current.value : ''), id: current.id };
  writeConditionRows(conditionRows.value);
}

/**
 * 更新关键词行
 * @param index 行下标
 * @param keywords 关键词
 */
function updateKeywordRow(index: number, keywords: string[] | null | undefined): void {
  const current = conditionRows.value[index];
  if (!current || current.type !== 'keyword') return;
  current.keywords = normalizePromptLlmMessageKeywords(keywords ?? []);
  writeConditionRows(conditionRows.value);
}

/**
 * 更新模型行
 * @param index 行下标
 * @param value 模型 ID
 */
function updateModelRow(index: number, value: string | null | undefined): void {
  const current = conditionRows.value[index];
  if (!current || current.type !== 'model') return;
  current.value = (value ?? '').trim();
  writeConditionRows(conditionRows.value);
}

/**
 * 更新生图源行
 * @param index 行下标
 * @param value 生图源
 */
function updateImageSourceRow(index: number, value: ImageSource | null | undefined): void {
  const current = conditionRows.value[index];
  if (!current || current.type !== 'image_source') return;
  current.value = value ?? '';
  writeConditionRows(conditionRows.value);
}

/**
 * 构建条件类型下拉选项
 * @returns 类型选项
 */
function buildTypeOptions(): TypeOption[] {
  return [
    { label: '关键词', value: 'keyword' },
    { label: '模型', value: 'model' },
    { label: '生图源', value: 'image_source' },
  ];
}

/**
 * 合并 NAI 内置与已同步 Comfy checkpoint 选项
 * @param selected 当前行已选值
 * @returns 选项
 */
function buildModelOptions(selected: string): TextOption[] {
  const options = new Map<string, TextOption>();
  for (const option of NAI_MODEL_OPTIONS) options.set(option.value, option);
  for (const name of checkpointNames.value) {
    const trimmed = name.trim();
    if (trimmed) options.set(trimmed, { label: trimmed, value: trimmed });
  }
  const current = selected.trim();
  if (current && !options.has(current)) options.set(current, { label: current, value: current });
  return [...options.values()];
}

/**
 * 同步 ComfyUI checkpoint 列表
 */
async function syncCheckpoints(): Promise<void> {
  if (!settings.comfyui.url.trim()) {
    toastr.warning('请先填写 ComfyUI URL');
    return;
  }
  isLoadingCheckpoints.value = true;
  try {
    checkpointNames.value = await fetchComfyUICheckpointNames(settings.comfyui);
    toastr.success(`成功获取 ${checkpointNames.value.length} 个 checkpoint`);
  } catch (error) {
    const text = error instanceof Error ? error.message : '获取 checkpoint 列表失败';
    toastr.error(text);
    console.error('[PromptLlmTriggerEditor]', error);
  } finally {
    isLoadingCheckpoints.value = false;
  }
}

/**
 * 从消息条件字段展开条件行；每个关键词组独立成行
 * @param source 消息
 * @returns 条件行
 */
function readConditionRowsFromMessage(source: PromptLlmMessage): ConditionRow[] {
  const rows: ConditionRow[] = [];
  for (const group of normalizePromptLlmMessageKeywordGroups(source.triggerKeywordGroups)) {
    rows.push(createKeywordRow(group));
  }
  for (const model of normalizePromptLlmMessageModels(source.triggerModels)) {
    rows.push(createValueRow('model', model));
  }
  for (const imageSource of normalizePromptLlmMessageImageSources(source.triggerImageSources)) {
    rows.push(createValueRow('image_source', imageSource));
  }
  return rows;
}

/**
 * 将条件行写回消息；关键词行各自保留为独立组
 * @param rows 条件行
 */
function writeConditionRows(rows: ConditionRow[]): void {
  const groups: string[][] = [];
  const models: string[] = [];
  const sources: string[] = [];
  for (const row of rows) {
    if (row.type === 'keyword') {
      groups.push(row.keywords);
      continue;
    }
    if (row.type === 'model') {
      if (row.value.trim()) models.push(row.value);
      continue;
    }
    if (row.value.trim()) sources.push(row.value);
  }
  message.value.triggerKeywordGroups = normalizePromptLlmMessageKeywordGroups(groups);
  message.value.triggerModels = normalizePromptLlmMessageModels(models);
  message.value.triggerImageSources = normalizePromptLlmMessageImageSources(sources);
}

/**
 * 创建关键词条件行
 * @param keywords 关键词
 * @returns 条件行
 */
function createKeywordRow(keywords: string[]): ConditionRow {
  return { id: nextRowId(), type: 'keyword', keywords: [...keywords], value: '' };
}

/**
 * 创建单值条件行
 * @param type 类型
 * @param value 值
 * @returns 条件行
 */
function createValueRow(type: Exclude<ConditionType, 'keyword'>, value: string): ConditionRow {
  return { id: nextRowId(), type, keywords: [], value };
}

/**
 * 生成条件行 id
 * @returns 唯一 id
 */
function nextRowId(): string {
  rowIdSeed += 1;
  return `trigger-row-${rowIdSeed}`;
}
</script>

<style scoped>
@reference '../../global.css';

.cv-trigger-mode-field,
.cv-trigger-match-field {
  @apply min-w-0;
}

.cv-trigger-mode-select {
  @apply w-full;
}

.cv-trigger-conditions-field {
  @apply min-w-0 w-full;
  display: flex;
  flex-direction: column;
  gap: var(--cv-space-md);
}

.cv-trigger-condition-row {
  @apply grid w-full items-center;
  grid-template-columns: minmax(6rem, 7.5rem) minmax(0, 1fr) auto;
  gap: var(--cv-space-md);
}

.cv-trigger-type-select,
.cv-trigger-model-select,
.cv-trigger-source-select,
.cv-trigger-inputchips {
  @apply w-full min-w-0;
}

.cv-trigger-model-control {
  @apply flex min-w-0 items-center;
  gap: var(--cv-space-md);
}

.cv-trigger-model-control > .cv-trigger-model-select {
  flex: 1;
}

.cv-add-condition-btn-flat-wide {
  @apply flex w-full cursor-pointer items-center justify-center;
  gap: var(--cv-space-sm);
  padding: var(--cv-space-md) 0;
  border: var(--cv-border-width) dashed var(--cv-surface-variant);
  border-radius: var(--cv-radius-sm);
  background: color-mix(in srgb, var(--cv-surface-container-low) 42%, transparent);
  color: var(--cv-on-surface-variant);
  font-size: var(--cv-font-size-sm);
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.cv-add-condition-btn-flat-wide:hover {
  border-color: var(--cv-outline);
  background: var(--cv-surface-container-low);
  color: var(--p-primary-color);
  box-shadow: 0 var(--cv-space-sm) var(--cv-space-3xl) color-mix(in srgb, var(--cv-on-surface) 10%, transparent);
}
</style>

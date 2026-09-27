<template>
  <label class="cv-field min-w-0">
    <span>触发模式</span>
    <Select
      :model-value="topMode"
      :options="TOP_MODE_OPTIONS"
      option-label="label"
      option-value="value"
      fluid
      class="w-full"
      @update:model-value="updateTopMode"
    />
  </label>

  <!-- cv-trigger-match-field / cv-trigger-conditions-field：PromptLlmMessageList 任意后代布局锚点 -->
  <label v-if="showConditionEditor" class="cv-field cv-trigger-match-field min-w-0">
    <span>匹配方式</span>
    <Select
      :model-value="conditionMatchMode"
      :options="CONDITION_MATCH_MODE_OPTIONS"
      option-label="label"
      option-value="value"
      fluid
      class="w-full"
      @update:model-value="updateConditionMatchMode"
    />
  </label>

  <div
    v-if="showConditionEditor"
    class="cv-field cv-trigger-conditions-field flex w-full min-w-0 flex-col gap-(--cv-space-md)"
  >
    <div class="cv-field-header flex flex-col items-start! gap-(--cv-space-xs)">
      <span>触发条件</span>
      <div class="cv-field-hint">{{ triggerMatchModeHint }}</div>
    </div>

    <CollapsiblePanelItem
      v-for="(row, index) in conditionRows"
      :key="row.id"
      :title="getConditionSummary(row)"
      :collapsed="!expandedRowIds.has(row.id)"
      @toggle="toggleRowExpanded(row.id)"
    >
      <template #actions>
        <CvMiniButton icon="fa-regular fa-trash" tone="danger" title="删除条件" aria-label="删除条件" @click="removeConditionRow(index)" />
      </template>
      <div class="flex flex-col gap-(--cv-space-lg)">
        <div class="cv-field">
          <span>条件类型</span>
          <Select
            :model-value="row.type"
            :options="buildTypeOptions()"
            option-label="label"
            option-value="value"
            fluid
            class="w-full"
            @update:model-value="value => updateRowType(index, value)"
          />
        </div>

        <div class="cv-field">
          <span>配置内容</span>

          <!-- 关键词输入 -->
          <InputTags
            v-if="row.type === 'keyword'"
            :model-value="row.keywords"
            :allow-duplicate="false"
            add-on-blur
            delimiter=","
            fluid
            class="min-w-0"
            @update:model-value="value => updateKeywordRow(index, value)"
          />

          <!-- 模型选择：AutoComplete 可输可选；Select editable+filter 会被下拉过滤框抢焦点 -->
          <div v-else-if="row.type === 'model'" class="flex min-w-0 items-center gap-(--cv-space-md)">
            <AutoComplete
              :model-value="row.value"
              :suggestions="modelSuggestions"
              placeholder="选择或输入模型 ID（支持正则，如 animal.*；ComfyUI 按工作流主模型匹配）"
              class="min-w-0 flex-1"
              dropdown
              fluid
              :pt="cosmosAutocompleteFieldPt"
              @update:model-value="value => updateModelRow(index, value)"
              @complete="event => searchModelSuggestions(event, row.value)"
              @dropdown-click="showAllModelSuggestions(row.value)"
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

          <!-- 生图源选择 -->
          <Select
            v-else
            :model-value="row.value || null"
            :options="IMAGE_SOURCE_OPTIONS"
            option-label="label"
            option-value="value"
            placeholder="选择生图源"
            fluid
            class="w-full min-w-0"
            @update:model-value="value => updateImageSourceRow(index, value)"
          />
        </div>
      </div>
    </CollapsiblePanelItem>

    <button
      type="button"
      class="flex w-full cursor-pointer items-center justify-center gap-(--cv-space-sm) rounded-(--cv-radius-sm) border-(length:--cv-border-width) border-dashed border-(--cv-surface-variant) bg-[color-mix(in_srgb,var(--cv-surface-container-low)_42%,transparent)] py-(--cv-space-md) text-(length:--cv-font-size-xs) text-(--cv-on-surface-variant) transition-all duration-250 ease-[cubic-bezier(0.4,0,0.2,1)] hover:border-(--cv-outline) hover:bg-(--cv-surface-container-low) hover:text-(--cvp-primary-color) hover:shadow-[0_var(--cv-space-sm)_var(--cv-space-3xl)_color-mix(in_srgb,var(--cv-on-surface)_10%,transparent)]"
      @click="addConditionRow"
    >
      <i class="fa-solid fa-plus" /> 新增条件
    </button>
  </div>
</template>

<script setup lang="ts">
import { IMAGE_SOURCES, type ImageSource } from '@/constants/comfyui';
import { NOVELAI_MODELS, type PromptLlmMessage, type PromptLlmMessageTriggerMatchMode } from '@/constants/novelai';
import CollapsiblePanelItem from '@/panel/components/CollapsiblePanelItem.vue';
import CvMiniButton from '@/panel/components/CvMiniButton.vue';
import { fetchComfyUICheckpointNames } from '@/services/comfyui/api';
import {
  normalizePromptLlmMessageImageSources,
  normalizePromptLlmMessageKeywordGroups,
  normalizePromptLlmMessageKeywords,
  normalizePromptLlmMessageModels,
  resolvePromptLlmMessageTriggerMatchMode,
} from '@/services/prompt-llm/message-trigger';
import { cosmosAutocompleteFieldPt } from '@/services/primevue/primevue-pt';
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

const TOP_MODE_OPTIONS: Array<{ label: string; value: TopMode }> = [
  { label: '始终触发', value: 'always' },
  { label: '条件触发', value: 'condition' },
];

const CONDITION_MATCH_MODE_OPTIONS: Array<{ label: string; value: ConditionMatchMode }> = [
  { label: '全部符合', value: 'all_match' },
  { label: '任一符合', value: 'any_match' },
  { label: '全部不符合', value: 'all_mismatch' },
  { label: '任一不符合', value: 'any_mismatch' },
];

const DEFAULT_CONDITION_MATCH_MODE: ConditionMatchMode = 'all_match';
const IMAGE_SOURCE_OPTIONS = IMAGE_SOURCES.map(item => ({ label: item.label, value: item.value }));
const NAI_MODEL_VALUES: string[] = NOVELAI_MODELS.map(item => item.value);

const message = defineModel<PromptLlmMessage>({ required: true });
const { settings } = useSettingsStore();

const checkpointNames = ref<string[]>([]);
const isLoadingCheckpoints = ref(false);
/** AutoComplete 筛选后的模型建议列表 */
const modelSuggestions = ref<string[]>([]);
let rowIdSeed = 0;
const conditionRows = ref<ConditionRow[]>(readConditionRowsFromMessage(message.value));

const matchMode = computed(() => resolvePromptLlmMessageTriggerMatchMode(message.value));
const topMode = computed<TopMode>(() => (matchMode.value === 'always' ? 'always' : 'condition'));
const showConditionEditor = computed(() => topMode.value === 'condition');
const conditionMatchMode = computed<ConditionMatchMode>(() =>
  matchMode.value === 'always' ? DEFAULT_CONDITION_MATCH_MODE : matchMode.value,
);

/** 处于展开状态的条件行 ID 集合 */
const expandedRowIds = ref<Set<string>>(new Set());

/**
 * 获取条件的只读摘要文本
 * @param row 条件行
 * @returns 摘要文本
 */
function getConditionSummary(row: ConditionRow): string {
  switch (row.type) {
    case 'keyword':
      return row.keywords.length > 0 ? `关键词: ${row.keywords.join(', ')}` : '关键词: 未配置';
    case 'model':
      return row.value ? `模型: ${row.value}` : '模型: 未配置';
    case 'image_source': {
      const matched = IMAGE_SOURCE_OPTIONS.find(item => item.value === row.value);
      return matched ? `生图源: ${matched.label}` : '生图源: 未配置';
    }
    default:
      return '未配置条件';
  }
}

/**
 * 获取当前匹配模式在无条件时的逻辑描述提示文本
 */
const triggerMatchModeHint = computed<string>(() => {
  const mode = conditionMatchMode.value;
  if (mode === 'all_match') {
    return '所有配置的条件必须全都满足时才发送。';
  }
  if (mode === 'any_match') {
    return '配置的条件中只要有任意一个满足即发送。';
  }
  if (mode === 'all_mismatch') {
    return '所有配置的条件必须全都不满足时才发送。';
  }
  if (mode === 'any_mismatch') {
    return '配置的条件中只要有任意一个满足就不发送。';
  }
  return '未配置条件时默认不发送。';
});

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
  const newRow = createKeywordRow([]);
  conditionRows.value.push(newRow);
  expandedRowIds.value.add(newRow.id); // 新条件自动展开
  writeConditionRows(conditionRows.value);
}

/**
 * 切换指定条件行的展开/折叠状态（有则删、无则加）
 * @param rowId 条件行 ID
 */
function toggleRowExpanded(rowId: string): void {
  if (expandedRowIds.value.has(rowId)) {
    expandedRowIds.value.delete(rowId);
  } else {
    expandedRowIds.value.add(rowId);
  }
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
 * 逐键触发，行内不 trim（避免吞掉输入中的空格），落库 trim 由 normalize 承担
 * @param index 行下标
 * @param value 模型 ID
 */
function updateModelRow(index: number, value: string | null | undefined): void {
  const current = conditionRows.value[index];
  if (!current || current.type !== 'model') return;
  current.value = value ?? '';
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
 * 构建模型候选全集（NAI 内置 + 已同步 Comfy checkpoint + 当前行已填值）
 * @param selected 当前行已填值
 * @returns 模型候选列表
 */
function buildModelValues(selected: string): string[] {
  const values = new Set(NAI_MODEL_VALUES);
  for (const name of checkpointNames.value) {
    const trimmed = name.trim();
    if (trimmed) values.add(trimmed);
  }
  const current = selected.trim();
  if (current) values.add(current);
  return [...values];
}

/**
 * AutoComplete 输入时按前缀过滤模型建议
 * @param event complete 事件（query 为当前输入）
 * @param selected 当前行已填值
 */
function searchModelSuggestions(event: { query: string }, selected: string): void {
  const query = event.query.toLowerCase().trim();
  const all = buildModelValues(selected);
  modelSuggestions.value = query ? all.filter(value => value.toLowerCase().includes(query)) : all;
}

/**
 * 点击 AutoComplete 下拉按钮时展示全部模型候选
 * @param selected 当前行已填值
 */
function showAllModelSuggestions(selected: string): void {
  modelSuggestions.value = buildModelValues(selected);
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

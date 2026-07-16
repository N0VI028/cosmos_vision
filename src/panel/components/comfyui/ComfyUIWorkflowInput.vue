<template>
  <div class="cv-workflow-input">
    <div class="cv-workflow-input__header">
      <span class="cv-workflow-input__label">{{ control.label }}</span>
      <div class="cv-workflow-input__actions">
        <Chip
          v-if="showPromptBinding"
          class="cv-workflow-input__binding-chip"
          :class="`is-${control.promptBinding ?? 'none'}`"
          @click="togglePromptBinding"
        >
          <span class="flex items-center gap-1.5 cursor-pointer">
            <i :class="bindingIcon" aria-hidden="true" />
            <span>{{ bindingLabel }}</span>
          </span>
        </Chip>
        <ToggleButton
          v-if="showSeedMode"
          :model-value="control.seedMode !== 'fixed' && control.seedMode !== undefined && control.seedMode !== null"
          class="cv-nai-mini-toggle"
          on-label="随机"
          off-label="随机"
          on-icon="fa-solid fa-check"
          off-icon="fa-solid fa-xmark"
          aria-label="切换随机种子"
          size="small"
          @update:model-value="onSeedToggleChange"
        />
      </div>
    </div>

    <div v-if="control.kind === 'link'" class="cv-workflow-input__link">
      来自节点 #{{ control.linkSource?.nodeId }} 输出 {{ control.linkSource?.outputIndex }}
    </div>
    <Select
      v-else-if="control.kind === 'select'"
      :model-value="String(control.value ?? '')"
      :options="selectOptions"
      option-label="label"
      option-value="value"
      class="w-full"
      @update:model-value="emitValue"
    />
    <InputNumber
      v-else-if="control.kind === 'number'"
      :model-value="Number(control.value ?? 0)"
      :min="control.min"
      :max="control.max"
      :step="control.step ?? 1"
      :use-grouping="false"
      :disabled="showSeedMode && control.seedMode !== 'fixed' && control.seedMode !== undefined && control.seedMode !== null"
      class="w-full"
      @update:model-value="emitValue"
    />
    <div v-else-if="control.kind === 'boolean'" class="cv-workflow-input__boolean">
      <Checkbox
        binary
        :model-value="Boolean(control.value)"
        @update:model-value="emitValue"
      />
      <span>{{ control.value ? 'true' : 'false' }}</span>
    </div>
    <Textarea
      v-else-if="control.kind === 'textarea'"
      :model-value="String(control.value ?? '')"
      rows="3"
      auto-resize
      class="w-full"
      @update:model-value="emitValue"
    />
    <InputText
      v-else-if="control.kind === 'text'"
      :model-value="String(control.value ?? '')"
      class="w-full"
      @update:model-value="emitValue"
    />
    <Textarea
      v-else-if="control.kind === 'json'"
      :model-value="textValue"
      rows="3"
      auto-resize
      class="w-full"
      @update:model-value="onTextChange"
    />
    <InputText
      v-else
      :model-value="String(control.value ?? '')"
      class="w-full"
      @update:model-value="emitValue"
    />
  </div>
</template>

<script setup lang="ts">
import type { ComfyUIInputControlDesc, PromptBinding, SeedMode } from '@/services/comfyui/types';

const props = defineProps<{
  control: ComfyUIInputControlDesc;
}>();

const emit = defineEmits<{
  'update:value': [value: unknown];
  'update:prompt-binding': [binding: PromptBinding | null];
  'update:seed-mode': [mode: SeedMode | null];
}>();

const promptBindingOptions = [
  { value: 'none', label: '不绑定' },
  { value: 'positive', label: '正向提示词' },
  { value: 'negative', label: '负向提示词' },
];



/**
 * 仅多行文本可绑定正负提示词；已绑定的单行字段仍展示以便解绑
 */
const showPromptBinding = computed(() => {
  if (props.control.kind === 'textarea') return true;
  return Boolean(props.control.promptBinding);
});

/**
 * 获取当前提示词绑定的显示文本
 */
const bindingLabel = computed(() => {
  const value = props.control.promptBinding ?? 'none';
  const option = promptBindingOptions.find(opt => opt.value === value);
  return option ? option.label : '不绑定';
});

/**
 * 获取当前提示词绑定的 FontAwesome 图标类名
 */
const bindingIcon = computed(() => {
  const value = props.control.promptBinding ?? 'none';
  if (value === 'positive') return 'fa-solid fa-circle-plus';
  if (value === 'negative') return 'fa-solid fa-circle-minus';
  return 'fa-solid fa-link-slash';
});

const showSeedMode = computed(() => {
  return props.control.kind === 'number' && Boolean(props.control.controlAfterGenerate || props.control.seedMode);
});

const selectOptions = computed(() => {
  return (props.control.options ?? []).map(value => ({ value, label: value }));
});

const textValue = computed(() => {
  if (props.control.kind === 'json') {
    try {
      return JSON.stringify(props.control.value, null, 2);
    } catch {
      return String(props.control.value ?? '');
    }
  }
  return String(props.control.value ?? '');
});

/**
 * 提交普通参数值
 * @param value 新值
 */
function emitValue(value: unknown): void {
  emit('update:value', value);
}

/**
 * 提交文本/JSON 值
 * @param value 文本
 */
function onTextChange(value: string | undefined): void {
  const text = value ?? '';
  if (props.control.kind !== 'json') {
    emitValue(text);
    return;
  }
  try {
    emitValue(JSON.parse(text));
  } catch {
    // 保留输入中的非法 JSON，不写回对象
  }
}

/**
 * 循环切换提示词绑定状态：未绑定 -> 正向提示词 -> 负向提示词 -> 未绑定
 */
function togglePromptBinding(): void {
  const current = props.control.promptBinding ?? 'none';
  let next: PromptBinding | null = null;
  if (current === 'none') {
    next = 'positive';
  } else if (current === 'positive') {
    next = 'negative';
  } else {
    next = null;
  }
  emit('update:prompt-binding', next);
}

/**
 * 切换随机种子开启状态
 * @param value 是否开启随机
 */
function onSeedToggleChange(value: boolean): void {
  emit('update:seed-mode', value ? 'randomize' : 'fixed');
}
</script>

<style scoped>
@reference '../../../global.css';

.cv-workflow-input {
  @apply flex flex-col;
  gap: var(--cv-space-sm);
  padding: var(--cv-space-lg) 0;
  border-bottom: var(--cv-border-width) solid var(--cv-surface-variant);
}

.cv-workflow-input:last-child {
  border-bottom: none;
}

.cv-workflow-input__header {
  @apply flex items-center justify-between;
  gap: var(--cv-space-lg);
}

.cv-workflow-input__label {
  font-size: var(--cv-font-size-sm);
  color: var(--cv-on-surface);
  font-weight: 600;
}

.cv-workflow-input__actions {
  @apply flex items-center;
  gap: var(--cv-space-sm);
}

.cv-nai-mini-toggle {
  @apply min-w-0;
  --p-togglebutton-sm-padding: var(--cv-space-xs) var(--cv-space-md);
  --p-togglebutton-content-sm-padding: var(--cv-space-xs) var(--cv-space-md);
  --p-togglebutton-sm-font-size: var(--cv-font-size-2xs);
}

.cv-nai-mini-toggle:deep(.cv-prime-togglebutton-content) {
  gap: var(--cv-space-xs);
  border-radius: var(--cv-radius-sm);
  line-height: 1;
}

.cv-workflow-input__binding-chip {
  cursor: pointer;
  transition: all 0.2s ease;
  user-select: none;
  font-size: var(--cv-font-size-2xs);
  padding: 0.15rem 0.5rem;
}

:deep(.cv-workflow-input__binding-chip) {
  cursor: pointer;
  transition: all 0.2s ease;
  user-select: none;
  font-size: var(--cv-font-size-2xs);
  padding: 0.15rem 0.5rem;
  line-height: 1.2;
  min-height: auto;
}

:deep(.cv-workflow-input__binding-chip.is-none) {
  background: var(--cv-surface-container-low) !important;
  border-color: var(--cv-outline) !important;
  color: var(--cv-on-surface-variant) !important;
}

:deep(.cv-workflow-input__binding-chip.is-none:hover) {
  background: var(--cv-surface-container-high) !important;
}

:deep(.cv-workflow-input__binding-chip.is-positive) {
  background: color-mix(in srgb, var(--p-primary-color) 12%, transparent) !important;
  border-color: var(--p-primary-color) !important;
  color: var(--p-primary-color) !important;
}

:deep(.cv-workflow-input__binding-chip.is-positive:hover) {
  background: color-mix(in srgb, var(--p-primary-color) 20%, transparent) !important;
}

:deep(.cv-workflow-input__binding-chip.is-negative) {
  background: color-mix(in srgb, #f59e0b 12%, transparent) !important;
  border-color: #f59e0b !important;
  color: #f59e0b !important;
}

:deep(.cv-workflow-input__binding-chip.is-negative:hover) {
  background: color-mix(in srgb, #f59e0b 20%, transparent) !important;
}

.cv-workflow-input__link {
  font-size: var(--cv-font-size-sm);
  color: var(--cv-on-surface-variant);
  font-family: Consolas, Monaco, monospace;
}

.cv-workflow-input__boolean {
  @apply flex items-center;
  gap: var(--cv-space-lg);
}
</style>

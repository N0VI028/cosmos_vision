<template>
  <div class="cv-workflow-input">
    <div class="cv-workflow-input__header">
      <span class="cv-workflow-input__label">{{ control.label }}</span>
      <div class="cv-workflow-input__actions">
        <Select
          v-if="showPromptBinding"
          :model-value="control.promptBinding ?? 'none'"
          :options="promptBindingOptions"
          option-label="label"
          option-value="value"
          class="cv-workflow-input__mini-select"
          @update:model-value="onPromptBindingChange"
        />
        <Select
          v-if="showSeedMode"
          :model-value="control.seedMode ?? 'fixed'"
          :options="seedModeOptions"
          option-label="label"
          option-value="value"
          class="cv-workflow-input__mini-select"
          @update:model-value="onSeedModeChange"
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
      v-else-if="control.kind === 'textarea' || control.kind === 'json'"
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

const seedModeOptions = [
  { value: 'fixed', label: '固定' },
  { value: 'randomize', label: '随机' },
  { value: 'increment', label: '递增' },
  { value: 'decrement', label: '递减' },
];

const showPromptBinding = computed(() => {
  return props.control.kind === 'text' || props.control.kind === 'textarea';
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
 * 切换提示词绑定
 * @param value 绑定值
 */
function onPromptBindingChange(value: string | null | undefined): void {
  if (!value || value === 'none') {
    emit('update:prompt-binding', null);
    return;
  }
  emit('update:prompt-binding', value as PromptBinding);
}

/**
 * 切换 seed 模式
 * @param value 模式值
 */
function onSeedModeChange(value: string | null | undefined): void {
  if (!value) {
    emit('update:seed-mode', null);
    return;
  }
  emit('update:seed-mode', value as SeedMode);
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

.cv-workflow-input__mini-select {
  min-width: 7rem;
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

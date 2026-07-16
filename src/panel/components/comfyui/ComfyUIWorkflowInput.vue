<template>
  <div class="cv-workflow-input">
    <div class="cv-workflow-input__header">
      <span class="cv-workflow-input__label">{{ control.label }}</span>
      <div class="cv-workflow-input__actions">
        <template v-if="control.canPromptBind">
          <Chip
            class="cv-workflow-action-chip"
            :class="[
              `is-${control.promptBinding ?? 'none'}`,
              { 'is-disabled': !online }
            ]"
            @click="online && promptPopover?.toggle($event)"
          >
            <span class="flex items-center gap-1.5">
              <i :class="currentBinding.icon" aria-hidden="true" />
              <span>{{ currentBinding.label }}</span>
              <i v-if="online" class="fa-solid fa-caret-down text-[0.65em] opacity-70" aria-hidden="true" />
            </span>
          </Chip>
          <Popover
            ref="promptPopover"
            :base-z-index="MACRO_POPOVER_BASE_Z_INDEX"
            :dt="MACRO_POPOVER_TOKENS"
            :pt="bindingPopoverPt"
          >
            <button
              v-for="option in alternateBindings"
              :key="option.value ?? 'none'"
              type="button"
              class="cv-workflow-input__binding-option"
              :class="`is-${option.value ?? 'none'}`"
              @click="selectPromptBinding(option.value)"
            >
              <i :class="option.icon" aria-hidden="true" />
              <span>{{ option.label }}</span>
            </button>
          </Popover>
        </template>

        <Chip
          v-if="showImageOutput"
          class="cv-workflow-action-chip"
          :class="[
            isImageOutput ? 'is-active' : 'is-inactive',
            { 'is-disabled': !online }
          ]"
          @click="online && emit('set-image-output')"
        >
          <span class="flex items-center gap-1.5">
            <i :class="isImageOutput ? 'fa-solid fa-circle-check' : 'fa-regular fa-circle'" aria-hidden="true" />
            <span>{{ isImageOutput ? '当前图片输出' : '设为图片输出' }}</span>
          </span>
        </Chip>

        <ToggleButton
          v-if="showSeedMode"
          :model-value="isSeedRandom"
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
      v-else-if="isDimensionControl"
      :model-value="Number(control.value ?? 0)"
      :options="COMFYUI_DIMENSION_PRESETS"
      editable
      class="w-full"
      :disabled="isValueDisabled"
      @update:model-value="onDimensionChange"
    />
    <Select
      v-else-if="control.kind === 'select'"
      :model-value="String(control.value ?? '')"
      :options="selectOptions"
      option-label="label"
      option-value="value"
      class="w-full"
      :disabled="isValueDisabled"
      @update:model-value="emit('update:value', $event)"
    />
    <InputNumber
      v-else-if="control.kind === 'number'"
      :model-value="Number(control.value ?? 0)"
      :min="control.min"
      :max="control.max"
      :step="control.step ?? 1"
      :use-grouping="false"
      :disabled="isValueDisabled"
      class="w-full"
      @update:model-value="emit('update:value', $event)"
    />
    <div v-else-if="control.kind === 'boolean'" class="cv-workflow-input__boolean">
      <Checkbox
        binary
        :model-value="Boolean(control.value)"
        :disabled="isValueDisabled"
        @update:model-value="emit('update:value', $event)"
      />
      <span>{{ control.value ? 'true' : 'false' }}</span>
    </div>
    <Textarea
      v-else-if="control.kind === 'textarea'"
      :model-value="String(control.value ?? '')"
      rows="3"
      auto-resize
      class="w-full"
      :disabled="isValueDisabled"
      @update:model-value="emit('update:value', $event)"
    />
    <InputText
      v-else-if="control.kind === 'text'"
      :model-value="String(control.value ?? '')"
      class="w-full"
      :disabled="isValueDisabled"
      @update:model-value="emit('update:value', $event)"
    />
    <Textarea
      v-else-if="control.kind === 'json'"
      :model-value="textValue"
      rows="3"
      auto-resize
      class="w-full"
      :disabled="isValueDisabled"
      @update:model-value="onJsonChange"
    />
    <InputText
      v-else
      :model-value="String(control.value ?? '')"
      class="w-full"
      :disabled="isValueDisabled"
      @update:model-value="emit('update:value', $event)"
    />
  </div>
</template>

<script setup lang="ts">
import type { PopoverPassThroughOptions } from 'primevue/popover';
import Popover from 'primevue/popover';
import { COMFYUI_DIMENSION_PRESETS } from '@/constants/comfyui';
import {
  MACRO_POPOVER_BASE_Z_INDEX,
  MACRO_POPOVER_TOKENS,
  type MacroPopoverInstance,
} from '@/panel/components/prompt-llm-macro-popover';
import type { ComfyUIInputControlDesc, PromptBinding, SeedMode } from '@/services/comfyui/types';

interface PromptBindingOption {
  value: PromptBinding | null;
  label: string;
  icon: string;
}

const BINDING_OPTIONS: PromptBindingOption[] = [
  { value: null, label: '不绑定', icon: 'fa-solid fa-link-slash' },
  { value: 'positive', label: '正向提示词', icon: 'fa-solid fa-circle-plus' },
  { value: 'negative', label: '负向提示词', icon: 'fa-solid fa-circle-minus' },
];

const bindingPopoverPt = {
  root: { class: 'cosmos-vision-root cv-workflow-input__binding-popover' },
  content: { class: 'cv-workflow-input__binding-popover-content' },
} satisfies PopoverPassThroughOptions;

const props = withDefaults(
  defineProps<{
    control: ComfyUIInputControlDesc;
    showImageOutput?: boolean;
    isImageOutput?: boolean;
    online?: boolean;
  }>(),
  {
    showImageOutput: false,
    isImageOutput: false,
    online: false,
  },
);

const emit = defineEmits<{
  'update:value': [value: unknown];
  'update:prompt-binding': [binding: PromptBinding | null];
  'update:seed-mode': [mode: SeedMode | null];
  'set-image-output': [];
}>();

const promptPopover = ref<MacroPopoverInstance | null>(null);

const currentBinding = computed(() => {
  const current = props.control.promptBinding ?? null;
  return BINDING_OPTIONS.find(opt => opt.value === current) ?? BINDING_OPTIONS[0];
});

const alternateBindings = computed(() => {
  const current = props.control.promptBinding ?? null;
  return BINDING_OPTIONS.filter(opt => opt.value !== current);
});

const showSeedMode = computed(
  () => props.control.kind === 'number' && Boolean(props.control.controlAfterGenerate || props.control.seedMode),
);

const isSeedRandom = computed(
  () => props.control.seedMode !== 'fixed' && props.control.seedMode != null,
);

/** 已绑提示词或随机 seed 时禁用值编辑 */
const isValueDisabled = computed(
  () => Boolean(props.control.promptBinding) || (showSeedMode.value && isSeedRandom.value),
);

const selectOptions = computed(() =>
  (props.control.options ?? []).map(value => ({ value, label: value })),
);

const isDimensionControl = computed(
  () =>
    props.control.kind === 'number' &&
    (props.control.inputName === 'width' || props.control.inputName === 'height'),
);

const textValue = computed(() => {
  if (props.control.kind !== 'json') return String(props.control.value ?? '');
  try {
    return JSON.stringify(props.control.value, null, 2);
  } catch {
    return String(props.control.value ?? '');
  }
});

/**
 * 解析并提交 JSON；非法内容不写回
 * @param value 文本
 */
function onJsonChange(value: string | undefined): void {
  try {
    emit('update:value', JSON.parse(value ?? ''));
  } catch {
    // 保留非法 JSON 输入
  }
}

/**
 * 提交尺寸值；可编辑 Select 手输时可能是字符串
 * @param value 下拉或手输值
 */
function onDimensionChange(value: string | number | null | undefined): void {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) return;
  emit('update:value', Math.round(num));
}

/**
 * 选择提示词绑定并关闭下拉
 * @param binding null 表示不绑定
 */
function selectPromptBinding(binding: PromptBinding | null): void {
  emit('update:prompt-binding', binding);
  promptPopover.value?.hide();
}

/**
 * 切换随机种子
 * @param value 是否随机
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

:deep(.cv-workflow-action-chip) {
  cursor: pointer;
  transition: all 0.2s ease;
  user-select: none;
  font-size: var(--cv-font-size-2xs);
  padding: 0.15rem 0.5rem;
  line-height: 1.2;
  min-height: auto;
}

:deep(.cv-workflow-action-chip.is-disabled) {
  opacity: 0.5;
  cursor: not-allowed !important;
}

:deep(.cv-workflow-action-chip.is-disabled:hover) {
  background: inherit !important;
  border-color: inherit !important;
  color: inherit !important;
}

:deep(.cv-workflow-action-chip.is-none),
:deep(.cv-workflow-action-chip.is-inactive) {
  background: var(--cv-surface-container-low) !important;
  border-color: var(--cv-outline) !important;
  color: var(--cv-on-surface-variant) !important;
}

:deep(.cv-workflow-action-chip.is-none:hover),
:deep(.cv-workflow-action-chip.is-inactive:hover) {
  background: var(--cv-surface-container-high) !important;
}

:deep(.cv-workflow-action-chip.is-positive),
:deep(.cv-workflow-action-chip.is-active) {
  background: color-mix(in srgb, var(--p-primary-color) 12%, transparent) !important;
  border-color: var(--p-primary-color) !important;
  color: var(--p-primary-color) !important;
}

:deep(.cv-workflow-action-chip.is-positive:hover),
:deep(.cv-workflow-action-chip.is-active:hover) {
  background: color-mix(in srgb, var(--p-primary-color) 20%, transparent) !important;
}

:deep(.cv-workflow-action-chip.is-negative) {
  background: color-mix(in srgb, #f59e0b 12%, transparent) !important;
  border-color: #f59e0b !important;
  color: #f59e0b !important;
}

:deep(.cv-workflow-action-chip.is-negative:hover) {
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

<!-- Popover 挂到 body，scoped 无法命中 -->
<style>
.cv-workflow-input__binding-popover {
  width: max-content;
  min-width: max-content;
}

.cv-workflow-input__binding-popover-content {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: var(--cv-space-xs);
  width: max-content;
}

.cv-workflow-input__binding-option {
  display: flex;
  align-items: center;
  gap: var(--cv-space-sm);
  padding: var(--cv-space-xs) var(--cv-space-lg);
  border: var(--cv-border-width) solid transparent;
  border-radius: var(--cv-radius-sm);
  background: transparent;
  color: var(--cv-on-surface);
  font-size: var(--cv-font-size-2xs);
  line-height: 1.2;
  cursor: pointer;
  text-align: left;
  white-space: nowrap;
}

.cv-workflow-input__binding-option:hover {
  background: var(--cv-surface-container-highest);
}

.cv-workflow-input__binding-option.is-positive {
  color: var(--p-primary-color);
}

.cv-workflow-input__binding-option.is-negative {
  color: #f59e0b;
}

.cv-workflow-input__binding-option.is-none {
  color: var(--cv-on-surface-variant);
}
</style>

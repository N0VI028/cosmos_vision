<template>
  <div
    class="cv-workflow-input flex flex-col gap-(--cv-space-sm) border-b-(length:--cv-border-width) border-b-solid border-b-(--cv-surface-variant) py-(--cv-space-lg) last:border-b-0"
  >
    <div class="flex items-center justify-between gap-(--cv-space-lg)">
      <span class="text-(length:--cv-font-size-xs) font-semibold text-(--cv-on-surface)">{{ control.label }}</span>
      <div class="flex items-center gap-(--cv-space-sm)">
        <template v-if="control.canPromptBind">
          <!-- 三态 Chip：class 挂在 Chip 根（PT root）；全局 chip 默认被业务变体覆盖 -->
          <Chip
            :class="chipRootClass"
            :pt="workflowActionChipPt"
            :data-cv-tutorial="promptBindingTutorialTarget"
            @click="online && promptPopover?.toggle($event)"
          >
            <span class="flex items-center gap-1.5">
              <i :class="currentBinding.icon" aria-hidden="true" />
              <span>{{ currentBinding.label }}</span>
              <i v-if="online" class="fa-solid fa-caret-down text-(length:--cv-font-size-xs) opacity-70" aria-hidden="true" />
            </span>
          </Chip>
          <Popover
            ref="promptPopover"
            :base-z-index="MACRO_POPOVER_BASE_Z_INDEX"
            :pt="bindingPopoverPt"
          >
            <button
              v-for="option in alternateBindings"
              :key="option.value ?? 'none'"
              type="button"
              class="cv-workflow-input__binding-option flex items-center gap-(--cv-space-sm) rounded-(--cv-radius-sm) border-(length:--cv-border-width) border-solid border-transparent bg-transparent px-(--cv-space-lg) py-(--cv-space-xs) text-left text-(length:--cv-font-size-xs) leading-[1.2] whitespace-nowrap cursor-pointer hover:bg-(--cv-surface-container-highest)"
              :class="bindingOptionColorClass(option.value)"
              @click="selectPromptBinding(option.value)"
            >
              <i :class="option.icon" aria-hidden="true" />
              <span>{{ option.label }}</span>
            </button>
          </Popover>
        </template>

        <ToggleButton
          v-if="showSeedMode"
          :model-value="isSeedRandom"
          class="min-w-0"
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

    <div
      v-if="control.kind === 'link'"
      class="font-mono text-(length:--cv-font-size-xs) text-(--cv-on-surface-variant)"
    >
      来自节点 #{{ control.linkSource?.nodeId }} 输出 {{ control.linkSource?.outputIndex }}
    </div>
    <div v-else-if="isCkptControl" class="flex w-full items-center gap-(--cv-space-sm)">
      <Select
        :model-value="String(control.value ?? '')"
        :options="ckptOptions"
        option-label="label"
        option-value="value"
        filter
        placeholder="选择或同步模型..."
        class="min-w-0 flex-1"
        fluid
        :disabled="isValueDisabled"
        @update:model-value="emit('update:value', $event)"
      />
      <Button
        icon="fa-solid fa-rotate"
        severity="secondary"
        outlined
        rounded
        :loading="isLoadingCheckpoints"
        :disabled="isValueDisabled"
        title="同步 ComfyUI 模型"
        aria-label="同步 ComfyUI 模型"
        @click="syncCheckpoints"
      />
    </div>
    <Select
      v-else-if="isDimensionControl"
      :model-value="Number(control.value ?? 0)"
      :options="COMFYUI_DIMENSION_PRESETS"
      editable
      fluid
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
      fluid
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
    <div
      v-else-if="control.kind === 'boolean'"
      class="flex items-center gap-(--cv-space-lg)"
    >
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
import type { ChipPassThroughOptions } from 'primevue/chip';
import type { PopoverPassThroughOptions } from 'primevue/popover';
import Popover from 'primevue/popover';
import { computed } from 'vue';
import { COMFYUI_DIMENSION_PRESETS } from '@/constants/comfyui';
import {
  MACRO_POPOVER_BASE_Z_INDEX,
  type MacroPopoverInstance,
} from '@/panel/components/prompt-llm-macro-popover';
import type { ComfyUIInputControlDesc, PromptBinding, SeedMode } from '@/services/comfyui/types';

import { fetchComfyUICheckpointNames } from '@/services/comfyui/api';

/** 工作流 Prompt 绑定 Chip：局部 PT 锚点（语义 class，样式在根 class 串） */
const workflowActionChipPt = {
  root: { class: 'cv-workflow-action-chip' },
  label: { class: 'cv-workflow-action-chip-label' },
} satisfies ChipPassThroughOptions;

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

/** 绑定 Popover：全局已有 cosmos-vision-root；仅追加业务布局类 */
const bindingPopoverPt = {
  root: { class: 'cv-workflow-input__binding-popover' },
  content: { class: 'cv-workflow-input__binding-popover-content' },
} satisfies PopoverPassThroughOptions;

const props = withDefaults(
  defineProps<{
    control: ComfyUIInputControlDesc;
    online?: boolean;
    comfyuiUrl?: string;
  }>(),
  {
    online: false,
    comfyuiUrl: '',
  },
);

const emit = defineEmits<{
  'update:value': [value: unknown];
  'update:prompt-binding': [binding: PromptBinding | null];
  'update:seed-mode': [mode: SeedMode | null];
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

/** 返回当前提示词绑定对应的教程锚点 */
const promptBindingTutorialTarget = computed(() => {
  if (props.control.promptBinding === 'positive') return 'comfyui-positive-binding';
  if (props.control.promptBinding === 'negative') return 'comfyui-negative-binding';
  return undefined;
});

/** Chip 根 class：紧凑布局 + 三态/禁用（class 直接上 Chip 根，无需 :deep） */
const chipRootClass = computed(() => {
  const base = [
    'cv-workflow-action-chip',
    'cursor-pointer select-none transition-[background,border-color,color] duration-150 ease-in-out',
    'text-(length:--cv-font-size-xs) leading-[1.2] min-h-auto px-[0.5em] py-[0.15em]',
  ];
  if (!props.online) {
    base.push('is-disabled opacity-50 cursor-not-allowed hover:bg-inherit hover:border-inherit hover:text-inherit');
  }
  const binding = props.control.promptBinding ?? 'none';
  if (binding === 'positive') {
    base.push(
      'is-positive',
      'bg-[color-mix(in_srgb,var(--p-primary-color)_12%,transparent)] border-(--p-primary-color) text-(--p-primary-color)',
      'hover:bg-[color-mix(in_srgb,var(--p-primary-color)_20%,transparent)]',
    );
  } else if (binding === 'negative') {
    base.push(
      'is-negative',
      'bg-[color-mix(in_srgb,var(--p-orange-500,#f59e0b)_12%,transparent)] border-(--p-orange-500,#f59e0b) text-(--p-orange-500,#f59e0b)',
      'hover:bg-[color-mix(in_srgb,var(--p-orange-500,#f59e0b)_20%,transparent)]',
    );
  } else {
    base.push(
      'is-none',
      'bg-(--cv-surface-container-low) border-(--cv-outline) text-(--cv-on-surface-variant)',
      'hover:bg-(--cv-surface-container-high)',
    );
  }
  return base.join(' ');
});

/**
 * 绑定选项文字色
 * @param value 绑定值
 */
function bindingOptionColorClass(value: PromptBinding | null): string {
  if (value === 'positive') return 'is-positive text-(--p-primary-color)';
  if (value === 'negative') return 'is-negative text-(--p-orange-500,#f59e0b)';
  return 'is-none text-(--cv-on-surface-variant)';
}

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

const isCkptControl = computed(
  () => props.control.inputName === 'ckpt_name',
);

const isLoadingCheckpoints = ref(false);
const fetchedCheckpoints = ref<string[]>([]);

/**
 * 同步 ComfyUI 可用 Checkpoint 列表
 */
async function syncCheckpoints(): Promise<void> {
  if (!props.comfyuiUrl.trim()) {
    toastr.warning('未填写 ComfyUI URL');
    return;
  }
  isLoadingCheckpoints.value = true;
  try {
    const list = await fetchComfyUICheckpointNames({ url: props.comfyuiUrl } as any);
    fetchedCheckpoints.value = list;
    toastr.success('已成功获取 ComfyUI 模型列表');
  } catch (error) {
    toastr.warning(error instanceof Error ? error.message : '获取 ComfyUI 模型列表失败');
  } finally {
    isLoadingCheckpoints.value = false;
  }
}

const ckptOptions = computed(() => {
  const values = [
    ...(props.control.value ? [String(props.control.value)] : []),
    ...fetchedCheckpoints.value,
    ...(props.control.options ?? []),
  ];
  return Array.from(new Set(values)).map(value => ({ value, label: value }));
});
</script>

<!--
  Popover 挂到 body，scoped 无法命中。
  迁移条件：Popover 改 Teleport 到组件内或全局 PT 注入宽度时，可删 unscoped。
-->
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
</style>

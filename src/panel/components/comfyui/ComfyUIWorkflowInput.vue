<template>
  <div
    class="cv-workflow-input border-b-solid flex flex-col gap-(--cv-space-sm) border-b-(length:--cv-border-width) border-b-(--cv-surface-variant) py-(--cv-space-lg) last:border-b-0"
  >
    <div class="flex items-center justify-between gap-(--cv-space-lg)">
      <span class="text-(length:--cv-font-size-xs) font-semibold text-(--cv-on-surface)">{{ control.label }}</span>
      <div class="flex items-center gap-(--cv-space-sm)">
        <!-- 提示词绑定 Chip -->
        <template v-if="control.canPromptBind">
          <Chip
            :class="chipRootClass"
            :pt="workflowActionChipPt"
            :data-cv-tutorial="promptBindingTutorialTarget"
            @click="online && promptPopover?.toggle($event)"
          >
            <span class="flex items-center gap-1.5">
              <i :class="currentBinding.icon" aria-hidden="true" />
              <span>{{ currentBinding.label }}</span>
              <i
                v-if="online"
                class="fa-solid fa-caret-down text-(length:--cv-font-size-xs) opacity-70"
                aria-hidden="true"
              />
            </span>
          </Chip>
          <Popover ref="promptPopover" :base-z-index="MACRO_POPOVER_BASE_Z_INDEX" :pt="bindingPopoverPt">
            <button
              v-for="option in alternateBindings"
              :key="option.value ?? 'none'"
              type="button"
              class="cv-workflow-input__binding-option flex cursor-pointer items-center gap-(--cv-space-sm) rounded-(--cv-radius-sm) border-(length:--cv-border-width) border-solid border-transparent bg-transparent px-(--cv-space-lg) py-(--cv-space-xs) text-left text-(length:--cv-font-size-xs) leading-[1.2] whitespace-nowrap hover:bg-(--cv-surface-container-highest)"
              :class="bindingOptionColorClass(option.value)"
              @click="selectPromptBinding(option.value)"
            >
              <i :class="option.icon" aria-hidden="true" />
              <span>{{ option.label }}</span>
            </button>
          </Popover>
        </template>

        <!-- 图像动态绑定 Chip -->
        <template v-if="control.canImageBind">
          <Chip
            :class="imageChipRootClass"
            :pt="workflowActionChipPt"
            title="点击切换动态头像绑定"
            @click="online && imagePopover?.toggle($event)"
          >
            <span class="flex items-center gap-1.5">
              <i :class="currentImageBinding.icon" aria-hidden="true" />
              <span>{{ currentImageBinding.label }}</span>
              <i
                v-if="online"
                class="fa-solid fa-caret-down text-(length:--cv-font-size-xs) opacity-70"
                aria-hidden="true"
              />
            </span>
          </Chip>
          <Popover ref="imagePopover" :base-z-index="MACRO_POPOVER_BASE_Z_INDEX" :pt="bindingPopoverPt">
            <button
              v-for="option in alternateImageBindings"
              :key="option.value ?? 'none'"
              type="button"
              class="cv-workflow-input__binding-option flex cursor-pointer items-center gap-(--cv-space-sm) rounded-(--cv-radius-sm) border-(length:--cv-border-width) border-solid border-transparent bg-transparent px-(--cv-space-lg) py-(--cv-space-xs) text-left text-(length:--cv-font-size-xs) leading-[1.2] whitespace-nowrap text-(--cv-on-surface) hover:bg-(--cv-surface-container-highest)"
              @click="selectImageBinding(option.value)"
            >
              <i :class="option.icon" class="text-(--cv-on-surface-variant)" aria-hidden="true" />
              <span>{{ option.label }}</span>
            </button>
          </Popover>
        </template>

        <!-- 随机种子 ToggleButton -->
        <ToggleButton
          v-if="showSeedMode"
          :model-value="isSeedRandom"
          class="min-w-0"
          on-label="随机"
          off-label="固定"
          on-icon="fa-solid fa-check"
          off-icon="fa-solid fa-xmark"
          aria-label="切换随机种子"
          size="small"
          @update:model-value="onSeedToggleChange"
        />
      </div>
    </div>

    <!-- 连线引用 -->
    <div
      v-if="control.kind === 'link'"
      class="font-mono text-(length:--cv-font-size-xs) text-(--cv-on-surface-variant)"
    >
      来自节点 #{{ control.linkSource?.nodeId }} 的输出 {{ control.linkSource?.outputIndex }}
    </div>

    <!-- 模型 Checkpoint 控件 -->
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
        title="同步 ComfyUI 模型列表"
        aria-label="同步 ComfyUI 模型列表"
        @click="syncCheckpoints"
      />
    </div>

    <!-- 图像输入控件 -->
    <div v-else-if="control.isImageInput" class="flex flex-col gap-(--cv-space-sm)">
      <div class="flex w-full items-center gap-(--cv-space-sm)">
        <Select
          v-if="imageOptions.length > 0"
          :model-value="String(control.value ?? '')"
          :options="imageOptions"
          option-label="label"
          option-value="value"
          editable
          filter
          placeholder="输入或选择图片文件名..."
          class="min-w-0 flex-1"
          fluid
          :disabled="isValueDisabled"
          @update:model-value="emit('update:value', $event)"
        />
        <InputText
          v-else
          :model-value="String(control.value ?? '')"
          placeholder="图片文件名 (例如 input.png)..."
          class="min-w-0 flex-1"
          :disabled="isValueDisabled"
          @update:model-value="emit('update:value', $event)"
        />

        <!-- 本地图片上传按钮 -->
        <Button
          icon="fa-solid fa-arrow-up-from-bracket"
          severity="secondary"
          outlined
          rounded
          :loading="isUploadingImage"
          :disabled="isValueDisabled || !online"
          title="上传本地图片至 ComfyUI"
          aria-label="上传本地图片"
          @click="fileInputRef?.click()"
        />
        <input
          ref="fileInputRef"
          type="file"
          accept="image/*"
          class="hidden"
          @change="onLocalFileSelected"
        />
      </div>

      <!-- 图片缩略图预览卡片 -->
      <div
        v-if="effectivePreviewUrl"
        class="relative flex items-center gap-(--cv-space-md) rounded-(--cv-radius-sm) bg-(--cv-surface-container-low) p-(--cv-space-sm)"
      >
        <img
          :src="effectivePreviewUrl"
          alt="预览"
          class="h-12 w-12 rounded-full object-cover border border-solid border-(--cv-outline-variant)"
          @error="handlePreviewError"
        />
        <div class="flex min-w-0 flex-1 flex-col text-(length:--cv-font-size-xs)">
          <span class="truncate font-semibold text-(--cv-on-surface)">{{ previewTitle }}</span>
          <span class="text-(--cv-on-surface-variant) opacity-80">{{ previewSubtitle }}</span>
        </div>
      </div>
    </div>

    <!-- 尺寸分辨率控件 -->
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

    <!-- 普通下拉控件 -->
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

    <!-- 数字控件 -->
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

    <!-- 布尔控件 -->
    <div v-else-if="control.kind === 'boolean'" class="flex items-center gap-(--cv-space-lg)">
      <Checkbox
        binary
        :model-value="Boolean(control.value)"
        :disabled="isValueDisabled"
        @update:model-value="emit('update:value', $event)"
      />
      <span>{{ control.value ? 'true' : 'false' }}</span>
    </div>

    <!-- 多行文本控件 -->
    <Textarea
      v-else-if="control.kind === 'textarea'"
      :model-value="String(control.value ?? '')"
      rows="3"
      auto-resize
      class="w-full"
      :disabled="isValueDisabled"
      @update:model-value="emit('update:value', $event)"
    />

    <!-- 单行文本控件 -->
    <InputText
      v-else-if="control.kind === 'text'"
      :model-value="String(control.value ?? '')"
      class="w-full"
      :disabled="isValueDisabled"
      @update:model-value="emit('update:value', $event)"
    />

    <!-- JSON 控件 -->
    <Textarea
      v-else-if="control.kind === 'json'"
      :model-value="textValue"
      rows="3"
      auto-resize
      class="w-full"
      :disabled="isValueDisabled"
      @update:model-value="onJsonChange"
    />

    <!-- 兜底输入控件 -->
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
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { COMFYUI_DIMENSION_PRESETS } from '@/constants/comfyui';
import { MACRO_POPOVER_BASE_Z_INDEX, type MacroPopoverInstance } from '@/panel/components/prompt-llm-macro-popover';
import type {
  ComfyUIInputControlDesc,
  PromptBinding,
  SeedMode,
} from '@/services/comfyui/types';
import type { TavernAvatarSource } from '@/services/tavern-helper/avatar';
import { fetchComfyUICheckpointNames, uploadComfyUIImage } from '@/services/comfyui/api';
import { normalizeComfyUIUrl } from '@/services/comfyui/parse';
import { getAvatarPath } from '@/services/tavern-helper/avatar';

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

interface ImageBindingOption {
  value: TavernAvatarSource | null;
  label: string;
  icon: string;
}

const IMAGE_BINDING_OPTIONS: ImageBindingOption[] = [
  { value: null, label: '不绑定', icon: 'fa-solid fa-link-slash' },
  { value: 'character-avatar', label: '绑定当前角色头像', icon: 'fa-solid fa-user-ninja' },
  { value: 'user-avatar', label: '绑定当前用户头像', icon: 'fa-solid fa-user' },
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
  'update:image-binding': [source: TavernAvatarSource | null];
  'update:seed-mode': [mode: SeedMode | null];
}>();

const promptPopover = ref<MacroPopoverInstance | null>(null);
const imagePopover = ref<MacroPopoverInstance | null>(null);
const fileInputRef = ref<HTMLInputElement | null>(null);
const isUploadingImage = ref(false);
const localPreviewUrl = ref('');
const hasPreviewError = ref(false);

const currentBinding = computed(() => {
  const current = props.control.promptBinding ?? null;
  return BINDING_OPTIONS.find(opt => opt.value === current) ?? BINDING_OPTIONS[0];
});

const alternateBindings = computed(() => {
  const current = props.control.promptBinding ?? null;
  return BINDING_OPTIONS.filter(opt => opt.value !== current);
});

const currentImageBinding = computed(() => {
  const current = props.control.imageBinding ?? null;
  return IMAGE_BINDING_OPTIONS.find(opt => opt.value === current) ?? IMAGE_BINDING_OPTIONS[0];
});

const alternateImageBindings = computed(() => {
  const current = props.control.imageBinding ?? null;
  return IMAGE_BINDING_OPTIONS.filter(opt => opt.value !== current);
});

/** 返回当前提示词绑定对应的教程锚点 */
const promptBindingTutorialTarget = computed(() => {
  if (props.control.promptBinding === 'positive') return 'comfyui-positive-binding';
  if (props.control.promptBinding === 'negative') return 'comfyui-negative-binding';
  return undefined;
});

/** Prompt Chip 根 class */
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
      'bg-[color-mix(in_srgb,var(--cvp-primary-color)_12%,transparent)] border-(--cvp-primary-color) text-(--cvp-primary-color)',
      'hover:bg-[color-mix(in_srgb,var(--cvp-primary-color)_20%,transparent)]',
    );
  } else if (binding === 'negative') {
    base.push(
      'is-negative',
      'bg-[color-mix(in_srgb,var(--cvp-orange-500)_12%,transparent)] border-(--cvp-orange-500) text-(--cvp-orange-500)',
      'hover:bg-[color-mix(in_srgb,var(--cvp-orange-500)_20%,transparent)]',
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

/** Image Chip 根 class（与正向绑定一致，使用主题色） */
const imageChipRootClass = computed(() => {
  const base = [
    'cv-workflow-action-chip',
    'cursor-pointer select-none transition-[background,border-color,color] duration-150 ease-in-out',
    'text-(length:--cv-font-size-xs) leading-[1.2] min-h-auto px-[0.5em] py-[0.15em]',
  ];
  if (!props.online) {
    base.push('is-disabled opacity-50 cursor-not-allowed hover:bg-inherit hover:border-inherit hover:text-inherit');
  }
  const binding = props.control.imageBinding;
  if (binding) {
    base.push(
      'is-bound',
      'bg-[color-mix(in_srgb,var(--cvp-primary-color)_12%,transparent)] border-(--cvp-primary-color) text-(--cvp-primary-color)',
      'hover:bg-[color-mix(in_srgb,var(--cvp-primary-color)_20%,transparent)]',
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
  if (value === 'positive') return 'is-positive text-(--cvp-primary-color)';
  if (value === 'negative') return 'is-negative text-(--cvp-orange-500)';
  return 'is-none text-(--cv-on-surface-variant)';
}

const showSeedMode = computed(
  () => props.control.kind === 'number' && Boolean(props.control.controlAfterGenerate || props.control.seedMode),
);

const isSeedRandom = computed(() => props.control.seedMode !== 'fixed' && props.control.seedMode != null);

/** 已绑定提示词、已绑定头像或随机 seed 时禁用值编辑 */
const isValueDisabled = computed(
  () =>
    Boolean(props.control.promptBinding) ||
    Boolean(props.control.imageBinding) ||
    (showSeedMode.value && isSeedRandom.value),
);

const selectOptions = computed(() => (props.control.options ?? []).map(value => ({ value, label: value })));

const imageOptions = computed(() => {
  const values = [
    ...(props.control.value ? [String(props.control.value)] : []),
    ...(props.control.options ?? []),
  ];
  return Array.from(new Set(values)).map(value => ({ value, label: value }));
});

const isDimensionControl = computed(
  () =>
    props.control.kind === 'number' && (props.control.inputName === 'width' || props.control.inputName === 'height'),
);

const textValue = computed(() => {
  if (props.control.kind !== 'json') return String(props.control.value ?? '');
  try {
    return JSON.stringify(props.control.value, null, 2);
  } catch {
    return String(props.control.value ?? '');
  }
});

/** 图像预览 URL */
const effectivePreviewUrl = computed(() => {
  if (hasPreviewError.value) return '';
  if (localPreviewUrl.value) return localPreviewUrl.value;
  if (props.control.imageBinding === 'character-avatar') {
    return getAvatarPath('character-avatar') ?? '';
  }
  if (props.control.imageBinding === 'user-avatar') {
    return getAvatarPath('user-avatar') ?? '';
  }
  if (props.online && props.comfyuiUrl && props.control.value) {
    try {
      const baseUrl = normalizeComfyUIUrl(props.comfyuiUrl);
      return `${baseUrl}/view?filename=${encodeURIComponent(String(props.control.value))}&type=input`;
    } catch {
      return '';
    }
  }
  return '';
});

const previewTitle = computed(() => {
  if (props.control.imageBinding === 'character-avatar') return '当前角色头像';
  if (props.control.imageBinding === 'user-avatar') return '当前用户头像';
  return String(props.control.value ?? '未选择图片');
});

const previewSubtitle = computed(() => {
  if (props.control.imageBinding) return '生图时动态提取并上传';
  return 'ComfyUI 输入图片';
});

watch(
  () => [props.control.value, props.control.imageBinding],
  () => {
    hasPreviewError.value = false;
  },
);

// 释放上一次的 Blob URL，避免长会话累积泄漏
watch(localPreviewUrl, (next, prev) => {
  if (prev && prev !== next) URL.revokeObjectURL(prev);
});

onBeforeUnmount(() => {
  if (localPreviewUrl.value) URL.revokeObjectURL(localPreviewUrl.value);
});

function handlePreviewError(): void {
  hasPreviewError.value = true;
}

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
 * 选择图片绑定并关闭下拉
 * @param source null 表示不绑定
 */
function selectImageBinding(source: TavernAvatarSource | null): void {
  emit('update:image-binding', source);
  imagePopover.value?.hide();
}

/**
 * 切换随机种子
 * @param value 是否随机
 */
function onSeedToggleChange(value: boolean): void {
  emit('update:seed-mode', value ? 'randomize' : 'fixed');
}

const isCkptControl = computed(() => props.control.inputName === 'ckpt_name');

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

/**
 * 处理本地文件选择并上传至 ComfyUI
 */
async function onLocalFileSelected(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  if (!props.comfyuiUrl.trim()) {
    toastr.warning('未填写 ComfyUI URL，无法上传图片');
    return;
  }

  isUploadingImage.value = true;
  try {
    const result = await uploadComfyUIImage(props.comfyuiUrl, file, { overwrite: true });
    localPreviewUrl.value = URL.createObjectURL(file);
    emit('update:value', result.name);
    toastr.success(`图片 ${result.name} 上传成功`);
  } catch (error) {
    toastr.error(error instanceof Error ? error.message : '上传图片失败');
  } finally {
    isUploadingImage.value = false;
    input.value = '';
  }
}
</script>

<!--
  Popover 挂到 body，scoped 无法命中。
  迁移条件：Popover 改 Teleport 到组件内或全局 PT 注入宽度时，可删 unscoped。
-->
<style>
.cv-workflow-input__binding-popover {
  width: max-content;
  min-width: 140px;
  max-width: min(15rem, 80vw);
}

.cv-workflow-input__binding-popover-content {
  display: flex;
  flex-direction: column;
  gap: var(--cv-space-xs);
  padding: var(--cv-space-xs);
}

.cv-workflow-input__binding-option {
  transition:
    background-color 150ms ease,
    color 150ms ease;
}
</style>

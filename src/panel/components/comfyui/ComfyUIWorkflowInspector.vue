<template>
  <!-- 非全屏且无节点选中时展示空状态 -->
  <div v-if="!fullscreen && (!nodeId || !node)" class="cv-workflow-inspector__empty">
    点击画布节点以编辑参数
  </div>

  <!-- 有节点选中时（或者在全屏且有节点选中时）渲染详情面板 -->
  <div
    v-else-if="nodeId && node"
    class="cv-workflow-inspector"
    :class="[
      fullscreen ? 'cv-lightbox-info' : 'cv-workflow-inspector__container',
      { 'cv-info-collapsed': isCollapsed }
    ]"
  >
    <div
      :class="fullscreen ? 'cv-lightbox-info-header cursor-pointer select-none' : 'cv-workflow-inspector__header cursor-pointer select-none'"
      @click="isCollapsed = !isCollapsed"
    >
      <div class="cv-workflow-inspector__title-block">
        <i
          class="fa-solid shrink-0 text-(--cv-on-surface-variant)"
          :class="isCollapsed ? 'fa-chevron-right' : 'fa-chevron-down'"
        />
        <span class="cv-workflow-inspector__title">{{ displayName }}</span>
        <span class="cv-workflow-inspector__meta">#{{ nodeId }}</span>
        <span v-if="bindingSummary" class="cv-workflow-inspector__bindings">{{ bindingSummary }}</span>
      </div>
      <div class="flex items-center gap-(--cv-space-md)" @click.stop>
        <Chip
          class="cv-workflow-inspector__output-chip"
          :class="[
            isImageOutput ? 'is-active' : 'is-inactive',
            { 'is-disabled': !canSetOutput }
          ]"
          @click="canSetOutput && emit('set-image-output', nodeId!)"
        >
          <span class="flex items-center gap-1.5 cursor-pointer">
            <i :class="isImageOutput ? 'fa-solid fa-circle-check' : 'fa-regular fa-circle'" aria-hidden="true" />
            <span>{{ isImageOutput ? '当前图片输出' : '设为图片输出' }}</span>
          </span>
        </Chip>
        <button
          v-if="fullscreen"
          type="button"
          class="cv-lightbox-toggle-btn"
          :title="isCollapsed ? '展开参数' : '隐藏参数'"
          @click="isCollapsed = !isCollapsed"
        >
          <i class="fa-solid" :class="isCollapsed ? 'fa-eye' : 'fa-eye-slash'" aria-hidden="true" />
          <span>{{ isCollapsed ? '显示参数' : '隐藏参数' }}</span>
        </button>
      </div>
    </div>

    <!-- 非全屏下根据 isCollapsed 使用 v-show 隐藏；全屏下由 CSS 的 opacity 过渡控制，v-show 恒显示 -->
    <div
      v-show="fullscreen || !isCollapsed"
      :class="fullscreen ? 'cv-lightbox-info-body' : 'cv-workflow-inspector__body'"
    >
      <div v-if="outputHint" class="cv-field-hint">{{ outputHint }}</div>

      <ComfyUILoraPresetPanel
        v-if="showLoraPanel && loraPresetSettings"
        :preset-settings="loraPresetSettings"
        :lora-options="loraOptions"
        :is-loading-loras="isLoadingLoras"
        @update:preset-settings="emit('update:lora-preset-settings', $event)"
        @refresh-options="emit('refresh-lora-options')"
      />

      <Divider v-if="showLoraPanel && loraPresetSettings && controls.length" :dt="dividerTokens" />

      <div class="cv-workflow-inspector__inputs">
        <ComfyUIWorkflowInput
          v-for="control in controls"
          :key="`${control.nodeId}:${control.inputName}`"
          :control="control"
          @update:value="value => emit('update:input', control.inputName, value)"
          @update:prompt-binding="binding => emit('update:prompt-binding', control.inputName, binding)"
          @update:seed-mode="mode => emit('update:seed-mode', control.inputName, mode)"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { DividerDesignTokens } from '@primeuix/themes/types/divider';
import type { ComfyUILoraPresetSettings } from '@/constants/comfyui';
import ComfyUILoraPresetPanel from '@/panel/components/ComfyUILoraPresetPanel.vue';
import ComfyUIWorkflowInput from '@/panel/components/comfyui/ComfyUIWorkflowInput.vue';
import { readNodeDisplayName } from '@/services/comfyui/layout';
import { readNodeMeta } from '@/services/comfyui/meta';
import { isSupportedLoraNode } from '@/services/comfyui/lora-adapter';
import type {
  ComfyUIInputControlDesc,
  ComfyUIWorkflowNode,
  PromptBinding,
  SeedMode,
} from '@/services/comfyui/types';

/**
 * 节点检视器内 Divider 局部 token：去掉水平分割线默认上下外边距
 * （Aura 默认 horizontal.margin 为 `1rem 0`）
 */
const dividerTokens = {
  horizontal: { margin: '0' },
} as const satisfies DividerDesignTokens;

const props = withDefaults(
  defineProps<{
    nodeId: string | null;
    node: ComfyUIWorkflowNode | null;
    controls: ComfyUIInputControlDesc[];
    canSetOutput: boolean;
    outputUnverified: boolean;
    loraPresetSettings?: ComfyUILoraPresetSettings;
    loraOptions: { value: string; label: string }[];
    isLoadingLoras: boolean;
    fullscreen?: boolean;
  }>(),
  {
    fullscreen: false,
  }
);

const emit = defineEmits<{
  'set-image-output': [nodeId: string];
  'update:input': [inputName: string, value: unknown];
  'update:prompt-binding': [inputName: string, binding: PromptBinding | null];
  'update:seed-mode': [inputName: string, mode: SeedMode | null];
  'update:lora-preset-settings': [settings: ComfyUILoraPresetSettings];
  'refresh-lora-options': [];
}>();

const displayName = computed(() => {
  if (!props.node || !props.nodeId) return '';
  return readNodeDisplayName(props.node, props.nodeId);
});

const isImageOutput = computed(() => Boolean(props.node && readNodeMeta(props.node).imageOutput));

const showLoraPanel = computed(() => isSupportedLoraNode(props.node ?? undefined));

/**
 * header 绑定摘要：提示词绑定 / seed 模式 / 输出节点
 */
const bindingSummary = computed(() => {
  if (!props.node) return '';
  const parts: string[] = [];
  const meta = readNodeMeta(props.node);

  for (const [inputName, binding] of Object.entries(meta.promptBindings ?? {})) {
    parts.push(`${inputName}:${binding === 'positive' ? '正向' : '负向'}`);
  }
  for (const [inputName, mode] of Object.entries(meta.seedModes ?? {})) {
    const modeLabel =
      mode === 'randomize' ? '随机' : mode === 'increment' ? '递增' : mode === 'decrement' ? '递减' : '固定';
    parts.push(`${inputName}:${modeLabel}`);
  }
  if (meta.imageOutput) parts.push('输出节点');

  return parts.join(' · ');
});

const outputHint = computed(() => {
  if (!props.canSetOutput) return '当前节点定义未将该节点标记为输出节点';
  if (props.outputUnverified) return '离线模式：输出节点未经验证';
  return '';
});

const isCollapsed = ref(false);

watch(
  () => props.nodeId,
  () => {
    isCollapsed.value = false;
  },
);
</script>

<style scoped>
@reference '../../../global.css';

.cv-workflow-inspector {
  @apply flex flex-col;
}

.cv-workflow-inspector__container {
  @apply flex flex-col overflow-hidden;
  border: var(--cv-border-width) solid var(--cv-surface-variant);
  border-radius: var(--cv-radius-sm);
  background: var(--cv-surface-container-low);
}

.cv-workflow-inspector__header {
  @apply flex items-center justify-between cursor-pointer select-none;
  padding: var(--cv-space-lg) var(--cv-space-xl);
  background: var(--cv-surface-container-low);
}

.cv-workflow-inspector__empty {
  @apply text-center;
  color: var(--cv-on-surface-variant);
  padding: var(--cv-space-5xl);
  font-size: var(--cv-font-size-sm);
  border: var(--cv-border-width) solid var(--cv-surface-variant);
  border-radius: var(--cv-radius);
  background: var(--cv-surface-container);
}

.cv-workflow-inspector__body {
  @apply flex flex-col;
  gap: var(--cv-space-xl);
  padding: var(--cv-space-xl);
}

.cv-workflow-inspector.cv-lightbox-info {
  background: var(--cv-surface-container-low);
  border-top: var(--cv-border-width) solid var(--cv-surface-variant);
  border-left: var(--cv-border-width) solid var(--cv-surface-variant);
  border-right: var(--cv-border-width) solid var(--cv-surface-variant);
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  box-shadow: 0 -4px 16px rgba(0, 0, 0, 0.25);
  border-radius: var(--cv-radius) var(--cv-radius) 0 0;
  max-height: 80%; /* 限制浮动面板的最大高度占画布的 80%，防止完全遮挡 */
}

/* 覆盖折叠状态下的高度 */
.cv-workflow-inspector.cv-lightbox-info.cv-info-collapsed {
  max-height: 3.5rem;
}

.cv-workflow-inspector__title-block {
  @apply flex min-w-0 flex-auto items-center overflow-hidden;
  gap: var(--cv-space-lg);
}

.cv-workflow-inspector__title {
  @apply min-w-0 overflow-hidden text-ellipsis whitespace-nowrap;
  font-weight: 600;
  color: var(--cv-on-surface);
}

.cv-workflow-inspector__meta {
  @apply shrink-0;
  font-size: var(--cv-font-size-sm);
  color: var(--cv-on-surface-variant);
  font-family: Consolas, Monaco, monospace;
}

.cv-workflow-inspector__bindings {
  @apply min-w-0 overflow-hidden text-ellipsis whitespace-nowrap;
  font-size: var(--cv-font-size-sm);
  color: var(--cv-primary);
}

.cv-workflow-inspector__inputs {
  @apply flex flex-col;
}

:deep(.cv-workflow-inspector__output-chip) {
  cursor: pointer;
  transition: all 0.2s ease;
  user-select: none;
  font-size: var(--cv-font-size-2xs);
  padding: 0.15rem 0.5rem;
  line-height: 1.2;
  min-height: auto;
}

:deep(.cv-workflow-inspector__output-chip.is-active) {
  background: color-mix(in srgb, var(--p-primary-color) 12%, transparent) !important;
  border-color: var(--p-primary-color) !important;
  color: var(--p-primary-color) !important;
}

:deep(.cv-workflow-inspector__output-chip.is-active:hover) {
  background: color-mix(in srgb, var(--p-primary-color) 20%, transparent) !important;
}

:deep(.cv-workflow-inspector__output-chip.is-inactive) {
  background: var(--cv-surface-container-low) !important;
  border-color: var(--cv-outline) !important;
  color: var(--cv-on-surface-variant) !important;
}

:deep(.cv-workflow-inspector__output-chip.is-inactive:hover) {
  background: var(--cv-surface-container-high) !important;
}

:deep(.cv-workflow-inspector__output-chip.is-disabled) {
  opacity: 0.55 !important;
  cursor: not-allowed !important;
  pointer-events: none !important;
}
</style>

<template>
  <!-- 非全屏且无节点选中时展示空状态 -->
  <div v-if="!fullscreen && (!nodeId || !node)" class="cv-workflow-inspector__empty">
    点击画布节点以编辑参数
  </div>

  <!-- 有节点选中时渲染详情面板 -->
  <div
    v-else-if="nodeId && node"
    class="cv-workflow-inspector"
    :class="[
      fullscreen ? 'cv-lightbox-info' : 'cv-workflow-inspector__container',
      { 'cv-info-collapsed': isCollapsed },
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
      </div>
      <div v-if="fullscreen" class="flex items-center gap-(--cv-space-md)" @click.stop>
        <button
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

    <!-- 非全屏用 v-show；全屏由 CSS opacity 过渡，v-show 恒显示 -->
    <div
      v-show="fullscreen || !isCollapsed"
      :class="['cv-workflow-inspector__body', { 'cv-lightbox-info-body': fullscreen }]"
    >
      <section class="cv-workflow-inspector__section">
        <div class="cv-workflow-inspector__section-header">
          <div class="cv-workflow-inspector__section-title">
            <i class="fa-solid fa-sliders" aria-hidden="true" />
            <span>可调参数</span>
            <span class="cv-workflow-inspector__count">{{ parameterCount }}</span>
          </div>
        </div>
        <div class="cv-workflow-inspector__section-body">
          <ComfyUILoraPresetPanel
            v-if="showLoraPanel && loraPresetSettings"
            :preset-settings="loraPresetSettings"
            :lora-options="loraOptions"
            :is-loading-loras="isLoadingLoras"
            @update:preset-settings="emit('update:lora-preset-settings', $event)"
            @refresh-options="emit('refresh-lora-options')"
          />
          <Divider v-if="showLoraPanel && loraPresetSettings && parameterControls.length" :dt="dividerTokens" />
          <ComfyUIWorkflowInput
            v-for="control in parameterControls"
            :key="`${control.nodeId}:${control.inputName}`"
            :control="control"
            :online="online"
            @update:value="value => emit('update:input', control.inputName, value)"
            @update:prompt-binding="binding => emit('update:prompt-binding', control.inputName, binding)"
            @update:seed-mode="mode => emit('update:seed-mode', control.inputName, mode)"
          />
          <div v-if="!parameterCount" class="cv-workflow-inspector__empty-section">无可调参数</div>
        </div>
      </section>

      <section class="cv-workflow-inspector__section">
        <div class="cv-workflow-inspector__section-header">
          <div class="cv-workflow-inspector__section-title">
            <i class="fa-solid fa-arrow-right-to-bracket" aria-hidden="true" />
            <span>输入</span>
            <span class="cv-workflow-inspector__count">{{ inputControls.length }}</span>
          </div>
        </div>
        <div class="cv-workflow-inspector__ports">
          <div v-for="control in inputControls" :key="control.inputName" class="cv-workflow-inspector__port">
            <div class="cv-workflow-inspector__port-main">
              <span class="cv-workflow-inspector__port-index">IN</span>
              <span class="cv-workflow-inspector__port-name">{{ control.label }}</span>
              <span class="cv-workflow-inspector__type">{{ control.dataType ?? 'UNKNOWN' }}</span>
            </div>
            <div class="cv-workflow-inspector__port-side">
              <ComfyUIResultBindingButton
                v-if="isResultInput(control)"
                :active="isImageOutput"
                :disabled="!online"
                @click="emit('set-image-output', nodeId!)"
              />
            </div>
          </div>
          <div v-if="!inputControls.length" class="cv-workflow-inspector__empty-section">无连线输入</div>
        </div>
      </section>

      <section class="cv-workflow-inspector__section">
        <div class="cv-workflow-inspector__section-header">
          <div class="cv-workflow-inspector__section-title">
            <i class="fa-solid fa-arrow-right-from-bracket" aria-hidden="true" />
            <span>输出</span>
            <span class="cv-workflow-inspector__count">{{ outputs.length }}</span>
          </div>
        </div>
        <div class="cv-workflow-inspector__ports">
          <div v-for="output in outputs" :key="output.index" class="cv-workflow-inspector__port">
            <div class="cv-workflow-inspector__port-main">
              <span class="cv-workflow-inspector__port-index">{{ output.index }}</span>
              <span class="cv-workflow-inspector__port-name">{{ output.name }}</span>
              <span class="cv-workflow-inspector__type">{{ output.type }}</span>
              <span v-if="output.isList" class="cv-workflow-inspector__list-tag">LIST</span>
            </div>
            <div class="cv-workflow-inspector__port-side">
              <ComfyUIResultBindingButton
                v-if="isResultOutput(output)"
                :active="isImageOutput"
                :disabled="!online"
                @click="emit('set-image-output', nodeId!)"
              />
            </div>
          </div>
          <div v-if="!outputs.length" class="cv-workflow-inspector__empty-section">{{ outputEmptyText }}</div>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { DividerDesignTokens } from '@primeuix/themes/types/divider';
import type { ComfyUILoraPresetSettings } from '@/constants/comfyui';
import ComfyUILoraPresetPanel from '@/panel/components/ComfyUILoraPresetPanel.vue';
import ComfyUIResultBindingButton from '@/panel/components/comfyui/ComfyUIResultBindingButton.vue';
import ComfyUIWorkflowInput from '@/panel/components/comfyui/ComfyUIWorkflowInput.vue';
import { readNodeDisplayName } from '@/services/comfyui/layout';
import { isLoraPanelManagedInput, isSupportedLoraNode } from '@/services/comfyui/lora-adapter';
import { readNodeMeta } from '@/services/comfyui/meta';
import type {
  ComfyUIInputControlDesc,
  ComfyUIObjectInfoOutputSpec,
  ComfyUIWorkflowNode,
  PromptBinding,
  SeedMode,
} from '@/services/comfyui/types';

/** Divider 去掉水平分割线默认上下外边距 */
const dividerTokens = {
  horizontal: { margin: '0' },
} as const satisfies DividerDesignTokens;

const props = withDefaults(
  defineProps<{
    nodeId: string | null;
    node: ComfyUIWorkflowNode | null;
    controls: ComfyUIInputControlDesc[];
    outputs: ComfyUIObjectInfoOutputSpec[];
    canSetOutput: boolean;
    online: boolean;
    loraPresetSettings?: ComfyUILoraPresetSettings;
    loraOptions: { value: string; label: string }[];
    isLoadingLoras: boolean;
    fullscreen?: boolean;
  }>(),
  {
    fullscreen: false,
    loraPresetSettings: undefined,
  },
);

const emit = defineEmits<{
  'set-image-output': [nodeId: string];
  'update:input': [inputName: string, value: unknown];
  'update:prompt-binding': [inputName: string, binding: PromptBinding | null];
  'update:seed-mode': [inputName: string, mode: SeedMode | null];
  'update:lora-preset-settings': [settings: ComfyUILoraPresetSettings];
  'refresh-lora-options': [];
}>();

const isCollapsed = ref(false);

const displayName = computed(() => {
  if (!props.node || !props.nodeId) return '';
  return readNodeDisplayName(props.node, props.nodeId);
});

const isImageOutput = computed(() => Boolean(props.node && readNodeMeta(props.node).imageOutput));
/** 候选可设，或已绑定（便于取消） */
const showOutputChip = computed(() => props.canSetOutput || isImageOutput.value);
const showLoraPanel = computed(() => isSupportedLoraNode(props.node ?? undefined));

/** LoRA 节点隐藏面板已托管的 text/loras */
const visibleControls = computed(() =>
  props.controls.filter(control => !isLoraPanelManagedInput(props.node ?? undefined, control.inputName)),
);
const parameterControls = computed(() => visibleControls.value.filter(control => control.kind !== 'link'));
const inputControls = computed(() => visibleControls.value.filter(control => control.kind === 'link'));
const parameterCount = computed(() => parameterControls.value.length + Number(showLoraPanel.value));
const outputEmptyText = computed(() => props.online ? '该节点未声明输出端口' : '同步节点定义后显示输出端口');
const resultInputName = computed(() =>
  inputControls.value.find(control => control.dataType?.toUpperCase() === 'IMAGE')?.inputName ?? null,
);
const resultOutputIndex = computed(() => {
  if (resultInputName.value) return null;
  return props.outputs.find(output => output.type === 'IMAGE')?.index ?? null;
});

/**
 * 判断输入端口是否承载段落生图结果操作
 * @param control 输入控件
 * @returns 是否显示操作
 */
function isResultInput(control: ComfyUIInputControlDesc): boolean {
  return showOutputChip.value && control.inputName === resultInputName.value;
}

/**
 * 判断输出端口是否承载段落生图结果操作
 * @param output 输出端口
 * @returns 是否显示操作
 */
function isResultOutput(output: ComfyUIObjectInfoOutputSpec): boolean {
  return showOutputChip.value && output.index === resultOutputIndex.value;
}

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
  overflow-y: auto;
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
  max-height: 80%;
}

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

.cv-workflow-inspector__section {
  @apply flex flex-col;
  border-top: var(--cv-border-width) solid var(--cv-surface-variant);
}

.cv-workflow-inspector__section-header {
  @apply flex items-center justify-between;
  min-height: 2.75rem;
  gap: var(--cv-space-lg);
  padding: var(--cv-space-md) var(--cv-space-xl);
  background: var(--cv-surface-container);
}

.cv-workflow-inspector__section-title,
.cv-workflow-inspector__port-main {
  @apply flex min-w-0 items-center;
  gap: var(--cv-space-sm);
}

.cv-workflow-inspector__section-title {
  color: var(--cv-on-surface);
  font-size: var(--cv-font-size-sm);
  font-weight: 600;
}

.cv-workflow-inspector__section-title i {
  width: 1rem;
  color: var(--cv-on-surface-variant);
  text-align: center;
}

.cv-workflow-inspector__count,
.cv-workflow-inspector__type,
.cv-workflow-inspector__list-tag,
.cv-workflow-inspector__port-index {
  font-family: Consolas, Monaco, monospace;
  font-size: var(--cv-font-size-2xs);
}

.cv-workflow-inspector__count {
  min-width: 1.25rem;
  padding: 0.05rem var(--cv-space-xs);
  border-radius: 999px;
  background: var(--cv-surface-container-highest);
  color: var(--cv-on-surface-variant);
  text-align: center;
}

.cv-workflow-inspector__section-body {
  @apply flex flex-col;
  padding: 0 var(--cv-space-xl);
}

.cv-workflow-inspector__ports {
  @apply flex flex-col;
  padding: var(--cv-space-sm) var(--cv-space-xl) var(--cv-space-lg);
}

.cv-workflow-inspector__port {
  @apply flex items-center justify-between;
  min-height: 2.5rem;
  gap: var(--cv-space-xl);
  padding: var(--cv-space-sm) 0;
  border-bottom: var(--cv-border-width) solid var(--cv-surface-variant);
}

.cv-workflow-inspector__port:last-child {
  border-bottom: none;
}

.cv-workflow-inspector__port-index {
  min-width: 1.75rem;
  color: var(--cv-on-surface-variant);
}

.cv-workflow-inspector__port-name {
  @apply min-w-0 overflow-hidden text-ellipsis whitespace-nowrap;
  color: var(--cv-on-surface);
  font-size: var(--cv-font-size-sm);
  font-weight: 600;
}

.cv-workflow-inspector__port-side {
  @apply flex shrink-0 items-center;
  gap: var(--cv-space-lg);
}

.cv-workflow-inspector__type,
.cv-workflow-inspector__list-tag {
  padding: 0.1rem var(--cv-space-sm);
  border: var(--cv-border-width) solid var(--cv-outline);
  border-radius: var(--cv-radius-sm);
  color: var(--cv-on-surface-variant);
}

.cv-workflow-inspector__list-tag {
  border-color: var(--p-primary-color);
  color: var(--p-primary-color);
}

.cv-workflow-inspector__empty-section {
  color: var(--cv-on-surface-variant);
  font-size: var(--cv-font-size-xs);
  padding: var(--cv-space-lg) 0;
}

:deep(.cv-workflow-action-btn) {
  @apply flex items-center gap-1.5 cursor-pointer select-none rounded border transition-all duration-200 shrink-0;
  font-size: var(--cv-font-size-2xs);
  padding: 0.15rem 0.40rem;
  line-height: 1.2;
  min-height: auto;
  width: fit-content;
}

:deep(.cv-workflow-action-btn.is-disabled) {
  opacity: 0.4 !important;
  cursor: not-allowed !important;
}

:deep(.cv-workflow-action-btn.is-active) {
  opacity: 1 !important;
  background: color-mix(in srgb, var(--p-primary-color) 12%, transparent) !important;
  border-color: var(--p-primary-color) !important;
  color: var(--p-primary-color) !important;
}

:deep(.cv-workflow-action-btn.is-active:hover) {
  background: color-mix(in srgb, var(--p-primary-color) 20%, transparent) !important;
}

:deep(.cv-workflow-action-btn.is-inactive) {
  background: var(--cv-surface-container-low) !important;
  border-color: var(--cv-outline) !important;
  color: var(--cv-on-surface-variant) !important;
}

:deep(.cv-workflow-action-btn.is-inactive:hover) {
  background: var(--cv-surface-container-high) !important;
}

@media (hover: hover) {
  :deep(.cv-workflow-action-btn.is-inactive) {
    opacity: 0;
    pointer-events: none;
  }

  :deep(.cv-workflow-inspector__port:hover .cv-workflow-action-btn.is-inactive) {
    opacity: 0.6;
    pointer-events: auto;
  }

  :deep(.cv-workflow-inspector__port:hover .cv-workflow-action-btn.is-inactive:hover) {
    opacity: 1;
  }
}
</style>

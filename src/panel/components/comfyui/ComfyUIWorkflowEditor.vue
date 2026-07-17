<template>
  <Teleport to="body" :disabled="!fullscreen">
    <div
      :class="[
        'cv-workflow-editor-container',
        fullscreen
          ? 'absolute inset-0 z-99999 overflow-hidden bg-(--cv-background) p-(--cv-space-lg) flex flex-col gap-(--cv-space-lg)'
          : 'flex flex-col gap-(--cv-space-xl)'
      ]"
    >
      <DefineIconButton v-slot="{ $slots, title, disabled }">
        <button
          type="button"
          class="flex h-8 w-8 cursor-pointer items-center justify-center rounded-(--cv-radius-sm) border-solid border-(--cv-outline) bg-(--cv-surface-container-lowest) text-(--cv-on-surface) opacity-(--cv-opacity-0-78) transition-[opacity,background-color,border-color] duration-150 ease-in-out hover:border-(--cv-primary-container) hover:bg-(--cv-surface-container-lowest) hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--cv-primary-container) disabled:cursor-wait disabled:opacity-55"
          :title="title"
          :aria-label="title"
          :disabled="disabled"
        >
          <component :is="$slots.default" />
        </button>
      </DefineIconButton>

      <DefineNodeSelect>
        <Select
          v-model="selectedNodeId"
          :options="nodeSelectOptions"
          option-label="label"
          option-value="value"
          filter
          filter-placeholder="搜索节点名称或 ID"
          placeholder="快速选择节点"
          class="cv-workflow-node-select w-full"
          :filter-fields="['label', 'classType']"
        />
      </DefineNodeSelect>

      <!-- 非全屏下才渲染 toolbar 和 JSON 编辑 textarea -->
      <template v-if="!fullscreen">
        <ComfyUIWorkflowToolbar
          :show-advanced-json="showAdvancedJson"
          :status-text="statusTone !== 'info' ? statusText : undefined"
          :status-tone="statusTone"
          @import="emit('import')"
          @toggle-json="showAdvancedJson = !showAdvancedJson"
        />

        <label v-if="showAdvancedJson" class="cv-field">
          <span>API 格式工作流 JSON</span>
          <div class="cv-field-control">
            <Textarea
              :model-value="modelValue"
              rows="8"
              class="w-full resize-y overflow-y-auto rounded-(--cv-radius) border-solid border-(--cv-outline) bg-(--cv-surface-variant) p-(--cv-space-xl) font-mono text-(--cv-font-size-sm)"
              :invalid="Boolean(parseError)"
              @update:model-value="onJsonEdit"
            />
            <div class="cv-field-hint">请使用 ComfyUI 的 Save (API Format) 导出</div>
          </div>
        </label>

        <div v-if="parseError" class="cv-field-warn">{{ parseError }}</div>
      </template>

      <div v-if="workflow" class="cv-workflow-canvas-wrapper relative">
        <ComfyUIWorkflowCanvas
          ref="canvasRef"
          :layout="layout"
          :selected-node-id="selectedNodeId"
          :workflow="workflow"
          @select="selectedNodeId = $event"
        />

        <!-- 悬浮状态提示与右侧操作按钮的统一容器，避免绝对定位冲突导致覆盖 -->
        <div class="absolute top-(--cv-space-lg) left-(--cv-space-lg) right-(--cv-space-lg) z-2 flex justify-between items-start gap-(--cv-space-md) pointer-events-none">
          <!-- 左侧统一状态提示 -->
          <div class="flex-1 min-w-0">
            <Transition
              enter-active-class="transition duration-300 ease"
              enter-from-class="opacity-0 -translate-y-[4px]"
              enter-to-class="opacity-100 translate-y-0"
              leave-active-class="transition duration-300 ease"
              leave-from-class="opacity-100 translate-y-0"
              leave-to-class="opacity-0 -translate-y-[4px]"
            >
              <div
                v-if="isStatusFloatingVisible"
                class="flex items-center gap-(--cv-space-sm) px-(--cv-space-lg) py-(--cv-space-sm) text-(length:--cv-font-size-xs) bg-(--cv-surface-container-high) text-(--cv-on-surface) rounded border border-solid border-(--cv-outline) shadow-md w-fit max-w-full"
              >
                <i
                  v-if="statusTone === 'error'"
                  class="fa-solid fa-circle-xmark text-(--p-red-500) shrink-0"
                  aria-hidden="true"
                />
                <i
                  v-else-if="statusTone === 'warn'"
                  class="fa-solid fa-triangle-exclamation text-(--p-orange-500) shrink-0"
                  aria-hidden="true"
                />
                <i
                  v-else
                  class="fa-solid fa-circle-info text-(--cv-primary) shrink-0"
                  aria-hidden="true"
                />
                <span class="whitespace-break-spaces">{{ statusText }}</span>
              </div>
            </Transition>
          </div>

          <!-- 右侧操作按钮 -->
          <div class="flex gap-(--cv-space-sm) shrink-0 pointer-events-auto">
            <ReuseIconButton
              title="定位绑定节点"
              @click="locatePopover?.toggle($event)"
            >
              <i class="fa-solid fa-location-crosshairs" aria-hidden="true" />
            </ReuseIconButton>

            <Popover
              ref="locatePopover"
              :base-z-index="3200"
              :dt="MACRO_POPOVER_TOKENS"
              :pt="locatePopoverPt"
            >
              <div class="cv-workflow-locate-popover-content">
                <button
                  v-for="option in locateOptions"
                  :key="option.key"
                  type="button"
                  class="cv-workflow-locate-option"
                  :disabled="!option.nodeId"
                  @click="onLocateNode(option.nodeId)"
                >
                  <span class="cv-workflow-locate-option__icon">
                    <i :class="option.icon" :style="{ color: option.nodeId ? option.color : undefined }" aria-hidden="true" />
                  </span>
                  <span>{{ option.label }}</span>
                  <span class="cv-workflow-locate-option__sub">
                    {{ option.nodeId ? `#${option.nodeId}` : '未绑定' }}
                  </span>
                </button>
              </div>
            </Popover>

            <ReuseIconButton
              title="同步节点定义"
              :disabled="schemaLoading"
              @click="refreshSchema(true)"
            >
              <i class="fa-solid fa-rotate" :class="{ 'fa-spin': schemaLoading }" aria-hidden="true" />
            </ReuseIconButton>
            <ReuseIconButton
              title="适配视图"
              @click="canvasRef?.fitView()"
            >
              <i class="fa-solid fa-expand" aria-hidden="true" />
            </ReuseIconButton>
            <ReuseIconButton
              :title="fullscreen ? '退出全屏' : '全屏编辑'"
              @click="fullscreen = !fullscreen"
            >
              <i
                :class="fullscreen ? 'fa-solid fa-compress' : 'fa-solid fa-up-right-and-down-left-from-center'"
                aria-hidden="true"
              />
            </ReuseIconButton>
          </div>
        </div>

        <!-- 全屏：节点选择 + Inspector 叠在画布底部 -->
        <div v-if="fullscreen" class="cv-workflow-editor__inspector-stack">
          <ReuseNodeSelect />
          <ComfyUIWorkflowInspector
            :fullscreen="true"
            :node-id="selectedNodeId"
            :node="selectedNode"
            :controls="selectedControls"
            :outputs="selectedOutputs"
            :can-set-output="canSetSelectedOutput"
            :online="online"
            :lora-preset-settings="loraPresetSettings"
            :lora-options="loraOptions"
            :is-loading-loras="isLoadingLoras"
            :comfyui-url="comfyuiUrl"
            @set-image-output="setImageOutput"
            @update:input="updateInput"
            @update:prompt-binding="updatePromptBinding"
            @update:seed-mode="updateSeedMode"
            @update:lora-preset-settings="onLoraPresetUpdate"
            @refresh-lora-options="emit('refresh-lora-options')"
          />
        </div>
      </div>

      <!-- 非全屏：画布与详情之间的节点选择 -->
      <label v-if="workflow && !fullscreen" class="cv-field">
        <ReuseNodeSelect />
      </label>

      <!-- 非全屏专属 Inspector -->
      <ComfyUIWorkflowInspector
        v-if="!fullscreen"
        :fullscreen="false"
        :node-id="selectedNodeId"
        :node="selectedNode"
        :controls="selectedControls"
        :outputs="selectedOutputs"
        :can-set-output="canSetSelectedOutput"
        :online="online"
        :lora-preset-settings="loraPresetSettings"
        :lora-options="loraOptions"
        :is-loading-loras="isLoadingLoras"
        :comfyui-url="comfyuiUrl"
        @set-image-output="setImageOutput"
        @update:input="updateInput"
        @update:prompt-binding="updatePromptBinding"
        @update:seed-mode="updateSeedMode"
        @update:lora-preset-settings="onLoraPresetUpdate"
        @refresh-lora-options="emit('refresh-lora-options')"
      />
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { nextTick } from 'vue';
import type { ComfyUILoraPresetSettings } from '@/constants/comfyui';
import { getActiveComfyUILoraPreset } from '@/services/comfyui/lora-presets';
import { writeLoraPresetToNode, isSupportedLoraNode } from '@/services/comfyui/lora-adapter';
import { layoutWorkflow, readNodeDisplayName } from '@/services/comfyui/layout';
import { readImageOutputNodeId, setImageOutputNode, clearImageOutputNode, readNodeMeta, setPromptBinding, setSeedMode, readPromptBindings } from '@/services/comfyui/meta';
import {
  fetchComfyUIObjectInfo,
  getCachedComfyUIObjectInfo,
  listOutputCandidates,
  mapInputControls,
} from '@/services/comfyui/object-info';
import { parseComfyUIWorkflow, serializeComfyUIWorkflow } from '@/services/comfyui/parse';
import type { ComfyUIObjectInfoMap, ComfyUIWorkflow, PromptBinding, SeedMode } from '@/services/comfyui/types';
import { createReusableTemplate } from '@vueuse/core';
import ComfyUIWorkflowCanvas from '@/panel/components/comfyui/ComfyUIWorkflowCanvas.vue';
import ComfyUIWorkflowInspector from '@/panel/components/comfyui/ComfyUIWorkflowInspector.vue';
import ComfyUIWorkflowToolbar from '@/panel/components/comfyui/ComfyUIWorkflowToolbar.vue';
import { MACRO_POPOVER_TOKENS } from '@/panel/components/prompt-llm-macro-popover';

const [DefineIconButton, ReuseIconButton] = createReusableTemplate<{
  title: string;
  disabled?: boolean;
}>();
const [DefineNodeSelect, ReuseNodeSelect] = createReusableTemplate();

const props = defineProps<{
  modelValue: string;
  comfyuiUrl: string;
  loraPresetSettings: ComfyUILoraPresetSettings;
  loraOptions: { value: string; label: string }[];
  isLoadingLoras: boolean;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: string];
  'update:lora-preset-settings': [settings: ComfyUILoraPresetSettings];
  import: [];
  'refresh-lora-options': [];
}>();

const showConfirm =
  inject<
    (options: {
      title?: string;
      message: string;
      acceptLabel?: string;
      cancelLabel?: string;
      severity?: string;
    }) => Promise<boolean>
  >('showConfirm');

const canvasRef = ref<{ fitView: () => void; focusNode: (nodeId: string) => void } | null>(null);
const selectedNodeId = ref<string | null>(null);
const showAdvancedJson = ref(false);
const fullscreen = ref(false);

const locatePopover = ref<any>(null);

const locateOptions = computed(() => {
  const wf = workflow.value;
  if (!wf) return [];

  const bindings = readPromptBindings(wf);
  const positiveId = bindings.find(b => b.binding === 'positive')?.nodeId ?? null;
  const negativeId = bindings.find(b => b.binding === 'negative')?.nodeId ?? null;
  const loraId = Object.entries(wf).find(([_, node]) => isSupportedLoraNode(node))?.[0] ?? null;
  const outputId = readImageOutputNodeId(wf);

  return [
    { key: 'positive', label: '正面提示词', icon: 'fa-solid fa-circle-plus', nodeId: positiveId, color: '#10b981' },
    { key: 'negative', label: '负面提示词', icon: 'fa-solid fa-circle-minus', nodeId: negativeId, color: '#ef4444' },
    { key: 'lora', label: 'Lora组', icon: 'fa-solid fa-puzzle-piece', nodeId: loraId, color: '#a855f7' },
    { key: 'output', label: '段落生图结果', icon: 'fa-solid fa-image', nodeId: outputId, color: '#3b82f6' },
  ];
});

const locatePopoverPt = {
  root: { class: 'cosmos-vision-root cv-workflow-locate-popover' },
  content: { class: 'cv-workflow-locate-popover-content' },
};

/**
 * 定位到指定节点并使其在画布中居中，同步更新详情和选择器焦点
 * @param nodeId 节点 ID
 */
function onLocateNode(nodeId: string | null): void {
  if (!nodeId) return;
  selectedNodeId.value = nodeId;
  nextTick(() => {
    canvasRef.value?.focusNode(nodeId);
  });
  locatePopover.value?.hide();
}
const schemaLoading = ref(false);
const objectInfo = ref<ComfyUIObjectInfoMap | null>(null);
const schemaError = ref<string | null>(null);

const showSyncStatus = ref(false);
let syncStatusTimer: number | null = null;

/**
 * 触发同步状态显示，在指定秒数后自动隐藏
 */
function triggerSyncStatusShow(): void {
  // 如果当前已有定时器，先清除
  if (syncStatusTimer) {
    clearTimeout(syncStatusTimer);
  }
  showSyncStatus.value = true;
  // 设置 3 秒后关闭显示
  syncStatusTimer = window.setTimeout(() => {
    showSyncStatus.value = false;
    syncStatusTimer = null;
  }, 3000);
}

const parseState = computed(() => {
  try {
    return { workflow: parseComfyUIWorkflow(props.modelValue), error: null as string | null };
  } catch (error) {
    return {
      workflow: null as ComfyUIWorkflow | null,
      error: error instanceof Error ? error.message : '工作流解析失败',
    };
  }
});

const workflow = computed(() => parseState.value.workflow);
const parseError = computed(() => parseState.value.error);

const layout = computed(() => {
  return workflow.value ? layoutWorkflow(workflow.value) : { nodes: [], edges: [], width: 1, height: 1 };
});

const selectedNode = computed(() => {
  if (!workflow.value || !selectedNodeId.value) return null;
  return workflow.value[selectedNodeId.value] ?? null;
});

/** 节点下拉选项；label 含名称与 ID，classType 供自定义标题时仍可搜类型 */
const nodeSelectOptions = computed(() => {
  if (!workflow.value) return [] as { value: string; label: string; classType: string }[];
  return Object.entries(workflow.value)
    .map(([id, node]) => {
      const title = readNodeDisplayName(node, id);
      return {
        value: id,
        label: `${title} (#${id})`,
        classType: node.class_type ?? '',
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label, 'zh-CN', { numeric: true }));
});

const selectedControls = computed(() => {
  if (!workflow.value || !selectedNodeId.value) return [];
  return mapInputControls(workflow.value, selectedNodeId.value, objectInfo.value);
});

const selectedOutputs = computed(() => {
  if (!selectedNode.value || !objectInfo.value) return [];
  return objectInfo.value[selectedNode.value.class_type]?.outputs ?? [];
});

const outputCandidates = computed(() => {
  if (!workflow.value) return [] as string[];
  return listOutputCandidates(workflow.value, objectInfo.value);
});

const online = computed(() => Boolean(objectInfo.value));

const canSetSelectedOutput = computed(() => {
  if (!selectedNodeId.value) return false;
  return outputCandidates.value.includes(selectedNodeId.value);
});



const statusText = computed(() => {
  if (parseError.value) return parseError.value;
  if (schemaError.value) return `节点定义离线：${schemaError.value}`;
  if (objectInfo.value) return `已同步节点定义（${Object.keys(objectInfo.value).length} 类）`;
  return '未同步节点定义，使用基础控件';
});

const statusTone = computed(() => {
  if (parseError.value) return 'error' as const;
  if (schemaError.value) return 'warn' as const;
  return 'info' as const;
});

const isStatusFloatingVisible = computed(() => {
  if (!statusText.value) return false;
  return (fullscreen.value && statusTone.value !== 'info') || showSyncStatus.value;
});

/**
 * 将工作流对象写回 JSON 草稿
 * @param next 工作流对象
 */
function commitWorkflow(next: ComfyUIWorkflow): void {
  emit('update:modelValue', serializeComfyUIWorkflow(next));
}

/**
 * JSON 文本编辑
 * @param value 新文本
 */
function onJsonEdit(value: string | undefined): void {
  emit('update:modelValue', value ?? '');
}

/**
 * 修改节点输入值
 * @param inputName 输入名
 * @param value 新值
 */
function updateInput(inputName: string, value: unknown): void {
  if (!workflow.value || !selectedNodeId.value) return;
  const next = structuredClone(workflow.value) as ComfyUIWorkflow;
  const node = next[selectedNodeId.value];
  if (!node) return;
  node.inputs[inputName] = value;
  commitWorkflow(next);
}

/**
 * 更新提示词绑定
 * @param inputName 输入名
 * @param binding 绑定
 */
function updatePromptBinding(inputName: string, binding: PromptBinding | null): void {
  if (!workflow.value || !selectedNodeId.value) return;
  const next = structuredClone(workflow.value) as ComfyUIWorkflow;
  setPromptBinding(next, selectedNodeId.value, inputName, binding);
  commitWorkflow(next);
}

/**
 * 更新 seed 模式
 * @param inputName 输入名
 * @param mode 模式
 */
function updateSeedMode(inputName: string, mode: SeedMode | null): void {
  if (!workflow.value || !selectedNodeId.value) return;
  const next = structuredClone(workflow.value) as ComfyUIWorkflow;
  setSeedMode(next, selectedNodeId.value, inputName, mode);
  commitWorkflow(next);
}

/**
 * 设置或取消唯一段落生图结果节点；改绑时用插件确认弹窗二次确认
 * @param nodeId 节点 ID
 */
async function setImageOutput(nodeId: string): Promise<void> {
  const next = createWorkflowDraft(nodeId);
  if (!next) return;
  if (tryClearParagraphResult(next, nodeId)) return;
  if (!canBindParagraphResult(nodeId)) return;
  if (!(await confirmParagraphResultRebind(next, nodeId))) return;
  setImageOutputNode(next, nodeId);
  commitWorkflow(next);
}

/**
 * 创建包含目标节点的工作流草稿
 * @param nodeId 目标节点 ID
 * @returns 工作流草稿或 null
 */
function createWorkflowDraft(nodeId: string): ComfyUIWorkflow | null {
  if (!workflow.value) return null;
  const next = structuredClone(workflow.value) as ComfyUIWorkflow;
  return next[nodeId] ? next : null;
}

/**
 * 尝试取消当前段落生图结果
 * @param next 工作流草稿
 * @param nodeId 目标节点 ID
 * @returns 是否已取消
 */
function tryClearParagraphResult(next: ComfyUIWorkflow, nodeId: string): boolean {
  if (!readNodeMeta(next[nodeId]).imageOutput) return false;
  clearImageOutputNode(next);
  commitWorkflow(next);
  return true;
}

/**
 * 校验节点是否可绑定段落生图结果
 * @param nodeId 目标节点 ID
 * @returns 是否可绑定
 */
function canBindParagraphResult(nodeId: string): boolean {
  if (outputCandidates.value.includes(nodeId)) return true;
  const message = objectInfo.value
    ? '当前节点没有可用的 IMAGE 输入或输出端口'
    : '未同步节点定义，不能设置段落生图结果';
  toastr.warning(message);
  return false;
}

/**
 * 确认是否改绑段落生图结果
 * @param next 工作流草稿
 * @param nodeId 目标节点 ID
 * @returns 是否继续改绑
 */
async function confirmParagraphResultRebind(next: ComfyUIWorkflow, nodeId: string): Promise<boolean> {
  const existingId = readImageOutputNodeId(next);
  if (!existingId || existingId === nodeId) return true;
  const existing = next[existingId];
  const name = existing ? readNodeDisplayName(existing, existingId) : existingId;
  return Boolean(await showConfirm?.({
    title: '改绑段落生图结果',
    message: `节点 #${existingId}（${name}）已绑定为段落生图结果。是否改绑到当前节点 #${nodeId}？`,
    acceptLabel: '确认改绑',
    cancelLabel: '取消',
    severity: 'warn',
  }));
}

/**
 * LoRA 预设变更后写入当前选中兼容节点
 * @param settings 预设集合
 */
function onLoraPresetUpdate(settings: ComfyUILoraPresetSettings): void {
  emit('update:lora-preset-settings', settings);
  if (!workflow.value || !selectedNodeId.value) return;
  const next = structuredClone(workflow.value) as ComfyUIWorkflow;
  const node = next[selectedNodeId.value];
  if (!node) return;
  writeLoraPresetToNode(node, getActiveComfyUILoraPreset(settings));
  commitWorkflow(next);
}

/**
 * 从 ComfyUI 同步节点定义
 * @param force 是否强制刷新
 */
async function refreshSchema(force = false): Promise<void> {
  if (!props.comfyuiUrl.trim()) {
    objectInfo.value = null;
    schemaError.value = '未填写 ComfyUI URL';
    return;
  }
  schemaLoading.value = true;
  try {
    objectInfo.value = await fetchComfyUIObjectInfo(props.comfyuiUrl, force);
    schemaError.value = null;
    if (force) toastr.success('已从 ComfyUI 同步节点定义');
  } catch (error) {
    objectInfo.value = getCachedComfyUIObjectInfo(props.comfyuiUrl);
    schemaError.value = error instanceof Error ? error.message : '同步节点定义失败';
    if (force) toastr.warning(schemaError.value);
  } finally {
    schemaLoading.value = false;
  }
}

watch(
  () => props.comfyuiUrl,
  () => {
    objectInfo.value = getCachedComfyUIObjectInfo(props.comfyuiUrl);
    void refreshSchema(false);
  },
  { immediate: true },
);

watch(
  workflow,
  value => {
    if (!value) {
      selectedNodeId.value = null;
      return;
    }
    if (selectedNodeId.value && value[selectedNodeId.value]) return;
    selectedNodeId.value = readImageOutputNodeId(value) ?? Object.keys(value)[0] ?? null;
  },
  { immediate: true },
);

watch(fullscreen, async (value) => {
  document.body.classList.toggle('cv-workflow-editor-open', value);
  await nextTick();
  canvasRef.value?.fitView();
});

watch(
  objectInfo,
  newVal => {
    if (newVal && statusTone.value === 'info') {
      triggerSyncStatusShow();
    }
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  document.body.classList.remove('cv-workflow-editor-open');
  if (syncStatusTimer) {
    clearTimeout(syncStatusTimer);
  }
});
</script>

<style scoped>
@reference '../../../global.css';

.cv-workflow-canvas-wrapper {
  width: 100%;
  height: auto !important;
  aspect-ratio: 16 / 9;
  max-height: 18rem;
  min-height: 0;
  overflow: hidden;
}

.cv-workflow-editor-container.absolute {
  position: absolute !important;
  inset: 0 !important;
  width: 100% !important;
  height: 100% !important;
  z-index: 99999 !important;
}

.cv-workflow-editor-container.absolute .cv-workflow-canvas-wrapper {
  @apply flex-1 min-h-0;
  height: auto !important;
  aspect-ratio: auto !important;
  max-height: none !important;
}

/* 全屏底部叠层：不拦截画布指针，子元素自行接收 */
.cv-workflow-editor__inspector-stack {
  @apply absolute bottom-0 left-0 right-0 z-2 flex flex-col;
  gap: var(--cv-space-sm);
  padding: 0 var(--cv-space-lg);
  pointer-events: none;
  max-height: 85%;
}

.cv-workflow-editor__inspector-stack > * {
  pointer-events: auto;
}

/* Inspector 原为 absolute 贴底，叠层内改为相对流式布局 */
.cv-workflow-editor__inspector-stack :deep(.cv-lightbox-info) {
  position: relative;
  bottom: auto;
  left: auto;
  right: auto;
  max-height: none;
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
}

.cv-workflow-editor__inspector-stack .cv-workflow-node-select {
  @apply shrink-0;
  background: var(--cv-surface-container-high);
}

.cv-workflow-node-select {
  --p-select-focus-ring-color: transparent;
  --p-select-focus-ring-width: 0;
}
</style>

<!-- Popover 挂到 body，scoped 无法命中 -->
<style>
.cv-workflow-locate-popover {
  width: max-content;
  min-width: 160px;
}

.cv-workflow-locate-popover-content {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: var(--cv-space-xs);
  padding: var(--cv-space-xs);
}

.cv-workflow-locate-option {
  display: flex;
  align-items: center;
  gap: var(--cv-space-md);
  padding: var(--cv-space-sm) var(--cv-space-lg);
  border: var(--cv-border-width) solid transparent;
  border-radius: var(--cv-radius-sm);
  background: transparent;
  color: var(--cv-on-surface);
  font-size: var(--cv-font-size-sm);
  cursor: pointer;
  text-align: left;
  white-space: nowrap;
  width: 100%;
}

.cv-workflow-locate-option:hover:not(:disabled) {
  background: var(--cv-surface-container-highest);
}

.cv-workflow-locate-option:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.cv-workflow-locate-option__icon {
  width: 1.125rem;
  display: flex;
  justify-content: center;
  align-items: center;
  font-size: 1rem;
}

.cv-workflow-locate-option__sub {
  font-size: var(--cv-font-size-2xs);
  color: var(--cv-on-surface-variant);
  margin-left: auto;
  padding-left: var(--cv-space-lg);
}
</style>

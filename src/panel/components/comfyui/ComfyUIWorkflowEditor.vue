<template>
  <div
    :class="[
      'flex flex-col gap-(--cv-space-xl)',
      { 'fixed inset-0 z-1200 overflow-auto bg-(--cv-background) p-(--cv-space-5xl)': fullscreen },
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

    <div v-if="workflow" class="relative">
      <ComfyUIWorkflowCanvas
        ref="canvasRef"
        :layout="layout"
        :selected-node-id="selectedNodeId"
        @select="selectedNodeId = $event"
      />
      <Transition
        enter-active-class="transition duration-300 ease"
        enter-from-class="opacity-0 -translate-y-[4px]"
        enter-to-class="opacity-100 translate-y-0"
        leave-active-class="transition duration-300 ease"
        leave-from-class="opacity-100 translate-y-0"
        leave-to-class="opacity-0 -translate-y-[4px]"
      >
        <div
          v-if="showSyncStatus && statusText && statusTone === 'info'"
          class="pointer-events-none absolute top-(--cv-space-lg) left-(--cv-space-lg) z-2 flex items-center gap-(--cv-space-sm) px-(--cv-space-lg) py-(--cv-space-sm) text-(length:--cv-font-size-xs)"
        >
          <i class="fa-solid fa-circle-info" aria-hidden="true" />
          <span>{{ statusText }}</span>
        </div>
      </Transition>
      <div class="absolute top-(--cv-space-lg) right-(--cv-space-lg) z-2 flex gap-(--cv-space-sm)">
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

    <ComfyUIWorkflowInspector
      v-if="workflow"
      :node-id="selectedNodeId"
      :node="selectedNode"
      :controls="selectedControls"
      :can-set-output="canSetSelectedOutput"
      :output-unverified="outputUnverified"
      :lora-preset-settings="loraPresetSettings"
      :lora-options="loraOptions"
      :is-loading-loras="isLoadingLoras"
      @set-image-output="setImageOutput"
      @update:input="updateInput"
      @update:prompt-binding="updatePromptBinding"
      @update:seed-mode="updateSeedMode"
      @update:lora-preset-settings="onLoraPresetUpdate"
      @refresh-lora-options="emit('refresh-lora-options')"
    />
  </div>
</template>

<script setup lang="ts">
import type { ComfyUILoraPresetSettings } from '@/constants/comfyui';
import { getActiveComfyUILoraPreset } from '@/services/comfyui/lora-presets';
import { writeLoraPresetToNode } from '@/services/comfyui/lora-adapter';
import { layoutWorkflow } from '@/services/comfyui/layout';
import { readImageOutputNodeId, setImageOutputNode, setPromptBinding, setSeedMode } from '@/services/comfyui/meta';
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

const [DefineIconButton, ReuseIconButton] = createReusableTemplate<{
  title: string;
  disabled?: boolean;
}>();

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

const canvasRef = ref<{ fitView: () => void } | null>(null);
const selectedNodeId = ref<string | null>(null);
const showAdvancedJson = ref(false);
const fullscreen = ref(false);
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

const selectedControls = computed(() => {
  if (!workflow.value || !selectedNodeId.value) return [];
  return mapInputControls(workflow.value, selectedNodeId.value, objectInfo.value);
});

const outputCandidates = computed(() => {
  if (!workflow.value) return [] as string[];
  return listOutputCandidates(workflow.value, objectInfo.value);
});

const canSetSelectedOutput = computed(() => {
  if (!selectedNodeId.value) return false;
  if (!objectInfo.value) return true;
  return outputCandidates.value.includes(selectedNodeId.value);
});

const outputUnverified = computed(() => !objectInfo.value);

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
 * 设置唯一输出节点
 * @param nodeId 节点 ID
 */
function setImageOutput(nodeId: string): void {
  if (!workflow.value) return;
  if (objectInfo.value && !outputCandidates.value.includes(nodeId)) {
    toastr.warning('当前节点定义未将该节点标记为输出节点');
    return;
  }
  const next = structuredClone(workflow.value) as ComfyUIWorkflow;
  setImageOutputNode(next, nodeId);
  commitWorkflow(next);
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

watch(fullscreen, value => {
  document.body.classList.toggle('cv-workflow-editor-open', value);
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

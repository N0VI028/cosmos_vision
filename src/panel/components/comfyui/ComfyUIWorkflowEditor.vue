<template>
  <div class="cv-workflow-editor" :class="{ 'is-fullscreen': fullscreen }">
    <ComfyUIWorkflowToolbar
      :show-advanced-json="showAdvancedJson"
      :fullscreen="fullscreen"
      :schema-loading="schemaLoading"
      :status-text="statusText"
      :status-tone="statusTone"
      @import="emit('import')"
      @restore-default="emit('restore-default')"
      @toggle-json="showAdvancedJson = !showAdvancedJson"
      @refresh-schema="refreshSchema(true)"
      @fit-view="canvasRef?.fitView()"
      @toggle-fullscreen="fullscreen = !fullscreen"
    />

    <div v-if="parseError" class="cv-field-warn">{{ parseError }}</div>

    <ComfyUIWorkflowCanvas
      v-if="workflow"
      ref="canvasRef"
      :layout="layout"
      :selected-node-id="selectedNodeId"
      @select="selectedNodeId = $event"
    />

    <label v-if="showAdvancedJson" class="cv-field">
      <span>API 格式工作流 JSON</span>
      <div class="cv-field-control">
        <Textarea
          :model-value="modelValue"
          rows="8"
          class="cv-workflow-textarea w-full"
          :invalid="Boolean(parseError)"
          @update:model-value="onJsonEdit"
        />
        <div class="cv-field-hint">请使用 ComfyUI 的 Save (API Format) 导出</div>
      </div>
    </label>

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
import {
  readImageOutputNodeId,
  setImageOutputNode,
  setPromptBinding,
  setSeedMode,
} from '@/services/comfyui/meta';
import {
  fetchComfyUIObjectInfo,
  getCachedComfyUIObjectInfo,
  listOutputCandidates,
  mapInputControls,
} from '@/services/comfyui/object-info';
import { parseComfyUIWorkflow, serializeComfyUIWorkflow } from '@/services/comfyui/parse';
import type {
  ComfyUIObjectInfoMap,
  ComfyUIWorkflow,
  PromptBinding,
  SeedMode,
} from '@/services/comfyui/types';
import ComfyUIWorkflowCanvas from '@/panel/components/comfyui/ComfyUIWorkflowCanvas.vue';
import ComfyUIWorkflowInspector from '@/panel/components/comfyui/ComfyUIWorkflowInspector.vue';
import ComfyUIWorkflowToolbar from '@/panel/components/comfyui/ComfyUIWorkflowToolbar.vue';

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
  'restore-default': [];
  'refresh-lora-options': [];
}>();

const canvasRef = ref<{ fitView: () => void } | null>(null);
const selectedNodeId = ref<string | null>(null);
const showAdvancedJson = ref(false);
const fullscreen = ref(false);
const schemaLoading = ref(false);
const objectInfo = ref<ComfyUIObjectInfoMap | null>(null);
const schemaError = ref<string | null>(null);

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
  return workflow.value
    ? layoutWorkflow(workflow.value)
    : { nodes: [], edges: [], width: 1, height: 1 };
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
  if (schemaError.value) return `Schema 离线降级: ${schemaError.value}`;
  if (objectInfo.value) return `Schema 已加载（${Object.keys(objectInfo.value).length} 类节点）`;
  return 'Schema 未加载，使用基础控件';
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
 * 高级 JSON 文本编辑
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
    toastr.warning('在线 schema 未将该节点标记为输出节点');
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
 * 刷新 object_info schema
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
    if (force) toastr.success('已刷新 ComfyUI object_info');
  } catch (error) {
    objectInfo.value = getCachedComfyUIObjectInfo(props.comfyuiUrl);
    schemaError.value = error instanceof Error ? error.message : '获取 schema 失败';
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

onBeforeUnmount(() => {
  document.body.classList.remove('cv-workflow-editor-open');
});
</script>

<style scoped>
@reference '../../../global.css';

.cv-workflow-editor {
  @apply flex flex-col;
  gap: var(--cv-space-xl);
}

.cv-workflow-editor.is-fullscreen {
  @apply fixed inset-0 z-1200 overflow-auto;
  background: var(--cv-background);
  padding: var(--cv-space-5xl);
}

.cv-workflow-textarea {
  @apply resize-y overflow-y-auto;
  background: var(--cv-surface-variant);
  border: var(--cv-border-width) solid var(--cv-outline);
  color: var(--cv-on-surface);
  border-radius: var(--cv-radius);
  padding: var(--cv-space-xl);
  font-family: Consolas, Monaco, monospace;
  font-size: var(--cv-font-size-sm);
}
</style>

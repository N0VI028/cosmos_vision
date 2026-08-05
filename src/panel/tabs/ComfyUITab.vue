<template>
  <div class="flex flex-col gap-0">
    <!-- API Tab -->
    <template v-if="subTab === 'api'">
      <h2 class="cv-section-title">连接信息</h2>
      <div class="cv-section-body" data-cv-tutorial="comfyui-connection">
        <label class="cv-field">
          <span>ComfyUI URL</span>
          <div class="cv-field-control">
            <div class="flex items-center gap-(--cv-space-md)">
              <InputText v-model="settings.comfyui.url" placeholder="http://127.0.0.1:8188" class="min-w-0 flex-1" />
              <Button
                :icon="connectionTestIcon"
                :severity="connectionTestSeverity"
                outlined
                rounded
                :loading="isTestingConnection"
                :title="connectionTestTitle"
                aria-label="测试连接"
                @click="testConnection"
              />
            </div>
            <div class="cv-field-hint">
              确保 Comfyui 设置了启动参数，否则可能无法连接：--listen --enable-cors-header *
            </div>
          </div>
        </label>
        <label class="cv-field">
          <span>超时时间</span>
          <div class="cv-field-control">
            <InputNumber v-model="settings.comfyui.timeout" :min="1" :max="3600" show-buttons />
            <div class="cv-field-hint">请求超时截断时间，单位为秒</div>
          </div>
        </label>
      </div>
    </template>

    <!-- 配置 Tab -->
    <template v-else-if="subTab === 'config'">
      <h2 class="cv-section-title inline-flex items-center gap-(--cv-space-sm)">
        <span>工作流</span>
        <button
          v-if="isDefaultWorkflowActive"
          type="button"
          class="inline-flex size-[1.65em] cursor-pointer items-center justify-center rounded-(--cv-radius-sm) border-0 bg-transparent p-0 text-(length:--cv-font-size-xs) text-(--cv-on-surface-variant) outline-none hover:bg-[color-mix(in_srgb,var(--cvp-red-500)_10%,transparent)] hover:text-(--cvp-red-500) focus-visible:bg-[color-mix(in_srgb,var(--cvp-red-500)_10%,transparent)] focus-visible:text-(--cvp-red-500)"
          title="重置默认工作流"
          aria-label="重置默认工作流"
          @click="resetDefaultWorkflow"
        >
          <i class="fa-solid fa-rotate-left" />
        </button>
      </h2>
      <div class="cv-section-body" data-cv-tutorial="comfyui-workflow">
        <PresetSelector
          :presets="workflowPresetOptions"
          :active-preset-id="settings.comfyui.workflowPresets.activePresetId"
          :default-preset-id="DEFAULT_COMFYUI_WORKFLOW_PRESET_ID"
          @update:active-preset-id="updateWorkflowPresetId"
          @create="createWorkflowPreset"
          @clone="cloneWorkflowPreset"
          @rename="renameWorkflowPreset"
          @delete-preset="deleteWorkflowPreset"
        />
        <input
          ref="workflowFileInput"
          type="file"
          accept="application/json,.json"
          class="hidden"
          @change="handleWorkflowFileChange"
        />
        <ComfyUIWorkflowEditor
          v-model="workflowEditorJson"
          :comfyui-url="settings.comfyui.url"
          :favorite-node-ids="activeFavoriteNodeIds"
          :lora-preset-settings="settings.comfyui.loraPresets"
          :lora-options="loraOptions"
          :is-loading-loras="isLoadingLoras"
          :tutorial-selected-node-id="tutorialNodeId"
          @update:favorite-node-ids="updateFavoriteNodeIds"
          @update:lora-preset-settings="settings.comfyui.loraPresets = $event"
          @import="triggerWorkflowImport"
          @refresh-lora-options="fetchLoraOptions"
        />
        <div v-if="workflowValidationError" class="cv-field-warn">{{ workflowValidationError }}</div>
      </div>

      <h2 class="cv-section-title">生图提示词</h2>
      <div class="cv-section-body">
        <ImagePromptPresetPanel
          :preset-settings="settings.imagePromptPresets"
          :positive-preset-id="settings.comfyui.positivePromptPresetId"
          :negative-preset-id="settings.comfyui.negativePromptPresetId"
          @update:preset-settings="settings.imagePromptPresets = $event"
          @update:positive-preset-id="settings.comfyui.positivePromptPresetId = $event"
          @update:negative-preset-id="settings.comfyui.negativePromptPresetId = $event"
        />
      </div>
    </template>

    <!-- 测试 Tab -->
    <ComfyUITestTab v-else />
  </div>
</template>

<script setup lang="ts">
import { uuidv4 } from '@sillytavern/scripts/utils';

import {
  createComfyUIWorkflowPreset,
  DEFAULT_COMFYUI_WORKFLOW_JSON,
  DEFAULT_COMFYUI_WORKFLOW_PRESET_ID,
} from '@/constants/comfyui';
import { fetchComfyUILoraNames } from '@/services/comfyui/api';
import { fetchComfyUIObjectInfo } from '@/services/comfyui/object-info';
import { getActiveComfyUILoras } from '@/services/comfyui/lora-presets';
import { getComfyUIWorkflowValidationError } from '@/services/comfyui/parse';
import { findComfyUIWorkflowPreset, importComfyUIWorkflowPreset } from '@/services/comfyui/workflow-presets';
import ComfyUIWorkflowEditor from '@/panel/components/comfyui/ComfyUIWorkflowEditor.vue';
import PresetSelector from '@/panel/components/PresetSelector.vue';
import { useSettingsStore } from '@/store/settings';
import { useSyncCacheStore } from '@/store/sync-cache';
import ImagePromptPresetPanel from '@/panel/components/ImagePromptPresetPanel.vue';
import ComfyUITestTab from './ComfyUITestTab.vue';

type ComfyUISubTab = 'api' | 'config' | 'test';
type TextOption = { value: string; label: string };
type PresetOption = { id: string; name: string };

const { settings } = useSettingsStore();
const syncCacheStore = useSyncCacheStore();
const workflowFileInput = ref<HTMLInputElement | null>(null);

const props = withDefaults(defineProps<{ subTab: ComfyUISubTab; tutorialNodeId?: string | null }>(), {
  tutorialNodeId: null,
});
const subTab = computed(() => props.subTab);

const refreshSections = inject<(() => void) | undefined>('refreshSections');
const showPrompt =
  inject<(options: { title?: string; message: string; defaultValue?: string }) => Promise<string | null>>('showPrompt');
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
const isLoadingLoras = ref(false);

const isTestingConnection = ref(false);
const connectionTestStatus = ref<'idle' | 'success' | 'error'>('idle');

const connectionTestIcon = computed(() => {
  if (connectionTestStatus.value === 'success') return 'fa-solid fa-circle-check';
  if (connectionTestStatus.value === 'error') return 'fa-solid fa-circle-xmark';
  return 'fa-solid fa-plug';
});

const connectionTestSeverity = computed(() => {
  if (connectionTestStatus.value === 'success') return 'success';
  if (connectionTestStatus.value === 'error') return 'danger';
  return 'secondary';
});

const connectionTestTitle = computed(() => {
  if (isTestingConnection.value) return '正在测试连接...';
  if (connectionTestStatus.value === 'success') return '连接成功，点击重新测试';
  if (connectionTestStatus.value === 'error') return '连接失败，点击重新测试';
  return '测试连接';
});

/**
 * 测试当前填写的 ComfyUI URL 连通性
 */
async function testConnection(): Promise<void> {
  if (isTestingConnection.value) return;
  isTestingConnection.value = true;
  connectionTestStatus.value = 'idle';
  try {
    if (!settings.comfyui.url.trim()) {
      throw new Error('请先填写 ComfyUI URL');
    }
    // 复用已有的元数据拉取函数作为连通性测试，同时进行缓存预热
    await fetchComfyUIObjectInfo(settings.comfyui.url, true);
    connectionTestStatus.value = 'success';
    toastr.success('ComfyUI 连接成功');
  } catch (error) {
    connectionTestStatus.value = 'error';
    const message = error instanceof Error ? error.message : '连接失败';
    toastr.error(message);
  } finally {
    isTestingConnection.value = false;
  }
}

watch(
  () => settings.comfyui.url,
  () => {
    connectionTestStatus.value = 'idle';
  },
);

watch(
  subTab,
  () => {
    nextTick(() => {
      refreshSections?.();
    });
  },
  { immediate: true },
);

const activeWorkflow = computed(() =>
  findComfyUIWorkflowPreset(settings.comfyui.workflowPresets, settings.comfyui.workflowPresets.activePresetId),
);
const activeWorkflowJson = computed({
  get: () => activeWorkflow.value?.workflowJson ?? '',
  set: value => {
    if (activeWorkflow.value) activeWorkflow.value.workflowJson = value;
  },
});
const workflowEditorJson = computed({
  get: () => (props.tutorialNodeId ? DEFAULT_COMFYUI_WORKFLOW_JSON : activeWorkflowJson.value),
  set: value => {
    if (!props.tutorialNodeId) activeWorkflowJson.value = value;
  },
});
/** 当前工作流预设的收藏节点 ID（缺字段时回退空数组） */
const activeFavoriteNodeIds = computed(() => activeWorkflow.value?.favoriteNodeIds ?? []);
const workflowPresetOptions = computed<PresetOption[]>(() =>
  settings.comfyui.workflowPresets.presets.map(({ id, name }) => ({ id, name })),
);
const isDefaultWorkflowActive = computed(
  () => settings.comfyui.workflowPresets.activePresetId === DEFAULT_COMFYUI_WORKFLOW_PRESET_ID,
);

const loraOptions = computed(() =>
  buildTextOptions(
    syncCacheStore.fetchedComfyUiLoras,
    (settings.comfyui.loraPresets.presets.length ? getActiveComfyUILoras(settings.comfyui.loraPresets) : []).map(
      lora => lora.name,
    ),
  ),
);

const workflowValidationError = computed(() => {
  const workflowJson = activeWorkflowJson.value.trim();
  if (!workflowJson) return null;
  return getComfyUIWorkflowValidationError(workflowJson);
});

/**
 * 构建文本下拉选项,并保留当前已选值
 * @param sourceValues 远程拉取到的值
 * @param selectedValues 当前已选值
 * @returns Select 可用选项
 */
function buildTextOptions(sourceValues: readonly string[], selectedValues: readonly string[]): TextOption[] {
  const values = new Set<string>();
  appendTrimmedValues(values, sourceValues);
  appendTrimmedValues(values, selectedValues);
  return [...values].map(value => ({ value, label: value }));
}

/**
 * 向集合中写入去空白后的文本值
 * @param target 目标集合
 * @param values 待写入文本
 */
function appendTrimmedValues(target: Set<string>, values: readonly string[]): void {
  values.forEach(value => {
    const trimmed = value.trim();
    if (trimmed) target.add(trimmed);
  });
}

/**
 * 切换当前工作流预设
 * @param presetId 工作流预设 ID
 */
function updateWorkflowPresetId(presetId: string): void {
  settings.comfyui.workflowPresets.activePresetId = presetId;
}

/** 新建工作流预设 */
async function createWorkflowPreset(): Promise<void> {
  const name = await askWorkflowPresetName('新建工作流', '请输入工作流名称：', '新工作流');
  if (!name) return;
  const preset = createComfyUIWorkflowPreset(uuidv4(), name, '');
  settings.comfyui.workflowPresets.presets.push(preset);
  updateWorkflowPresetId(preset.id);
}

/** 克隆当前工作流预设（含收藏节点快照） */
async function cloneWorkflowPreset(): Promise<void> {
  if (!activeWorkflow.value) return;
  const name = await askWorkflowPresetName('克隆工作流', '请输入工作流名称：', `${activeWorkflow.value.name} - 副本`);
  if (!name) return;
  const preset = createComfyUIWorkflowPreset(uuidv4(), name, activeWorkflow.value.workflowJson, {
    favoriteNodeIds: [...(activeWorkflow.value.favoriteNodeIds ?? [])],
  });
  settings.comfyui.workflowPresets.presets.push(preset);
  updateWorkflowPresetId(preset.id);
}

/**
 * 写回当前工作流预设的收藏节点列表
 * @param ids 新的收藏节点 ID 列表
 */
function updateFavoriteNodeIds(ids: string[]): void {
  if (!activeWorkflow.value) return;
  activeWorkflow.value.favoriteNodeIds = [...ids];
}

/** 重命名当前工作流预设 */
async function renameWorkflowPreset(): Promise<void> {
  if (!activeWorkflow.value) return;
  const name = await askWorkflowPresetName('重命名工作流', '请输入新的工作流名称：', activeWorkflow.value.name);
  if (name) activeWorkflow.value.name = name;
}

/**
 * 删除指定工作流预设
 * @param presetId 工作流预设 ID
 */
function deleteWorkflowPreset(presetId: string): void {
  const presets = settings.comfyui.workflowPresets.presets;
  const index = presets.findIndex(preset => preset.id === presetId);
  if (index < 0) return;
  presets.splice(index, 1);
  updateWorkflowPresetId(presets[0].id);
}

/** 确认后重置默认工作流 */
async function resetDefaultWorkflow(): Promise<void> {
  const message = '确定要重置默认工作流吗？这会覆盖你对默认工作流的修改。';
  const confirmed = showConfirm
    ? await showConfirm({
        title: '重置默认工作流',
        message,
        acceptLabel: '确认重置',
        cancelLabel: '取消',
        severity: 'danger',
      })
    : confirm(message);
  if (!confirmed || !activeWorkflow.value) return;
  activeWorkflow.value.workflowJson = DEFAULT_COMFYUI_WORKFLOW_JSON;
  toastr.success('默认工作流已重置');
}

/**
 * 请求并校验工作流预设名称
 * @param title 弹窗标题
 * @param message 弹窗提示
 * @param defaultValue 默认名称
 * @returns 有效名称或 null
 */
async function askWorkflowPresetName(title: string, message: string, defaultValue: string): Promise<string | null> {
  if (!showPrompt) return null;
  const value = await showPrompt({ title, message, defaultValue });
  const name = value?.trim();
  if (value !== null && !name) toastr.error('工作流名称不能为空');
  return name || null;
}

/**
 * 从 ComfyUI 读取 LoRA 文件列表
 */
async function fetchLoraOptions(): Promise<void> {
  if (!settings.comfyui.url.trim()) {
    toastr.warning('请先填写 ComfyUI URL');
    return;
  }

  isLoadingLoras.value = true;
  try {
    const loras = await fetchComfyUILoraNames(settings.comfyui);
    syncCacheStore.setComfyUiLoras(loras);
    toastr.success(`成功获取 ${syncCacheStore.fetchedComfyUiLoras.length} 个 LoRA`);
  } catch (error) {
    const message = error instanceof Error ? error.message : '获取 LoRA 列表失败';
    toastr.error(message);
    console.error('[ComfyUITab]', error);
  } finally {
    isLoadingLoras.value = false;
  }
}

/**
 * 触发工作流文件导入
 */
function triggerWorkflowImport(): void {
  workflowFileInput.value?.click();
}

/**
 * 读取导入的工作流文件
 * @param event 文件选择事件
 */
async function handleWorkflowFileChange(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  try {
    const preset = importComfyUIWorkflowPreset(
      settings.comfyui.workflowPresets,
      uuidv4(),
      file.name,
      await file.text(),
    );
    toastr.success(`已导入工作流到新预设: ${preset.name}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : '读取工作流文件失败';
    toastr.error(message);
  } finally {
    input.value = '';
  }
}
</script>

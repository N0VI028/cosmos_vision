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
              需要 Comfyui 设置启动参数：--listen --enable-cors-header *
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

    <!-- 工作流 Tab -->
    <template v-else-if="subTab === 'workflow'">
      <h2 class="cv-section-title">工作流</h2>
      <div class="cv-section-body" data-cv-tutorial="comfyui-workflow">
        <PresetSelector
          :presets="workflowPresetOptions"
          :active-preset-id="settings.comfyui.workflowPresets.activePresetId"
          :show-portability="true"
          import-via-dialog
          rename-title="编辑当前预设"
          export-title="导出当前工作流"
          import-title="导入工作流"
          @update:active-preset-id="updateWorkflowPresetId"
          @create="createWorkflowPreset"
          @clone="cloneWorkflowPreset"
          @rename="isWorkflowEditDialogOpen = true"
          @export-preset="handleWorkflowPresetExport"
          @import-click="isImportVisible = true"
          @delete-preset="deleteWorkflowPreset"
        />
        <PresetImportDialog
          v-model:visible="isImportVisible"
          title="导入工作流"
          defaults-entry-label="导入默认工作流"
          :defaults="defaultWorkflowImportOptions"
          :existing-ids="settings.comfyui.workflowPresets.presets.map(preset => preset.id)"
          @import-file="handleWorkflowFileImport"
          @import-defaults="importDefaults"
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
          @refresh-lora-options="fetchLoraOptions"
        />
        <div v-if="workflowValidationError" class="cv-field-warn">{{ workflowValidationError }}</div>
        <ComfyUIWorkflowEditDialog
          v-model:visible="isWorkflowEditDialogOpen"
          :preset-name="activeWorkflow?.name ?? ''"
          :workflow-json="activeWorkflow?.workflowJson ?? ''"
          @confirm="onWorkflowEditConfirm"
        />
      </div>
    </template>

    <!-- 预设 Tab -->
    <template v-else-if="subTab === 'preset'">
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

      <h2 class="cv-section-title">随机预设池</h2>
      <div class="cv-section-body">
        <RandomPresetPoolPanel source="comfyui" />
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
  createComfyUIWorkflowPresetSettings,
  DEFAULT_COMFYUI_WORKFLOW_JSON,
  DEFAULT_COMFYUI_WORKFLOW_PRESET_ID,
  DEFAULT_COMFYUI_WORKFLOW_PRESET_ID_K2_ANIMA,
  type ComfyUIWorkflowPreset,
} from '@/constants/comfyui';
import { fetchComfyUILoraNames } from '@/services/comfyui/api';
import { fetchComfyUIObjectInfo } from '@/services/comfyui/object-info';
import {
  applyActiveLoraPresetToWorkflowJson,
  formatLoraDisplayName,
  getActiveComfyUILoras,
} from '@/services/comfyui/lora-presets';
import { getComfyUIWorkflowValidationError } from '@/services/comfyui/parse';
import { mergeById } from '@/services/data-portability/import';
import {
  exportComfyUIWorkflowPreset,
  findComfyUIWorkflowPreset,
  importComfyUIWorkflowPreset,
} from '@/services/comfyui/workflow-presets';
import ComfyUIWorkflowEditDialog from '@/panel/components/comfyui/ComfyUIWorkflowEditDialog.vue';
import ComfyUIWorkflowEditor from '@/panel/components/comfyui/ComfyUIWorkflowEditor.vue';
import PresetImportDialog from '@/panel/components/PresetImportDialog.vue';
import PresetSelector from '@/panel/components/PresetSelector.vue';
import { useSettingsStore } from '@/store/settings';
import { useSyncCacheStore } from '@/store/sync-cache';
import ImagePromptPresetPanel from '@/panel/components/ImagePromptPresetPanel.vue';
import RandomPresetPoolPanel from '@/panel/components/RandomPresetPoolPanel.vue';
import ComfyUITestTab from './ComfyUITestTab.vue';

type ComfyUISubTab = 'api' | 'workflow' | 'preset' | 'test';
type TextOption = { value: string; label: string };
type PresetOption = { id: string; name: string };

const { settings } = useSettingsStore();
const syncCacheStore = useSyncCacheStore();
const isWorkflowEditDialogOpen = ref(false);

const props = withDefaults(defineProps<{ subTab: ComfyUISubTab; tutorialNodeId?: string | null }>(), {
  tutorialNodeId: null,
});
const subTab = computed(() => props.subTab);

const refreshSections = inject<(() => void) | undefined>('refreshSections');
const showPrompt =
  inject<(options: { title?: string; message: string; defaultValue?: string }) => Promise<string | null>>('showPrompt');
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

/** 控制导入工作流弹窗的显示状态 */
const isImportVisible = ref(false);

/** 默认工作流预设的副标题说明 */
const DEFAULT_WORKFLOW_DESCRIPTIONS: Record<string, string> = {
  [DEFAULT_COMFYUI_WORKFLOW_PRESET_ID]: 'ComfyUI + Lora-Manager 默认模板',
  [DEFAULT_COMFYUI_WORKFLOW_PRESET_ID_K2_ANIMA]: 'UNETLoader + RegexMatch 分流 Krea-2 / Anima',
};

/** 可导入的默认工作流初始预设 */
const DEFAULT_WORKFLOW_PRESETS = createComfyUIWorkflowPresetSettings().presets;

/** 弹窗内可导入的默认工作流选项 */
const defaultWorkflowImportOptions = DEFAULT_WORKFLOW_PRESETS.map(({ id, name }) => ({
  id,
  name,
  description: DEFAULT_WORKFLOW_DESCRIPTIONS[id],
}));

const loraOptions = computed(() =>
  buildTextOptions(
    syncCacheStore.fetchedComfyUiLoras,
    (settings.comfyui.loraPresets.presets.length ? getActiveComfyUILoras(settings.comfyui.loraPresets) : []).map(
      lora => lora.name,
    ),
  ).map(option => ({ value: option.value, label: formatLoraDisplayName(option.value) })),
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

/**
 * 按合并结果导入选中的默认工作流（已存在的覆盖为初始内容）
 * @param ids 选中的默认工作流预设 ID 列表
 */
function importDefaults(ids: string[]): void {
  const incoming = DEFAULT_WORKFLOW_PRESETS.filter(preset => ids.includes(preset.id)).map(toImportableWorkflow);
  if (!incoming.length) return;

  const presets = mergeById(settings.comfyui.workflowPresets.presets, incoming);
  settings.comfyui.workflowPresets.presets = presets;
  if (!presets.some(preset => preset.id === settings.comfyui.workflowPresets.activePresetId)) {
    updateWorkflowPresetId(presets[0].id);
  }
  toastr.success(`已导入 ${incoming.length} 个默认工作流`);
}

/**
 * 转换默认工作流为待导入预设
 * 默认工作流同步写入当前激活 LoRA 预设，避免空 LoRA 节点直接生图
 * @param preset 默认工作流预设
 * @returns 待导入副本
 */
function toImportableWorkflow(preset: ComfyUIWorkflowPreset): ComfyUIWorkflowPreset {
  if (preset.id !== DEFAULT_COMFYUI_WORKFLOW_PRESET_ID) return preset;
  return {
    ...preset,
    workflowJson: applyActiveLoraPresetToWorkflowJson(DEFAULT_COMFYUI_WORKFLOW_JSON, settings.comfyui.loraPresets),
  };
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
 * 导出当前 ComfyUI 工作流预设
 */
function handleWorkflowPresetExport(): void {
  if (!activeWorkflow.value) return;
  try {
    exportComfyUIWorkflowPreset(activeWorkflow.value);
  } catch (error) {
    const message = error instanceof Error ? error.message : '导出工作流预设失败';
    toastr.error(message);
  }
}

/**
 * 读取并导入工作流文件到新预设
 * @param file 选中的工作流 JSON 文件
 */
async function handleWorkflowFileImport(file: File): Promise<void> {
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
  }
}

/**
 * 保存工作流编辑弹窗确认的数据
 * @param payload 编辑后的预设名称与工作流 JSON
 */
function onWorkflowEditConfirm(payload: { name: string; workflowJson: string }): void {
  if (!activeWorkflow.value) return;
  activeWorkflow.value.name = payload.name;
  activeWorkflow.value.workflowJson = payload.workflowJson;
}
</script>

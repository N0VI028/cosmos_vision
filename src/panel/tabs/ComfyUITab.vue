<template>
  <div class="cv-tab-content">
    <!-- API Tab -->
    <template v-if="subTab === 'api'">
      <h2 class="cv-section-title">连接信息</h2>
      <div class="cv-section-body">
        <label class="cv-field">
          <span>ComfyUI URL</span>
          <div class="cv-field-control">
            <InputText v-model="settings.comfyui.url" placeholder="http://127.0.0.1:8188" />
            <div class="cv-field-hint">浏览器直连本地 ComfyUI 时，请确认已允许当前来源的 CORS</div>
          </div>
        </label>
      </div>
    </template>

    <!-- 配置 Tab -->
    <template v-else-if="subTab === 'config'">
      <h2 class="cv-section-title">工作流编辑器</h2>
      <div class="cv-section-body">
        <input
          ref="workflowFileInput"
          type="file"
          accept="application/json,.json"
          class="hidden"
          @change="handleWorkflowFileChange"
        />
        <ComfyUIWorkflowEditor
          v-model="settings.comfyui.workflowJson"
          :comfyui-url="settings.comfyui.url"
          :lora-preset-settings="settings.comfyui.loraPresets"
          :lora-options="loraOptions"
          :is-loading-loras="isLoadingLoras"
          @update:lora-preset-settings="settings.comfyui.loraPresets = $event"
          @import="triggerWorkflowImport"
          @restore-default="restoreDefaultWorkflow"
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
import {
  createComfyUILoraPresetSettings,
  DEFAULT_COMFYUI_WORKFLOW_JSON,
} from '@/constants/comfyui';
import { fetchComfyUILoraNames } from '@/services/comfyui/api';
import { getActiveComfyUILoras } from '@/services/comfyui/lora-presets';
import { getComfyUIWorkflowValidationError } from '@/services/comfyui/parse';
import ComfyUIWorkflowEditor from '@/panel/components/comfyui/ComfyUIWorkflowEditor.vue';
import { useSettingsStore } from '@/store/settings';
import ImagePromptPresetPanel from '@/panel/components/ImagePromptPresetPanel.vue';
import ComfyUITestTab from './ComfyUITestTab.vue';

type ComfyUISubTab = 'api' | 'config' | 'test';
type TextOption = { value: string; label: string };

const { settings } = useSettingsStore();
const workflowFileInput = ref<HTMLInputElement | null>(null);

const props = defineProps<{ subTab: ComfyUISubTab }>();
const subTab = computed(() => props.subTab);

const refreshSections = inject<(() => void) | undefined>('refreshSections');
const loraNames = ref<string[]>([]);
const isLoadingLoras = ref(false);

watch(
  subTab,
  value => {
    if (value === 'config') fillDefaultWorkflowIfEmpty();
    nextTick(() => {
      refreshSections?.();
    });
  },
  { immediate: true },
);

const loraOptions = computed(() =>
  buildTextOptions(
    loraNames.value,
    (
      settings.comfyui.loraPresets.presets.length
        ? getActiveComfyUILoras(settings.comfyui.loraPresets)
        : []
    ).map(lora => lora.name),
  ),
);

const workflowValidationError = computed(() => {
  const workflowJson = settings.comfyui.workflowJson.trim();
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
 * 在空工作流时填入默认工作流
 */
function fillDefaultWorkflowIfEmpty(): void {
  if (settings.comfyui.workflowJson.trim()) return;
  settings.comfyui.workflowJson = DEFAULT_COMFYUI_WORKFLOW_JSON;
  if (!settings.comfyui.loraPresets.presets.length) {
    settings.comfyui.loraPresets = createComfyUILoraPresetSettings();
  }
}

/**
 * 恢复默认工作流与 LoRA 预设组
 */
function restoreDefaultWorkflow(): void {
  settings.comfyui.workflowJson = DEFAULT_COMFYUI_WORKFLOW_JSON;
  settings.comfyui.loraPresets = createComfyUILoraPresetSettings();
  toastr.success('已恢复默认工作流');
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
    loraNames.value = await fetchComfyUILoraNames(settings.comfyui);
    toastr.success(`成功获取 ${loraNames.value.length} 个 LoRA`);
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
    settings.comfyui.workflowJson = await file.text();
    toastr.success(`已导入工作流: ${file.name}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : '读取工作流文件失败';
    toastr.error(message);
  } finally {
    input.value = '';
  }
}
</script>

<style scoped>
@reference '../../global.css';

.cv-tab-content {
  @apply flex flex-col gap-0;
}
</style>

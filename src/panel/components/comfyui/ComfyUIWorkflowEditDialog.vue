<template>
  <Dialog
    :visible="visible"
    modal
    dismissable-mask
    :draggable="false"
    header="编辑工作流预设"
    :style="DIALOG_STYLE"
    :content-style="{ overflow: 'hidden' }"
    @update:visible="emit('update:visible', $event)"
  >
    <div class="flex flex-col gap-(--cv-space-lg) py-(--cv-space-sm)">
      <label class="cv-field">
        <span>预设名称</span>
        <div class="cv-field-control">
          <InputText v-model="localName" class="w-full" placeholder="输入预设名称" />
        </div>
      </label>

      <label class="cv-field">
        <span>API 格式工作流 JSON</span>
        <div class="cv-field-control">
          <Textarea
            v-model="localWorkflowJson"
            rows="10"
            class="custom-scrollbar w-full resize-y overflow-y-auto font-mono text-(length:--cv-font-size-xs)"
            :invalid="Boolean(validationError)"
            placeholder="{ ... }"
          />
          <div class="cv-field-hint">请使用 ComfyUI 的 Save (API Format) 导出</div>
        </div>
      </label>

      <div v-if="validationError" class="cv-field-warn">{{ validationError }}</div>
    </div>

    <template #footer>
      <div class="cv-confirm-actions">
        <Button label="取消" text :fluid="false" @click="emit('update:visible', false)" />
        <Button label="保存" :fluid="false" @click="handleSave" />
      </div>
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { getComfyUIWorkflowValidationError } from '@/services/comfyui/parse';

/** 弹窗样式 */
const DIALOG_STYLE = {
  width: '38rem',
  maxWidth: 'calc(100vw - 2rem)',
} as const;

const props = defineProps<{
  visible: boolean;
  presetName: string;
  workflowJson: string;
}>();

const emit = defineEmits<{
  'update:visible': [value: boolean];
  confirm: [{ name: string; workflowJson: string }];
}>();

const localName = ref('');
const localWorkflowJson = ref('');
const validationError = ref<string | null>(null);

watch(
  () => props.visible,
  opened => {
    if (opened) {
      localName.value = props.presetName;
      localWorkflowJson.value = props.workflowJson;
      validationError.value = null;
    }
  },
  { immediate: true },
);

/**
 * 校验并提交工作流预设修改
 */
function handleSave(): void {
  const trimmedName = localName.value.trim();
  if (!trimmedName) {
    validationError.value = '预设名称不能为空';
    return;
  }
  const jsonError = getComfyUIWorkflowValidationError(localWorkflowJson.value);
  if (jsonError) {
    validationError.value = jsonError;
    return;
  }
  validationError.value = null;
  emit('confirm', {
    name: trimmedName,
    workflowJson: localWorkflowJson.value,
  });
  emit('update:visible', false);
}
</script>

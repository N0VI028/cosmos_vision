<template>
  <div class="cv-workflow-inspector">
    <div v-if="!nodeId || !node" class="cv-workflow-inspector__empty">点击画布节点以编辑参数</div>
    <template v-else>
      <div class="cv-workflow-inspector__header">
        <div>
          <div class="cv-workflow-inspector__title">{{ displayName }}</div>
          <div class="cv-workflow-inspector__meta">#{{ nodeId }} · {{ node.class_type }}</div>
        </div>
        <div class="cv-workflow-inspector__output">
          <Button
            :label="isImageOutput ? '当前输出节点' : '设为输出节点'"
            :severity="isImageOutput ? 'success' : 'secondary'"
            size="small"
            :outlined="!isImageOutput"
            :disabled="!canSetOutput"
            @click="emit('set-image-output', nodeId)"
          />
          <div v-if="outputHint" class="cv-field-hint">{{ outputHint }}</div>
        </div>
      </div>

      <ComfyUILoraPresetPanel
        v-if="showLoraPanel && loraPresetSettings"
        :preset-settings="loraPresetSettings"
        :lora-options="loraOptions"
        :is-loading-loras="isLoadingLoras"
        @update:preset-settings="emit('update:lora-preset-settings', $event)"
        @refresh-options="emit('refresh-lora-options')"
      />

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
    </template>
  </div>
</template>

<script setup lang="ts">
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

const props = defineProps<{
  nodeId: string | null;
  node: ComfyUIWorkflowNode | null;
  controls: ComfyUIInputControlDesc[];
  canSetOutput: boolean;
  outputUnverified: boolean;
  loraPresetSettings?: ComfyUILoraPresetSettings;
  loraOptions: { value: string; label: string }[];
  isLoadingLoras: boolean;
}>();

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

const outputHint = computed(() => {
  if (!props.canSetOutput) return '在线 schema 未将该节点标记为输出节点';
  if (props.outputUnverified) return '离线模式：输出节点未经验证';
  return '';
});
</script>

<style scoped>
@reference '../../../global.css';

.cv-workflow-inspector {
  @apply flex flex-col;
  gap: var(--cv-space-xl);
  border: var(--cv-border-width) solid var(--cv-surface-variant);
  border-radius: var(--cv-radius);
  background: var(--cv-surface-container);
  padding: var(--cv-space-2xl);
}

.cv-workflow-inspector__empty {
  @apply text-center;
  color: var(--cv-on-surface-variant);
  padding: var(--cv-space-5xl);
  font-size: var(--cv-font-size-sm);
}

.cv-workflow-inspector__header {
  @apply flex items-start justify-between;
  gap: var(--cv-space-xl);
}

.cv-workflow-inspector__title {
  font-size: var(--cv-font-size-md);
  font-weight: 600;
  color: var(--cv-on-surface);
}

.cv-workflow-inspector__meta {
  font-size: var(--cv-font-size-sm);
  color: var(--cv-on-surface-variant);
}

.cv-workflow-inspector__output {
  @apply flex flex-col items-end;
  gap: var(--cv-space-sm);
  max-width: 14rem;
}

.cv-workflow-inspector__inputs {
  @apply flex flex-col;
}
</style>

<template>
  <Dialog
    v-model:visible="visible"
    modal
    :auto-z-index="false"
    :pt="downloadDialogPt"
    :closable="false"
    :close-on-escape="false"
    :draggable="false"
    :class="dialogClass"
    header="下载图片"
    :style="dialogStyle"
    :content-style="contentStyle"
  >
    <div class="cv-image-download-dialog">
      <div class="cv-confirm-message">下载前先确认导出格式和处理方式。</div>
      <SubTabNav v-model="options.format" class="cv-image-download-dialog__tabs" :tabs="formatTabs" />

      <div v-if="options.format === 'png'" class="cv-image-download-dialog__panel">
        <div class="cv-image-download-dialog__field cv-image-download-dialog__field--row">
          <div class="cv-image-download-dialog__field-header">
            <span>清理 PNG 元数据</span>
            <span class="cv-image-download-dialog__hint">移除 NovelAI / ComfyUI 图片中的提示词、工作流等数据</span>
          </div>
          <ToggleSwitch v-model="options.cleanMetadata" />
        </div>
      </div>

      <div v-else class="cv-image-download-dialog__panel">
        <div class="cv-image-download-dialog__field">
          <div class="cv-image-download-dialog__field-header">
            <span>JPG 压缩质量</span>
            <span class="cv-image-download-dialog__value">{{ jpgQualityPercent }}%</span>
          </div>
          <Slider v-model="jpgQualityPercent" :min="10" :max="100" class="cv-image-download-dialog__slider" />
          <div class="cv-image-download-dialog__hint">JPG 导出会默认清理元数据。</div>
        </div>
      </div>
    </div>
    <template #footer>
      <div class="cv-confirm-actions">
        <Button label="取消" text @click="submit(false)" />
        <Button label="开始下载" @click="submit(true)" />
      </div>
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import { useMediaQuery } from '@vueuse/core';
import type { DialogPassThroughOptions } from 'primevue/dialog';

import SubTabNav from '@/panel/components/SubTabNav.vue';
import { DARK_CLASS } from '@/constants/default-settings';
import {
  cloneInlineImageDownloadOptions,
  type InlineImageDownloadOptions,
} from '@/services/inline-image/download-options';

const visible = defineModel<boolean>('visible', { required: true });
const options = defineModel<InlineImageDownloadOptions>('options', { required: true });

const props = withDefaults(defineProps<{ darkMode?: boolean }>(), {
  darkMode: false,
});

const emit = defineEmits<{
  submit: [value: InlineImageDownloadOptions | null];
}>();

const isMobile = useMediaQuery('(max-width: 87.5em)');

const dialogClass = computed(() => [
  'cosmos-vision-root',
  'cv-confirm-dialog',
  'cv-image-download-dialog__root',
  { [DARK_CLASS]: props.darkMode },
]);
const dialogStyle = computed(() =>
  isMobile.value
    ? { width: 'calc(100vw - 2rem)', maxWidth: '28rem' }
    : { width: '28rem', maxWidth: 'calc(100vw - 3rem)' },
);
const contentStyle = { overflow: 'hidden' } as const;
const DOWNLOAD_DIALOG_Z_INDEX = 100100;
const downloadDialogPt = {
  mask: {
    class: 'cv-dialog-mask',
    style: { zIndex: DOWNLOAD_DIALOG_Z_INDEX },
  },
} satisfies DialogPassThroughOptions;
const formatTabs = [
  { value: 'png', label: 'PNG' },
  { value: 'jpg', label: 'JPG' },
] as const;
const jpgQualityPercent = computed({
  get: () => Math.round(options.value.jpgQuality * 100),
  set: value => {
    options.value.jpgQuality = Math.min(1, Math.max(0.1, value / 100));
  },
});

/**
 * 提交下载配置弹窗结果
 * @param accept 是否确认下载
 */
function submit(accept: boolean): void {
  visible.value = false;
  emit('submit', accept ? cloneInlineImageDownloadOptions(options.value) : null);
}
</script>

<style scoped>
@reference '../../global.css';

.cv-image-download-dialog {
  @apply flex flex-col;
  gap: var(--cv-space-3xl);
}

.cv-image-download-dialog__tabs {
  @apply w-full;
}

.cv-image-download-dialog__tabs :deep(.cv-subtab-nav) {
  @apply w-full;
}

.cv-image-download-dialog__tabs :deep(.cv-subtab-item) {
  @apply flex-1;
}

.cv-image-download-dialog__panel {
  @apply flex flex-col;
  gap: var(--cv-space-2xl);
}

.cv-image-download-dialog__field {
  @apply flex flex-col;
  gap: var(--cv-space-lg);
}

.cv-image-download-dialog__field--row {
  @apply flex-row items-start justify-between;
}

.cv-image-download-dialog__field-header {
  @apply flex flex-col;
  gap: var(--cv-space-xs);
}

.cv-image-download-dialog__value {
  color: var(--cv-on-surface);
  font-size: var(--cv-font-size-sm);
  font-weight: 600;
}

.cv-image-download-dialog__hint {
  color: var(--cv-on-surface-variant);
  font-size: var(--cv-font-size-xs);
  line-height: 1.5;
}

.cv-image-download-dialog__slider.p-slider {
  margin-inline: 0 !important;
}

:deep(.cv-image-download-dialog__root .p-dialog-content) {
  overflow: hidden;
}
</style>

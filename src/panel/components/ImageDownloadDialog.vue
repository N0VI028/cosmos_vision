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
    <div class="flex flex-col gap-(--cv-space-3xl)">
      <div class="cv-confirm-message">下载前先确认导出格式和处理方式。</div>
      <SelectButton
        v-model="options.format"
        fluid
        :options="formatOptions"
        option-label="label"
        option-value="value"
        :allow-empty="false"
        aria-label="导出格式"
      />

      <div v-if="options.format === 'png'" class="flex flex-col gap-(--cv-space-2xl)">
        <div class="flex flex-row items-start justify-between gap-(--cv-space-lg)">
          <div class="flex flex-col gap-(--cv-space-xs)">
            <span>清理 PNG 元数据</span>
            <span class="text-(length:--cv-font-size-xs) leading-[1.5] text-(--cv-on-surface-variant)"
              >移除 NovelAI / ComfyUI 图片中的提示词、工作流等数据</span
            >
          </div>
          <ToggleSwitch v-model="options.cleanMetadata" />
        </div>
      </div>

      <div v-else class="flex flex-col gap-(--cv-space-2xl)">
        <div class="flex flex-col gap-(--cv-space-lg)">
          <div class="flex flex-col gap-(--cv-space-xs)">
            <span>JPG 压缩质量</span>
            <span class="text-(length:--cv-font-size-xs) font-semibold text-(--cv-on-surface)"
              >{{ jpgQualityPercent }}%</span
            >
          </div>
          <Slider v-model="jpgQualityPercent" :min="10" :max="100" />
          <div class="text-(length:--cv-font-size-xs) leading-[1.5] text-(--cv-on-surface-variant)">
            JPG 导出会默认清理元数据。
          </div>
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

/** 全局 dialog.root 已含 cosmos-vision-root；此处只叠业务/确认框变体与 dark */
const dialogClass = computed(() => [
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
/** 下载格式选项：对齐设置侧栏 SelectButton 的 option 结构 */
const formatOptions = [
  { value: 'png' as const, label: 'PNG' },
  { value: 'jpg' as const, label: 'JPG' },
];
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

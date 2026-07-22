<template>
  <section class="cv-wd-tagger-source">
    <div class="cv-wd-tagger-source__avatar-options">
      <Button
        v-for="option in sourceOptions"
        :key="option.value"
        :label="option.label"
        :icon="option.icon"
        outlined
        :disabled="option.disabled"
        class="cv-wd-tagger-source__avatar-option"
        @click="selectSource(option.value)"
      />
    </div>

    <FileUpload
      name="image"
      accept="image/*"
      :file-limit="1"
      :max-file-size="MAX_IMAGE_FILE_SIZE"
      :show-upload-button="false"
      :show-cancel-button="false"
      custom-upload
      :dt="fileUploadTheme"
      :pt="fileUploadPt"
      class="cv-wd-tagger-source__upload"
      @select="selectUpload"
    >
      <template #header="{ chooseCallback, clearCallback }">
        <button
          type="button"
          class="cv-wd-tagger-source__upload-panel"
          @click="chooseUpload(clearCallback, chooseCallback)"
        >
          <img v-if="previewUrl" :src="previewUrl" alt="待分析图片预览" />
          <i v-else class="fa-solid fa-image" aria-hidden="true" />
          <span class="cv-wd-tagger-source__upload-copy">
            <strong>{{ selectedFile?.name ?? '选择本地图片' }}</strong>
            <small>{{ previewUrl ? '点击更换图片，也可拖拽新图片到此处' : '上传或拖拽图片到此处' }}</small>
          </span>
        </button>
        <button
          v-if="source === 'upload' && selectedFile"
          type="button"
          class="cv-wd-tagger-source__upload-remove"
          aria-label="移除已上传图片"
          title="移除图片"
          @click="clearUpload(clearCallback)"
        >
          <i class="fa-solid fa-xmark" aria-hidden="true" />
        </button>
      </template>
    </FileUpload>

    <div class="cv-wd-tagger-source__thresholds">
      <div class="cv-field">
        <span>通用标签阈值 {{ generalThreshold.toFixed(2) }}</span>
        <Slider v-model="generalThreshold" :min="0.1" :max="0.9" :step="0.05" />
      </div>
      <div class="cv-field">
        <span>角色标签阈值 {{ characterThreshold.toFixed(2) }}</span>
        <Slider v-model="characterThreshold" :min="0.1" :max="0.9" :step="0.05" />
      </div>
    </div>

    <p class="cv-field-hint">
      图片会上传至第三方公共 WD Tagger 测试服务；该服务可能排队、限流或临时不可用。
    </p>

    <div class="cv-wd-tagger-source__actions">
      <Button
        :label="isAnalyzing ? '停止' : hasAnalyzed ? '重新分析' : '分析图片'"
        :icon="isAnalyzing ? 'fa-solid fa-stop' : 'fa-solid fa-wand-magic-sparkles'"
        :severity="isAnalyzing ? 'danger' : undefined"
        :outlined="isAnalyzing"
        :disabled="!isAnalyzing && !selectedFile"
        @click="isAnalyzing ? cancel() : analyze()"
      />
    </div>
  </section>
</template>

<script setup lang="ts">
import { formatWdTagDraft } from '@/services/prompt-profiles/static-tags-draft';
import { interrogateWdTagger } from '@/services/wd-tagger/client';
import { getWdAvatarPath, readWdAvatarFile, validateWdImageFile } from '@/services/wd-tagger/image-source';
import type { WdImageSource } from '@/services/wd-tagger/types';

const MAX_IMAGE_FILE_SIZE = 10 * 1024 * 1024;
const fileUploadPt = {
  header: {
    style: {
      position: 'relative',
    },
  },
  content: {
    style: {
      display: 'none',
    },
  },
} as const;
const fileUploadTheme = {
  root: {
    background: 'var(--cv-surface-container-low)',
    borderColor: 'var(--cv-surface-variant)',
    color: 'var(--cv-on-surface)',
    borderRadius: 'var(--cv-radius-md)',
  },
  header: {
    background: 'transparent',
    color: 'var(--cv-on-surface)',
    padding: '0',
    borderColor: 'transparent',
    borderWidth: '0',
    borderRadius: 'var(--cv-radius-md)',
    gap: '0',
  },
  content: {
    highlightBorderColor: 'var(--p-primary-color)',
    padding: '0',
    gap: '0',
  },
} as const;

/**
 * 图片反推来源组件属性
 */
const props = defineProps<{ personKind: 'user' | 'character' }>();
const emit = defineEmits<{ draft: [draft: string]; error: [message: string]; parsing: [value: boolean] }>();
const generalThreshold = defineModel<number>('generalThreshold', { required: true });
const characterThreshold = defineModel<number>('characterThreshold', { required: true });
const source = ref<WdImageSource>(props.personKind === 'user' ? 'user-avatar' : 'character-avatar');
const selectedFile = ref<File | null>(null);
const previewUrl = ref('');
const isAnalyzing = ref(false);
const hasAnalyzed = ref(false);
let abortController: AbortController | null = null;

const sourceOptions = computed(() => [
  {
    value: 'user-avatar' as const,
    label: '使用当前 user 头像',
    icon: 'fa-solid fa-user',
    disabled: !getWdAvatarPath('user-avatar'),
  },
  {
    value: 'character-avatar' as const,
    label: '使用当前 char 头像',
    icon: 'fa-solid fa-user-astronaut',
    disabled: !getWdAvatarPath('character-avatar'),
  },
]);

watch(
  () => props.personKind,
  kind => {
    if (!selectedFile.value) source.value = kind === 'user' ? 'user-avatar' : 'character-avatar';
  },
);
onBeforeUnmount(cancel);

/**
 * 选择当前头像作为图片来源
 * @param nextSource 新图片来源
 */
async function selectSource(nextSource: Exclude<WdImageSource, 'upload'>): Promise<void> {
  try {
    source.value = nextSource;
    setSelectedFile(await readWdAvatarFile(nextSource));
  } catch (error) {
    emit('error', readErrorMessage(error));
  }
}

/**
 * 打开 FileUpload 的图片选择器前清理旧的内部文件队列
 * @param clearCallback FileUpload 清理函数
 * @param chooseCallback FileUpload 选择函数
 */
function chooseUpload(clearCallback: () => void, chooseCallback: () => void): void {
  clearCallback();
  chooseCallback();
}

/**
 * 清理本地上传图片及 FileUpload 内部队列
 * @param clearCallback FileUpload 清理函数
 */
function clearUpload(clearCallback: () => void): void {
  cancel();
  clearCallback();
  selectedFile.value = null;
  hasAnalyzed.value = false;
  revokePreviewUrl();
}

/**
 * 读取 FileUpload 选择的图片文件
 * @param event FileUpload 选择事件
 */
function selectUpload(event: { files: File[] }): void {
  try {
    source.value = 'upload';
    setSelectedFile(validateWdImageFile(event.files.at(-1) ?? null));
  } catch (error) {
    emit('error', readErrorMessage(error));
  }
}

/**
 * 保存图片文件并更新预览地址
 * @param file 已校验图片文件
 */
function setSelectedFile(file: File): void {
  revokePreviewUrl();
  selectedFile.value = file;
  previewUrl.value = URL.createObjectURL(file);
  hasAnalyzed.value = false;
}

/**
 * 调用公共 WD Tagger 并提交标签草稿
 */
async function analyze(): Promise<void> {
  if (!selectedFile.value || isAnalyzing.value) return;
  abortController = new AbortController();
  setParsing(true);
  try {
    const result = await interrogateWdTagger(selectedFile.value, {
      thresholds: { general: generalThreshold.value, character: characterThreshold.value },
      signal: abortController.signal,
    });
    hasAnalyzed.value = true;
    emit('draft', formatWdTagDraft(result));
  } catch (error) {
    if (!isAbortError(error)) emit('error', readErrorMessage(error));
  } finally {
    abortController = null;
    setParsing(false);
  }
}

/**
 * 中止当前图片分析
 */
function cancel(): void {
  abortController?.abort();
  abortController = null;
  setParsing(false);
}

/**
 * 同步图片分析状态给父级
 * @param value 当前是否请求中
 */
function setParsing(value: boolean): void {
  isAnalyzing.value = value;
  emit('parsing', value);
}

/**
 * 释放图片预览地址
 */
function revokePreviewUrl(): void {
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value);
  previewUrl.value = '';
}

/**
 * 获取可展示的异常信息
 * @param error 原始异常
 * @returns 用户提示文本
 */
function readErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '图片分析失败';
}

/**
 * 判断是否为用户取消请求
 * @param error 原始异常
 * @returns 是否为取消异常
 */
function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

defineExpose({ cancel });
</script>

<style scoped>
@reference '../../global.css';

.cv-wd-tagger-source {
  @apply flex flex-col;
  gap: var(--cv-space-xl);
}

.cv-wd-tagger-source__avatar-options {
  @apply grid grid-cols-2;
  gap: var(--cv-space-md);
}

.cv-wd-tagger-source__avatar-option {
  @apply w-full;
}


.cv-wd-tagger-source__upload-panel {
  @apply flex w-full cursor-pointer items-center text-left;
  gap: var(--cv-space-lg);
  min-height: 7rem;
  padding: var(--cv-space-xl);
  border: var(--cv-border-width) dashed var(--cv-surface-variant);
  border-radius: var(--cv-radius-md);
  background: var(--cv-surface-container-low);
  color: var(--cv-on-surface);
}

.cv-wd-tagger-source__upload-panel:hover {
  border-color: var(--p-primary-color);
  background: color-mix(in srgb, var(--p-primary-color) 8%, var(--cv-surface-container-low));
}

.cv-wd-tagger-source__upload-remove {
  @apply grid cursor-pointer place-items-center;
  position: absolute;
  top: var(--cv-space-sm);
  right: var(--cv-space-sm);
  width: 1.5rem;
  height: 1.5rem;
  border: var(--cv-border-width) solid var(--cv-surface-variant);
  border-radius: var(--cv-radius-sm);
  background: var(--cv-surface-container-high);
  color: var(--cv-on-surface-variant);
}

.cv-wd-tagger-source__upload-remove:hover {
  border-color: var(--p-primary-color);
  color: var(--cv-on-surface);
}

.cv-wd-tagger-source__upload-panel > img {
  width: 5rem;
  height: 5rem;
  border-radius: var(--cv-radius-md);
  object-fit: cover;
}

.cv-wd-tagger-source__upload-panel > i {
  @apply grid place-items-center;
  width: 5rem;
  height: 5rem;
  border-radius: var(--cv-radius-md);
  background: var(--cv-surface-container-high);
  color: var(--cv-on-surface-variant);
  font-size: var(--cv-font-size-xl);
}

.cv-wd-tagger-source__upload-copy {
  @apply flex min-w-0 flex-col;
  gap: var(--cv-space-xs);
}

.cv-wd-tagger-source__upload-copy > strong {
  @apply overflow-hidden text-ellipsis whitespace-nowrap;
}

.cv-wd-tagger-source__upload-copy > small {
  color: var(--cv-on-surface-variant);
  font-size: var(--cv-font-size-xs);
}

.cv-wd-tagger-source__thresholds {
  @apply grid grid-cols-2;
  gap: var(--cv-space-xl);
}

.cv-wd-tagger-source__actions {
  @apply flex flex-wrap justify-end;
  gap: var(--cv-space-md);
}
</style>

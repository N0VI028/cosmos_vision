<template>
  <section class="flex flex-col gap-(--cv-space-xl)">
    <!-- 提取方式二级切换 -->
    <SelectButton
      v-model="extractMethod"
      fluid
      :options="EXTRACT_METHOD_OPTIONS"
      option-label="label"
      option-value="value"
      :allow-empty="false"
      aria-label="提取方式"
    >
      <template #option="{ option }">
        <div class="flex items-center justify-center gap-(--cv-space-sm)">
          <i :class="[option.icon, 'text-(length:--cv-font-size-xs)!']" aria-hidden="true" />
          <span>{{ option.label }}</span>
        </div>
      </template>
    </SelectButton>

    <div class="flex flex-wrap gap-(--cv-space-md)">
      <Button
        v-for="option in sourceOptions"
        :key="option.value"
        :label="option.label"
        :icon="option.icon"
        outlined
        :disabled="option.disabled"
        class="min-w-[12rem] flex-1"
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
      :pt="fileUploadPt"
      @select="selectUpload"
    >
      <template #header="{ chooseCallback, clearCallback }">
        <button
          type="button"
          class="flex min-h-28 w-full cursor-pointer items-center gap-(--cv-space-lg) rounded-(--cv-radius-md) border-0 bg-(--cv-surface-container-low) p-(--cv-space-xl) text-left text-(--cv-on-surface)"
          @click="chooseUpload(clearCallback, chooseCallback)"
        >
          <img
            v-if="previewUrl"
            :src="previewUrl"
            alt="待分析图片预览"
            class="size-20 rounded-(--cv-radius-md) object-cover"
          />
          <i
            v-else
            class="fa-solid fa-image grid size-20 place-items-center rounded-(--cv-radius-md) bg-(--cv-surface-container-high) text-(length:--cv-font-size-lg) text-(--cv-on-surface-variant)"
            aria-hidden="true"
          />
          <span class="flex min-w-0 flex-col gap-(--cv-space-xs)">
            <strong class="overflow-hidden text-ellipsis whitespace-nowrap">{{
              selectedFile?.name ?? '选择本地图片'
            }}</strong>
            <small class="text-(length:--cv-font-size-xs) whitespace-normal text-(--cv-on-surface-variant)">{{
              previewUrl ? '点击更换图片，也可拖拽新图片到此处' : '上传或拖拽图片到此处'
            }}</small>
          </span>
        </button>
        <button
          v-if="source === 'upload' && selectedFile"
          type="button"
          class="absolute top-(--cv-space-sm) right-(--cv-space-sm) grid size-6 cursor-pointer place-items-center rounded-(--cv-radius-sm) border-(length:--cv-border-width) border-solid border-(--cv-surface-variant) bg-(--cv-surface-container-high) text-(--cv-on-surface-variant) hover:border-(--cvp-primary-color) hover:text-(--cv-on-surface)"
          aria-label="移除已上传图片"
          title="移除图片"
          @click="clearUpload(clearCallback)"
        >
          <i class="fa-solid fa-xmark text-(length:--cv-font-size-xs)!" aria-hidden="true" />
        </button>
      </template>
      <template #content>
        <!-- 使用自定义 header 展示预览，无需渲染默认文件列表区域 -->
      </template>
    </FileUpload>

    <!-- WD Tagger 模式下显示阈值滑块 -->
    <div v-if="extractMethod === 'wd-tagger'" class="mt-(--cv-space-lg) grid grid-cols-2 gap-(--cv-space-xl)">
      <div class="cv-field">
        <div class="cv-field-header">
          <span>通用标签阈值</span>
          <span class="text-(length:--cv-font-size-base) font-medium text-(--cv-on-surface-variant)">
            {{ generalThreshold.toFixed(2) }}
          </span>
        </div>
        <Slider v-model="generalThreshold" :min="0.1" :max="0.9" :step="0.05" />
      </div>
      <div class="cv-field">
        <div class="cv-field-header">
          <span>角色标签阈值</span>
          <span class="text-(length:--cv-font-size-base) font-medium text-(--cv-on-surface-variant)">
            {{ characterThreshold.toFixed(2) }}
          </span>
        </div>
        <Slider v-model="characterThreshold" :min="0.1" :max="0.9" :step="0.05" />
      </div>
    </div>

    <!-- 模式提示说明 -->
    <p v-if="extractMethod === 'wd-tagger'" class="cv-field-hint">
      图片会上传至第三方公共 WD Tagger 测试服务；该服务可能排队、限流或临时不可用。
    </p>
    <p v-else class="cv-field-hint">
      支持解析 PNG 格式图片内置的 NovelAI、SD (A1111) 或 ComfyUI 生成元数据，全程在本地解析，不产生网络请求。
    </p>

    <div class="flex flex-wrap justify-end gap-(--cv-space-md)">
      <Button
        :label="actionButtonLabel"
        :icon="actionButtonIcon"
        :severity="isAnalyzing && extractMethod === 'wd-tagger' ? 'danger' : undefined"
        :outlined="isAnalyzing && extractMethod === 'wd-tagger'"
        :disabled="actionButtonDisabled"
        @click="handleActionClick"
      />
    </div>
  </section>
</template>

<script setup lang="ts">
import { extractPromptTagsFromImage } from '@/services/image-metadata/extract-tags';
import { formatWdTagDraft, type PromptPersonTagsDraft } from '@/services/prompt-profiles/static-tags-draft';
import { interrogateWdTagger } from '@/services/wd-tagger/client';
import { getWdAvatarPath, readWdAvatarFile, validateWdImageFile } from '@/services/wd-tagger/image-source';
import type { WdImageSource } from '@/services/wd-tagger/types';

export type ExtractMethod = 'wd-tagger' | 'image-metadata';

const MAX_IMAGE_FILE_SIZE = 10 * 1024 * 1024;

const EXTRACT_METHOD_OPTIONS = [
  { label: 'WD Tagger 反推', value: 'wd-tagger' as const, icon: 'fa-solid fa-wand-magic-sparkles' },
  { label: '读取内置元数据', value: 'image-metadata' as const, icon: 'fa-solid fa-file-code' },
] as const;

/**
 * FileUpload 局部 PT：自定义 header 面板 + 隐藏默认 content 列表
 * 颜色/圆角已迁全局 fileupload token；此处只做结构
 */
const fileUploadPt = {
  root: { class: 'cv-wd-tagger-source__upload-root' },
  header: { class: 'cv-wd-tagger-source__upload-header relative' },
  content: { class: 'cv-wd-tagger-source__upload-content !hidden !p-0 !m-0 !border-0 !h-0 !min-h-0' },
  empty: { class: '!hidden' },
} as const;

/**
 * 图片反推/元数据提取来源组件属性
 */
const props = defineProps<{ personKind: 'user' | 'character' }>();
const emit = defineEmits<{
  draft: [draft: PromptPersonTagsDraft | string];
  error: [message: string];
  parsing: [value: boolean];
}>();

const generalThreshold = defineModel<number>('generalThreshold', { required: true });
const characterThreshold = defineModel<number>('characterThreshold', { required: true });
const extractMethod = ref<ExtractMethod>('wd-tagger');
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

const actionButtonLabel = computed(() => {
  if (extractMethod.value === 'wd-tagger') {
    return isAnalyzing.value ? '停止' : hasAnalyzed.value ? '重新分析' : '分析图片';
  }
  return isAnalyzing.value ? '解析中...' : hasAnalyzed.value ? '重新分析' : '分析图片';
});

const actionButtonIcon = computed(() => {
  if (extractMethod.value === 'wd-tagger') {
    return isAnalyzing.value ? 'fa-solid fa-stop' : 'fa-solid fa-wand-magic-sparkles';
  }
  return isAnalyzing.value ? 'fa-solid fa-spinner fa-spin' : 'fa-solid fa-wand-magic-sparkles';
});

const actionButtonDisabled = computed(() => {
  if (extractMethod.value === 'wd-tagger') {
    return !isAnalyzing.value && !selectedFile.value;
  }
  return !selectedFile.value || isAnalyzing.value;
});

watch(
  () => props.personKind,
  kind => {
    if (!selectedFile.value) source.value = kind === 'user' ? 'user-avatar' : 'character-avatar';
  },
);

watch(extractMethod, () => {
  cancel();
  hasAnalyzed.value = false;
});

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
 * 触发操作按钮对应逻辑（WD Tagger 或本地元数据解析）
 */
function handleActionClick(): void {
  if (extractMethod.value === 'wd-tagger') {
    if (isAnalyzing.value) {
      cancel();
    } else {
      void analyzeWd();
    }
  } else {
    void analyzeMetadata();
  }
}

/**
 * 调用公共 WD Tagger 并提交标签草稿
 */
async function analyzeWd(): Promise<void> {
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
 * 直接解析本地文件内置元数据并提交人物 tag 草稿
 */
async function analyzeMetadata(): Promise<void> {
  if (!selectedFile.value || isAnalyzing.value) return;
  setParsing(true);
  try {
    const draft = await extractPromptTagsFromImage(selectedFile.value);
    hasAnalyzed.value = true;
    emit('draft', draft);
  } catch (error) {
    emit('error', readErrorMessage(error));
  } finally {
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

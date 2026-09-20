<template>
  <Dialog
    v-model:visible="visible"
    modal
    dismissable-mask
    :draggable="false"
    header="导入 LoRA 预设"
    :style="DIALOG_STYLE"
    :content-style="{ overflow: 'hidden' }"
  >
    <!-- 入口态：选择导入方式 -->
    <div v-if="mode === 'entry'" class="flex flex-col gap-(--cv-space-lg) py-(--cv-space-sm)">
      <input
        ref="fileInputRef"
        type="file"
        accept="application/json,.json"
        class="hidden"
        @change="onFileSelected"
      >
      <button
        type="button"
        class="flex w-full cursor-pointer items-center justify-center gap-(--cv-space-md) rounded-(--cv-radius-sm) border-(length:--cv-border-width) border-dashed border-(--cv-surface-variant) bg-[color-mix(in_srgb,var(--cv-surface-container-low)_42%,transparent)] py-(--cv-space-2xl) text-(length:--cv-font-size-sm) text-(--cv-on-surface) transition-all duration-200 ease-in-out hover:border-(--cv-outline) hover:bg-(--cv-surface-container-low) hover:text-(--cvp-primary-color)"
        @click="triggerFileInput"
      >
        <i class="fa-solid fa-file-import text-(length:--cv-font-size-base)" />
        <span>导入文件</span>
      </button>

      <button
        type="button"
        class="flex w-full cursor-pointer items-center justify-center gap-(--cv-space-md) rounded-(--cv-radius-sm) border-(length:--cv-border-width) border-dashed border-(--cv-surface-variant) bg-[color-mix(in_srgb,var(--cv-surface-container-low)_42%,transparent)] py-(--cv-space-2xl) text-(length:--cv-font-size-sm) text-(--cv-on-surface) transition-all duration-200 ease-in-out hover:border-(--cv-outline) hover:bg-(--cv-surface-container-low) hover:text-(--cvp-primary-color) disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:border-(--cv-surface-variant) disabled:hover:bg-[color-mix(in_srgb,var(--cv-surface-container-low)_42%,transparent)] disabled:hover:text-(--cv-on-surface)"
        :disabled="isComfyuiUrlEmpty"
        :title="isComfyuiUrlEmpty ? '请先填写 ComfyUI URL' : undefined"
        @click="startFetchRecipes"
      >
        <i class="fa-solid fa-book-open text-(length:--cv-font-size-base)" />
        <span>从 LoRA Manager 导入</span>
      </button>
    </div>

    <!-- 拉取中：加载动画 -->
    <div
      v-else-if="mode === 'loading'"
      class="flex min-h-[14rem] flex-col items-center justify-center gap-(--cv-space-lg) text-(length:--cv-font-size-sm) text-(--cv-on-surface-variant)"
    >
      <i class="fa-solid fa-spinner animate-spin text-(length:--cv-font-size-2xl) text-(--cvp-primary-color)" aria-hidden="true" />
      <span>正在拉取 LoRA Manager 配方…</span>
    </div>

    <!-- 列表态：勾选导入列表 / 错误重试 / 空提示 -->
    <div v-else-if="mode === 'list'" class="flex flex-col gap-(--cv-space-md)">
      <!-- 错误状态 -->
      <div
        v-if="errorMessage"
        class="flex min-h-[12rem] flex-col items-center justify-center gap-(--cv-space-md) px-(--cv-space-xl) text-center text-(length:--cv-font-size-xs) text-(--cv-on-surface-variant)"
      >
        <span class="text-(--cvp-red-500)">{{ errorMessage }}</span>
        <Button label="重试" severity="secondary" variant="text" size="small" :fluid="false" @click="startFetchRecipes" />
      </div>

      <!-- 空结果状态 -->
      <div
        v-else-if="!recipes.length"
        class="flex min-h-[12rem] items-center justify-center px-(--cv-space-xl) text-center text-(length:--cv-font-size-xs) text-(--cv-on-surface-variant)"
      >
        LoRA Manager 中还没有配方，可先在管理器里保存一个配方
      </div>

      <!-- 配方勾选列表 -->
      <template v-else>
        <!-- 本地 LoRA 库未加载警告 -->
        <div
          v-if="!props.loraOptions.length"
          class="rounded-(--cv-radius-sm) bg-[color-mix(in_srgb,var(--cvp-orange-500)_12%,transparent)] px-(--cv-space-md) py-(--cv-space-sm) text-(length:--cv-font-size-xs) leading-[1.4] text-(--cvp-orange-500)"
        >
          LoRA 库尚未加载，导入的 LoRA 会全部处于禁用状态，建议先刷新 LoRA 库
        </div>

        <!-- 全选与统计 -->
        <div class="flex items-center justify-between pb-(--cv-space-lg) text-(length:--cv-font-size-xs)">
          <label class="inline-flex cursor-pointer items-center gap-(--cv-space-sm) select-none">
            <Checkbox :model-value="isAllSelected" :indeterminate="isIndeterminate" binary @change="toggleSelectAll" />
            <span class="font-medium text-(--cv-on-surface)">全选</span>
          </label>
          <span class="text-(--cv-on-surface-variant)">已选 {{ selectedCount }} / 共 {{ recipes.length }}</span>
        </div>

        <!-- 列表滚动区 -->
        <div class="custom-scrollbar flex max-h-[min(52vh,26rem)] min-h-[10rem] flex-col gap-(--cv-space-md) overflow-y-auto overscroll-contain">
          <div
            v-for="recipe in recipes"
            :key="recipe.id"
            role="checkbox"
            :aria-checked="selectedIds.has(recipe.id)"
            tabindex="0"
            class="flex w-full cursor-pointer items-center gap-(--cv-space-md) rounded-(--cv-radius-sm) border-(length:--cv-border-width) border-solid border-transparent px-(--cv-space-md) py-(--cv-space-sm) transition-colors duration-150 hover:bg-(--cv-surface-container-highest)"
            :class="{ 'bg-(--cv-surface-container-low)': selectedIds.has(recipe.id) }"
            @click="toggleRecipe(recipe.id)"
            @keydown.space.prevent="toggleRecipe(recipe.id)"
            @keydown.enter.prevent="toggleRecipe(recipe.id)"
          >
            <Checkbox
              binary
              :model-value="selectedIds.has(recipe.id)"
              class="pointer-events-none"
              :tabindex="-1"
            />
            <img
              v-if="recipe.previewUrl && !failedPreviewIds.has(recipe.id)"
              :src="recipe.previewUrl"
              :alt="`${recipe.title || '配方'} 预览图`"
              class="size-11 shrink-0 rounded-(--cv-radius-sm) object-cover"
              loading="lazy"
              @error="markPreviewFailed(recipe.id)"
            >
            <span
              v-else
              class="flex size-11 shrink-0 items-center justify-center rounded-(--cv-radius-sm) bg-(--cv-surface-container-highest) text-(--cv-on-surface-variant)"
            >
              <i class="fa-solid fa-image" aria-hidden="true" />
            </span>
            <span class="flex min-w-0 flex-1 flex-col gap-(--cv-space-2xs)">
              <span
                class="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-(length:--cv-font-size-xs) font-medium text-(--cv-on-surface)"
                :title="recipe.title"
              >
                {{ recipe.title || '未命名配方' }}
              </span>
              <span
                class="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-(length:--cv-font-size-xs) text-(--cv-on-surface-variant)"
              >
                {{ describeRecipe(recipe) }}
              </span>
            </span>
          </div>
        </div>
      </template>
    </div>

    <!-- 底部操作栏（列表态下展示） -->
    <template v-if="mode === 'list'" #footer>
      <div class="cv-confirm-actions">
        <Button label="取消" text :fluid="false" @click="visible = false" />
        <Button
          :label="`导入所选 (${selectedCount})`"
          icon="fa-solid fa-file-import"
          :disabled="selectedCount === 0"
          :fluid="false"
          @click="confirmImportRecipes"
        />
      </div>
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import { fetchAllComfyUILoraRecipes, type ComfyUILoraRecipe } from '@/services/comfyui/lora-recipes';
import { formatLoraDisplayName } from '@/services/comfyui/lora-presets';

/** 弹窗样式 */
const DIALOG_STYLE = {
  width: '26rem',
  maxWidth: 'calc(100vw - 2rem)',
} as const;

type DialogMode = 'entry' | 'loading' | 'list';

const visible = defineModel<boolean>('visible', { required: true });

const props = defineProps<{
  /** ComfyUI 地址 */
  comfyuiUrl: string;
  /** 当前已加载的 LoRA 选项 */
  loraOptions: readonly { value: string }[];
}>();

const emit = defineEmits<{
  /** 导入单个预设文件 */
  'import-file': [file: File];
  /** 从 LoRA Manager 批量导入配方 */
  'import-recipes': [recipes: ComfyUILoraRecipe[]];
}>();

const mode = ref<DialogMode>('entry');
const recipes = ref<ComfyUILoraRecipe[]>([]);
const selectedIds = ref<ReadonlySet<string>>(new Set());
const failedPreviewIds = ref<ReadonlySet<string>>(new Set());
const errorMessage = ref<string | null>(null);
const fileInputRef = ref<HTMLInputElement | null>(null);

const isComfyuiUrlEmpty = computed(() => !props.comfyuiUrl.trim());

const selectedCount = computed(() => selectedIds.value.size);
const isAllSelected = computed(
  () => recipes.value.length > 0 && selectedIds.value.size === recipes.value.length,
);
const isIndeterminate = computed(
  () => selectedIds.value.size > 0 && selectedIds.value.size < recipes.value.length,
);

watch(visible, opened => {
  if (opened) {
    resetState();
  }
});

/**
 * 触发本地 JSON 文件选择
 */
function triggerFileInput(): void {
  fileInputRef.value?.click();
}

/**
 * 处理选中的本地文件
 * @param event 文件变更事件
 */
function onFileSelected(event: Event): void {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (file) {
    emit('import-file', file);
    visible.value = false;
  }
  target.value = '';
}

/**
 * 开始从 ComfyUI 拉取 LoRA Manager 全部配方
 */
async function startFetchRecipes(): Promise<void> {
  if (isComfyuiUrlEmpty.value) return;
  mode.value = 'loading';
  errorMessage.value = null;

  try {
    const items = await fetchAllComfyUILoraRecipes(props.comfyuiUrl);
    recipes.value = items;
    selectedIds.value = new Set(items.map(recipe => recipe.id));
    failedPreviewIds.value = new Set();
    mode.value = 'list';
  } catch (error) {
    const message = error instanceof Error ? error.message : '获取配方列表失败';
    errorMessage.value = message;
    console.error('[ComfyUILoraImportDialog] 获取配方列表失败', error);
    mode.value = 'list';
  }
}

/**
 * 切换全选/全不选状态
 */
function toggleSelectAll(): void {
  if (isAllSelected.value) {
    selectedIds.value = new Set();
  } else {
    selectedIds.value = new Set(recipes.value.map(recipe => recipe.id));
  }
}

/**
 * 切换单个配方的勾选状态
 * @param id 配方 ID
 */
function toggleRecipe(id: string): void {
  const next = new Set(selectedIds.value);
  if (next.has(id)) {
    next.delete(id);
  } else {
    next.add(id);
  }
  selectedIds.value = next;
}

/**
 * 记录预览图加载失败的配方 ID
 * @param id 配方 ID
 */
function markPreviewFailed(id: string): void {
  const next = new Set(failedPreviewIds.value);
  next.add(id);
  failedPreviewIds.value = next;
}

/**
 * 描述配方副标题（包含的 LoRA 名称，去扩展名）
 * @param recipe 配方对象
 * @returns 格式化后的副标题文本
 */
function describeRecipe(recipe: ComfyUILoraRecipe): string {
  const names = recipe.loras
    .filter(lora => !lora.excluded)
    .map(lora => formatLoraDisplayName(lora.fileName))
    .filter(Boolean);
  return names.join(' · ') || '无 LoRA';
}

/**
 * 提交选中的配方列表并关闭弹窗
 */
function confirmImportRecipes(): void {
  const selected = recipes.value.filter(recipe => selectedIds.value.has(recipe.id));
  if (!selected.length) return;
  emit('import-recipes', selected);
  visible.value = false;
}

/**
 * 重置弹窗内部状态为初始入口态
 */
function resetState(): void {
  mode.value = 'entry';
  errorMessage.value = null;
  recipes.value = [];
  selectedIds.value = new Set();
  failedPreviewIds.value = new Set();
  if (fileInputRef.value) {
    fileInputRef.value.value = '';
  }
}
</script>

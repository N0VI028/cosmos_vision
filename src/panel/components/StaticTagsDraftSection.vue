<template>
  <div class="cv-field flex flex-col gap-(--cv-space-xs)">
    <div class="cv-field-header flex items-center justify-between">
      <span class="text-(length:--cv-font-size-base) font-medium text-(--cv-on-surface)">{{ title }}</span>
      <span v-if="tags.length > 0" class="text-(length:--cv-font-size-xs) text-(--cv-on-surface-variant)">
        已选 {{ selectedIndices.size }} / {{ tags.length }}
      </span>
    </div>

    <div class="cv-field-control flex flex-col gap-(--cv-space-xs)">
      <!-- 徽章点选区（取代原 textarea） -->
      <div
        class="cv-static-tags-container flex min-h-16 flex-wrap content-start items-center gap-(--cv-space-xs) rounded-(--cv-radius-sm) border-(length:--cv-border-width) border-solid border-(--cvp-content-border-color) bg-(--cvp-inputtext-background) p-(--cv-space-sm)"
      >
        <button
          v-for="(tag, index) in tags"
          :key="index"
          type="button"
          class="cv-tag-badge inline-flex cursor-pointer items-start gap-(--cv-space-xs) rounded-(--cv-radius-xs) border-(length:--cv-border-width) border-solid px-(--cv-space-md) py-(--cv-space-xs) text-left text-(length:--cv-font-size-xs) leading-tight transition-all select-none focus-visible:outline-2 focus-visible:outline-(--cvp-primary-color)"
          :class="
            selectedIndices.has(index)
              ? 'border-[color-mix(in_srgb,var(--cvp-primary-color)_60%,var(--cvp-content-border-color))] bg-[color-mix(in_srgb,var(--cvp-primary-color)_14%,transparent)] font-medium text-(--cvp-primary-color)'
              : 'border-dashed border-(--cvp-content-border-color) bg-transparent text-(--cv-on-surface-variant) opacity-50 hover:opacity-80'
          "
          :aria-pressed="selectedIndices.has(index)"
          :title="selectedIndices.has(index) ? '点击取消选中' : '点击选中'"
          @click="toggleTag(index)"
        >
          <i
            class="fa-solid shrink-0"
            :class="selectedIndices.has(index) ? 'fa-check' : 'fa-plus opacity-40'"
            aria-hidden="true"
          />
          <span class="break-all whitespace-normal">{{ tag }}</span>
        </button>

        <span
          v-if="tags.length === 0"
          class="py-(--cv-space-xs) text-(length:--cv-font-size-xs) text-(--cv-on-surface-variant) italic select-none"
        >
          {{ placeholder || '无 tag 草稿' }}
        </span>
      </div>

      <!-- 操作按钮组 -->
      <div class="grid grid-cols-3 gap-(--cv-space-md)">
        <Button label="复制" outlined :disabled="isActionDisabled" @click="handleCopy" />
        <Button label="替换" severity="danger" outlined :disabled="isActionDisabled" @click="handleReplace" />
        <Button label="追加" :disabled="isActionDisabled" @click="handleAppend" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { StaticTagsApplyPayload } from '@/panel/components/StaticTagsDraftResult.vue';

const props = withDefaults(
  defineProps<{
    /** 区块标题（如“固定正面 tag”） */
    title: string;
    /** 草稿原始文本 */
    rawText?: string;
    /** 占位提示文案 */
    placeholder?: string;
    /** 目标属性键名（正面/负面） */
    targetKey: 'positive' | 'negative';
  }>(),
  {
    rawText: '',
    placeholder: '',
  },
);

const emit = defineEmits<{
  copy: [text: string];
  replace: [payload: StaticTagsApplyPayload];
  append: [payload: StaticTagsApplyPayload];
}>();

/**
 * 按全角/半角逗号、换行归一化切分 tag
 * @param text 原始文本
 * @returns 过滤后的有效 tag 数组
 */
function parseTags(text: string): string[] {
  return text
    .split(/[,，\n\r]+/)
    .map(tag => tag.trim())
    .filter(Boolean);
}

const tags = computed(() => parseTags(props.rawText));
const selectedIndices = ref<Set<number>>(new Set());

// 草稿文本变化（重新解析后父组件替换草稿）时重置为全选
watch(
  tags,
  nextTags => {
    selectedIndices.value = new Set(nextTags.map((_, index) => index));
  },
  { immediate: true },
);

/**
 * 切换指定徽章的选中态
 * @param index tag 索引
 */
function toggleTag(index: number): void {
  const next = new Set(selectedIndices.value);
  if (next.has(index)) {
    next.delete(index);
  } else {
    next.add(index);
  }
  selectedIndices.value = next;
}

// 拼接所选徽章
const selectedText = computed(() => {
  return tags.value
    .filter((_, index) => selectedIndices.value.has(index))
    .join(', ');
});

// 草稿为空或全部取消选中时，禁用复制/替换/追加按钮
const isActionDisabled = computed(() => tags.value.length === 0 || selectedIndices.value.size === 0);

function handleCopy(): void {
  if (!isActionDisabled.value) {
    emit('copy', selectedText.value);
  }
}

function handleReplace(): void {
  if (!isActionDisabled.value) {
    emit('replace', { [props.targetKey]: selectedText.value });
  }
}

function handleAppend(): void {
  if (!isActionDisabled.value) {
    emit('append', { [props.targetKey]: selectedText.value });
  }
}
</script>

<style scoped>
/*
 * ST 宿主会反压覆盖 FontAwesome 图标字号，显式钉死字号比例
 */
.cv-tag-badge i {
  font-size: 0.75em !important;
}
</style>

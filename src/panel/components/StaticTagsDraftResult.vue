<template>
  <section class="cv-static-tags-draft-result flex flex-col gap-(--cv-space-lg) whitespace-normal">
    <!-- 正面 tag 区 -->
    <div class="cv-field flex flex-col gap-(--cv-space-xs)">
      <div class="cv-field-header">
        <span class="text-(length:--cv-font-size-base) font-medium text-(--cv-on-surface)">固定正面 tag</span>
      </div>
      <div class="cv-field-control flex flex-col gap-(--cv-space-xs)">
        <CvExpandableTextarea
          v-model="draft.positiveTags"
          rows="4"
          auto-resize
          class="custom-scrollbar w-full font-mono"
          placeholder="正面 tag 草稿..."
        />
        <div class="grid grid-cols-3 gap-(--cv-space-md)">
          <Button label="复制" outlined :disabled="!hasPositive" @click="copyPositive" />
          <Button label="替换" severity="danger" outlined :disabled="!hasPositive" @click="replacePositive" />
          <Button label="追加" :disabled="!hasPositive" @click="appendPositive" />
        </div>
      </div>
    </div>

    <!-- 负面 tag 区 -->
    <div class="cv-field flex flex-col gap-(--cv-space-xs)">
      <div class="cv-field-header">
        <span class="text-(length:--cv-font-size-base) font-medium text-(--cv-on-surface)">固定负面 tag</span>
      </div>
      <div class="cv-field-control flex flex-col gap-(--cv-space-xs)">
        <CvExpandableTextarea
          v-model="draft.negativeTags"
          rows="4"
          auto-resize
          class="custom-scrollbar w-full font-mono"
          placeholder="负面 tag 草稿（可留空）..."
        />
        <div class="grid grid-cols-3 gap-(--cv-space-md)">
          <Button label="复制" outlined :disabled="!hasNegative" @click="copyNegative" />
          <Button label="替换" severity="danger" outlined :disabled="!hasNegative" @click="replaceNegative" />
          <Button label="追加" :disabled="!hasNegative" @click="appendNegative" />
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import CvExpandableTextarea from '@/panel/components/CvExpandableTextarea.vue';
import type { PromptPersonTagsDraft } from '@/services/prompt-profiles/static-tags-draft';

export interface StaticTagsApplyPayload {
  positive?: string;
  negative?: string;
}

/**
 * 统一解析草稿结果组件：正面/负面双区各自携带 复制/替换/追加 按钮组，只作用于本区草稿
 */
const draft = defineModel<PromptPersonTagsDraft>('draft', { required: true });

const emit = defineEmits<{
  copy: [text: string];
  replace: [payload: StaticTagsApplyPayload];
  append: [payload: StaticTagsApplyPayload];
}>();

// 本区草稿为空时禁用按钮：天然防止"替换"误清空已有 tag
const hasPositive = computed(() => Boolean(draft.value.positiveTags.trim()));
const hasNegative = computed(() => Boolean(draft.value.negativeTags.trim()));

function copyPositive(): void {
  if (hasPositive.value) emit('copy', draft.value.positiveTags.trim());
}

function replacePositive(): void {
  if (hasPositive.value) emit('replace', { positive: draft.value.positiveTags });
}

function appendPositive(): void {
  if (hasPositive.value) emit('append', { positive: draft.value.positiveTags });
}

function copyNegative(): void {
  if (hasNegative.value) emit('copy', draft.value.negativeTags.trim());
}

function replaceNegative(): void {
  if (hasNegative.value) emit('replace', { negative: draft.value.negativeTags });
}

function appendNegative(): void {
  if (hasNegative.value) emit('append', { negative: draft.value.negativeTags });
}
</script>

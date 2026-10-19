<template>
  <section class="cv-static-tags-draft-result flex flex-col gap-(--cv-space-lg) whitespace-normal">
    <!-- 正面 tag 区 -->
    <StaticTagsDraftSection
      title="固定正面 tag"
      :raw-text="draft.positiveTags"
      placeholder="正面 tag 草稿..."
      target-key="positive"
      @copy="text => emit('copy', text)"
      @replace="payload => emit('replace', payload)"
      @append="payload => emit('append', payload)"
    />

    <!-- 负面 tag 区 -->
    <StaticTagsDraftSection
      title="固定负面 tag"
      :raw-text="draft.negativeTags"
      placeholder="负面 tag 草稿（可留空）..."
      target-key="negative"
      @copy="text => emit('copy', text)"
      @replace="payload => emit('replace', payload)"
      @append="payload => emit('append', payload)"
    />
  </section>
</template>

<script setup lang="ts">
import StaticTagsDraftSection from '@/panel/components/StaticTagsDraftSection.vue';
import type { PromptPersonTagsDraft } from '@/services/prompt-profiles/static-tags-draft';

export interface StaticTagsApplyPayload {
  positive?: string;
  negative?: string;
}

/**
 * 统一解析草稿结果组件：正面/负面双区徽章点选展示，各区操作按钮仅作用于本区所选徽章
 */
const draft = defineModel<PromptPersonTagsDraft>('draft', { required: true });

const emit = defineEmits<{
  copy: [text: string];
  replace: [payload: StaticTagsApplyPayload];
  append: [payload: StaticTagsApplyPayload];
}>();
</script>

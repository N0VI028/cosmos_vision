<template>
  <section class="cv-static-tags-draft-result">
    <label class="cv-field">
      <span>解析结果草稿</span>
      <Textarea
        :model-value="draft"
        rows="8"
        auto-resize
        class="cv-full-textarea custom-scrollbar"
        placeholder="可在此编辑 tag 草稿"
        @update:model-value="draft = $event"
      />
    </label>
    <div class="cv-static-tags-draft-result__actions">
      <Button label="复制" icon="fa-solid fa-copy" outlined :disabled="!hasDraft" @click="emit('copy', draft)" />
      <Button label="替换固定 tag" severity="danger" outlined :disabled="!hasDraft" @click="emit('replace', draft)" />
      <Button label="追加到固定 tag" icon="fa-solid fa-plus" :disabled="!hasDraft" @click="emit('append', draft)" />
    </div>
  </section>
</template>

<script setup lang="ts">
/**
 * 统一解析草稿结果组件
 */
const draft = defineModel<string>('draft', { required: true });
const emit = defineEmits<{
  copy: [draft: string];
  replace: [draft: string];
  append: [draft: string];
}>();
const hasDraft = computed(() => Boolean(draft.value.trim()));
</script>

<style scoped>
@reference '../../global.css';

.cv-static-tags-draft-result {
  @apply flex flex-col;
  gap: var(--cv-space-xl);
}

.cv-static-tags-draft-result__actions {
  @apply grid grid-cols-3;
  gap: var(--cv-space-md);
}
</style>

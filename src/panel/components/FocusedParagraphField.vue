<template>
  <div class="cv-field">
    <span>{{ label }}</span>
    <Textarea
      v-model="model"
      rows="3"
      auto-resize
      class="cv-focused-paragraph-textarea w-full"
      :placeholder="placeholder"
    />
    <Message v-if="!hasFocusedParagraph" severity="warn" size="small">
      {{ warningText }}
    </Message>
  </div>
</template>

<script setup lang="ts">
interface Props {
  hasFocusedParagraph: boolean;
  label?: string;
  placeholder?: string;
  warningText?: string;
}

withDefaults(defineProps<Props>(), {
  label: '焦点段落文本',
  placeholder: '在此处输入测试段落，或在聊天中选择任意段落，它会自动在此处填充',
  warningText: '当前没有可用焦点段落，可直接手动输入测试段落，或先在聊天中点选目标段落',
});

const model = defineModel<string>({ required: true });
</script>

<style scoped>
.cv-focused-paragraph-textarea {
  background: var(--cv-surface-variant);
  border: var(--cv-border-width) solid var(--cv-outline);
  color: var(--cv-on-surface);
  border-radius: var(--cv-radius);
  padding: var(--cv-space-xl);
  font-family: inherit;
  font-size: calc(var(--mainFontSize) * 0.95);
  resize: vertical;
}
</style>

<template>
  <div class="cv-workflow-toolbar">
    <div class="cv-workflow-toolbar__actions">
      <Button label="导入 JSON" icon="fa-solid fa-download" size="small" @click="emit('import')" />
      <Button
        label="恢复默认"
        icon="fa-solid fa-rotate-left"
        severity="secondary"
        size="small"
        variant="outlined"
        @click="emit('restore-default')"
      />
      <Button
        :label="showAdvancedJson ? '收起 JSON' : '高级 JSON'"
        icon="fa-solid fa-code"
        severity="secondary"
        size="small"
        variant="outlined"
        @click="emit('toggle-json')"
      />
      <Button
        label="刷新 Schema"
        icon="fa-solid fa-rotate"
        severity="secondary"
        size="small"
        variant="outlined"
        :loading="schemaLoading"
        @click="emit('refresh-schema')"
      />
      <Button
        label="适配视图"
        icon="fa-solid fa-expand"
        severity="secondary"
        size="small"
        variant="outlined"
        @click="emit('fit-view')"
      />
      <Button
        :label="fullscreen ? '退出全屏' : '全屏编辑'"
        :icon="fullscreen ? 'fa-solid fa-compress' : 'fa-solid fa-up-right-and-down-left-from-center'"
        severity="secondary"
        size="small"
        variant="outlined"
        @click="emit('toggle-fullscreen')"
      />
    </div>
    <div v-if="statusText" class="cv-workflow-toolbar__status" :class="statusClass">{{ statusText }}</div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  showAdvancedJson: boolean;
  fullscreen: boolean;
  schemaLoading: boolean;
  statusText?: string;
  statusTone?: 'info' | 'warn' | 'error';
}>();

const emit = defineEmits<{
  import: [];
  'restore-default': [];
  'toggle-json': [];
  'refresh-schema': [];
  'fit-view': [];
  'toggle-fullscreen': [];
}>();

const statusClass = computed(() => {
  if (props.statusTone === 'error') return 'is-error';
  if (props.statusTone === 'warn') return 'is-warn';
  return 'is-info';
});
</script>

<style scoped>
@reference '../../../global.css';

.cv-workflow-toolbar {
  @apply flex flex-col;
  gap: var(--cv-space-lg);
}

.cv-workflow-toolbar__actions {
  @apply flex flex-wrap;
  gap: var(--cv-space-lg);
}

.cv-workflow-toolbar__status {
  font-size: var(--cv-font-size-sm);
  color: var(--cv-on-surface-variant);
}

.cv-workflow-toolbar__status.is-warn {
  color: var(--p-orange-500, var(--cv-on-surface));
}

.cv-workflow-toolbar__status.is-error {
  color: var(--p-red-500, var(--cv-on-surface));
}
</style>

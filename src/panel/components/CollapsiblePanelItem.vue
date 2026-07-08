<template>
  <Accordion
    :value="collapsed ? undefined : '0'"
    :class="['cv-collapsible-panel', { 'cv-collapsible-panel--disabled': disabled }]"
    @update:value="handleAccordionChange"
  >
    <AccordionPanel value="0" :disabled="disabled">
      <AccordionHeader :pt="{ root: { style: { gap: 'var(--cv-space-sm)' } }, toggleIcon: { class: 'hidden' } }">
        <i
          :class="[
            'fa-solid',
            collapsed ? 'fa-chevron-right' : 'fa-chevron-down',
            'shrink-0',
            'text-(--cv-on-surface-variant)',
          ]"
        />
        <div class="flex min-w-0 flex-auto items-center gap-(--cv-space-sm) overflow-hidden">
          <span class="block min-w-0 flex-[0_1_auto] overflow-hidden text-ellipsis whitespace-nowrap font-semibold text-(--cv-on-surface)">
            {{ title }}
          </span>
          <slot name="title-extra" />
        </div>
        <div v-if="$slots.actions" class="flex shrink-0 items-center gap-(--cv-space-3xl) max-[38rem]:flex-wrap max-[38rem]:justify-end" @click.stop @keydown.stop>
          <slot name="actions" />
        </div>
      </AccordionHeader>
      <AccordionContent>
        <slot />
      </AccordionContent>
    </AccordionPanel>
  </Accordion>
</template>

<script setup lang="ts">

/**
 * 可折叠面板项组件
 * 基于 PrimeVue Accordion 实现
 */
const props = withDefaults(
  defineProps<{
    title: string;
    collapsed: boolean;
    disabled?: boolean;
  }>(),
  { disabled: false },
);

const emit = defineEmits<{
  toggle: [];
}>();

/**
 * 处理 Accordion 展开/折叠状态变化
 */
function handleAccordionChange(): void {
  emit('toggle');
}
</script>

<style scoped>
.cv-collapsible-panel {
  overflow: hidden;
  border: var(--cv-border-width) solid var(--cv-surface-variant);
  border-radius: var(--cv-radius-sm);
  background: var(--cv-surface-container-low);
}

.cv-collapsible-panel--disabled :deep(.p-accordionheader),
.cv-collapsible-panel--disabled :deep(.p-accordioncontent) {
  opacity: 0.62;
}
</style>

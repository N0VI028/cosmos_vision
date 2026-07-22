<template>
  <Accordion
    :value="collapsed ? undefined : '0'"
    :class="['cv-collapsible-panel', { 'cv-collapsible-panel--disabled': disabled }]"
    @update:value="handleAccordionChange"
  >
    <AccordionPanel value="0" :pt="panelPt">
      <AccordionHeader :pt="headerPt">
        <!--
          gap 放在内层容器：官方 .p-accordionheader { all: unset } 会清掉 header 根上的 utility，
          内层 div 不受影响，可稳定保留 gap-(--cv-space-lg)
        -->
        <div class="flex min-w-0 flex-1 items-center gap-(--cv-space-lg) overflow-hidden">
          <i
            :class="[
              'fa-solid',
              collapsed ? 'fa-chevron-right' : 'fa-chevron-down',
              'shrink-0',
              'text-(--cv-on-surface-variant)',
            ]"
          />
          <div class="flex min-w-0 flex-auto items-center gap-(--cv-space-lg) overflow-hidden">
            <slot name="title">
              <span
                class="block min-w-0 flex-[0_1_auto] overflow-hidden text-ellipsis whitespace-nowrap font-semibold text-(--cv-on-surface)"
              >
                {{ title }}
              </span>
            </slot>
            <slot name="title-extra" />
          </div>
          <div
            v-if="$slots.actions"
            class="ml-auto flex shrink-0 items-center justify-end gap-(--cv-space-5xl)"
            @click.stop
            @keydown.stop
          >
            <slot name="actions" />
          </div>
        </div>
      </AccordionHeader>
      <AccordionContent :pt="contentPt">
        <slot />
      </AccordionContent>
    </AccordionPanel>
  </Accordion>
</template>

<script setup lang="ts">
/**
 * 可折叠面板项组件
 * 基于 PrimeVue Accordion；业务壳边框/底色在 root class，不依赖 .p-accordion*
 * header 布局 gap 必须在 slot 内层容器上，勿写在 AccordionHeader 根（官方 all:unset）
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

/** Panel：宽度约束用语义 class，避免 :deep(.p-accordionpanel) */
const panelPt = {
  root: { class: 'cv-collapsible-panel__panel min-w-0 w-full max-w-full' },
} as const;

/** Header：只隐藏默认 toggle；布局 class 放 slot 内层 */
const headerPt = {
  root: { class: 'cv-collapsible-panel__header' },
  toggleicon: { class: 'hidden' },
} as const;

/** Content：宽度约束用语义 class */
const contentPt = {
  contentWrapper: { class: 'cv-collapsible-panel__content-wrapper min-w-0 w-full max-w-full' },
  content: { class: 'cv-collapsible-panel__content min-w-0 w-full max-w-full' },
} as const;

/**
 * 处理 Accordion 展开/折叠状态变化
 */
function handleAccordionChange(): void {
  emit('toggle');
}
</script>

<style scoped>
@reference '../../global.css';

.cv-collapsible-panel {
  @apply min-w-0 w-full max-w-full overflow-hidden;
  border: var(--cv-border-width) solid var(--cv-surface-variant);
  border-radius: var(--cv-radius-sm);
  background: var(--cv-surface-container-low);
}

.cv-collapsible-panel--disabled :deep(.cv-collapsible-panel__header),
.cv-collapsible-panel--disabled :deep(.cv-collapsible-panel__content) {
  opacity: 0.62;
}
</style>

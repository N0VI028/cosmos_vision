<template>
  <Accordion
    :value="collapsed ? undefined : '0'"
    :class="rootClass"
    @update:value="handleAccordionChange"
  >
    <AccordionPanel value="0" :pt="panelPt">
      <AccordionHeader :pt="headerPt">
        <!--
          gap 放在内层容器：官方 .p-accordionheader { all: unset } 会清掉 header 根上的 utility，
          内层 div 不受影响，可稳定保留 gap-(--cv-space-lg)
        -->
        <div class="flex min-w-0 flex-1 flex-wrap items-center gap-x-(--cv-space-5xl) gap-y-(--cv-space-xs)">
          <!-- 第一行：Chevron + Title -->
          <div class="flex h-8 min-w-0 flex-1 items-center gap-(--cv-space-3xl)">
            <i
              :class="[
                'fa-solid',
                collapsed ? 'fa-chevron-right' : 'fa-chevron-down',
                'shrink-0',
                'text-(--cv-on-surface-variant)',
              ]"
            />
            <div class="flex h-8 min-w-0 flex-1 items-center gap-(--cv-space-lg) overflow-hidden">
              <slot name="title">
                <span
                  class="block min-w-0 flex-[0_1_auto] overflow-hidden text-ellipsis whitespace-nowrap font-semibold text-(--cv-on-surface)"
                >
                  {{ title }}
                </span>
              </slot>
              <slot name="title-extra" />
            </div>
          </div>
          <div
            v-if="$slots.actions"
            class="ml-auto flex items-center justify-end gap-(--cv-space-sm)"
            :class="isEditing ? 'w-full basis-full mt-(--cv-space-xs)' : 'h-8 shrink-0'"
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
    isEditing?: boolean;
  }>(),
  { disabled: false, isEditing: false },
);

const emit = defineEmits<{
  toggle: [];
}>();

const rootClass = computed(
  () =>
    'cv-collapsible-panel min-w-0 w-full max-w-full overflow-hidden rounded-(--cv-radius-sm) border-(length:--cv-border-width) border-solid border-(--cv-surface-variant) bg-(--cv-surface-container-low)',
);

/** Panel：宽度约束用语义 class，避免 :deep(.p-accordionpanel) */
const panelPt = {
  root: { class: 'cv-collapsible-panel__panel min-w-0 w-full max-w-full' },
} as const;

/** Header：只隐藏默认 toggle；禁用态 opacity 写在 PT，避免 :deep */
const headerPt = computed(() => ({
  root: {
    class: [
      'cv-collapsible-panel__header',
      props.disabled ? 'opacity-[0.62]' : '',
    ],
  },
  toggleicon: { class: 'hidden' },
}));

/**
 * Content：宽度约束 + 禁用 opacity
 * 顶部分隔线用 inline style：官方 .p-accordioncontent-content 写死 border-width token(0)，
 * 会盖掉 Tailwind border-t utility；inline 特异性更高（对齐 TriggerEditor header padding:0）
 */
const contentPt = computed(() => ({
  contentWrapper: { class: 'cv-collapsible-panel__content-wrapper min-w-0 w-full max-w-full' },
  content: {
    class: [
      'cv-collapsible-panel__content min-w-0 w-full max-w-full',
      props.disabled ? 'opacity-[0.62]' : '',
    ],
    style: {
      borderTop: 'var(--cv-border-width) solid var(--cv-surface-variant)',
    },
  },
}));

/**
 * 处理 Accordion 展开/折叠状态变化
 */
function handleAccordionChange(): void {
  emit('toggle');
}
</script>

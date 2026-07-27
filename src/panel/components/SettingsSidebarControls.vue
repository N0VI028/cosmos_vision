<template>
  <div
    class="flex shrink-0 flex-col gap-(--cv-space-lg) p-(--cv-space-8xl) max-[87.5em]:items-center max-[87.5em]:px-0 max-[87.5em]:py-(--cv-space-4xl)"
  >
    <Button
      :class="[SIDEBAR_CONTROL_CLASS, SIDEBAR_ACTION_CLASS, mobile ? SIDEBAR_ICON_SIZE_CLASS : SIDEBAR_FULL_SIZE_CLASS]"
      :pt="BUTTON_PT"
      :label="mobile ? undefined : '使用教程'"
      icon="fa-regular fa-graduation-cap"
      severity="secondary"
      outlined
      :rounded="mobile"
      :fluid="!mobile"
      title="使用教程"
      aria-label="使用教程"
      @click="emit('start-tutorial')"
    />

    <SelectButton
      v-if="!mobile"
      v-model="darkMode"
      :class="[SIDEBAR_CONTROL_CLASS, SIDEBAR_FULL_SIZE_CLASS, SIDEBAR_THEME_CLASS]"
      :pt="THEME_PT"
      fluid
      :options="THEME_OPTIONS"
      option-label="label"
      option-value="value"
      :allow-empty="false"
      aria-label="主题模式"
    >
      <template #option="slotProps">
        <i :class="slotProps.option.icon" />
        <span>{{ slotProps.option.label }}</span>
      </template>
    </SelectButton>

    <Button
      v-else
      :class="[SIDEBAR_CONTROL_CLASS, SIDEBAR_ACTION_CLASS, SIDEBAR_ICON_SIZE_CLASS]"
      :pt="BUTTON_PT"
      :icon="darkMode ? 'fa-regular fa-moon' : 'fa-regular fa-sun'"
      severity="secondary"
      outlined
      rounded
      :title="darkMode ? '切换为浅色模式' : '切换为深色模式'"
      :aria-label="darkMode ? '切换为浅色模式' : '切换为深色模式'"
      @click="toggleTheme"
    />
  </div>
</template>

<script setup lang="ts">
interface Props {
  mobile: boolean;
}

defineProps<Props>();
const emit = defineEmits<{ 'start-tutorial': [] }>();
const darkMode = defineModel<boolean>({ required: true });

const THEME_OPTIONS = [
  { value: false, label: 'Light', icon: 'fa-regular fa-sun' },
  { value: true, label: 'Dark', icon: 'fa-regular fa-moon' },
];

const SIDEBAR_CONTROL_CLASS =
  'box-border flex! shrink-0 items-center justify-center rounded-(--cv-radius-full)! border-(length:--cv-border-width)! border-solid! border-(--cv-surface-variant)! bg-(--cv-surface-container-low)! text-(--cv-on-surface-variant)! shadow-none! transition-all duration-150 ease-in-out [&_i]:shrink-0 [&_i]:text-(length:--cv-font-size-xl)';
const SIDEBAR_FULL_SIZE_CLASS = 'h-[2.75em]! min-h-[2.75em]! w-full! min-w-0!';
const SIDEBAR_ICON_SIZE_CLASS = 'size-[2em]! min-h-[2em]! min-w-[2em]! p-0!';
const SIDEBAR_ACTION_CLASS =
  'cursor-pointer hover:bg-[color-mix(in_srgb,var(--cv-surface-variant)_70%,transparent)]! hover:text-(--cv-on-surface)!';
const SIDEBAR_THEME_CLASS = 'items-stretch! gap-(--cv-space-sm)! overflow-hidden p-(--cv-space-sm)!';

const BUTTON_PT = {
  root: {
    class: 'cv-prime-button',
    style: {
      '--p-button-padding-y': '0',
      '--p-button-padding-x': 'var(--cv-space-md)',
      '--p-button-icon-only-width': '2em',
      '--p-button-gap': 'var(--cv-space-sm)',
    },
  },
  icon: { class: 'cv-prime-icon' },
  loadingIcon: { class: 'cv-prime-icon' },
  label: { class: 'cv-prime-button-label' },
} as const;

const THEME_PT = {
  root: {
    class: 'cv-prime-selectbutton',
    style: {
      '--p-togglebutton-background': 'transparent',
      '--p-togglebutton-hover-background': 'color-mix(in srgb, var(--cv-surface-variant) 70%, transparent)',
      '--p-togglebutton-checked-background': 'var(--cv-surface-variant)',
      '--p-togglebutton-border-color': 'transparent',
      '--p-togglebutton-checked-border-color': 'transparent',
      '--p-togglebutton-color': 'var(--cv-on-surface-variant)',
      '--p-togglebutton-hover-color': 'var(--cv-on-surface)',
      '--p-togglebutton-checked-color': 'var(--cv-on-surface)',
      '--p-togglebutton-content-checked-background': 'transparent',
      '--p-togglebutton-content-checked-shadow': 'none',
      '--p-togglebutton-content-padding': '0 var(--cv-space-md)',
      '--p-togglebutton-gap': 'var(--cv-space-sm)',
    },
  },
  pcToggleButton: {
    root: { class: 'cv-prime-togglebutton h-full! min-h-0! min-w-0! flex-1!' },
    content: { class: 'cv-prime-togglebutton-content h-full! w-full!' },
    icon: { class: 'cv-prime-icon cv-prime-togglebutton-icon' },
    label: { class: 'cv-prime-togglebutton-label' },
  },
} as const;

/**
 * 切换移动端主题模式
 */
function toggleTheme(): void {
  darkMode.value = !darkMode.value;
}
</script>

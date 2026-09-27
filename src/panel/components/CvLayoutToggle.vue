<template>
  <!-- 文案/图标显示"点击后将切换到的视图"（对齐"选择/取消选择"按钮的动作语义） -->
  <CvMiniButton
    class="cv-layout-toggle"
    :icon="toggleOption.icon"
    :label="toggleOption.label"
    :aria-label="toggleOption.aria"
    :title="toggleOption.aria"
    @click="emit('update:modelValue', props.modelValue === 'grid' ? 'list' : 'grid')"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue';
import CvMiniButton from '@/panel/components/CvMiniButton.vue';

type LayoutMode = 'grid' | 'list';

const props = defineProps<{ modelValue: LayoutMode }>();

const emit = defineEmits<{ 'update:modelValue': [value: LayoutMode] }>();

/** 切换目标视图的按钮文案与图标 */
const toggleOption = computed(() =>
  props.modelValue === 'grid'
    ? { label: '列表', icon: 'fa-solid fa-list', aria: '切换为列表视图' }
    : { label: '网格', icon: 'fa-solid fa-table-cells-large', aria: '切换为网格视图' },
);
</script>

<style scoped>
/*
 * ST 宿主样式会把 .fa-solid 图标统一污染为主字体大小（同排"选择"按钮的 fa-regular check-double 幸免），
 * !important 钉回 --cv-font-size-xs，与多选图标同尺寸（同 .cv-inline-trigger-icon 反压惯例）。
 */
.cv-layout-toggle :deep(.cv-prime-icon) {
  font-size: var(--cv-font-size-xs) !important;
}
</style>

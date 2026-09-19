<template>
  <button
    type="button"
    class="cv-rail-toggle"
    :aria-label="collapsed ? '展开侧栏' : '收起侧栏'"
    :title="collapsed ? '展开侧栏' : '收起侧栏'"
    @click="emit('toggle')"
  >
    <i class="fa-solid" :class="collapsed ? 'fa-chevron-right' : 'fa-chevron-left'" aria-hidden="true" />
  </button>
</template>

<script setup lang="ts">
/**
 * 侧栏收起/展开圆形切换钮
 *
 * 骑跨在侧栏与主区交界的分隔线上（靠上），圆形边框与分隔线同色、
 * 填色与右侧主界面背景一致；点击后侧栏收起为竖排单图标栏，箭头镜像。
 * 样式见 settings-dialog.css 的 .cv-rail-toggle（两窗共用）。
 */
defineProps<{ collapsed: boolean }>();
const emit = defineEmits<{ toggle: [] }>();
</script>

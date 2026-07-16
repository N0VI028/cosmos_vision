<template>
  <button
    type="button"
    class="cv-workflow-action-btn"
    :class="[active ? 'is-active' : 'is-inactive', { 'is-disabled': disabled }]"
    :disabled="disabled"
    @click="emit('click')"
  >
    <i :class="active ? 'fa-solid fa-circle-check' : 'fa-regular fa-circle-dot'" aria-hidden="true" />
    <span>段落生图结果</span>
  </button>
</template>

<script setup lang="ts">
defineProps<{
  active: boolean;
  disabled: boolean;
}>();

const emit = defineEmits<{
  click: [];
}>();
</script>

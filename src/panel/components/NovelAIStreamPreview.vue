<script setup lang="ts">
/** 流式预览槽位：单张图的实时预览状态 */
export interface StreamPreviewSlot {
  /** 当前预览图 objectURL；完成后为最终图 URL，未开始为 null */
  previewUrl: string | null;
  /** 该图是否已完成（最终帧已到） */
  completed: boolean;
  /** 当前去噪步（1 基） */
  step: number;
  /** 总去噪步数 */
  totalSteps: number;
}

const props = defineProps<{ slots: StreamPreviewSlot[] }>();

/** 单图模式：槽数为 1 时整幅展示 */
const isSingle = computed(() => props.slots.length === 1);

/**
 * 计算槽位的去噪进度百分比
 * @param slot 流式预览槽位
 * @returns 0-100 的百分比
 */
function progressPercent(slot: StreamPreviewSlot): number {
  if (slot.totalSteps <= 0) return 0;
  return Math.min(100, Math.round((slot.step / slot.totalSteps) * 100));
}

/**
 * 构建槽位容器 class（多图网格用，未开始格为虚线占位）
 * @param slot 流式预览槽位
 * @returns class 字符串
 */
function slotClass(slot: StreamPreviewSlot): string {
  const base = 'relative aspect-square overflow-hidden rounded-(--cv-radius) border-(length:--cv-border-width) border-solid';
  if (slot.previewUrl) return `${base} border-(--cv-surface-variant)`;
  return `${base} border-dashed border-[color-mix(in_srgb,var(--cvp-content-border-color)_78%,transparent)]`;
}
</script>

<template>
  <!-- 单图：预览图整幅展示 + 底部细进度条 -->
  <div v-if="isSingle && slots[0]" class="w-full">
    <div
      v-if="slots[0].previewUrl"
      class="relative overflow-hidden rounded-(--cv-radius) border-(length:--cv-border-width) border-solid border-(--cv-surface-variant)"
    >
      <img :src="slots[0].previewUrl" class="block w-full object-contain" alt="流式预览" />
      <div class="absolute inset-x-0 bottom-0 h-1 bg-black/50">
        <div
          class="h-full transition-all duration-200 bg-(--cvp-primary-color)"
          :style="{ width: `${progressPercent(slots[0])}%` }"
        />
      </div>
    </div>
    <div
      v-else
      class="flex min-h-64 items-center justify-center rounded-(--cv-radius) border-(length:--cv-border-width) border-dashed border-[color-mix(in_srgb,var(--cvp-content-border-color)_78%,transparent)] text-(--cv-on-surface-variant)"
    >
      正在准备生成...
    </div>
  </div>

  <!-- 多图：网格展示（完成格/进行中格/待生成占位格）；图片数上限 4，固定两列 -->
  <div v-else class="grid grid-cols-2 gap-(--cv-space-lg)">
    <div v-for="(slot, index) in slots" :key="index" :class="slotClass(slot)">
      <img
        v-if="slot.previewUrl"
        :src="slot.previewUrl"
        class="h-full w-full object-contain"
        alt="流式预览"
      />
      <div v-else class="flex h-full items-center justify-center text-(--cv-on-surface-variant)">待生成</div>
      <div v-if="!slot.completed && slot.previewUrl" class="absolute inset-x-0 bottom-0 h-1 bg-black/50">
        <div
          class="h-full transition-all duration-200 bg-(--cvp-primary-color)"
          :style="{ width: `${progressPercent(slot)}%` }"
        />
      </div>
    </div>
  </div>
</template>

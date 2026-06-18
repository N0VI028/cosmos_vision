<template>
  <div class="cv-tab-content">
    <h2 class="cv-section-title">基础设置</h2>
    <div class="cv-field-inline">
      <span>启用图像扩展</span>
      <ToggleSwitch v-model="settings.enabled" />
    </div>
    <label class="cv-field">
      <span>图像来源</span>
      <Select v-model="settings.imageSource" :options="imageSourceOptions" option-label="label" option-value="value" />
    </label>

    <h2 class="cv-section-title">重置设置</h2>
    <div class="cv-field">
      <Button
        label="重置为默认设置"
        icon="fa-solid fa-rotate-left"
        severity="danger"
        size="small"
        @click="handleReset"
      />
      <div class="cv-field-hint">将所有设置恢复为默认值，此操作不可撤销</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { inject } from 'vue';
import { IMAGE_SOURCES } from '@/constants/comfyui';
import { useSettingsStore } from '@/store/settings';

const { settings, resetToDefaults } = useSettingsStore();
const imageSourceOptions = [...IMAGE_SOURCES];

const showConfirm = inject<(options: {
  title?: string;
  message: string;
  acceptLabel?: string;
  cancelLabel?: string;
  severity?: string;
}) => Promise<boolean>>('showConfirm');

/**
 * 确认后重置所有设置
 */
async function handleReset(): Promise<void> {
  if (showConfirm) {
    const confirmed = await showConfirm({
      title: '重置设置',
      message: '确定要重置所有设置为默认值吗？此操作不可撤销。',
      acceptLabel: '确定',
      cancelLabel: '取消',
      severity: 'danger',
    });
    if (confirmed) {
      resetToDefaults();
    }
  } else if (confirm('确定要重置所有设置为默认值吗？此操作不可撤销。')) {
    resetToDefaults();
  }
}
</script>

<style scoped>
.cv-tab-content {
  display: flex;
  flex-direction: column;
  gap: 0;
}
</style>

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

    <div class="cv-about-title-row">
      <h2 class="cv-section-title">关于插件</h2>
      <Tag :value="'v' + manifest.version" class="cv-version-tag" rounded/>
    </div>
    <div class="cv-field-inline">
      <span>作者</span>
      <span class="cv-about-text">{{ manifest.author }}</span>
    </div>
    <div class="cv-field-inline">
      <span>相关链接</span>
      <div class="cv-links-container">
        <Button
          icon="fa-brands fa-github"
          severity="secondary"
          text
          rounded
          aria-label="GitHub"
          @click="openUrl('https://github.com/N0VI028/cosmos_vision')"
        />
        <Button
          icon="fa-brands fa-discord"
          severity="secondary"
          text
          rounded
          aria-label="Discord"
          @click="openUrl('https://discord.gg/sillytavern')"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { inject } from 'vue';
import { IMAGE_SOURCES } from '@/constants/comfyui';
import { useSettingsStore } from '@/store/settings';
import manifest from '../../../manifest.json';

const { settings, resetToDefaults } = useSettingsStore();
const imageSourceOptions = [...IMAGE_SOURCES];

const showConfirm =
  inject<
    (options: {
      title?: string;
      message: string;
      acceptLabel?: string;
      cancelLabel?: string;
      severity?: string;
    }) => Promise<boolean>
  >('showConfirm');

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

/**
 * 在新窗口中打开指定 URL
 * @param url 要打开的链接
 */
function openUrl(url: string): void {
  window.open(url, '_blank');
}
</script>

<style scoped>
.cv-tab-content {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.cv-about-title-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin: var(--cv-space-10xl) 0 var(--cv-space-3xl) 0;
}

.cv-about-title-row > .cv-section-title {
  margin: 0;
}

.cv-version-tag {
  font-family: var(--cv-font-headline) !important;
  font-size: calc(var(--mainFontSize) * 0.8) !important;
  font-weight: 700 !important;
  background: var(--p-primary-color) !important;
  color: var(--p-primary-contrast-color) !important;
  padding: 0.05rem 0.25rem !important;
  line-height: 1 !important;
  height: auto !important;
}

.cv-about-text {
  text-align: right;
  color: var(--cv-on-surface-variant);
  color: var(--p-button-secondary-color);
}

.cv-links-container {
  display: inline-flex;
  justify-content: flex-end;
  align-items: center;
  gap: var(--cv-space-xs);
}
</style>

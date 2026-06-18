<template>
  <Teleport defer to="#extensionsMenu">
    <div class="extension_container">
      <div
        class="list-group-item flex-container flexGap5 interactable"
        tabindex="0"
        role="listitem"
        @click="settingsVisible = true"
      >
        <div class="fa-fw fa-solid fa-gear extensionsMenuExtensionButton" />
        <span>Cosmos Vision</span>
      </div>
    </div>
  </Teleport>
  <SettingsDialog v-model:visible="settingsVisible" />
</template>

<script setup lang="ts">
import SettingsDialog from '@/panel/SettingsDialog.vue';
import { useSettingsStore } from '@/store/settings';
import { useInlineImageGeneration } from '@/composables/useInlineImageGeneration';

/** 设置弹窗显隐状态,由入口按钮触发 */
const settingsVisible = ref(false);

const { savedSettings } = useSettingsStore();

/** 段落生图运行时控制器 */
const { attachChatClickListener, detachChatClickListener, deselectParagraph, cleanup } = useInlineImageGeneration(
  savedSettings,
  () => savedSettings.enabled,
);

/** 图像扩展开关同步:关闭时停用后续入口并保留既有图片产物 */
watch(
  () => savedSettings.enabled,
  enabled => {
    if (enabled) {
      attachChatClickListener();
      return;
    }
    detachChatClickListener();
    deselectParagraph();
  },
  { immediate: true },
);

/** unmount 清理:移除监听并清理临时图片 */
onBeforeUnmount(() => {
  detachChatClickListener();
  cleanup();
});
</script>

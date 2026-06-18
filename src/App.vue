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
  <Teleport to="body">
    <!-- 顶部生图模式提示蒙版 -->
    <Transition name="cv-fade">
      <div
        v-if="isSelectionMode"
        class="cv-mode-indicator-bar"
        aria-hidden="true"
      />
    </Transition>

    <!-- 底部生图状态提示胶囊 -->
    <Transition name="cv-fade">
      <div
        v-if="isSelectionMode"
        class="cv-mode-indicator-bottom"
        aria-hidden="true"
      >
        <div class="cv-mode-indicator-text">
          <i class="fa-solid fa-wand-magic-sparkles" />
          <span>段落生图模式已激活</span>
        </div>
      </div>
    </Transition>

    <button
      ref="fabEl"
      v-if="savedSettings.enabled"
      type="button"
      class="cv-inline-mode-fab cosmos-vision-root cv-inline-mode-fab--draggable"
      :class="{ [DARK_CLASS]: savedSettings.darkMode, 'cv-inline-mode-fab--active': isSelectionMode }"
      :style="fabStyle"
      :aria-label="isSelectionMode ? '退出段落生图模式' : '进入段落生图模式'"
      :aria-pressed="isSelectionMode"
    >
      <i v-if="isSelectionMode" class="fa-solid fa-xmark" />
      <svg v-else viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <g fill="currentColor">
          <circle cx="50" cy="50" r="14" />
          <path
            d="M 16,50 A 34,34 0 0,1 63,18.6 C 61,21 59.5,23 56.7,24.9 A 26,26 0 0,0 24.9,43.3 C 21,46 18,48 16,50 Z"
          />
          <path
            d="M 84,50 A 34,34 0 0,1 37,81.4 C 39,79 40.5,77 43.3,75.1 A 26,26 0 0,0 75.1,56.7 C 79,54 82,52 84,50 Z"
          />
          <path d="M 75,11 Q 75,21 85,21 Q 75,21 75,31 Q 75,21 65,21 Q 75,21 75,11 Z" />
          <circle cx="25" cy="79" r="5" />
        </g>
      </svg>
    </button>
  </Teleport>
</template>

<script setup lang="ts">
import { useDraggable, useLocalStorage, useWindowSize } from '@vueuse/core';
import { DARK_CLASS } from '@/constants/theme';
import SettingsDialog from '@/panel/SettingsDialog.vue';
import { useSettingsStore } from '@/store/settings';
import { useInlineImageGeneration } from '@/composables/useInlineImageGeneration';

/** 设置弹窗显隐状态,由入口按钮触发 */
const settingsVisible = ref(false);

const { savedSettings } = useSettingsStore();

/** 段落生图运行时控制器 */
const { isSelectionMode, toggleSelectionMode, exitSelectionMode, cleanup } = useInlineImageGeneration(
  savedSettings,
  () => savedSettings.enabled,
);

// ── 悬浮球拖动 ─────────────────────────────────────────────

/** 悬浮球元素引用 */
const fabEl = ref<HTMLButtonElement | null>(null);

/** 持久化位置:保存到 localStorage，key 带命名空间避免冲突 */
const savedPos = useLocalStorage<{ x: number; y: number }>('cosmos-vision:fab-pos', {
  x: window.innerWidth - 80,
  y: window.innerHeight - 120,
});

/** pointerdown 时记录起始坐标，用于 onEnd 判断是否发生了真正的位移 */
let startX = 0;
let startY = 0;

const { x, y, isDragging } = useDraggable(fabEl, {
  initialValue: savedPos.value,
  onStart() {
    // 记录元素当前 left/top，而非鼠标 clientX/Y
    startX = x.value;
    startY = y.value;
  },
  onMove(pos) {
    // 限制在视口范围内
    const el = fabEl.value;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    pos.x = Math.max(0, Math.min(window.innerWidth - w, pos.x));
    pos.y = Math.max(0, Math.min(window.innerHeight - h, pos.y));
  },
  onEnd(pos) {
    const dx = Math.abs(pos.x - startX);
    const dy = Math.abs(pos.y - startY);
    // 位移小于 5px 视为点击，触发模式切换
    if (dx < 5 && dy < 5) {
      toggleSelectionMode();
    } else {
      savedPos.value = { x: pos.x, y: pos.y };
    }
  },
});

/** 窗口尺寸变化时将悬浮球夹回视口内，避免被遮挡 */
const { width: winW, height: winH } = useWindowSize();
watch([winW, winH], ([w, h]) => {
  const el = fabEl.value;
  if (!el) return;
  const clamped = {
    x: Math.max(0, Math.min(w - el.offsetWidth, x.value)),
    y: Math.max(0, Math.min(h - el.offsetHeight, y.value)),
  };
  x.value = clamped.x;
  y.value = clamped.y;
  savedPos.value = clamped;
});

/** 动态 style：覆盖 CSS 中的 right/bottom 定位，改用 left/top */
const fabStyle = computed(() => ({
  left: `${x.value}px`,
  top: `${y.value}px`,
  right: 'auto',
  bottom: 'auto',
  // 拖动时禁用过渡，避免抖动
  transition: isDragging.value ? 'none' : undefined,
}));

// ── 生命周期 ─────────────────────────────────────────────

/** 图像扩展开关同步:关闭时退出选择模式并保留既有图片产物 */
watch(
  () => savedSettings.enabled,
  enabled => {
    if (!enabled) exitSelectionMode();
  },
);

/** unmount 清理:移除监听并清理临时图片 */
onBeforeUnmount(() => {
  cleanup();
});
</script>

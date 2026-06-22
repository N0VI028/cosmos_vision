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

    <!-- Speed Dial 悬浮球 -->
    <div
      v-if="savedSettings.enabled"
      ref="fabEl"
      class="cv-speed-dial-container cosmos-vision-root"
      :class="{ [DARK_CLASS]: savedSettings.darkMode }"
      :style="fabStyle"
    >
      <!-- Speed Dial 菜单 -->
      <Transition name="cv-speed-dial-menu">
        <div
          v-if="speedDialOpen"
          class="cv-speed-dial-menu"
        >
          <button
            type="button"
            aria-label="打开设置"
            @pointerdown.stop
            @click="handleSettingsClick"
          >
            <i class="fa-solid fa-gear" />
          </button>
        </div>
      </Transition>

      <!-- 主按钮 -->
      <button
        type="button"
        class="cv-inline-mode-fab cv-inline-mode-fab--draggable"
        :class="{ 'cv-inline-mode-fab--active': speedDialOpen }"
        :aria-label="isSelectionMode ? '退出段落生图模式' : '进入段落生图模式'"
        :aria-pressed="speedDialOpen"
        :aria-expanded="speedDialOpen"
        @click="handleFabClick"
      >
        <i v-if="speedDialOpen" class="fa-solid fa-xmark" />
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
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { useDraggable, useLocalStorage, useWindowSize, onClickOutside } from '@vueuse/core';
import { DARK_CLASS } from '@/constants/theme';
import SettingsDialog from '@/panel/SettingsDialog.vue';
import { useSettingsStore } from '@/store/settings';
import { useInlineImageGeneration } from '@/composables/useInlineImageGeneration';

/** 设置弹窗显隐状态 */
const settingsVisible = ref(false);

/** Speed Dial 菜单展开状态 */
const speedDialOpen = ref(false);

const { savedSettings } = useSettingsStore();

/** 段落生图运行时控制器 */
const { isSelectionMode, toggleSelectionMode, exitSelectionMode, cleanup } = useInlineImageGeneration(
  savedSettings,
  () => savedSettings.enabled,
);

// ── 悬浮球拖动 ─────────────────────────────────────────────

/** Speed Dial 容器引用 */
const fabEl = ref<HTMLElement | null>(null);

/** 持久化位置:保存到 localStorage，key 带命名空间避免冲突 */
const savedPos = useLocalStorage<{ x: number; y: number }>('cosmos-vision:fab-pos', {
  x: window.innerWidth - 80,
  y: window.innerHeight - 120,
});

/** pointerdown 时记录起始坐标，用于 onEnd 判断是否发生了真正的位移 */
let startX = 0;
let startY = 0;
/** 是否发生了真实拖动（位移 > 5px） */
let didDrag = false;

const { x, y, isDragging } = useDraggable(fabEl, {
  initialValue: savedPos.value,
  onStart() {
    startX = x.value;
    startY = y.value;
    didDrag = false;
  },
  onMove(pos) {
    const el = fabEl.value;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    pos.x = Math.max(0, Math.min(window.innerWidth - w, pos.x));
    pos.y = Math.max(0, Math.min(window.innerHeight - h, pos.y));
    if (Math.abs(pos.x - startX) > 5 || Math.abs(pos.y - startY) > 5) {
      didDrag = true;
    }
  },
  onEnd(pos) {
    if (didDrag) {
      speedDialOpen.value = false;
      savedPos.value = { x: pos.x, y: pos.y };
    }
  },
});

/** 主按钮点击：拖动结束时不触发 */
function handleFabClick(): void {
  if (didDrag) return;
  if (isSelectionMode.value) {
    speedDialOpen.value = false;
    toggleSelectionMode();
  } else {
    speedDialOpen.value = true;
    toggleSelectionMode();
  }
}

/**
 * 处理悬浮球外部点击
 * 仅在未进入段落生图模式时收起 Speed Dial
 */
function handleSpeedDialOutsideClick(): void {
  if (!speedDialOpen.value || isSelectionMode.value) return;
  speedDialOpen.value = false;
}

/** 点击外部关闭 Speed Dial */
onClickOutside(fabEl, handleSpeedDialOutsideClick);

/** 窗口尺寸变化时将悬浮球夹回视口内 */
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

/** 动态 style：left/top 由 useDraggable 驱动 */
const fabStyle = computed(() => ({
  left: `${x.value}px`,
  top: `${y.value}px`,
  right: 'auto',
  bottom: 'auto',
  transition: isDragging.value ? 'none' : undefined,
}));

/** 点击设置按钮 */
function handleSettingsClick(): void {
  speedDialOpen.value = false;
  exitSelectionMode();
  settingsVisible.value = true;
}

// ── 生命周期 ─────────────────────────────────────────────

watch(
  () => savedSettings.enabled,
  enabled => {
    if (!enabled) {
      exitSelectionMode();
      speedDialOpen.value = false;
    }
  },
);

watch(isSelectionMode, active => {
  if (!active) {
    speedDialOpen.value = false;
  }
});

onBeforeUnmount(() => {
  cleanup();
});
</script>

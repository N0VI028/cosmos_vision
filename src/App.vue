<template>
  <Teleport defer to="#extensionsMenu">
    <div class="extension_container">
      <div
        class="list-group-item flex-container flexGap5 interactable"
        tabindex="0"
        role="listitem"
        @click="openSettings"
      >
        <div class="fa-fw fa-solid fa-gear extensionsMenuExtensionButton" />
        <span>Cosmos Vision</span>
      </div>
    </div>
  </Teleport>
  <SettingsDialog
    v-model:visible="settingsVisible"
    :initial-focus-message-id="settingsFocusMessageId"
    :initial-focus-message-paragraphs="settingsFocusMessageParagraphs"
    :initial-focus-paragraph-text="settingsFocusParagraphText"
  />
  <TextInputDialog
    v-model:visible="textInputDialogVisible"
    v-model:value="textInputDialogState.value"
    v-model:secondary-value="textInputDialogState.secondaryValue"
    v-model:characters="textInputDialogState.characters"
    :title="textInputDialogState.title"
    :message="textInputDialogState.message"
    :primary-label="textInputDialogState.primaryLabel"
    :secondary-label="textInputDialogState.secondaryLabel"
    :rows="textInputDialogState.rows"
    :secondary-rows="textInputDialogState.secondaryRows"
    :accept-label="textInputDialogState.acceptLabel"
    :cancel-label="textInputDialogState.cancelLabel"
    :dark-mode="darkMode"
    :enable-characters="textInputDialogState.enableCharacters"
    @submit="handleTextInputDialog"
  />
  <ImageDownloadDialog
    v-model:visible="imageDownloadDialogVisible"
    v-model:options="imageDownloadDialogOptions"
    :dark-mode="darkMode"
    @submit="handleImageDownloadDialog"
  />
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
          <span>点击段落开始生图</span>
        </div>
      </div>
    </Transition>

    <!-- Speed Dial 悬浮球 -->
    <div
      v-if="savedSettings.enabled"
      ref="fabEl"
      class="cv-speed-dial-container cosmos-vision-root"
      :class="{ [DARK_CLASS]: darkMode }"
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
  <!-- 短码 / 临时画廊：Teleport 到聊天内 cv-render -->
  <InlineGalleryRuntimeHost />
</template>

<script setup lang="ts">
import { useDraggable, useLocalStorage, useWindowSize, onClickOutside } from '@vueuse/core';
import { storeToRefs } from 'pinia';
import { DARK_CLASS } from '@/constants/default-settings';
import SettingsDialog from '@/panel/SettingsDialog.vue';
import ImageDownloadDialog from '@/panel/components/ImageDownloadDialog.vue';
import TextInputDialog from '@/panel/components/TextInputDialog.vue';
import { useSettingsStore } from '@/store/settings';
import {
  useInlineImageGeneration,
  type InlineCharacterPromptDraft,
  type InlinePromptPairInputOptions,
  type InlinePromptPairInputValue,
  type InlineTextInputOptions,
} from '@/composables/useInlineImageGeneration';
import InlineGalleryRuntimeHost from '@/panel/components/InlineGalleryRuntimeHost.vue';
import {
  extractMessageParagraphs,
  findMessageId,
  getFocusedChatParagraphs,
  mergeFocusParagraphText,
} from '@/services/sillytavern/chat-dom';
import { ensureTavernHelper } from '@/services/tavern-helper/availability';
import {
  IMAGE_DOWNLOAD_OPTIONS_REQUEST_KEY,
  cloneInlineImageDownloadOptions,
  createDefaultInlineImageDownloadOptions,
  type InlineImageDownloadOptions,
} from '@/services/inline-image/download-options';
import { ensurePromptStripRegex } from '@/services/inline-image/prompt-strip-regex';
import type { TextInputCharacterDraft } from '@/panel/components/TextInputDialog.vue';

interface TextInputDialogSubmitValue {
  value: string;
  secondaryValue: string;
  characters: TextInputCharacterDraft[];
}

interface TextInputDialogState {
  title: string;
  message: string;
  primaryLabel: string;
  value: string;
  secondaryLabel: string;
  secondaryValue: string;
  rows: number;
  secondaryRows: number;
  acceptLabel: string;
  cancelLabel: string;
  enableCharacters: boolean;
  characters: TextInputCharacterDraft[];
  resolve: (value: TextInputDialogSubmitValue | null) => void;
}

interface ImageDownloadDialogState {
  resolve: (value: InlineImageDownloadOptions | null) => void;
}

/** 设置弹窗显隐状态 */
const settingsVisible = ref(false);

/** 打开设置时捕获的焦点段落文本快照 */
const settingsFocusParagraphText = ref('');

/** 打开设置时捕获的焦点楼层 ID 快照 */
const settingsFocusMessageId = ref<string | null>(null);

/** 打开设置时捕获的焦点整楼文本快照 */
const settingsFocusMessageParagraphs = ref<string[]>([]);

/** Speed Dial 菜单展开状态 */
const speedDialOpen = ref(false);

const settingsStore = useSettingsStore();
const { savedSettings } = settingsStore;
const { darkMode } = storeToRefs(settingsStore);

const textInputDialogVisible = ref(false);
const imageDownloadDialogVisible = ref(false);
const textInputDialogState = ref<TextInputDialogState>({
  title: '',
  message: '',
  primaryLabel: '',
  value: '',
  secondaryLabel: '',
  secondaryValue: '',
  rows: 4,
  secondaryRows: 4,
  acceptLabel: '确定',
  cancelLabel: '取消',
  enableCharacters: false,
  characters: [],
  resolve: () => {},
});
const imageDownloadDialogOptions = ref(createDefaultInlineImageDownloadOptions());
const imageDownloadDialogState = ref<ImageDownloadDialogState>({
  resolve: () => {},
});

/** 段落生图运行时控制器 */
const { isSelectionMode, toggleSelectionMode, exitSelectionMode, refreshGalleryTheme, cleanup } = useInlineImageGeneration(
  savedSettings,
  {
    isRuntimeEnabled: () => savedSettings.enabled,
    requestTextInput: showTextInputDialog,
    requestPromptPairInput: showPromptPairDialog,
    requestImageDownloadOptions: showImageDownloadDialog,
    getDarkMode: () => darkMode.value,
  },
);

provide(IMAGE_DOWNLOAD_OPTIONS_REQUEST_KEY, showImageDownloadDialog);

/** 日夜模式切换时立即刷新画廊主题 */
watch(darkMode, () => refreshGalleryTheme());

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
  openSettings();
}

/**
 * 打开设置并清理段落生图选择态
 * 设置页只保留打开瞬间捕获的焦点楼层快照
 */
function openSettings(): void {
  const paragraphs = getFocusedChatParagraphs();
  const anchor = paragraphs.at(-1) ?? null;
  settingsFocusParagraphText.value = mergeFocusParagraphText(paragraphs);
  settingsFocusMessageId.value = anchor ? findMessageId(anchor) : null;
  settingsFocusMessageParagraphs.value = anchor ? extractMessageParagraphs(anchor) : [];
  speedDialOpen.value = false;
  exitSelectionMode();
  ensureTavernHelper();
  settingsVisible.value = true;
}

/**
 * 清理设置页使用的焦点段落文本快照
 */
function clearSettingsFocusParagraphText(): void {
  settingsFocusParagraphText.value = '';
  settingsFocusMessageId.value = null;
  settingsFocusMessageParagraphs.value = [];
}

/**
 * 显示 PrimeVue 文本输入弹窗
 * @param options 弹窗配置
 * @returns 用户输入文本或取消状态
 */
function showTextInputDialog(options: InlineTextInputOptions): Promise<string | null> {
  return new Promise(resolve => {
    textInputDialogState.value = {
      title: options.title ?? '输入',
      message: options.message,
      primaryLabel: '',
      value: options.defaultValue ?? '',
      secondaryLabel: '',
      secondaryValue: '',
      rows: options.rows ?? 4,
      secondaryRows: 4,
      acceptLabel: options.acceptLabel ?? '确定',
      cancelLabel: options.cancelLabel ?? '取消',
      enableCharacters: false,
      characters: [],
      resolve: result => resolve(result?.value ?? null),
    };
    textInputDialogVisible.value = true;
  });
}

/**
 * 显示正负提示词双输入弹窗（可选角色提示词）
 * @param options 弹窗配置
 * @returns 用户输入的正负与角色提示词或取消状态
 */
function showPromptPairDialog(options: InlinePromptPairInputOptions): Promise<InlinePromptPairInputValue | null> {
  return new Promise(resolve => {
    textInputDialogState.value = {
      title: options.title ?? '编辑提示词',
      message: options.message,
      primaryLabel: options.positiveLabel ?? '正向提示词',
      value: options.positiveDefaultValue ?? '',
      secondaryLabel: options.negativeLabel ?? '负向提示词',
      secondaryValue: options.negativeDefaultValue ?? '',
      rows: options.positiveRows ?? 6,
      secondaryRows: options.negativeRows ?? 4,
      acceptLabel: options.acceptLabel ?? '确定',
      cancelLabel: options.cancelLabel ?? '取消',
      enableCharacters: Boolean(options.enableCharacters),
      characters: toTextInputCharacterDrafts(options.charactersDefaultValue ?? []),
      resolve: result =>
        resolve(
          result
            ? {
                positive: result.value,
                negative: result.secondaryValue,
                characters: result.characters.map(toInlineCharacterDraft),
              }
            : null,
        ),
    };
    textInputDialogVisible.value = true;
  });
}

/**
 * 将内联角色草稿转为弹窗草稿（补 id）
 * @param drafts 内联角色草稿
 * @returns 弹窗角色草稿
 */
function toTextInputCharacterDrafts(drafts: InlineCharacterPromptDraft[]): TextInputCharacterDraft[] {
  return drafts.map((draft, index) => ({
    id: index + 1,
    positivePrompt: draft.positivePrompt,
    negativePrompt: draft.negativePrompt,
    x: draft.x,
    y: draft.y,
  }));
}

/**
 * 将弹窗角色草稿转回内联草稿
 * @param draft 弹窗角色草稿
 * @returns 内联角色草稿
 */
function toInlineCharacterDraft(draft: TextInputCharacterDraft): InlineCharacterPromptDraft {
  return {
    positivePrompt: draft.positivePrompt,
    negativePrompt: draft.negativePrompt,
    x: draft.x,
    y: draft.y,
  };
}

/**
 * 显示图片下载配置弹窗
 * @returns 用户确认后的下载配置,取消时返回 null
 */
function showImageDownloadDialog(): Promise<InlineImageDownloadOptions | null> {
  return new Promise(resolve => {
    imageDownloadDialogOptions.value = createDefaultInlineImageDownloadOptions();
    imageDownloadDialogState.value = {
      resolve: result => resolve(result ? cloneInlineImageDownloadOptions(result) : null),
    };
    imageDownloadDialogVisible.value = true;
  });
}

/**
 * 处理文本输入弹窗结果
 * @param value 输入文本或取消状态
 */
function handleTextInputDialog(value: TextInputDialogSubmitValue | null): void {
  textInputDialogState.value.resolve(value);
}

/**
 * 处理图片下载配置弹窗结果
 * @param value 下载配置或取消状态
 */
function handleImageDownloadDialog(value: InlineImageDownloadOptions | null): void {
  imageDownloadDialogState.value.resolve(value);
}

// ── 生命周期 ─────────────────────────────────────────────

// 段落短码 prompt 剥离正则：load 注册；关插件保持开启
void ensurePromptStripRegex();

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

watch(settingsVisible, visible => {
  if (!visible) {
    clearSettingsFocusParagraphText();
  }
});

onBeforeUnmount(() => {
  if (textInputDialogVisible.value) textInputDialogState.value.resolve(null);
  if (imageDownloadDialogVisible.value) imageDownloadDialogState.value.resolve(null);
  cleanup();
});
</script>

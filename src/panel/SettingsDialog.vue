<template>
  <Dialog
    v-model:visible="dialogVisible"
    modal
    dismissable-mask
    :show-header="false"
    :class="settingsDialogClass"
    :style="dialogStyle"
    :content-style="contentStyle"
    @show="handleShow"
  >
    <div class="cv-shell">
      <!-- 侧边栏导航 -->
      <nav class="cv-sidebar">
        <!-- Logo/品牌区 -->
        <div class="cv-brand">
          <div class="cv-brand-icon">
            <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
              <g fill="currentColor">
                <circle cx="50" cy="50" r="14" />

                <path
                  d="M 16,50 
             A 34,34 0 0,1 63,18.6 
             C 61,21 59.5,23 56.7,24.9 
             A 26,26 0 0,0 24.9,43.3 
             C 21,46 18,48 16,50 Z"
                />

                <path
                  d="M 84,50 
             A 34,34 0 0,1 37,81.4 
             C 39,79 40.5,77 43.3,75.1 
             A 26,26 0 0,0 75.1,56.7 
             C 79,54 82,52 84,50 Z"
                />

                <path
                  d="M 75,11 
             Q 75,21 85,21 
             Q 75,21 75,31 
             Q 75,21 65,21 
             Q 75,21 75,11 Z"
                />

                <circle cx="25" cy="79" r="5" />
              </g>
            </svg>
          </div>
          <div class="cv-brand-text">
            <span class="cv-brand-title">Cosmos</span>
          </div>
        </div>

        <!-- 主导航 -->
        <div class="cv-nav">
          <button
            v-for="item in NAV_ITEMS"
            :key="item.value"
            type="button"
            class="cv-nav-item"
            :class="{ 'cv-nav-item--active': activeTab === item.value }"
            @click="activeTab = item.value"
          >
            <svg
              v-if="item.value === 'comfyui'"
              fill="currentColor"
              fill-rule="evenodd"
              height="1em"
              style="flex: none; line-height: 1"
              viewBox="0 0 24 24"
              width="1em"
              xmlns="http://www.w3.org/2000/svg"
              class="cv-nav-icon"
            >
              <title>ComfyUI</title>
              <path
                d="M5.485 23.76c-.568 0-1.026-.207-1.325-.598-.307-.402-.387-.964-.22-1.54l.672-2.315a.605.605 0 00-.1-.536.622.622 0 00-.494-.243H2.085c-.568 0-1.026-.207-1.325-.598-.307-.403-.387-.964-.22-1.54l2.31-7.917.255-.87c.343-1.18 1.592-2.14 2.786-2.14h2.313c.276 0 .519-.18.595-.442l.764-2.633C9.906 1.208 11.155.249 12.35.249l4.945-.008h3.62c.568 0 1.027.206 1.325.597.307.402.387.964.22 1.54l-1.035 3.566c-.343 1.178-1.593 2.137-2.787 2.137l-4.956.01H11.37a.618.618 0 00-.594.441l-1.928 6.604a.605.605 0 00.1.537c.118.153.3.243.495.243l3.275-.006h3.61c.568 0 1.026.206 1.325.598.307.402.387.964.22 1.54l-1.036 3.565c-.342 1.179-1.592 2.138-2.786 2.138l-4.957.01h-3.61z"
              ></path>
            </svg>
            <svg
              v-else-if="item.value === 'novelai'"
              fill="currentColor"
              fill-rule="evenodd"
              height="1em"
              style="flex: none; line-height: 1"
              viewBox="0 0 24 24"
              width="1em"
              xmlns="http://www.w3.org/2000/svg"
              class="cv-nav-icon"
            >
              <title>NovelAI</title>
              <path
                clip-rule="evenodd"
                d="M5.861 18.918c-.829-1.368-1.838-2.504-3.04-3.289a.74.74 0 01-.18-1.045C4.817 11.764 8.199 4.378 9.97.359c.264-.601 1.17-.4 1.17.256v10.71a2.719 2.719 0 00-1.35 3.611l-3.935 3.982h.006zm.871 1.678c.415.924.763 1.92 1.04 2.948a.605.605 0 00.582.456h7.748a.61.61 0 00.583-.456 19.585 19.585 0 011.039-2.948l-2.06-2.085-1.718 1.738c.042.158.066.323.066.493 0 .997-.799 1.805-1.784 1.805a1.795 1.795 0 01-1.784-1.805c0-.997.799-1.806 1.784-1.806.15 0 .3.019.438.055l1.736-1.757-.979-.99a2.68 2.68 0 01-2.378 0l-4.3 4.352h-.013zm11.863-1.678c.829-1.368 1.838-2.504 3.04-3.289a.74.74 0 00.18-1.045C19.64 11.764 16.257 4.378 14.485.359c-.264-.601-1.17-.4-1.17.256v10.71a2.719 2.719 0 011.35 3.611l3.935 3.982h-.006z"
              />
            </svg>
            <i v-else class="cv-nav-icon" :class="item.icon" />
            <span class="cv-nav-label">{{ item.label }}</span>
          </button>
        </div>

        <!-- 底部操作 -->
        <div class="cv-sidebar-footer">
          <SelectButton
            v-if="!isMobile"
            v-model="darkMode"
            class="cv-theme-toggle"
            :options="THEME_OPTIONS"
            option-label="label"
            option-value="value"
            :allow-empty="false"
            aria-label="主题模式"
          >
            <template #option="slotProps">
              <i :class="slotProps.option.icon" />
              <span>{{ slotProps.option.label }}</span>
            </template>
          </SelectButton>
          <button
            v-else
            type="button"
            class="cv-mobile-theme-btn"
            :title="darkMode ? '切换为浅色模式' : '切换为深色模式'"
            :aria-label="darkMode ? '切换为浅色模式' : '切换为深色模式'"
            @click="darkMode = !darkMode"
          >
            <i :class="darkMode ? 'fa-solid fa-moon' : 'fa-solid fa-sun'" />
          </button>
        </div>
      </nav>

      <!-- 主内容区 -->
      <main class="cv-main">
        <!-- 关闭按钮 -->
        <button type="button" class="cv-close" @click="requestClose">
          <i class="fa-solid fa-xmark" />
        </button>

        <!-- 顶部标题 -->
        <header class="cv-header">
          <div ref="breadcrumbRef" class="cv-breadcrumb">
            <span class="cv-breadcrumb-item">设置</span>
            <i class="fa-solid fa-chevron-right cv-breadcrumb-sep" />
            <span class="cv-breadcrumb-item cv-breadcrumb-item--active">{{ currentTabLabel }}</span>

            <!-- Section 层级 -->
            <template v-if="currentSection">
              <i class="fa-solid fa-chevron-right cv-breadcrumb-sep" />
              <div class="cv-breadcrumb-section-wrapper">
                <button
                  type="button"
                  class="cv-breadcrumb-item cv-breadcrumb-item--active cv-breadcrumb-dropdown"
                  @click="toggleSectionMenu"
                >
                  {{ currentSection }}
                  <i v-if="sections.length > 1" class="fa-solid fa-chevron-down cv-breadcrumb-dropdown-icon" />
                </button>

                <!-- 下拉菜单 -->
                <div v-if="showSectionMenu && sections.length > 1" class="cv-section-menu">
                  <button
                    v-for="section in sections"
                    :key="section.id"
                    type="button"
                    class="cv-section-menu-item"
                    :class="{ 'cv-section-menu-item--active': section.title === currentSection }"
                    @click="scrollToSection(section)"
                  >
                    {{ section.title }}
                  </button>
                </div>
              </div>
            </template>
          </div>
          <h1 class="cv-header-title">{{ currentTabLabel }}</h1>
          <SubTabNav v-if="activeTab === 'novelai'" v-model="novelaiSubTab" :tabs="NOVELAI_SUB_TABS" />
          <SubTabNav v-if="activeTab === 'comfyui'" v-model="comfyuiSubTab" :tabs="COMFYUI_SUB_TABS" />
          <SubTabNav v-if="activeTab === 'prompt-llm'" v-model="promptLlmSubTab" :tabs="PROMPT_LLM_SUB_TABS" />
          <SubTabNav
            v-if="activeTab === 'prompt-profiles'"
            v-model="promptProfilesSubTab"
            :tabs="PROMPT_PROFILES_SUB_TABS"
          />
        </header>

        <!-- 滚动内容区 -->
        <div ref="scrollContainer" class="cv-content custom-scrollbar">
          <Fluid class="cv-content-inner">
            <MainTab v-if="activeTab === 'main'" />
            <NovelAITab v-else-if="activeTab === 'novelai'" :sub-tab="novelaiSubTab" />
            <ComfyUITab v-else-if="activeTab === 'comfyui'" :sub-tab="comfyuiSubTab" />
            <PromptLlmTab v-else-if="activeTab === 'prompt-llm'" :sub-tab="promptLlmSubTab" />
            <PromptProfilesTab v-else-if="activeTab === 'prompt-profiles'" v-model:kind="promptProfilesSubTab" />
          </Fluid>
        </div>

        <!-- 浮动操作栏 -->
        <div class="cv-action-bar">
          <div class="cv-action-bar-inner">
            <button type="button" class="cv-action-btn cv-action-btn--ghost" @click="requestDiscard">放弃更改</button>
            <button type="button" class="cv-action-btn cv-action-btn--primary" @click="applySettings">
              <i class="fa-solid fa-check" />
              应用更改
            </button>
          </div>
        </div>
      </main>
    </div>
  </Dialog>
  <Dialog
    v-model:visible="isConfirmVisible"
    modal
    :closable="false"
    :draggable="false"
    :class="confirmDialogClass"
    :header="confirmTitle"
    :style="confirmDialogStyle"
  >
    <div class="cv-confirm-message">{{ confirmMessage }}</div>
    <template #footer>
      <div class="cv-confirm-actions">
        <Button :label="confirmCancelLabel" text @click="closeConfirmDialog" />
        <Button :label="confirmAcceptLabel" :severity="confirmAcceptSeverity" @click="handleConfirmAccept" />
      </div>
    </template>
  </Dialog>

  <Dialog
    v-model:visible="customConfirmVisible"
    modal
    :closable="false"
    :draggable="false"
    :class="confirmDialogClass"
    :header="customConfirmState.title"
    :style="confirmDialogStyle"
  >
    <div class="cv-confirm-message">{{ customConfirmState.message }}</div>
    <template #footer>
      <div class="cv-confirm-actions">
        <Button :label="customConfirmState.cancelLabel" text @click="handleCustomConfirm(false)" />
        <Button
          :label="customConfirmState.acceptLabel"
          :severity="customConfirmState.severity"
          @click="handleCustomConfirm(true)"
        />
      </div>
    </template>
  </Dialog>

  <Dialog
    v-model:visible="customPromptVisible"
    modal
    :closable="false"
    :draggable="false"
    :class="confirmDialogClass"
    :header="customPromptState.title"
    :style="confirmDialogStyle"
    @show="focusPromptInput"
  >
    <div class="flex w-full flex-col gap-2">
      <div v-if="customPromptState.message" class="cv-confirm-message mb-2">{{ customPromptState.message }}</div>
      <InputText
        ref="promptInputRef"
        v-model="customPromptState.value"
        class="w-full"
        @keydown.enter="handleCustomPrompt(true)"
      />
    </div>
    <template #footer>
      <div class="cv-confirm-actions">
        <Button label="取消" text @click="handleCustomPrompt(false)" />
        <Button label="确定" @click="handleCustomPrompt(true)" />
      </div>
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import { onClickOutside, useEventListener, useMediaQuery } from '@vueuse/core';
import { storeToRefs } from 'pinia';

import { DARK_CLASS } from '@/constants/theme';
import '@/panel/styles/settings-dialog.css';
import ComfyUITab from '@/panel/tabs/ComfyUITab.vue';
import MainTab from '@/panel/tabs/MainTab.vue';
import NovelAITab from '@/panel/tabs/NovelAITab.vue';
import PromptLlmTab from '@/panel/tabs/PromptLlmTab.vue';
import PromptProfilesTab from '@/panel/tabs/PromptProfilesTab.vue';
import SubTabNav from '@/panel/components/SubTabNav.vue';
import { useSettingsStore } from '@/store/settings';

type NavValue = 'main' | 'novelai' | 'comfyui' | 'prompt-llm' | 'prompt-profiles';
type ThemeOption = { value: boolean; label: string; icon: string };
type ConfirmAction = 'close' | 'discard';

interface SectionInfo {
  id: string;
  title: string;
  element: HTMLElement;
}

interface CustomConfirmOptions {
  title?: string;
  message: string;
  acceptLabel?: string;
  cancelLabel?: string;
  severity?: string;
}

interface CustomPromptOptions {
  title?: string;
  message: string;
  defaultValue?: string;
}

const NAV_ITEMS = [
  { value: 'main', label: '通用', icon: 'fa-solid fa-gear' },
  { value: 'novelai', label: 'NovelAI', icon: '' },
  { value: 'comfyui', label: 'ComfyUI', icon: '' },
  { value: 'prompt-llm', label: 'LLM', icon: 'fa-solid fa-wand-magic-sparkles' },
  { value: 'prompt-profiles', label: '人物', icon: 'fa-solid fa-user-gear' },
] as const satisfies ReadonlyArray<{ value: NavValue; label: string; icon: string }>;

const THEME_OPTIONS: ThemeOption[] = [
  { value: false, label: 'Light', icon: 'fa-solid fa-sun' },
  { value: true, label: 'Dark', icon: 'fa-solid fa-moon' },
];

const visible = defineModel<boolean>('visible', { default: false });
const settingsStore = useSettingsStore();
const { darkMode } = storeToRefs(settingsStore);

const settingsDialogClass = computed(() => ({ [DARK_CLASS]: darkMode.value }));
const confirmDialogClass = computed(() => ['cv-confirm-dialog', settingsDialogClass.value]);

const isMobile = useMediaQuery('(max-width: 66.6667em)');
const dialogStyle = computed(() =>
  isMobile.value ? { width: '95vw', height: '85vh' } : { width: '50.6667em', height: '40em', maxHeight: '80vh' },
);
const confirmDialogStyle = computed(() =>
  isMobile.value
    ? { width: 'calc(100vw - 2rem)', maxWidth: '26rem' }
    : { width: '24rem', maxWidth: 'calc(100vw - 2rem)' },
);

const contentStyle = { padding: '0', overflow: 'hidden' } as const;

const activeTab = ref<NavValue>('main');

type NovelAISubTab = 'api' | 'config' | 'preset' | 'test';
type ComfyUISubTab = 'api' | 'config' | 'test';
type PromptLlmSubTab = 'settings' | 'builder' | 'test';
type PromptProfilesSubTab = 'user' | 'character';

const NOVELAI_SUB_TABS = [
  { value: 'api', label: 'API' },
  { value: 'config', label: '配置' },
  { value: 'preset', label: '预设' },
  { value: 'test', label: '测试' },
] as const;

const COMFYUI_SUB_TABS = [
  { value: 'api', label: 'API' },
  { value: 'config', label: '配置' },
  { value: 'test', label: '测试' },
] as const;

const PROMPT_LLM_SUB_TABS = [
  { value: 'settings', label: '模型设置' },
  { value: 'builder', label: '提示词构建' },
  { value: 'test', label: '测试' },
] as const;

const PROMPT_PROFILES_SUB_TABS = [
  { value: 'user', label: '用户' },
  { value: 'character', label: '角色卡' },
] as const;

const novelaiSubTab = ref<NovelAISubTab>('api');
const comfyuiSubTab = ref<ComfyUISubTab>('api');
const promptLlmSubTab = ref<PromptLlmSubTab>('settings');
const promptProfilesSubTab = ref<PromptProfilesSubTab>('character');

const sections = ref<SectionInfo[]>([]);
const currentSection = ref<string>('');
const showSectionMenu = ref(false);
const scrollContainer = ref<HTMLElement | null>(null);
const breadcrumbRef = ref<HTMLElement | null>(null);
const isConfirmVisible = ref(false);
const confirmAction = ref<ConfirmAction>('close');

const customConfirmVisible = ref(false);
const customConfirmState = ref<{
  title: string;
  message: string;
  acceptLabel: string;
  cancelLabel: string;
  severity: string;
  resolve: (value: boolean) => void;
}>({
  title: '',
  message: '',
  acceptLabel: '确认',
  cancelLabel: '取消',
  severity: 'primary',
  resolve: () => {},
});

const customPromptVisible = ref(false);
const customPromptState = ref<{
  title: string;
  message: string;
  value: string;
  resolve: (value: string | null) => void;
}>({
  title: '',
  message: '',
  value: '',
  resolve: () => {},
});

const promptInputRef = ref<any>(null);

/**
 * 自定义确认弹窗处理函数
 * @param accept 是否同意
 */
function handleCustomConfirm(accept: boolean): void {
  customConfirmVisible.value = false;
  customConfirmState.value.resolve(accept);
}

/**
 * 自定义输入弹窗处理函数
 * @param accept 是否同意
 */
function handleCustomPrompt(accept: boolean): void {
  customPromptVisible.value = false;
  customPromptState.value.resolve(accept ? customPromptState.value.value : null);
}

/**
 * 聚焦输入框
 */
function focusPromptInput(): void {
  if (isMobile.value) return;
  nextTick(() => {
    const el = promptInputRef.value?.$el || promptInputRef.value;
    if (el) {
      el.focus();
      if (typeof el.select === 'function') el.select();
    }
  });
}

/**
 * 显示自定义确认弹窗
 * @param options 配置项
 */
function showCustomConfirm(options: CustomConfirmOptions): Promise<boolean> {
  return new Promise<boolean>(resolve => {
    customConfirmState.value = {
      title: options.title || '确认',
      message: options.message,
      acceptLabel: options.acceptLabel || '确定',
      cancelLabel: options.cancelLabel || '取消',
      severity: options.severity || 'primary',
      resolve,
    };
    customConfirmVisible.value = true;
  });
}

/**
 * 显示自定义输入弹窗
 * @param options 配置项
 */
function showCustomPrompt(options: CustomPromptOptions): Promise<string | null> {
  return new Promise<string | null>(resolve => {
    customPromptState.value = {
      title: options.title || '输入',
      message: options.message || '',
      value: options.defaultValue || '',
      resolve,
    };
    customPromptVisible.value = true;
  });
}

provide('showConfirm', showCustomConfirm);
provide('showPrompt', showCustomPrompt);

const dialogVisible = computed({
  get: () => visible.value,
  set: value => {
    if (value) {
      visible.value = true;
      return;
    }
    requestClose();
  },
});

// 提供刷新 section 的方法给子组件
provide('refreshSections', () => {
  nextTick(() => {
    scanSections();
  });
});

const currentTabLabel = computed(() => NAV_ITEMS.find(item => item.value === activeTab.value)?.label ?? '');
const confirmTitle = computed(() => (confirmAction.value === 'discard' ? '放弃更改' : '保存更改'));
const confirmMessage = computed(() =>
  confirmAction.value === 'discard'
    ? '确定要放弃所有未应用的更改吗？此操作会恢复为最后保存的设置'
    : '有未应用的设置更改，是否应用并保存后关闭？',
);
const confirmAcceptLabel = computed(() => (confirmAction.value === 'discard' ? '确认放弃' : '保存并关闭'));
const confirmCancelLabel = computed(() => (confirmAction.value === 'discard' ? '继续编辑' : '继续编辑'));
const confirmAcceptSeverity = computed(() => (confirmAction.value === 'discard' ? 'danger' : undefined));

onClickOutside(breadcrumbRef, () => {
  showSectionMenu.value = false;
});

/**
 * 打开设置弹窗时重置编辑状态
 */
function handleShow(): void {
  settingsStore.resetDraftSettings();
  activeTab.value = 'main';
  closeConfirmDialog();
}

/**
 * 请求关闭弹窗,有未应用更改时询问是否保存
 */
function requestClose(): void {
  if (!settingsStore.isDirty) {
    closeDialog();
    return;
  }
  openConfirmDialog('close');
}

/**
 * 应用设置但保持窗口打开
 */
function applySettings(): void {
  if (!settingsStore.isDirty) return;
  settingsStore.applySettings();
  toastr.success('设置已保存');
}

/**
 * 请求放弃未应用更改
 */
function requestDiscard(): void {
  if (!settingsStore.isDirty) return;
  openConfirmDialog('discard');
}

/**
 * 打开确认弹窗
 * @param action 当前确认动作
 */
function openConfirmDialog(action: ConfirmAction): void {
  confirmAction.value = action;
  isConfirmVisible.value = true;
}

/**
 * 关闭确认弹窗
 */
function closeConfirmDialog(): void {
  isConfirmVisible.value = false;
}

/**
 * 处理确认弹窗的主操作
 */
function handleConfirmAccept(): void {
  const action = confirmAction.value;
  closeConfirmDialog();
  if (action === 'discard') {
    settingsStore.discardSettings();
    toastr.info('已放弃未保存更改');
    return;
  }
  applySettings();
  closeDialog();
}

/**
 * 直接关闭设置弹窗
 */
function closeDialog(): void {
  visible.value = false;
}

/**
 * 扫描当前页面的所有 section
 */
function scanSections(): void {
  if (!scrollContainer.value) return;

  const sectionElements = scrollContainer.value.querySelectorAll('.cv-section-title');
  sections.value = Array.from(sectionElements).map((el, index) => ({
    id: `section-${index}`,
    title: el.textContent?.trim() || '',
    element: el as HTMLElement,
  }));

  markSectionEdges(sectionElements);
  updateCurrentSection();
}

/**
 * 标记 section 首尾内容块
 */
function markSectionEdges(sectionElements: NodeListOf<Element>): void {
  scrollContainer.value?.querySelectorAll('.cv-section-first, .cv-section-last').forEach(el => {
    el.classList.remove('cv-section-first', 'cv-section-last');
  });

  sectionElements.forEach(sectionEl => {
    const edge = findSectionEdge(sectionEl);
    edge.first?.classList.add('cv-section-first');
    edge.last?.classList.add('cv-section-last');
  });
}

/**
 * 查找 section 首尾内容元素
 */
function findSectionEdge(sectionEl: Element): { first: Element | null; last: Element | null } {
  let nextEl = sectionEl.nextElementSibling;
  let first: Element | null = null;
  let last: Element | null = null;

  while (nextEl && !nextEl.classList.contains('cv-section-title')) {
    if (isSectionContent(nextEl)) {
      first ??= nextEl;
      last = nextEl;
    }
    nextEl = nextEl.nextElementSibling;
  }

  return { first, last };
}

/**
 * 判断元素是否为 section 内容
 */
function isSectionContent(el: Element): boolean {
  return [
    'cv-field',
    'cv-field-inline',
    'cv-field-grid',
    'cv-section-desc',
    'cv-account-list',
    'cv-nai-advanced-block',
  ].some(className => el.classList.contains(className));
}

/**
 * 根据滚动容器位置更新当前 section
 */
function updateCurrentSection(): void {
  const container = scrollContainer.value;
  if (!container || sections.value.length === 0) {
    currentSection.value = '';
    return;
  }

  const markerTop = container.getBoundingClientRect().top + container.clientHeight * 0.2;
  currentSection.value = findActiveSection(markerTop).title;
}

/**
 * 查找滚动定位线对应的 section
 */
function findActiveSection(markerTop: number): SectionInfo {
  return (
    sections.value.findLast(section => section.element.getBoundingClientRect().top <= markerTop) ?? sections.value[0]
  );
}

/**
 * 切换 section 菜单显示状态
 */
function toggleSectionMenu(): void {
  showSectionMenu.value = !showSectionMenu.value;
}

/**
 * 滚动到指定 section
 */
function scrollToSection(section: SectionInfo): void {
  currentSection.value = section.title;
  section.element.scrollIntoView({ behavior: 'smooth', block: 'start' });
  showSectionMenu.value = false;
}

watch(activeTab, () => {
  nextTick(() => {
    showSectionMenu.value = false;
    scanSections();
  });
});

onMounted(() => {
  nextTick(() => {
    scanSections();
  });
});

useEventListener(scrollContainer, 'scroll', updateCurrentSection, { passive: true });
</script>

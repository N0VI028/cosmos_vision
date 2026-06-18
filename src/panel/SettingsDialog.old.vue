<template>
  <Dialog
    v-model:visible="visible"
    modal
    dismissable-mask
    :show-header="false"
    :style="dialogStyle"
    :content-style="contentStyle"
    :pt="{
      mask: {
        style: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100dvw', height: '100dvh' },
      },
      root: { class: 'cosmos-vision-root cv-dialog', style: { overflow: 'hidden' } },
    }"
    @show="resetActiveTab"
  >
    <div class="cv-shell">
      <aside class="cv-sidebar" :class="{ 'cv-sidebar--collapsed': collapsed }">
        <div class="cv-brand">
          <span class="cv-brand-text" title="CosmosVision">
            <span class="cv-brand-first">C</span><span class="cv-brand-rest">osmosVision</span>
          </span>
        </div>

        <button
          type="button"
          class="cv-icon-btn cv-brand-toggle"
          :title="collapsed ? '展开' : '折叠'"
          :aria-label="collapsed ? '展开侧边栏' : '折叠侧边栏'"
          @click="toggleCollapsed"
        >
          <i :class="collapsed ? 'fa-solid fa-chevron-right' : 'fa-solid fa-chevron-left'" />
        </button>

        <nav class="cv-nav">
          <button
            v-for="item in NAV_ITEMS"
            :key="item.value"
            type="button"
            class="cv-nav-item"
            :class="{ 'cv-nav-item--active': activeTab === item.value }"
            :title="collapsed ? item.label : undefined"
            :aria-label="item.label"
            :aria-current="activeTab === item.value ? 'page' : undefined"
            @click="activeTab = item.value"
          >
            <i class="cv-nav-icon" :class="item.icon" />
            <span class="cv-nav-label">{{ item.label }}</span>
          </button>
        </nav>

        <div class="cv-darkpill" :class="{ 'cv-darkpill--collapsed': collapsed }">
          <div class="cv-darkpill-expanded">
            <button
              type="button"
              class="cv-pill-seg"
              :class="{ 'cv-pill-seg--active': !darkMode }"
              :aria-pressed="!darkMode"
              @click="settings.darkMode = false"
            >
              <i class="fa-solid fa-sun" />
              <span>Light</span>
            </button>
            <button
              type="button"
              class="cv-pill-seg"
              :class="{ 'cv-pill-seg--active': darkMode }"
              :aria-pressed="darkMode"
              @click="settings.darkMode = true"
            >
              <i class="fa-solid fa-moon" />
              <span>Dark</span>
            </button>
          </div>
          <button
            type="button"
            class="cv-icon-btn cv-darkpill-collapsed-btn"
            :title="darkModeTip"
            :aria-label="darkModeTip"
            @click="toggleDarkMode"
          >
            <i :class="darkMode ? 'fa-solid fa-sun' : 'fa-solid fa-moon'" />
          </button>
        </div>
      </aside>

      <section class="cv-main">
        <button type="button" class="cv-close" title="关闭" aria-label="关闭" @click="visible = false">
          <i class="fa-solid fa-xmark" />
        </button>
        <div class="cv-main-body" :class="{ 'cv-main-body--no-tabs': activeTab !== 'novelai' }">
          <MainTab v-if="activeTab === 'main'" />
          <NovelAITab v-else-if="activeTab === 'novelai'" sub-tab="api" />
          <PromptLlmTab v-else-if="activeTab === 'prompt-llm'" sub-tab="settings" />
        </div>
      </section>
    </div>
  </Dialog>
</template>

<script setup lang="ts">
import { useLocalStorage, useMediaQuery } from '@vueuse/core';

import MainTab from '@/panel/tabs/MainTab.vue';
import NovelAITab from '@/panel/tabs/NovelAITab.vue';
import PromptLlmTab from '@/panel/tabs/PromptLlmTab.vue';
import { useSettingsStore } from '@/store/settings';

/** 导航项 value 联合类型 */
type NavValue = 'main' | 'novelai' | 'prompt-llm';

/** 侧边栏导航项配置:value/label/icon */
const NAV_ITEMS = [
  { value: 'main', label: '主设置', icon: 'fa-solid fa-gear' },
  { value: 'novelai', label: 'NovelAI 设置', icon: 'fa-solid fa-image' },
  { value: 'prompt-llm', label: '提示词 LLM', icon: 'fa-solid fa-wand-magic-sparkles' },
] as const satisfies ReadonlyArray<{ value: NavValue; label: string; icon: string }>;

/** CosmosVision 设置弹窗:左侧侧边导航 + 右侧面板,折叠态写入 localStorage */
const visible = defineModel<boolean>('visible', { default: false });

const { settings } = useSettingsStore();

/** 桌面/移动响应式宽度切换,移动端本期不优化 */
const isMobile = useMediaQuery('(max-width: 66.6667em)');
const dialogStyle = computed(() =>
  isMobile.value ? { width: '95vw', height: '85vh' } : { width: '50.6667em', height: '40em', maxHeight: '80vh' },
);

/** Dialog 内容区清零自带 padding,把布局完全交给 .cv-shell */
const contentStyle = { padding: '0', overflow: 'hidden' } as const;

/** 当前激活导航项 */
const activeTab = ref<NavValue>('main');

/** 侧边栏折叠态,跨会话持久化到 localStorage */
const collapsed = useLocalStorage('cosmos-vision-sidebar-collapsed', false);

/** 翻转折叠态;ref 自动写回 localStorage */
function toggleCollapsed(): void {
  collapsed.value = !collapsed.value;
}

/** 深色模式状态:用于按钮图标/提示与 Pill 选中态判定 */
const darkMode = computed(() => settings.darkMode);
const darkModeTip = computed(() => (darkMode.value ? '切换到浅色模式' : '切换到深色模式'));

/** 每次弹窗打开回到主设置 */
function resetActiveTab(): void {
  activeTab.value = 'main';
}

/** 翻转深色模式,deep watcher 自动持久化到 extension_settings */
function toggleDarkMode(): void {
  settings.darkMode = !settings.darkMode;
}
</script>

<style scoped>
/* 容器:水平 flex,占满 Dialog 内容区;集中声明视觉 token */
.cv-shell {
  /* 形状语言:整体方块化,卡片仅留极小圆角,纯扁平无阴影 */
  --cv-radius: 0.1333em;
  --cv-radius-lg: 0.2667em;
  --cv-gap-card: 0.8em;
  --cv-card-bg: var(--p-content-background);
  --cv-main-bg: color-mix(in srgb, var(--p-content-background) 96%, var(--p-text-color));
  --cv-card-shadow: none;
  --cv-aside-width: 6em;

  display: flex;
  flex-direction: row;
  height: 100%;
  min-height: 24em;
}

/* 侧边栏:展开 12.5333em,折叠 3.7333em,自身竖向 flex */
.cv-sidebar {
  position: relative;
  flex: 0 0 12.5333em;
  width: 12.5333em;
  min-width: 12.5333em;
  display: flex;
  flex-direction: column;
  background: var(--p-content-background);
  border-right: var(--cv-border-width) solid var(--p-content-border-color);
  padding: 0 var(--cv-space-xl) var(--cv-space-3xl);
  gap: var(--cv-space-lg);
  box-sizing: border-box;
  transition:
    flex-basis 0.3s cubic-bezier(0.4, 0, 0.2, 1),
    width 0.3s cubic-bezier(0.4, 0, 0.2, 1),
    min-width 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.cv-sidebar--collapsed {
  flex-basis: 3.7333em;
  width: 3.7333em;
  min-width: 3.7333em;
  padding: 0 var(--cv-space-xl) var(--cv-space-3xl);
}

/* 品牌区 */
.cv-brand {
  height: 3.4667em;
  margin: 0 calc(var(--cv-space-xl) * -1);
  padding: 0 var(--cv-space-7xl);
  display: flex;
  align-items: center;
  box-sizing: border-box;
  transition: padding 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.cv-sidebar--collapsed .cv-brand {
  margin: 0 calc(var(--cv-space-xl) * -1);
  padding: 0 var(--cv-space-7xl);
  justify-content: flex-start;
}

.cv-brand-text {
  font-size: calc(var(--mainFontSize) * 0.95);
  font-weight: 600;
  color: var(--p-text-color);
  letter-spacing: 0.01em;
  user-select: none;
  white-space: nowrap;
  overflow: hidden;
  display: flex;
  align-items: center;
}

.cv-brand-first {
  flex-shrink: 0;
}

.cv-brand-rest {
  opacity: 1;
  max-width: 8em;
  display: inline-block;
  white-space: nowrap;
  overflow: hidden;
  transition:
    opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1),
    max-width 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.cv-sidebar--collapsed .cv-brand-rest {
  opacity: 0;
  max-width: 0;
}

/* 通用图标按钮:折叠/展开 + 折叠态深色切换共用 */
.cv-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.8667em;
  height: 1.8667em;
  border-radius: var(--cv-radius);
  color: var(--p-text-muted-color);
  cursor: pointer;
  flex-shrink: 0;
}

.cv-icon-btn:hover {
  background: var(--p-list-option-focus-background);
  color: var(--p-text-color);
}

/* 折叠按钮:极小圆形,位于品牌区下边线与侧边栏右边线交界处 */
.cv-brand-toggle {
  position: absolute;
  right: calc(var(--cv-space-lg) * -1);
  top: var(--cv-space-11xl);
  width: 1.0667em;
  height: 1.0667em;
  border-radius: 50% !important;
  background: var(--p-content-background);
  color: var(--p-content-border-color);
  border: var(--cv-border-width) solid var(--p-content-border-color);
  box-shadow: none;
  z-index: 20;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.cv-brand-toggle:hover {
  background: var(--p-list-option-focus-background);
  color: var(--p-text-color);
  border-color: var(--p-content-border-color);
  transform: none;
  box-shadow: none;
}

.cv-brand-toggle i {
  font-size: calc(var(--mainFontSize) * 0.5) !important;
  font-weight: 900;
  line-height: 1;
}

/* 导航列表:占据中部剩余空间 */
.cv-nav {
  display: flex;
  flex-direction: column;
  gap: var(--cv-space-xxs);
  flex: 1 1 auto;
  padding-top: var(--cv-space-md);
  overflow-y: auto;
}

/* 导航项:实心方块激活态,无左侧竖条 */
.cv-nav-item {
  position: relative;
  display: flex;
  align-items: center;
  padding: var(--cv-space-lg-plus) var(--cv-space-2xl);
  border-radius: var(--cv-radius);
  color: var(--p-text-muted-color);
  cursor: pointer;
  text-align: left;
  font-size: calc(var(--mainFontSize) * 0.875);
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  height: 2.4em;
  box-sizing: border-box;
  transition:
    background 0.2s,
    color 0.2s;
}

.cv-nav-item:hover {
  background: var(--p-list-option-focus-background);
  color: var(--p-text-color);
}

.cv-nav-item--active {
  background: var(--p-primary-color);
  color: var(--p-primary-contrast-color);
}

.cv-nav-item--active:hover {
  background: var(--p-primary-color);
  color: var(--p-primary-contrast-color);
}

.cv-nav-icon {
  font-size: calc(var(--mainFontSize) * 0.95);
  width: 1em;
  text-align: center;
  flex-shrink: 0;
}

.cv-nav-label {
  flex: 1 1 auto;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-left: var(--cv-space-xl);
  opacity: 1;
  transition:
    opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1),
    margin-left 0.2s cubic-bezier(0.4, 0, 0.2, 1),
    max-width 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  max-width: 8em;
}

.cv-sidebar--collapsed .cv-nav-label {
  opacity: 0;
  max-width: 0;
  margin-left: 0;
}

/* 底部深色 Pill:展开态横向双档,折叠态居中单按钮;方角化 */
.cv-darkpill {
  position: relative;
  display: flex;
  align-items: center;
  border-radius: var(--cv-radius-lg);
  background: var(--p-list-option-focus-background);
  margin-top: var(--cv-space-sm);
  padding: var(--cv-space-sm);
  height: 2.1333em;
  box-sizing: border-box;
  transition:
    background 0.3s cubic-bezier(0.4, 0, 0.2, 1),
    padding 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.cv-darkpill--collapsed {
  background: transparent;
  padding: var(--cv-space-sm) 0;
}

.cv-darkpill-expanded {
  display: flex;
  width: 100%;
  gap: var(--cv-space-xxs);
  opacity: 1;
  overflow: hidden;
  max-width: 12em;
  transition:
    opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1),
    max-width 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.cv-darkpill--collapsed .cv-darkpill-expanded {
  opacity: 0;
  max-width: 0;
  pointer-events: none;
}

.cv-darkpill-collapsed-btn {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.cv-darkpill--collapsed .cv-darkpill-collapsed-btn {
  opacity: 1;
  pointer-events: auto;
}

.cv-pill-seg {
  flex: 1 1 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--cv-space-md);
  padding: var(--cv-space-sm) var(--cv-space-lg);
  border-radius: var(--cv-radius);
  font-size: calc(var(--mainFontSize) * 0.8);
  color: var(--p-text-muted-color);
  cursor: pointer;
  white-space: nowrap;
}

.cv-pill-seg:hover {
  color: var(--p-text-color);
}

.cv-pill-seg--active {
  background: var(--p-primary-color);
  color: var(--p-primary-contrast-color);
}

.cv-pill-seg--active:hover {
  color: var(--p-primary-contrast-color);
}

/* 主内容区:relative 给关闭按钮做定位锚点;浅灰底承托卡片 */
.cv-main {
  position: relative;
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--cv-main-bg);
}

.cv-close {
  position: absolute;
  top: var(--cv-space-lg);
  right: var(--cv-space-3xl);
  width: 1.8667em;
  height: 1.8667em;
  border-radius: var(--cv-radius);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--p-text-muted-color);
  cursor: pointer;
  z-index: 100;
}

.cv-close:hover {
  background: var(--p-list-option-focus-background);
  color: var(--p-text-color);
}

.cv-main-body {
  flex: 1 1 auto;
  padding: var(--cv-space-4xl) var(--cv-space-6xl);
  overflow-y: auto;
}

.cv-main-body--no-tabs {
  padding-top: var(--cv-space-12xl);
}
</style>

<style>
/**
 * 跨组件共用的布局/卡片/字段类:不能放在 scoped 块里
 * (子组件 MainTab/NovelAITab 是独立 scope,scoped 选择器拿不到 [data-v-xxx])。
 * 仍依赖 .cv-shell 节点声明的 --cv-* 自定义属性继承到子组件。
 */

/** 双栏页面容器:左侧锚点 + 右侧滚动内容 */
.cv-page-container {
  display: flex;
  flex-direction: row;
  gap: var(--cv-space-7xl);
  align-items: flex-start;
}

/** 左侧锚点列:sticky 跟随滚动 */
.cv-page-aside {
  flex: 0 0 var(--cv-aside-width);
  position: sticky;
  top: var(--cv-aside-top, var(--cv-space-4xl));
  z-index: 20;
  display: flex;
  flex-direction: column;
  gap: var(--cv-space-xxs);
  margin-top: var(--cv-space-lg);
}

/** 锚点链接:Myna UI 风格,仅文字色高亮,无背景色块 */
.cv-anchor-link {
  padding: var(--cv-space-md) var(--cv-space-lg);
  font-size: calc(var(--mainFontSize) * 0.85);
  color: var(--p-text-muted-color);
  cursor: pointer;
  text-align: left;
  border: none;
  background: transparent;
  border-radius: var(--cv-radius);
}

.cv-anchor-link:hover {
  color: var(--p-text-color);
}

.cv-anchor-link--active {
  color: var(--p-primary-color);
  font-weight: 600;
}

/** 右侧内容列:卡片堆叠 */
.cv-page-content {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--cv-gap-card);
}

/** 卡片:扁平变量描边 + 极小圆角,无阴影,标题与正文一体 */
.cv-card {
  background: var(--cv-card-bg);
  border: var(--cv-border-width) solid var(--p-content-border-color);
  border-radius: var(--cv-radius-lg);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/** 卡片标题:通过 pseudo-element 实现不延伸到边距的底部分割线 */
.cv-card-title {
  position: relative;
  padding: var(--cv-space-4xl) var(--cv-space-5xl) var(--cv-space-3xl);
  font-size: calc(var(--mainFontSize) * 0.95);
  font-weight: 700;
  color: var(--p-text-color);
  letter-spacing: 0.01em;
}

.cv-card-title::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: var(--cv-space-5xl);
  right: var(--cv-space-5xl);
  height: 0.0667em;
  background-color: var(--p-content-border-color);
}

/** 卡片正文容器 */
.cv-card-body {
  display: flex;
  flex-direction: column;
}

/** 字段:去除非必要的顶部分割线 */
.cv-field {
  display: flex;
  flex-direction: column;
  gap: var(--cv-space-md);
  padding: var(--cv-space-3xl) var(--cv-space-5xl);
  font-size: calc(var(--mainFontSize) * 0.85);
}

.cv-field > span {
  color: var(--p-text-muted-color);
  font-size: calc(var(--mainFontSize) * 0.95);
}

/** 字段内 PrimeVue 控件默认撑满,避免每处显式写 w-full */
.cv-field > .p-inputtext,
.cv-field > .p-textarea,
.cv-field > .p-select,
.cv-field > .p-password,
.cv-field > .p-inputnumber {
  width: 100%;
}

.cv-field > .p-password > .p-inputtext {
  width: 100%;
}

/** 内联字段:去除非必要的顶部分割线 */
.cv-field-inline {
  display: flex;
  align-items: center;
  gap: var(--cv-space-xl);
  padding: var(--cv-space-3xl) var(--cv-space-5xl);
  font-size: calc(var(--mainFontSize) * 0.85);
  color: var(--p-text-muted-color);
}

/** 字段栅格:去除非必要的分割线 */
.cv-field-grid {
  display: grid;
  grid-template-columns: repeat(var(--cv-grid-cols, 2), minmax(0, 1fr));
}

.cv-field-grid > .cv-field,
.cv-field-grid > .cv-field-inline {
  border: none;
}

/** 卡片堆叠容器 */
.cv-stack {
  display: flex;
  flex-direction: column;
  gap: var(--cv-gap-card);
}
</style>

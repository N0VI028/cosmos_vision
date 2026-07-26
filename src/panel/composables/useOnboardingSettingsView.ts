import { nextTick, type Ref } from 'vue';

import type { TutorialSettingsScene, TutorialStep } from '@/panel/components/onboarding/tutorial-steps';

type SettingsNavigationTab = TutorialSettingsScene['tab'] | 'prompt-profiles';
type SubTabSetters = Record<TutorialSettingsScene['tab'], (value: string) => void>;

export interface SettingsViewTypes {
  activeTab: SettingsNavigationTab;
  mainSubTab: string;
  novelaiSubTab: string;
  comfyuiSubTab: string;
  promptLlmSubTab: string;
  promptProfilesSubTab: string;
}

interface TutorialViewSnapshot extends SettingsViewTypes {
  visible: boolean;
  scrollTop: number;
}

export interface TutorialSettingsViewOptions<T extends SettingsViewTypes> {
  visible: Ref<boolean>;
  activeTab: Ref<T['activeTab']>;
  mainSubTab: Ref<T['mainSubTab']>;
  novelaiSubTab: Ref<T['novelaiSubTab']>;
  comfyuiSubTab: Ref<T['comfyuiSubTab']>;
  promptLlmSubTab: Ref<T['promptLlmSubTab']>;
  promptProfilesSubTab: Ref<T['promptProfilesSubTab']>;
  scrollContainer: Ref<HTMLElement | null>;
  isTutorialActive: () => boolean;
}

export interface OnboardingSettingsViewController {
  capture: () => void;
  applyStep: (step: TutorialStep) => void;
  restore: () => void;
  handleDialogShow: () => boolean;
}

interface SettingsViewRuntime<T extends SettingsViewTypes> {
  options: TutorialSettingsViewOptions<T>;
  snapshot: TutorialViewSnapshot | null;
  pendingScrollTop: number | null;
  suppressNextShowReset: boolean;
  subTabSetters: SubTabSetters;
}

/**
 * 管理教程期间的设置页快照与临时导航
 * @param options 设置页响应式状态
 * @returns 快照、场景切换和恢复方法
 */
export function useOnboardingSettingsView<T extends SettingsViewTypes>(
  options: TutorialSettingsViewOptions<T>,
): OnboardingSettingsViewController {
  const runtime = createSettingsViewRuntime(options);
  return {
    capture: () => captureSettingsView(runtime),
    applyStep: step => applyTutorialStep(runtime, step),
    restore: () => restoreSettingsView(runtime),
    handleDialogShow: () => handleSettingsDialogShow(runtime),
  };
}

/** 创建设置页教程运行上下文 */
function createSettingsViewRuntime<T extends SettingsViewTypes>(
  options: TutorialSettingsViewOptions<T>,
): SettingsViewRuntime<T> {
  return {
    options,
    snapshot: null,
    pendingScrollTop: null,
    suppressNextShowReset: false,
    subTabSetters: createSubTabSetters(options),
  };
}

/** 创建各主页签对应的子页签写入器 */
function createSubTabSetters<T extends SettingsViewTypes>(options: TutorialSettingsViewOptions<T>): SubTabSetters {
  return {
    main: value => (options.mainSubTab.value = value as T['mainSubTab']),
    novelai: value => (options.novelaiSubTab.value = value as T['novelaiSubTab']),
    comfyui: value => (options.comfyuiSubTab.value = value as T['comfyuiSubTab']),
    'prompt-llm': value => (options.promptLlmSubTab.value = value as T['promptLlmSubTab']),
    'prompt-profiles': value => (options.promptProfilesSubTab.value = value as T['promptProfilesSubTab']),
  };
}

/** 保存教程开始前的设置视图 */
function captureSettingsView<T extends SettingsViewTypes>(runtime: SettingsViewRuntime<T>): void {
  runtime.snapshot = readSettingsViewSnapshot(runtime.options);
}

/** 根据教程步骤切换设置页或聊天页 */
function applyTutorialStep<T extends SettingsViewTypes>(runtime: SettingsViewRuntime<T>, step: TutorialStep): void {
  if (step.scene.kind === 'chat') {
    runtime.options.visible.value = false;
    return;
  }
  if (step.scene.kind === 'settings') applySettingsScene(runtime, step.scene);
  showSettingsDialog(runtime);
}

/** 恢复教程开始前的设置视图 */
function restoreSettingsView<T extends SettingsViewTypes>(runtime: SettingsViewRuntime<T>): void {
  const target = runtime.snapshot;
  runtime.snapshot = null;
  if (!target) return;
  const wasVisible = runtime.options.visible.value;
  writeSettingsViewSnapshot(runtime.options, target);
  runtime.pendingScrollTop = target.scrollTop;
  runtime.suppressNextShowReset ||= target.visible && !wasVisible;
  runtime.options.visible.value = target.visible;
  if (target.visible && wasVisible) void applyPendingScroll(runtime);
}

/** 处理设置弹窗 show 事件并决定是否保留草稿 */
function handleSettingsDialogShow<T extends SettingsViewTypes>(runtime: SettingsViewRuntime<T>): boolean {
  const preserveDraft = runtime.options.isTutorialActive() || runtime.suppressNextShowReset;
  runtime.suppressNextShowReset = false;
  void applyPendingScroll(runtime);
  return preserveDraft;
}

/** 读取当前设置视图快照 */
function readSettingsViewSnapshot<T extends SettingsViewTypes>(
  options: TutorialSettingsViewOptions<T>,
): TutorialViewSnapshot {
  return {
    visible: options.visible.value,
    activeTab: options.activeTab.value,
    mainSubTab: options.mainSubTab.value,
    novelaiSubTab: options.novelaiSubTab.value,
    comfyuiSubTab: options.comfyuiSubTab.value,
    promptLlmSubTab: options.promptLlmSubTab.value,
    promptProfilesSubTab: options.promptProfilesSubTab.value,
    scrollTop: options.scrollContainer.value?.scrollTop ?? 0,
  };
}

/** 按快照恢复所有导航状态 */
function writeSettingsViewSnapshot<T extends SettingsViewTypes>(
  options: TutorialSettingsViewOptions<T>,
  target: TutorialViewSnapshot,
): void {
  options.activeTab.value = target.activeTab as T['activeTab'];
  options.mainSubTab.value = target.mainSubTab as T['mainSubTab'];
  options.novelaiSubTab.value = target.novelaiSubTab as T['novelaiSubTab'];
  options.comfyuiSubTab.value = target.comfyuiSubTab as T['comfyuiSubTab'];
  options.promptLlmSubTab.value = target.promptLlmSubTab as T['promptLlmSubTab'];
  options.promptProfilesSubTab.value = target.promptProfilesSubTab as T['promptProfilesSubTab'];
}

/** 应用设置类教程场景 */
function applySettingsScene<T extends SettingsViewTypes>(
  runtime: SettingsViewRuntime<T>,
  scene: TutorialSettingsScene,
): void {
  runtime.options.activeTab.value = scene.tab as T['activeTab'];
  runtime.subTabSetters[scene.tab](scene.subTab);
}

/** 显示设置弹窗且避免重置草稿 */
function showSettingsDialog<T extends SettingsViewTypes>(runtime: SettingsViewRuntime<T>): void {
  if (runtime.options.visible.value) return;
  runtime.suppressNextShowReset = true;
  runtime.options.visible.value = true;
}

/** 在渲染完成后恢复滚动位置 */
async function applyPendingScroll<T extends SettingsViewTypes>(runtime: SettingsViewRuntime<T>): Promise<void> {
  if (runtime.pendingScrollTop === null) return;
  await nextTick();
  const container = runtime.options.scrollContainer.value;
  if (!container) return;
  container.scrollTop = runtime.pendingScrollTop;
  runtime.pendingScrollTop = null;
}

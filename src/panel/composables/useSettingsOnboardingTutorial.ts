import { computed, reactive, watch, type ComputedRef } from 'vue';

import {
  useOnboardingSettingsView,
  type OnboardingSettingsViewController,
  type SettingsViewTypes,
  type TutorialSettingsViewOptions,
} from '@/panel/composables/useOnboardingSettingsView';
import { useOnboardingTutorial, type OnboardingTutorialController } from '@/panel/composables/useOnboardingTutorial';

type ViewOptions<T extends SettingsViewTypes> = Omit<TutorialSettingsViewOptions<T>, 'isTutorialActive'>;

/**
 * 编排设置页教程状态、场景切换与视图恢复
 * @param options 设置页响应式状态
 * @returns 模板可直接使用的教程控制器
 */
export function useSettingsOnboardingTutorial<T extends SettingsViewTypes>(options: ViewOptions<T>) {
  const tutorial = useOnboardingTutorial();
  const view = useOnboardingSettingsView({
    ...options,
    isTutorialActive: () => tutorial.isActive.value,
  });
  bindTutorialScene(tutorial, view);
  return createTemplateController(
    tutorial,
    view,
    computed(() => tutorial.steps.value.length),
  );
}

/** 监听步骤变化并同步设置页场景 */
function bindTutorialScene(tutorial: OnboardingTutorialController, view: OnboardingSettingsViewController): void {
  watch(
    tutorial.currentStep,
    step => {
      if (tutorial.isActive.value) view.applyStep(step);
    },
    { flush: 'sync' },
  );
}

/** 构建模板可直接读取的响应式控制器 */
function createTemplateController(
  tutorial: OnboardingTutorialController,
  view: OnboardingSettingsViewController,
  totalSteps: ComputedRef<number>,
) {
  return reactive({
    isActive: tutorial.isActive,
    selectedSource: tutorial.selectedSource,
    currentStep: tutorial.currentStep,
    stepNumber: tutorial.stepNumber,
    totalSteps,
    canPrevious: tutorial.canPrevious,
    canNext: tutorial.canNext,
    isLastStep: tutorial.isLastStep,
    start: () => startSettingsTutorial(tutorial, view),
    exit: () => exitSettingsTutorial(tutorial, view),
    next: () => nextSettingsTutorial(tutorial, view),
    previous: tutorial.previous,
    selectSource: tutorial.selectSource,
    handleDialogShow: view.handleDialogShow,
  });
}

/** 保存视图并启动教程 */
function startSettingsTutorial(tutorial: OnboardingTutorialController, view: OnboardingSettingsViewController): void {
  view.capture();
  tutorial.start();
  view.applyStep(tutorial.currentStep.value);
}

/** 停止教程并恢复设置视图 */
function exitSettingsTutorial(tutorial: OnboardingTutorialController, view: OnboardingSettingsViewController): void {
  tutorial.stop();
  view.restore();
}

/** 前进一页，末页完成并退出 */
function nextSettingsTutorial(tutorial: OnboardingTutorialController, view: OnboardingSettingsViewController): void {
  if (tutorial.next() === 'completed') exitSettingsTutorial(tutorial, view);
}

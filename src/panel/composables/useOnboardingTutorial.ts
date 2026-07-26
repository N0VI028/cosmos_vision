import { computed, ref, type ComputedRef, type Ref } from 'vue';

import {
  buildTutorialSteps,
  TUTORIAL_SELECTION_STEP,
  type TutorialSource,
  type TutorialStep,
} from '@/panel/components/onboarding/tutorial-steps';

export type TutorialNavigationResult = 'advanced' | 'blocked' | 'completed';

interface TutorialState {
  isActive: Ref<boolean>;
  selectedSource: Ref<TutorialSource | null>;
  stepIndex: Ref<number>;
  steps: ComputedRef<TutorialStep[]>;
  currentStep: ComputedRef<TutorialStep>;
  stepNumber: ComputedRef<number>;
  canPrevious: ComputedRef<boolean>;
  canNext: ComputedRef<boolean>;
  isLastStep: ComputedRef<boolean>;
}

export interface OnboardingTutorialController extends TutorialState {
  start: () => void;
  stop: () => void;
  selectSource: (source: TutorialSource) => void;
  previous: () => void;
  next: () => TutorialNavigationResult;
}

/**
 * 创建使用教程的纯运行状态
 * @returns 教程状态、导航边界与控制方法
 */
export function useOnboardingTutorial(): OnboardingTutorialController {
  const state = createTutorialState();
  return {
    ...state,
    start: () => startTutorial(state),
    stop: () => stopTutorial(state),
    selectSource: source => selectTutorialSource(state, source),
    previous: () => previousTutorialStep(state),
    next: () => nextTutorialStep(state),
  };
}

/** 创建教程响应式状态 */
function createTutorialState(): TutorialState {
  const isActive = ref(false);
  const selectedSource = ref<TutorialSource | null>(null);
  const stepIndex = ref(0);
  const steps = computed(() =>
    selectedSource.value ? buildTutorialSteps(selectedSource.value) : [TUTORIAL_SELECTION_STEP],
  );
  const currentStep = computed(() => steps.value[stepIndex.value] ?? TUTORIAL_SELECTION_STEP);
  return {
    isActive,
    selectedSource,
    stepIndex,
    steps,
    currentStep,
    stepNumber: computed(() => stepIndex.value + 1),
    canPrevious: computed(() => stepIndex.value > 0),
    canNext: computed(() => currentStep.value.id !== TUTORIAL_SELECTION_STEP.id || Boolean(selectedSource.value)),
    isLastStep: computed(() => Boolean(selectedSource.value) && stepIndex.value === steps.value.length - 1),
  };
}

/** 重置并启动教程 */
function startTutorial(state: TutorialState): void {
  state.selectedSource.value = null;
  state.stepIndex.value = 0;
  state.isActive.value = true;
}

/** 停止教程并清空临时选择 */
function stopTutorial(state: TutorialState): void {
  state.isActive.value = false;
  state.selectedSource.value = null;
  state.stepIndex.value = 0;
}

/**
 * 选择教程分支但不修改业务设置
 * @param state 教程响应式状态
 * @param source 教程图像来源
 */
function selectTutorialSource(state: TutorialState, source: TutorialSource): void {
  state.selectedSource.value = source;
  state.stepIndex.value = 0;
}

/** 返回上一步并限制首部边界 */
function previousTutorialStep(state: TutorialState): void {
  state.stepIndex.value = Math.max(0, state.stepIndex.value - 1);
}

/**
 * 前进或完成教程
 * @param state 教程响应式状态
 * @returns 当前导航结果
 */
function nextTutorialStep(state: TutorialState): TutorialNavigationResult {
  if (!state.canNext.value) return 'blocked';
  if (state.isLastStep.value) return 'completed';
  state.stepIndex.value += 1;
  return 'advanced';
}

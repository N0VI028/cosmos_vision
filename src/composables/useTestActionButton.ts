import { computed, type MaybeRefOrGetter, toValue } from 'vue';

/** 空闲态按钮文案与图标 */
export interface TestActionButtonIdleOptions {
  /** 空闲态按钮文案；可传 ref / computed / getter */
  label: MaybeRefOrGetter<string>;
  /** 空闲态图标 class，默认魔法棒 */
  icon?: string;
}

/**
 * 测试页主操作按钮：运行中统一切换为「终止测试」样式
 * @param isRunning 是否正在运行
 * @param idle 空闲态文案与图标
 * @returns 绑定到 Button 的 label / icon / severity / outlined
 */
export function useTestActionButton(isRunning: MaybeRefOrGetter<boolean>, idle: TestActionButtonIdleOptions) {
  const label = computed(() => (toValue(isRunning) ? '终止测试' : toValue(idle.label)));
  const icon = computed(() => {
    if (toValue(isRunning)) return 'fa-solid fa-stop';
    return idle.icon ?? 'fa-solid fa-wand-magic-sparkles';
  });
  const severity = computed(() => (toValue(isRunning) ? 'danger' : undefined));
  const outlined = computed(() => toValue(isRunning));

  return { label, icon, severity, outlined };
}

import { computed, ref } from 'vue';

/** 进行中的生图请求计数（模块级内存态，并发请求累加） */
const runningCount = ref(0);

/** 是否存在进行中的生图请求（悬浮球主按钮红点提示） */
export const hasRunningImageGeneration = computed(() => runningCount.value > 0);

/** 标记一次生图请求开始：计数加一 */
export function beginImageGeneration(): void {
  runningCount.value += 1;
}

/** 标记一次生图请求结束：计数减一 */
export function endImageGeneration(): void {
  runningCount.value -= 1;
}

import { useElementBounding, useMediaQuery } from '@vueuse/core';
import { computed, onMounted, ref } from 'vue';

/**
 * 壳级 Dialog 共享尺寸与定位（设置窗 / LLM 请求监视窗等全屏业务弹窗统一使用）
 *
 * - 桌面端（>87.5em）：40vw × 70vh（上限 80vh）；
 * - 窄屏（≤87.5em）：弹窗 fixed 对齐宿主 #chat 矩形（#chat 为滚动容器不可直接挂载子元素），
 *   矩形响应式跟随窗口尺寸；若未能获取 #chat 元素则回退 95vw × 95vh 全屏居中。
 *
 * 断点与侧栏宽度（--cv-sidebar-width 窄屏 2.6em 图标栏）同源，见 settings-dialog.css。
 */
export function useShellDialogStyle() {
  const isMobile = useMediaQuery('(max-width: 87.5em)');
  const chatEl = ref<HTMLElement | null>(null);
  const rect = useElementBounding(chatEl);

  onMounted(() => {
    chatEl.value = document.getElementById('chat');
  });

  const dialogStyle = computed(() => {
    if (!isMobile.value) {
      return { width: '40vw', height: '70vh', maxHeight: '80vh' };
    }
    if (!chatEl.value) {
      return { width: '95vw', height: '95vh' };
    }
    return {
      position: 'fixed',
      top: `${rect.top.value}px`,
      left: `${rect.left.value}px`,
      width: `${rect.width.value}px`,
      height: `${rect.height.value}px`,
      zIndex: 100000,
    };
  });

  return { isMobile, dialogStyle };
}

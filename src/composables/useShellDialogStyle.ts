import { useMediaQuery } from '@vueuse/core';
import { computed } from 'vue';

/**
 * 壳级 Dialog 共享尺寸（设置窗 / LLM 请求监视窗等全屏业务弹窗统一使用）
 *
 * 桌面端（>87.5em）：40vw × 70vh（上限 80vh）；窄屏（≤87.5em）：95vw × 95vh 全屏化。
 * 断点与侧栏宽度（--cv-sidebar-width 窄屏 2.6em 图标栏）同源，见 settings-dialog.css。
 */
export function useShellDialogStyle() {
  const isMobile = useMediaQuery('(max-width: 87.5em)');

  const dialogStyle = computed(() =>
    isMobile.value ? { width: '95vw', height: '95vh' } : { width: '40vw', height: '70vh', maxHeight: '80vh' },
  );

  return { isMobile, dialogStyle };
}

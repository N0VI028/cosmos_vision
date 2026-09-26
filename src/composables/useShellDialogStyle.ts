import { useMediaQuery } from '@vueuse/core';
import { computed } from 'vue';

/**
 * 壳级 Dialog 共享尺寸与定位（设置窗 / LLM 会话监视窗等全屏业务弹窗统一使用）
 *
 * - 桌面端（>87.5em）：50vw × 80vh（上限 95vh）；
 * - 窄屏（≤87.5em）：高 z-index 浮窗覆盖整个酒馆界面，顶部让位 ST 顶栏
 *   （--topBarBlockSize 为 ST 宿主 :root 变量，随字号设置缩放；ST 移动端抽屉同款公式），
 *   底部预留 iPhone home 条安全区。
 *
 * 断点与侧栏宽度（--cv-sidebar-width 窄屏 2.6em 图标栏）同源，见 settings-dialog.css。
 */
export function useShellDialogStyle() {
  const isMobile = useMediaQuery('(max-width: 87.5em)');

  const dialogStyle = computed(() => {
    if (!isMobile.value) {
      return { width: '50vw', height: '80vh', maxHeight: '95vh' };
    }
    return {
      // 移动端用 absolute：fixed 在部分移动端布局下不可见
      position: 'absolute',
      top: 'var(--topBarBlockSize)',
      left: '0',
      width: '100dvw',
      height: 'calc(100dvh - var(--topBarBlockSize) - env(safe-area-inset-bottom, 0px))',
      maxHeight: '99dvh !important',
      zIndex: 100000,
    };
  });

  return { isMobile, dialogStyle };
}

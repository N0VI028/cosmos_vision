import { preventInlineEventBubbling, removeInlineVueHost } from '@/composables/inlineImageDom';
import {
  getSelectionShellContainer,
  layoutSelectionShell,
} from '@/composables/inlineParagraphSelection';

export interface SelectionShellController {
  paint: (paragraphs: HTMLElement[], createToolbar: () => HTMLElement) => void;
  clear: (paragraphs: HTMLElement[]) => void;
}

/**
 * 创建连续段落整体选区壳控制器
 * 用包围盒蒙版覆盖选区，滚动与缩放时自动重排
 * @returns 选区壳绘制与清理接口
 */
export function createSelectionShellController(): SelectionShellController {
  let selectionShell: HTMLElement | null = null;
  let stopSelectionLayoutSync: (() => void) | null = null;

  /**
   * 绘制整体选区蒙版并挂载工具条
   * @param paragraphs 选中段落
   * @param createToolbar 创建工具条
   */
  function paint(paragraphs: HTMLElement[], createToolbar: () => HTMLElement): void {
    clear(paragraphs);
    if (!paragraphs.length) return;
    const container = getSelectionShellContainer(paragraphs);
    if (!container) return;
    for (const p of paragraphs) p.classList.add('cv-inline-selected');
    const shell = document.createElement('div');
    shell.className = 'cv-inline-selection-shell';
    preventInlineEventBubbling(shell);
    shell.appendChild(createToolbar());
    container.appendChild(shell);
    selectionShell = shell;
    const syncLayout = () => {
      if (selectionShell) layoutSelectionShell(selectionShell, paragraphs, container);
    };
    syncLayout();
    stopSelectionLayoutSync = bindSelectionLayoutSync(syncLayout);
  }

  /**
   * 清理选区 class 与蒙版壳
   * @param paragraphs 当前选区段落
   */
  function clear(paragraphs: HTMLElement[]): void {
    stopSelectionLayoutSync?.();
    stopSelectionLayoutSync = null;
    for (const p of paragraphs) p.classList.remove('cv-inline-selected');
    if (selectionShell) {
      removeInlineVueHost(selectionShell);
      selectionShell = null;
    }
  }

  return { paint, clear };
}

/**
 * 绑定滚动与窗口尺寸变化时的选区壳重排
 * @param syncLayout 布局同步函数
 * @returns 清理函数
 */
function bindSelectionLayoutSync(syncLayout: () => void): () => void {
  window.addEventListener('scroll', syncLayout, true);
  window.addEventListener('resize', syncLayout);
  return () => {
    window.removeEventListener('scroll', syncLayout, true);
    window.removeEventListener('resize', syncLayout);
  };
}

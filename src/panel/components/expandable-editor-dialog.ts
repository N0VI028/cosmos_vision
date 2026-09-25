import './expandable-editor-dialog.css';

/**
 * 全屏编辑大窗共享尺寸：近全屏，四周留呼吸边距
 */
export const EXPANDABLE_DIALOG_STYLE = {
  width: 'min(56rem, calc(100vw - 4rem))',
  height: 'min(85dvh, 48rem)',
  maxHeight: 'calc(100dvh - 2rem)',
  maxWidth: 'calc(100vw - 2rem)',
} as const;

/**
 * 全屏编辑大窗共享内容区样式：去掉默认内边距，交给内部布局控制
 */
export const EXPANDABLE_DIALOG_CONTENT_STYLE = { padding: '0', overflow: 'hidden', height: '100%' } as const;

/**
 * 全屏编辑大窗共享 PT：内容区纵向占满语义类
 */
export const EXPANDABLE_DIALOG_PT = { content: { class: 'cv-expandable-dialog-content' } } as const;

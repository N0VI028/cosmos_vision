import type { ImageSource } from '@/constants/comfyui';
import type { CharacterPromptItem } from '@/constants/novelai';
import type { ImagePromptVibeRef } from '@/constants/novelai-vibe';
import type { ComfyUIRequestSnapshot } from '@/services/comfyui/workflow';
import type { NovelAIFinalPrompts } from '@/services/novelai/api';
import type { NovelAIVibeParameters } from '@/services/novelai/vibe-types';

/** 内联生图提示词快照 */
export interface InlinePromptSnapshot {
  positivePrompt: string;
  negativePrompt: string;
  imageSource?: ImageSource;
  novelai?: NovelAIFinalPrompts;
  comfyui?: ComfyUIRequestSnapshot;
}

export interface InlineLightboxActions {
  onDownload?: () => void | Promise<void>;
}

/**
 * 克隆为 IndexedDB 可结构化保存的纯提示词快照
 * @param snapshot 原始提示词快照
 * @returns 去除响应式代理引用后的快照
 */
export function cloneInlinePromptSnapshot(snapshot: InlinePromptSnapshot): InlinePromptSnapshot {
  return {
    positivePrompt: snapshot.positivePrompt,
    negativePrompt: snapshot.negativePrompt,
    imageSource: snapshot.imageSource,
    novelai: snapshot.novelai ? cloneNovelAIFinalPrompts(snapshot.novelai) : undefined,
    comfyui: snapshot.comfyui ? cloneComfyUIRequestSnapshot(snapshot.comfyui) : undefined,
  };
}

/**
 * 克隆 NovelAI 最终提示词
 * @param prompts 原始 NovelAI 提示词
 * @returns 纯对象提示词
 */
function cloneNovelAIFinalPrompts(prompts: NovelAIFinalPrompts): NovelAIFinalPrompts {
  return {
    positivePrompt: prompts.positivePrompt,
    negativePrompt: prompts.negativePrompt,
    useCharacterCoords: prompts.useCharacterCoords,
    characterPrompts: prompts.characterPrompts?.map(cloneCharacterPromptItem),
    vibeReferences: prompts.vibeParameters ? undefined : prompts.vibeReferences?.map(cloneImagePromptVibeRef),
    vibeParameters: prompts.vibeParameters ? cloneNovelAIVibeParameters(prompts.vibeParameters) : undefined,
  };
}

/**
 * 克隆单个 NovelAI 角色提示词
 * @param item 原始角色提示词
 * @returns 纯对象角色提示词
 */
function cloneCharacterPromptItem(item: CharacterPromptItem): CharacterPromptItem {
  return {
    positivePrompt: item.positivePrompt,
    negativePrompt: item.negativePrompt,
    position: { x: item.position.x, y: item.position.y },
  };
}

/**
 * 克隆 NovelAI vibe 引用
 * @param vibe 原始 vibe 引用
 * @returns 纯对象 vibe 引用
 */
function cloneImagePromptVibeRef(vibe: ImagePromptVibeRef): ImagePromptVibeRef {
  return {
    id: vibe.id,
    sourceHash: vibe.sourceHash,
    enabled: vibe.enabled,
    referenceStrength: vibe.referenceStrength,
    informationExtracted: vibe.informationExtracted,
    temporary: vibe.temporary,
  };
}

/**
 * 克隆 NovelAI 官方 vibe 参数数组
 * @param parameters 原始 vibe 参数
 * @returns 纯数组 vibe 参数
 */
function cloneNovelAIVibeParameters(parameters: NovelAIVibeParameters): NovelAIVibeParameters {
  return {
    reference_image_multiple: [...parameters.reference_image_multiple],
    reference_strength_multiple: [...parameters.reference_strength_multiple],
    reference_information_extracted_multiple: [...parameters.reference_information_extracted_multiple],
  };
}

/**
 * 克隆 ComfyUI 请求快照
 * @param snapshot 原始 ComfyUI 快照
 * @returns 纯对象 ComfyUI 快照
 */
function cloneComfyUIRequestSnapshot(snapshot: ComfyUIRequestSnapshot): ComfyUIRequestSnapshot {
  return {
    ...snapshot,
    loras: snapshot.loras.map(lora => ({ name: lora.name, strength: lora.strength })),
  };
}

/**
 * 处理内联生成的图片点击事件
 * @param e 点击事件对象
 * @param img 图片元素
 * @param wrap 外层容器元素
 * @param isRuntimeEnabled 是否启用运行时
 * @param snapshot 提示词快照
 */
export function handleInlineImageClick(
  e: MouseEvent,
  img: HTMLImageElement,
  wrap: HTMLElement,
  isRuntimeEnabled: () => boolean,
  snapshot?: InlinePromptSnapshot,
  actions?: InlineLightboxActions,
): void {
  if (!isRuntimeEnabled()) return;
  e.stopPropagation();
  const isTouch = window.matchMedia('(hover: none)').matches;
  if (isTouch && !wrap.classList.contains('cv-inline-img-active')) {
    wrap.classList.add('cv-inline-img-active');
    ensureInlineImageOutsideDismiss();
    return;
  }
  openInlineImageLightbox(img.src, snapshot, actions);
  if (isTouch) wrap.classList.remove('cv-inline-img-active');
}

/** 是否已绑定移动端外部点击收起监听 */
let inlineImageOutsideDismissBound = false;

/**
 * 懒绑定全局监听: 移动端点击图片外部时收起段落图片操作 UI
 */
function ensureInlineImageOutsideDismiss(): void {
  if (inlineImageOutsideDismissBound) return;
  inlineImageOutsideDismissBound = true;
  // 捕获阶段监听,不受内联控件 stopPropagation 影响
  document.addEventListener('pointerdown', dismissActiveInlineImages, true);
}

/**
 * 收起所有点击落在图片容器之外的激活态操作 UI
 * @param event 指针按下事件
 */
function dismissActiveInlineImages(event: PointerEvent): void {
  const target = event.target as Node | null;
  document.querySelectorAll<HTMLElement>('.cv-inline-img-wrap.cv-inline-img-active').forEach(wrap => {
    if (!target || !wrap.contains(target)) wrap.classList.remove('cv-inline-img-active');
  });
  // 无激活项时解绑,避免常驻监听
  if (!document.querySelector('.cv-inline-img-wrap.cv-inline-img-active')) {
    document.removeEventListener('pointerdown', dismissActiveInlineImages, true);
    inlineImageOutsideDismissBound = false;
  }
}

/**
 * 复制文本并更新按钮状态
 * @param text 复制的文本
 * @param btn 触发复制的按钮
 */
async function copyText(text: string, btn: HTMLElement): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    markCopyButtonSuccess(btn);
  } catch {
    toastr.error('复制失败');
  }
}

/**
 * 标记复制按钮成功状态
 * @param btn 触发复制的按钮
 */
function markCopyButtonSuccess(btn: HTMLElement): void {
  const originalHTML = btn.innerHTML;
  btn.innerHTML = '<i class="fa-solid fa-check"></i> 已复制';
  btn.classList.add('copied');
  window.setTimeout(() => {
    btn.innerHTML = originalHTML;
    btn.classList.remove('copied');
  }, 1500);
}

/**
 * 创建 Lightbox 的 DOM 结构
 * @param src 图片地址
 * @param snapshot 提示词快照
 * @returns Lightbox 根元素
 */
function createLightboxDOM(src: string, snapshot?: InlinePromptSnapshot, actions?: InlineLightboxActions): HTMLElement {
  const overlay = document.createElement('div');
  overlay.className = 'cv-lightbox-overlay';
  overlay.innerHTML = buildLightboxMarkup(src, snapshot, actions);
  return overlay;
}

/**
 * 构建 Lightbox HTML
 * @param src 图片地址
 * @param snapshot 提示词快照
 * @returns HTML 字符串
 */
function buildLightboxMarkup(src: string, snapshot?: InlinePromptSnapshot, actions?: InlineLightboxActions): string {
  return `
    ${buildLightboxToolbarMarkup(actions)}
    <div class="cv-lightbox-wrapper">
      <div class="cv-lightbox-img-box">
        <img class="cv-lightbox-preview-img" src="${escapeHtml(src)}" alt="放大图片" draggable="false" />
      </div>
      <div class="cv-lightbox-info cv-info-collapsed">
        ${buildLightboxHeaderMarkup()}
        <div class="cv-lightbox-info-body">
          ${buildPromptGroupMarkup('pos', '正向提示词', snapshot?.positivePrompt || '无正向提示词')}
          ${buildPromptGroupMarkup('neg', '负面提示词', snapshot?.negativePrompt || '无负面提示词')}
          ${buildCharacterPromptsMarkup(snapshot)}
        </div>
      </div>
    </div>
  `;
}

/**
 * 构建 Lightbox 顶部操作栏
 * @param actions Lightbox 操作集合
 * @returns HTML 字符串
 */
function buildLightboxToolbarMarkup(actions?: InlineLightboxActions): string {
  return `
    <div class="cv-lightbox-toolbar">
      ${actions?.onDownload
        ? '<button class="cv-lightbox-download" title="下载图片" aria-label="下载图片"><i class="fa-solid fa-download"></i></button>'
        : ''}
      <button class="cv-lightbox-close" title="关闭" aria-label="关闭"><i class="fa-solid fa-xmark"></i></button>
    </div>
  `;
}

/**
 * 构建 Lightbox 头部 HTML
 * @returns HTML 字符串
 */
function buildLightboxHeaderMarkup(): string {
  return `
    <div class="cv-lightbox-info-header">
      <span class="cv-lightbox-info-title">提示词详情</span>
      <button class="cv-lightbox-toggle-btn" title="隐藏/显示提示词">
        <i class="fa-solid fa-eye"></i> <span>显示提示词</span>
      </button>
    </div>
  `;
}

/**
 * 构建提示词分组 HTML
 * @param kind 提示词类型
 * @param title 分组标题
 * @param text 提示词内容
 * @returns HTML 字符串
 */
function buildPromptGroupMarkup(kind: 'pos' | 'neg', title: string, text: string): string {
  return `
    <div class="cv-lightbox-prompt-group">
      <div class="cv-lightbox-prompt-header">
        <span class="cv-lightbox-prompt-title cv-lightbox-title-${kind}">${title}</span>
        <button class="cv-lightbox-copy-btn cv-copy-${kind}"><i class="fa-solid fa-copy"></i> 复制</button>
      </div>
      <div class="cv-lightbox-prompt-content">${escapeHtml(text)}</div>
    </div>
  `;
}

/**
 * 构建角色提示词区域 HTML（有角色时才渲染）
 * @param snapshot 提示词快照
 * @returns HTML 字符串
 */
function buildCharacterPromptsMarkup(snapshot?: InlinePromptSnapshot): string {
  const characters = snapshot?.novelai?.characterPrompts ?? [];
  if (!characters.length) return '';
  return `
    <div class="cv-lightbox-prompt-group cv-lightbox-character-section">
      <div class="cv-lightbox-prompt-header">
        <span class="cv-lightbox-prompt-title cv-lightbox-title-char">角色提示词（${characters.length}）</span>
      </div>
      <div class="cv-lightbox-character-list">
        ${characters.map((item, index) => buildCharacterItemMarkup(item, index, characters.length, snapshot?.novelai?.useCharacterCoords)).join('')}
      </div>
    </div>
  `;
}

/**
 * 构建单个角色提示词折叠项 HTML（默认折叠）
 * @param item 角色提示词
 * @param index 角色序号（从 0 起）
 * @param characterCount 角色总数
 * @param useCharacterCoords 是否使用手动坐标
 * @returns HTML 字符串
 */
function buildCharacterItemMarkup(
  item: CharacterPromptItem,
  index: number,
  characterCount: number,
  useCharacterCoords?: boolean,
): string {
  return `
    <div class="cv-lightbox-character-item cv-char-collapsed" data-char-index="${index}">
      <button type="button" class="cv-lightbox-character-toggle" aria-expanded="false">
        <i class="fa-solid fa-chevron-right cv-lightbox-character-chevron"></i>
        <span class="cv-lightbox-character-title">${escapeHtml(getCharacterItemTitle(item, index))}</span>
      </button>
      <div class="cv-lightbox-character-body">
        <div class="cv-lightbox-character-field">
          <span class="cv-lightbox-character-label">角色正面</span>
          <div class="cv-lightbox-prompt-content">${escapeHtml(item.positivePrompt || '(空)')}</div>
        </div>
        <div class="cv-lightbox-character-field">
          <span class="cv-lightbox-character-label">角色负面</span>
          <div class="cv-lightbox-prompt-content">${escapeHtml(item.negativePrompt || '(空)')}</div>
        </div>
        <div class="cv-lightbox-character-field">
          <span class="cv-lightbox-character-label">坐标</span>
          <div class="cv-lightbox-prompt-content">${escapeHtml(formatCharacterPosition(item, characterCount, useCharacterCoords))}</div>
        </div>
      </div>
    </div>
  `;
}

/**
 * 生成角色折叠标题（序号 + 正面提示词预览）
 * @param item 角色提示词
 * @param index 角色序号
 * @returns 标题文本
 */
function getCharacterItemTitle(item: CharacterPromptItem, index: number): string {
  const preview = item.positivePrompt.trim() || '(空)';
  const short = preview.length > 36 ? `${preview.slice(0, 36)}…` : preview;
  return `角色 ${index + 1} · ${short}`;
}

/**
 * 格式化角色坐标展示文本
 * @param item 角色提示词
 * @param characterCount 角色总数
 * @param useCharacterCoords 是否使用手动坐标
 * @returns 坐标文本
 */
function formatCharacterPosition(item: CharacterPromptItem, characterCount: number, useCharacterCoords?: boolean): string {
  if (characterCount < 2 || useCharacterCoords === false) return 'Auto';
  return `x: ${item.position.x.toFixed(2)}, y: ${item.position.y.toFixed(2)}`;
}

/**
 * 转义 Lightbox 内插文本
 * @param value 原始文本
 * @returns 安全 HTML 文本
 */
function escapeHtml(value: string): string {
  const node = document.createElement('span');
  node.textContent = value;
  return node.innerHTML;
}

/**
 * 绑定 Lightbox 相关的事件
 * @param overlay Lightbox 根元素
 * @param snapshot 提示词快照
 */
function bindLightboxEvents(overlay: HTMLElement, snapshot?: InlinePromptSnapshot, actions?: InlineLightboxActions): void {
  const close = () => closeLightbox(overlay, handleEsc);
  const handleEsc = (e: KeyboardEvent) => e.key === 'Escape' && close();
  document.addEventListener('keydown', handleEsc);
  overlay.addEventListener('click', e => handleOverlayClick(e, overlay, close));
  overlay.querySelector('.cv-lightbox-close')?.addEventListener('click', close);
  bindLightboxDownload(overlay, actions);
  bindLightboxToggle(overlay);
  bindLightboxCopyButtons(overlay, snapshot);
  bindCharacterItemToggles(overlay);
}

/**
 * 绑定 Lightbox 下载按钮
 * @param overlay Lightbox 根元素
 * @param actions Lightbox 操作集合
 */
function bindLightboxDownload(overlay: HTMLElement, actions?: InlineLightboxActions): void {
  if (!actions?.onDownload) return;
  overlay.querySelector('.cv-lightbox-download')?.addEventListener('click', () => {
    void Promise.resolve(actions.onDownload?.()).catch(error => {
      console.error('[CosmosVision] 下载图片失败', error);
    });
  });
}

/**
 * 关闭 Lightbox 并解绑键盘事件
 * @param overlay Lightbox 根元素
 * @param handleEsc ESC 事件处理器
 */
function closeLightbox(overlay: HTMLElement, handleEsc: (e: KeyboardEvent) => void): void {
  overlay.classList.remove('cv-lightbox-active');
  window.setTimeout(() => overlay.remove(), 250);
  document.removeEventListener('keydown', handleEsc);
}

/**
 * 处理 Lightbox 背景点击
 * @param e 点击事件
 * @param overlay Lightbox 根元素
 * @param close 关闭方法
 */
function handleOverlayClick(e: MouseEvent, overlay: HTMLElement, close: () => void): void {
  if (e.target === overlay || e.target === overlay.querySelector('.cv-lightbox-img-box')) close();
}

/**
 * 绑定提示词详情折叠按钮
 * @param overlay Lightbox 根元素
 */
function bindLightboxToggle(overlay: HTMLElement): void {
  const info = overlay.querySelector('.cv-lightbox-info') as HTMLElement | null;
  const toggleBtn = overlay.querySelector('.cv-lightbox-toggle-btn') as HTMLElement | null;
  toggleBtn?.addEventListener('click', () => togglePromptInfo(info, toggleBtn));
}

/**
 * 切换提示词详情显示状态
 * @param info 提示词面板
 * @param toggleBtn 切换按钮
 */
function togglePromptInfo(info: HTMLElement | null, toggleBtn: HTMLElement): void {
  const isCollapsed = Boolean(info?.classList.toggle('cv-info-collapsed'));
  const icon = isCollapsed ? 'fa-eye' : 'fa-eye-slash';
  const text = isCollapsed ? '显示提示词' : '隐藏提示词';
  toggleBtn.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${text}</span>`;
}

/**
 * 绑定提示词复制按钮
 * @param overlay Lightbox 根元素
 * @param snapshot 提示词快照
 */
function bindLightboxCopyButtons(overlay: HTMLElement, snapshot?: InlinePromptSnapshot): void {
  const copyPos = overlay.querySelector('.cv-copy-pos');
  const copyNeg = overlay.querySelector('.cv-copy-neg');
  copyPos?.addEventListener('click', e => copyText(snapshot?.positivePrompt || '', e.currentTarget as HTMLElement));
  copyNeg?.addEventListener('click', e => copyText(snapshot?.negativePrompt || '', e.currentTarget as HTMLElement));
}

/**
 * 绑定角色提示词单项折叠按钮（默认折叠）
 * @param overlay Lightbox 根元素
 */
function bindCharacterItemToggles(overlay: HTMLElement): void {
  overlay.querySelectorAll('.cv-lightbox-character-item').forEach(node => {
    const item = node as HTMLElement;
    const toggle = item.querySelector('.cv-lightbox-character-toggle') as HTMLElement | null;
    toggle?.addEventListener('click', e => {
      e.stopPropagation();
      toggleCharacterItem(item, toggle);
    });
  });
}

/**
 * 切换单个角色提示词的折叠状态
 * @param item 角色项容器
 * @param toggle 折叠按钮
 */
function toggleCharacterItem(item: HTMLElement, toggle: HTMLElement): void {
  const collapsed = item.classList.toggle('cv-char-collapsed');
  toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
  const chevron = toggle.querySelector('.cv-lightbox-character-chevron');
  if (chevron) {
    chevron.classList.toggle('fa-chevron-right', collapsed);
    chevron.classList.toggle('fa-chevron-down', !collapsed);
  }
}

/**
 * 打开 Lightbox 大图预览弹窗
 * @param src 图片地址
 * @param snapshot 提示词快照
 */
export function openInlineImageLightbox(
  src: string,
  snapshot?: InlinePromptSnapshot,
  actions?: InlineLightboxActions,
): void {
  const overlay = createLightboxDOM(src, snapshot, actions);
  document.body.appendChild(overlay);
  requestAnimationFrame(() => {
    overlay.classList.add('cv-lightbox-active');
  });
  bindLightboxEvents(overlay, snapshot, actions);
}

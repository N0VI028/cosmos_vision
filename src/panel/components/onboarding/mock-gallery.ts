import { getTavernHelper } from '@/services/tavern-helper/availability';

/**
 * 教程模拟画廊注入器
 * 在没有真实生成图片时，用角色头像临时模拟画廊结构
 */

/** 模拟元素标记 */
const MOCK_ATTR = 'data-cv-tutorial-mock';

/**
 * 注入模拟画廊到第一条消息段落下方
 * @returns 注入的容器元素，找不到插入点时返回 null
 */
export function injectMockGallery(): HTMLElement | null {
  // 检查是否已有真实画廊
  if (document.querySelector('.cv-render')) return null;

  // 查找第一个可见消息段落
  const firstParagraph = findFirstVisibleParagraph();
  if (!firstParagraph) return null;

  // 读取角色头像
  const avatarUrl = findCharacterAvatar();
  if (!avatarUrl) return null;

  // 构建模拟画廊容器
  const mockContainer = buildMockGalleryContainer(avatarUrl);
  firstParagraph.after(mockContainer);

  return mockContainer;
}

/**
 * 注入模拟选区：给段落添加选中效果和生图按钮
 * @returns 注入的选区壳元素，找不到段落时返回 null
 */
export function injectMockSelection(): HTMLElement | null {
  // 检查是否已有真实选区
  if (document.querySelector('.cv-inline-selection-shell')) return null;

  // 查找第一个可见消息段落
  const paragraph = findFirstVisibleParagraph();
  if (!paragraph) return null;

  // 获取段落容器（.mes_text）
  const mesText = paragraph.closest('.mes_text') as HTMLElement;
  if (!mesText) return null;

  // 添加选中样式
  paragraph.classList.add('cv-inline-selected');
  paragraph.setAttribute(MOCK_ATTR, 'paragraph');

  // 确保容器可以容纳绝对定位的选区壳
  mesText.style.position = 'relative';
  mesText.style.overflow = 'visible';

  // 构建选区壳和工具条
  const shell = buildMockSelectionShell(paragraph, mesText);
  mesText.appendChild(shell);

  return shell;
}

/**
 * 清理所有模拟元素（画廊、选区）
 */
export function cleanupMockGallery(): void {
  // 清理模拟画廊
  document.querySelectorAll(`[${MOCK_ATTR}="true"]`).forEach(el => el.remove());

  // 清理模拟选区
  document.querySelectorAll(`[${MOCK_ATTR}="shell"]`).forEach(el => el.remove());

  // 清理段落选中样式
  document.querySelectorAll(`[${MOCK_ATTR}="paragraph"]`).forEach(el => {
    el.classList.remove('cv-inline-selected');
    el.removeAttribute(MOCK_ATTR);
  });
}

/**
 * 查找第一个可见聊天段落
 * @returns 段落元素或 null
 */
function findFirstVisibleParagraph(): HTMLElement | null {
  const paragraphs = Array.from(document.querySelectorAll<HTMLElement>('.mes_text p'));
  return paragraphs.find(isVisibleElement) ?? null;
}

/**
 * 查找当前角色头像原图 URL
 * @returns 原图 URL 或 null
 */
function findCharacterAvatar(): string | null {
  const tavernHelper = getTavernHelper({ silent: true });
  const charAvatarPath = tavernHelper?.getCharAvatarPath('current');
  return charAvatarPath?.trim() || null;
}

/**
 * 构建模拟画廊 DOM 结构
 * @param avatarUrl 角色头像 URL
 * @returns 模拟容器元素
 */
function buildMockGalleryContainer(avatarUrl: string): HTMLElement {
  const container = document.createElement('div');
  container.className = 'cv-render';
  container.setAttribute(MOCK_ATTR, 'true');

  // 构建画廊包装器
  const wrapper = document.createElement('div');
  wrapper.className = 'cv-inline-img-wrap cv-inline-favorite-wrap cosmos-vision-root';

  // 构建画廊内容
  const content = document.createElement('div');
  content.className = 'cv-inline-favorite-content';

  // 构建 Galleria 容器
  const galleria = document.createElement('div');
  galleria.className = 'cv-inline-favorite-galleria p-galleria p-component';

  // 构建舞台
  const stage = document.createElement('div');
  stage.className = 'cv-inline-favorite-stage';

  // 构建图片
  const img = document.createElement('img');
  img.className = 'cv-inline-favorite-img';
  img.src = avatarUrl;
  img.alt = '示例图片（教程演示）';
  img.draggable = false;
  img.style.pointerEvents = 'none'; // 禁用点击

  // 构建右上角收藏按钮（仅演示）
  const favoriteBtn = document.createElement('button');
  favoriteBtn.className = 'cv-inline-corner-button cv-inline-favorite-toggle';
  favoriteBtn.innerHTML = '<i class="cv-inline-favorite-star fa-star fa-regular" aria-hidden="true"></i>';
  favoriteBtn.disabled = true;
  favoriteBtn.title = '收藏功能（仅演示）';

  // 构建左下角删除按钮（仅演示）
  const removeBtn = document.createElement('button');
  removeBtn.className = 'cv-inline-corner-button cv-inline-remove-toggle';
  removeBtn.innerHTML = '<i class="fa-solid fa-trash"></i>';
  removeBtn.disabled = true;
  removeBtn.title = '删除功能（仅演示）';

  // 构建操作条
  const actions = document.createElement('div');
  actions.className = 'cv-inline-img-actions';
  actions.innerHTML = `
    <div class="cv-inline-button-row">
      <button class="cv-inline-action-button p-button p-component p-button-outlined p-button-secondary" disabled>
        <i class="fa-solid fa-repeat p-button-icon p-button-icon-left"></i>
        <span class="p-button-label">重新生图</span>
      </button>
      <button class="cv-inline-action-button p-button p-component p-button-outlined p-button-secondary" disabled>
        <i class="fa-solid fa-pen-to-square p-button-icon p-button-icon-left"></i>
        <span class="p-button-label">编辑TAG后重新生图</span>
      </button>
      <button class="cv-inline-action-button p-button p-component p-button-outlined p-button-secondary" disabled>
        <i class="fa-solid fa-robot p-button-icon p-button-icon-left"></i>
        <span class="p-button-label">重新生成TAG和图片</span>
      </button>
    </div>
  `;

  // 组装结构
  stage.append(img, favoriteBtn, removeBtn, actions);
  galleria.appendChild(stage);
  content.appendChild(galleria);
  wrapper.appendChild(content);
  container.appendChild(wrapper);

  return container;
}

/**
 * 构建模拟选区壳（毛玻璃蒙版 + 生图按钮）
 * @param paragraph 目标段落
 * @param container 段落容器
 * @returns 选区壳元素
 */
function buildMockSelectionShell(paragraph: HTMLElement, container: HTMLElement): HTMLElement {
  const shell = document.createElement('div');
  shell.className = 'cv-inline-selection-shell';
  shell.setAttribute(MOCK_ATTR, 'shell');

  // 计算段落相对容器的位置和尺寸
  const containerRect = container.getBoundingClientRect();
  const paragraphRect = paragraph.getBoundingClientRect();

  // 设置选区壳位置和尺寸
  shell.style.position = 'absolute';
  shell.style.top = `${paragraphRect.top - containerRect.top}px`;
  shell.style.left = `${paragraphRect.left - containerRect.left}px`;
  shell.style.width = `${paragraphRect.width}px`;
  shell.style.height = `${paragraphRect.height}px`;
  shell.style.pointerEvents = 'none';

  // 构建工具条
  const toolbar = document.createElement('div');
  toolbar.className = 'cv-inline-toolbar';
  toolbar.style.pointerEvents = 'none';

  // 构建生图触发器（白色胶囊）
  const trigger = document.createElement('div');
  trigger.className = 'cv-inline-trigger';
  trigger.style.pointerEvents = 'none';

  const text = document.createElement('span');
  text.className = 'cv-inline-trigger-text';
  text.textContent = '生成图片';

  const iconWrap = document.createElement('span');
  iconWrap.className = 'cv-inline-trigger-icon-wrap';

  const icon = document.createElement('i');
  icon.className = 'fa-solid fa-paint-brush cv-inline-trigger-icon';

  iconWrap.appendChild(icon);
  trigger.append(text, iconWrap);
  toolbar.appendChild(trigger);
  shell.appendChild(toolbar);

  return shell;
}

/**
 * 判断元素是否在当前页面布局中可见
 * @param element 待检查元素
 * @returns 是否可见
 */
function isVisibleElement(element: HTMLElement): boolean {
  const style = window.getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden') return false;
  return element.getClientRects().length > 0;
}

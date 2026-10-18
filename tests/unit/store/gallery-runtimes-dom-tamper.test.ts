import { createApp, defineComponent, h, nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import InlineGalleryRuntimeHost from '@/panel/components/InlineGalleryRuntimeHost.vue';
import { useGalleryRuntimesStore } from '@/store/gallery-runtimes';
import { useSettingsStore } from '@/store/settings';
import type { InlinePromptSnapshot } from '@/composables/inlineImageLightbox';
import type { InlineImageFavoriteScope } from '@/services/inline-image/favorites-cache';
import { ensureFloorTailSlotContainer } from '@/services/inline-image/floor-tail-host';
import { CV_SHADOW_ROOT_CLASS, getShadowContentRoot } from '@/services/inline-image/shadow-mount';
import PrimeVue from 'primevue/config';

/**
 * 复现「回声工具箱 normalize() 打断 Vue Fragment 锚点」崩溃：
 * 第三方插件对 #chat .mes_text 子树执行 el.normalize()（Node.normalize 会删除空文本节点，
 * 而 Vue Fragment 首尾锚点恰为空文本节点 hostCreateText("")），随后画廊任何 patch 都会
 * 撞上断裂的兄弟链（nextSibling of null / subTree of null）导致渲染管线永久坏死。
 */

vi.mock('@/services/sillytavern/chat-context', () => ({
  getCurrentInlineFavoriteScope: (): InlineImageFavoriteScope | null => null,
}));

vi.mock('@/services/inline-image/slot-bind', () => ({
  resolveParagraphSlotId: () => 'tamper001',
  ensureSlotShortcodeOnParagraph: async () => undefined,
  removeSlotShortcodeFromMessage: async () => undefined,
}));

vi.mock('@/services/inline-image/favorites-cache', () => ({
  listInlineImageFavoritesBySlot: async () => [],
}));

const snapshot: InlinePromptSnapshot = {
  positivePrompt: '1girl',
  negativePrompt: 'lowres',
};

/** 本次测试捕获的 Vue 渲染错误（errorHandler 收集，任一非空即视为崩溃复现） */
let capturedErrors: unknown[] = [];

describe('画廊挂载对外部 DOM 篡改（normalize）的容错', () => {
  let app: ReturnType<typeof createApp> | null = null;

  beforeEach(() => {
    const pinia = createPinia();
    setActivePinia(pinia);
    capturedErrors = [];

    const settingsStore = useSettingsStore();
    settingsStore.savedSettings.enabled = true;

    // 聊天 DOM：#chat > .mes[mesid] > .mes_text > p
    const chat = document.createElement('div');
    chat.id = 'chat';
    const mes = document.createElement('div');
    mes.className = 'mes';
    mes.setAttribute('mesid', '0');
    const mesText = document.createElement('div');
    mesText.className = 'mes_text';
    const paragraph = document.createElement('p');
    paragraph.textContent = '宿主段落正文';
    mesText.append(paragraph);
    mes.append(mesText);
    chat.append(mes);
    document.body.append(chat);

    app = createApp(defineComponent({ render: () => h(InlineGalleryRuntimeHost) }));
    app.use(pinia);
    app.use(PrimeVue);
    app.config.errorHandler = (error: unknown) => {
      capturedErrors.push(error);
    };
    const host = document.createElement('div');
    document.body.append(host);
    app.mount(host);
  });

  afterEach(() => {
    app?.unmount();
    app = null;
  });

  /**
   * 读取画廊宿主容器的 ShadowRoot
   */
  function getGalleryShadowRoot(): ShadowRoot | null {
    const cvRender = document.querySelector('.cv-render');
    return cvRender?.shadowRoot ?? null;
  }

  /**
   * 在画廊 ShadowRoot 或 document 中查询单个元素
   */
  function queryGallery<T extends Element = HTMLElement>(selector: string): T | null {
    const shadow = getGalleryShadowRoot();
    return shadow?.querySelector<T>(selector) ?? document.querySelector<T>(selector);
  }

  /**
   * 在画廊 ShadowRoot 或 document 中查询所有匹配元素
   */
  function queryGalleryAll<T extends Element = HTMLElement>(selector: string): T[] {
    const shadow = getGalleryShadowRoot();
    return shadow ? Array.from(shadow.querySelectorAll<T>(selector)) : Array.from(document.querySelectorAll<T>(selector));
  }

  /**
   * 生成一张图并等待画廊完成挂载与加载
   * @param store 画廊 runtime store
   * @param paragraph 宿主段落
   */
  async function generateImage(
    store: ReturnType<typeof useGalleryRuntimesStore>,
    paragraph: HTMLElement,
  ): Promise<void> {
    await store.showGenerated(paragraph, {
      imageBlob: new Blob(['image']),
      promptSnapshot: snapshot,
    });
    for (let i = 0; i < 10 && !queryGallery('.cv-inline-img-wrap'); i += 1) {
      await nextTick();
    }
    await nextTick();
  }

  it('外部 normalize 后再次生图不崩溃且缩略图可切换', async () => {
    const store = useGalleryRuntimesStore();
    const paragraph = document.querySelector('.mes_text p') as HTMLElement;

    await generateImage(store, paragraph);
    expect(queryGallery('.cv-inline-img-wrap')).toBeTruthy();

    // 模拟回声工具箱：GENERATION_ENDED 后对全部 .mes_text 子树 normalize()
    document.querySelectorAll('#chat .mes_text').forEach(el => el.normalize());

    // 第二次生图（触发 items 1→2 的 patch，即用户复现路径）
    await generateImage(store, paragraph);

    const stripItems = queryGalleryAll('.cv-inline-gallery-strip-item');
    expect(stripItems.length).toBe(2);

    // 点击旧图缩略图：主图应切换为旧图 objectUrl
    const images = queryGalleryAll<HTMLImageElement>('.cv-inline-favorite-img');
    const beforeSrc = images[0]?.getAttribute('src') ?? '';
    const oldThumb = stripItems[1] as HTMLElement;
    oldThumb.click();
    await nextTick();
    await nextTick();
    const afterSrc = queryGallery<HTMLImageElement>('.cv-inline-favorite-img')?.getAttribute('src') ?? '';
    expect(afterSrc).toBeTruthy();
    expect(afterSrc).not.toBe(beforeSrc);

    expect(capturedErrors).toEqual([]);
  });

  it('frontend 楼层尾 slot 容器自动注入 shadowRoot 并正确隔离内容根', () => {
    const slotContainer = ensureFloorTailSlotContainer(0, 0, 'floor-slot-001');
    expect(slotContainer).toBeTruthy();
    expect(slotContainer.shadowRoot).toBeTruthy();
    expect(slotContainer.shadowRoot?.mode).toBe('open');

    const contentRoot = getShadowContentRoot(slotContainer);
    expect(contentRoot).toBeTruthy();
    expect(contentRoot?.classList.contains(CV_SHADOW_ROOT_CLASS)).toBe(true);
    expect(slotContainer.shadowRoot?.contains(contentRoot)).toBe(true);

    // 再次调用应当幂等复用已有的 shadowRoot 与内容根
    const reobtained = ensureFloorTailSlotContainer(0, 0, 'floor-slot-001');
    expect(reobtained).toBe(slotContainer);
    expect(getShadowContentRoot(reobtained)).toBe(contentRoot);
  });
});

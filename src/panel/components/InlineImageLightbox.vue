<template>
  <Teleport to="body">
    <Transition name="cv-lightbox">
      <div
        v-if="inlineLightboxState.open"
        class="cv-lightbox-overlay cosmos-vision-root"
        :class="{ [DARK_CLASS]: darkMode }"
        @click="handleOverlayClick"
      >
        <!-- 图片区：PrimeVue Gallery 提供捏合缩放 / 拖拽平移 / 点击切换缩放 -->
        <div class="cv-lightbox-img-box">
          <Gallery>
            <GalleryContent class="cv-lightbox-gallery-content">
              <GalleryItem :zoomed-scale="3">
                <img :src="inlineLightboxState.src" alt="放大图片" draggable="false" />
              </GalleryItem>
            </GalleryContent>

            <!-- 工具栏须在 Gallery 子树内，Zoom 按钮才能 inject $pcGallery -->
            <div class="cv-lightbox-toolbar" @click.stop>
              <GalleryZoomIn title="放大" aria-label="放大" :pt="galleryActionPt">
                <i class="fa-solid fa-magnifying-glass-plus" />
              </GalleryZoomIn>
              <GalleryZoomOut title="缩小" aria-label="缩小" :pt="galleryActionPt">
                <i class="fa-solid fa-magnifying-glass-minus" />
              </GalleryZoomOut>
              <button
                v-if="inlineLightboxState.onDownload"
                type="button"
                class="cv-lightbox-download"
                title="下载图片"
                aria-label="下载图片"
                @click="handleDownload"
              >
                <i class="fa-solid fa-download" />
              </button>
              <button
                type="button"
                class="cv-lightbox-close"
                title="关闭"
                aria-label="关闭"
                @click="closeInlineImageLightbox"
              >
                <i class="fa-solid fa-xmark" />
              </button>
            </div>
          </Gallery>
        </div>

        <!-- 底部提示词详情面板 -->
        <div class="cv-lightbox-info" :class="{ 'cv-info-collapsed': infoCollapsed }" @click.stop>
          <div class="cv-lightbox-info-header">
            <span class="cv-lightbox-info-title">提示词详情</span>
            <button
              type="button"
              class="cv-lightbox-toggle-btn"
              title="隐藏/显示提示词"
              @click="infoCollapsed = !infoCollapsed"
            >
              <i class="fa-solid" :class="infoCollapsed ? 'fa-eye' : 'fa-eye-slash'" />
              <span>{{ infoCollapsed ? '显示' : '隐藏' }}提示词</span>
            </button>
          </div>
          <div class="cv-lightbox-info-body">
            <div class="cv-lightbox-prompt-group">
              <div class="cv-lightbox-prompt-header">
                <span class="cv-lightbox-prompt-title cv-lightbox-title-pos">正向提示词</span>
                <button type="button" class="cv-lightbox-copy-btn" @click="copyPrompt(COPY_KEY_POS, positivePrompt)">
                  <template v-if="copiedKey === COPY_KEY_POS"><i class="fa-solid fa-check" /> 已复制</template>
                  <template v-else><i class="fa-solid fa-copy" /> 复制</template>
                </button>
              </div>
              <div class="cv-lightbox-prompt-content">{{ positivePrompt }}</div>
            </div>
            <div class="cv-lightbox-prompt-group">
              <div class="cv-lightbox-prompt-header">
                <span class="cv-lightbox-prompt-title cv-lightbox-title-neg">负面提示词</span>
                <button type="button" class="cv-lightbox-copy-btn" @click="copyPrompt(COPY_KEY_NEG, negativePrompt)">
                  <template v-if="copiedKey === COPY_KEY_NEG"><i class="fa-solid fa-check" /> 已复制</template>
                  <template v-else><i class="fa-solid fa-copy" /> 复制</template>
                </button>
              </div>
              <div class="cv-lightbox-prompt-content">{{ negativePrompt }}</div>
            </div>
            <div v-if="characters.length" class="cv-lightbox-prompt-group cv-lightbox-character-section">
              <div class="cv-lightbox-prompt-header">
                <span class="cv-lightbox-prompt-title cv-lightbox-title-char">角色提示词（{{ characters.length }}）</span>
              </div>
              <div class="cv-lightbox-character-list">
                <div
                  v-for="(item, index) in characters"
                  :key="index"
                  class="cv-lightbox-character-item"
                  :class="{ 'cv-char-collapsed': collapsedCharIndexes.has(index) }"
                >
                  <button
                    type="button"
                    class="cv-lightbox-character-toggle"
                    :aria-expanded="!collapsedCharIndexes.has(index)"
                    @click="toggleCharacterItem(index)"
                  >
                    <i
                      class="fa-solid cv-lightbox-character-chevron"
                      :class="collapsedCharIndexes.has(index) ? 'fa-chevron-right' : 'fa-chevron-down'"
                    />
                    <span class="cv-lightbox-character-title">{{ getCharacterItemTitle(item, index) }}</span>
                  </button>
                  <div class="cv-lightbox-character-body">
                    <div class="cv-lightbox-character-field">
                      <div class="cv-lightbox-character-label-row">
                        <span class="cv-lightbox-character-label">角色正面</span>
                        <button
                          type="button"
                          class="cv-lightbox-copy-btn"
                          @click="copyPrompt(getCharCopyKey(index, true), item.positivePrompt || '')"
                        >
                          <template v-if="copiedKey === getCharCopyKey(index, true)">
                            <i class="fa-solid fa-check" /> 已复制
                          </template>
                          <template v-else><i class="fa-solid fa-copy" /> 复制</template>
                        </button>
                      </div>
                      <div class="cv-lightbox-prompt-content">{{ item.positivePrompt || '(空)' }}</div>
                    </div>
                    <div class="cv-lightbox-character-field">
                      <div class="cv-lightbox-character-label-row">
                        <span class="cv-lightbox-character-label">角色负面</span>
                        <button
                          type="button"
                          class="cv-lightbox-copy-btn"
                          @click="copyPrompt(getCharCopyKey(index, false), item.negativePrompt || '')"
                        >
                          <template v-if="copiedKey === getCharCopyKey(index, false)">
                            <i class="fa-solid fa-check" /> 已复制
                          </template>
                          <template v-else><i class="fa-solid fa-copy" /> 复制</template>
                        </button>
                      </div>
                      <div class="cv-lightbox-prompt-content">{{ item.negativePrompt || '(空)' }}</div>
                    </div>
                    <div class="cv-lightbox-character-field">
                      <span class="cv-lightbox-character-label">坐标</span>
                      <div class="cv-lightbox-prompt-content">{{ formatCharacterPosition(item) }}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import Gallery from 'primevue/gallery';
import GalleryContent from 'primevue/gallerycontent';
import GalleryItem from 'primevue/galleryitem';
import GalleryZoomIn from 'primevue/galleryzoomin';
import GalleryZoomOut from 'primevue/galleryzoomout';
import { computed, onUnmounted, ref, watch } from 'vue';
import type { CharacterPromptItem } from '@/constants/novelai';
import { closeInlineImageLightbox, inlineLightboxState } from '@/composables/inlineImageLightbox';
import { DARK_CLASS } from '@/constants/default-settings';
import { useSettingsStore } from '@/store/settings';

/** 正向提示词复制按钮的 key */
const COPY_KEY_POS = 'pos';

/** 负面提示词复制按钮的 key */
const COPY_KEY_NEG = 'neg';

/** Gallery 放大/缩小按钮 PT：仅锚点；尺寸/颜色/hover 由 gallery token 控制，边框/底色见 inline-lightbox.css 共享视觉组 */
const galleryActionPt = { root: { class: 'cv-lightbox-gallery-action' } };

const settingsStore = useSettingsStore();
const darkMode = computed(() => settingsStore.darkMode);

/** 提示词详情面板是否折叠（默认折叠，与原命令式行为一致） */
const infoCollapsed = ref(true);

/** 处于 1.5s 成功态的复制按钮 key */
const copiedKey = ref<string | null>(null);

/** 折叠的角色提示词序号集合（默认全部折叠） */
const collapsedCharIndexes = ref(new Set<number>());

/** 复制成功态还原定时器 */
let copiedTimer = 0;

/** 正向提示词文本（无快照时占位提示） */
const positivePrompt = computed(() => inlineLightboxState.snapshot?.positivePrompt || '无正向提示词');

/** 负面提示词文本（无快照时占位提示） */
const negativePrompt = computed(() => inlineLightboxState.snapshot?.negativePrompt || '无负面提示词');

/** 角色提示词列表 */
const characters = computed(() => inlineLightboxState.snapshot?.novelai?.characterPrompts ?? []);

// 打开时重置面板折叠/角色折叠并绑定 ESC；关闭时解绑
watch(
  () => inlineLightboxState.open,
  open => {
    if (open) {
      infoCollapsed.value = true;
      collapsedCharIndexes.value = new Set(characters.value.map((_, index) => index));
      document.addEventListener('keydown', handleEscKey);
    } else {
      document.removeEventListener('keydown', handleEscKey);
    }
  },
);

onUnmounted(() => document.removeEventListener('keydown', handleEscKey));

/**
 * ESC 键关闭灯箱
 * @param e 键盘事件
 */
function handleEscKey(e: KeyboardEvent): void {
  if (e.key === 'Escape') closeInlineImageLightbox();
}

/**
 * 背景点击关闭：点击 overlay / 图片区空白处生效，点击图片本身不关闭
 * @param e 点击事件
 */
function handleOverlayClick(e: MouseEvent): void {
  const target = e.target as HTMLElement;
  // 图片点击是 Gallery 的切换缩放手势，不能关闭灯箱
  if (target.closest('.p-gallery-item')) return;
  closeInlineImageLightbox();
}

/**
 * 触发下载回调并捕获异步错误
 */
function handleDownload(): void {
  void Promise.resolve(inlineLightboxState.onDownload?.()).catch(error => {
    console.error('[CosmosVision] 下载图片失败', error);
  });
}

/**
 * 复制提示词文本并展示 1.5s 成功态
 * @param key 复制按钮标识
 * @param text 待复制文本
 */
async function copyPrompt(key: string, text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    copiedKey.value = key;
    window.clearTimeout(copiedTimer);
    copiedTimer = window.setTimeout(() => {
      copiedKey.value = null;
    }, 1500);
  } catch {
    toastr.error('复制失败');
  }
}

/**
 * 生成角色提示词复制按钮的 key
 * @param index 角色序号
 * @param isPositive 是否为角色正面提示词
 * @returns key 文本
 */
function getCharCopyKey(index: number, isPositive: boolean): string {
  return `${isPositive ? 'char-pos' : 'char-neg'}-${index}`;
}

/**
 * 切换单个角色提示词折叠状态
 * @param index 角色序号
 */
function toggleCharacterItem(index: number): void {
  const next = new Set(collapsedCharIndexes.value);
  if (next.has(index)) next.delete(index);
  else next.add(index);
  collapsedCharIndexes.value = next;
}

/**
 * 生成角色折叠标题（序号 + 正面提示词前 36 字预览）
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
 * @returns 坐标文本
 */
function formatCharacterPosition(item: CharacterPromptItem): string {
  const useCharacterCoords = inlineLightboxState.snapshot?.novelai?.useCharacterCoords;
  if (characters.value.length < 2 || useCharacterCoords === false) return 'Auto';
  return `x: ${item.position.x.toFixed(2)}, y: ${item.position.y.toFixed(2)}`;
}
</script>

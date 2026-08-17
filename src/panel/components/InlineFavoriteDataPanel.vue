<template>
  <StaticPanel title="图片管理" class="[--cv-favorite-grid-max-h:36rem]">
    <template #actions>
      <CvMiniButton
        :label="isSelecting ? '取消选择' : '选择'"
        icon="fa-regular fa-check-double"
        :disabled="isSelectionToggleDisabled"
        @click="toggleSelectMode"
      />
    </template>

    <div
      v-if="loading"
      class="grid max-h-(--cv-favorite-grid-max-h,36rem) grid-cols-3 gap-(--cv-space-4xl) overflow-y-auto max-[56rem]:grid-cols-2"
    >
      <CvDataCard v-for="index in 4" :key="index">
        <div class="relative flex min-w-0 flex-col">
          <Skeleton height="100%" class="block aspect-square" />
          <div class="flex min-w-0 flex-col gap-(--cv-space-sm) p-(--cv-space-4xl)">
            <Skeleton height="1rem" width="70%" />
            <Skeleton height="0.9rem" width="52%" />
          </div>
        </div>
      </CvDataCard>
    </div>

    <div
      v-else-if="!items.length"
      class="flex min-h-36 items-center justify-center rounded-(--cv-radius) border-(length:--cv-border-width) border-dashed border-(--cv-surface-variant) bg-[color-mix(in_srgb,var(--cv-surface-container-low)_42%,transparent)] p-(--cv-space-2xl) text-center text-(--cv-on-surface-variant)"
    >
      暂无图片数据
    </div>

    <template v-else>
      <div class="mb-(--cv-space-4xl) flex flex-wrap items-end gap-(--cv-space-4xl)">
        <div class="flex min-w-0 flex-1 basis-48 flex-col gap-(--cv-space-md) max-[38rem]:basis-full">
          <div class="text-(length:--cv-font-size-xs) font-semibold text-(--cv-on-surface-variant)">类型</div>
          <Select
            v-model="selectedType"
            :options="typeOptions"
            option-label="label"
            option-value="value"
            fluid
            class="w-full"
          />
        </div>

        <div class="flex min-w-0 flex-1 basis-48 flex-col gap-(--cv-space-md) max-[38rem]:basis-full">
          <div class="text-(length:--cv-font-size-xs) font-semibold text-(--cv-on-surface-variant)">角色</div>
          <Select
            v-model="selectedCharacterKey"
            :options="characterOptions"
            option-label="label"
            option-value="value"
            fluid
            class="w-full"
          />
        </div>

        <div class="flex min-w-0 flex-1 basis-48 flex-col gap-(--cv-space-md) max-[38rem]:basis-full">
          <div class="text-(length:--cv-font-size-xs) font-semibold text-(--cv-on-surface-variant)">聊天</div>
          <Select
            v-model="selectedChatId"
            :options="chatOptions"
            option-label="label"
            option-value="value"
            fluid
            class="w-full"
          />
        </div>
      </div>

      <div v-if="visibleItems.length" v-bind="containerProps" class="max-h-(--cv-favorite-grid-max-h,36rem)">
        <div v-bind="wrapperProps">
          <div
            v-for="row in visibleRows"
            :key="row.rowIndex"
            :ref="rowRef(row.rowIndex)"
            class="grid grid-cols-3 gap-x-(--cv-space-4xl) pb-(--cv-space-4xl) max-[56rem]:grid-cols-2"
          >
            <CvDataCard
              v-for="item in row.items"
              :key="item.key"
              :selected="isItemSelected(item.key)"
              :selecting="isSelecting"
              :disabled="busy && isSelecting"
              @toggle="toggleItem(item.key)"
            >
              <div class="relative flex min-w-0 flex-col">
                <!-- 选择模式勾选框放右上角：左上角已让位给类型徽章 -->
                <div v-if="isSelecting" class="absolute top-(--cv-space-lg) right-(--cv-space-lg) z-1" @click.stop>
                  <Checkbox
                    binary
                    :model-value="isItemSelected(item.key)"
                    :disabled="busy"
                    @update:model-value="toggleItem(item.key)"
                  />
                </div>

                <div
                  class="relative aspect-square overflow-hidden border-(length:--cv-border-width) border-b border-solid border-[color-mix(in_srgb,var(--cv-surface-variant)_72%,transparent)] bg-(--cv-surface-container-high)"
                >
                  <span
                    class="pointer-events-none absolute top-(--cv-space-md) left-(--cv-space-md) z-1 rounded-(--cv-radius-sm) px-[0.35rem] py-[0.1rem] text-(length:--cv-font-size-xs) leading-[1.2] font-semibold"
                    :class="kindBadgeClass(item.kind)"
                    >{{ kindLabel(item.kind) }}</span
                  >
                  <!-- 缩略图按需加载：就绪后可点击进灯箱；加载中骨架占位；失败降级为图片图标 -->
                  <LightboxImage
                    v-if="previewStatus(item.key) === 'ready'"
                    :src="getPreviewUrl(item.key)"
                    :snapshot="item.promptSnapshot"
                    :download-action="() => $emit('download-items', [item.key])"
                    :disabled="isSelecting"
                    alt="图片预览"
                    class="block size-full object-cover"
                  />
                  <div
                    v-else-if="previewStatus(item.key) === 'error'"
                    class="flex size-full items-center justify-center text-(--cv-on-surface-variant)"
                    title="缩略图加载失败"
                  >
                    <i class="fa-regular fa-image text-(length:--cv-font-size-2xl)" aria-hidden="true" />
                  </div>
                  <Skeleton v-else height="100%" class="block size-full" />

                  <!-- 移动端窄卡片：缩略图右下角三点按钮呼出箭头气泡菜单（半透明方形底增强辨识度） -->
                  <!-- 底色放在容器上：按钮自带 bg-transparent 工具类会压掉同属性的背景类 -->
                  <div
                    v-if="!isSelecting"
                    class="absolute right-(--cv-space-md) bottom-(--cv-space-md) z-1 hidden rounded-(--cv-radius-sm) bg-[color-mix(in_srgb,var(--cv-surface)_82%,transparent)] max-[56rem]:flex"
                    @click.stop
                  >
                    <CvMiniButton
                      class="text-(--cv-on-surface-variant)"
                      icon="fa-solid fa-ellipsis-vertical"
                      aria-label="更多操作"
                      title="更多操作"
                      :disabled="busy"
                      @click="toggleCardMenu($event, item.key)"
                    />
                    <Popover :ref="el => setCardMenuPopover(item.key, el)" :base-z-index="MACRO_POPOVER_BASE_Z_INDEX">
                      <div class="flex w-max flex-col items-stretch gap-(--cv-space-xs)">
                        <CvMiniButton
                          class="cv-card-menu-action"
                          :icon="item.kind === 'favorite' ? 'fa-regular fa-star-half-alt' : 'fa-regular fa-star'"
                          :label="kindToggleLabel(item.kind)"
                          :disabled="busy"
                          @click="invokeCardMenu(item.key, () => $emit('toggle-kind', item.key))"
                        />
                        <CvMiniButton
                          class="cv-card-menu-action"
                          icon="fa-regular fa-download"
                          label="下载"
                          :disabled="busy"
                          @click="invokeCardMenu(item.key, () => $emit('download-items', [item.key]))"
                        />
                        <CvMiniButton
                          class="cv-card-menu-action"
                          icon="fa-regular fa-trash"
                          tone="error"
                          label="删除"
                          :disabled="busy"
                          @click="invokeCardMenu(item.key, () => $emit('delete-items', [item.key]))"
                        />
                      </div>
                    </Popover>
                  </div>
                </div>

                <div class="flex min-w-0 flex-col gap-(--cv-space-sm) p-(--cv-space-4xl)">
                  <div
                    class="overflow-hidden text-(length:--cv-font-size-xs) font-semibold text-ellipsis whitespace-nowrap text-(--cv-on-surface)"
                  >
                    {{ formatImageLabel(item.createdAt) }}
                  </div>
                  <div
                    class="overflow-hidden text-(length:--cv-font-size-xs) text-ellipsis whitespace-nowrap text-(--cv-on-surface-variant)"
                  >
                    {{ stripPngExtension(item.characterKey) }} · {{ stripPngExtension(item.chatId) }}
                  </div>
                </div>

                <div
                  v-if="!isSelecting"
                  class="flex flex-wrap items-center justify-end gap-(--cv-space-sm) px-(--cv-space-4xl) pb-(--cv-space-4xl) max-[56rem]:hidden"
                  @click.stop
                >
                  <CvMiniButton
                    class="relative text-(--cv-on-surface-variant)"
                    :icon="item.kind === 'favorite' ? 'fa-regular fa-star-half-alt' : 'fa-regular fa-star'"
                    :aria-label="kindToggleLabel(item.kind)"
                    :title="kindToggleLabel(item.kind)"
                    :disabled="busy"
                    @click="$emit('toggle-kind', item.key)"
                  />
                  <CvMiniButton
                    icon="fa-regular fa-download"
                    aria-label="下载"
                    :disabled="busy"
                    @click="$emit('download-items', [item.key])"
                  />
                  <CvMiniButton
                    icon="fa-regular fa-trash"
                    tone="error"
                    aria-label="删除"
                    :disabled="busy"
                    @click="$emit('delete-items', [item.key])"
                  />
                </div>
              </div>
            </CvDataCard>
          </div>
        </div>
      </div>
      <div
        v-else
        class="flex min-h-36 items-center justify-center rounded-(--cv-radius) border-(length:--cv-border-width) border-dashed border-(--cv-surface-variant) bg-[color-mix(in_srgb,var(--cv-surface-container-low)_42%,transparent)] p-(--cv-space-2xl) text-center text-(--cv-on-surface-variant)"
      >
        当前筛选范围暂无图片
      </div>

      <div
        v-if="isSelecting"
        class="sticky bottom-0 mt-(--cv-space-4xl) flex flex-wrap items-center justify-between gap-(--cv-space-md) border-t border-(--cv-surface-variant) pt-(--cv-space-4xl)"
      >
        <span class="text-(length:--cv-font-size-xs) text-(--cv-on-surface-variant)">已选 {{ selectedCount }} 张</span>
        <div class="flex flex-wrap items-center justify-end gap-(--cv-space-3xl)">
          <CvMiniButton
            :label="isAllSelected ? '取消全选' : '全选'"
            :disabled="busy || !visibleItems.length"
            @click="toggleSelectAll"
          />
          <CvMiniButton label="下载" :disabled="!selectedCount || busy" @click="downloadSelected" />
          <CvMiniButton label="删除" tone="error" :disabled="!selectedCount || busy" @click="deleteSelected" />
          <CvMiniButton label="取消" :disabled="busy" @click="clearSelection" />
        </div>
      </div>
    </template>
  </StaticPanel>
</template>

<script setup lang="ts">
import Checkbox from 'primevue/checkbox';
import Popover from 'primevue/popover';
import Select from 'primevue/select';
import Skeleton from 'primevue/skeleton';
import { computed, ref, watch } from 'vue';
import { useManagedImagePreviews } from '@/composables/useManagedImagePreviews';
import { useVirtualCardGrid } from '@/composables/useVirtualCardGrid';
import CvDataCard from '@/panel/components/CvDataCard.vue';
import CvMiniButton from '@/panel/components/CvMiniButton.vue';
import LightboxImage from '@/panel/components/LightboxImage.vue';
import { MACRO_POPOVER_BASE_Z_INDEX, type MacroPopoverInstance } from '@/panel/components/prompt-llm-macro-popover';
import StaticPanel from '@/panel/components/StaticPanel.vue';
import {
  managedChatGroupId,
  type ManagedImageItem,
  type ManagedImageKind,
} from '@/services/inline-image/managed-images';
import './inline-favorite-card-menu.css';

interface FilterOption {
  label: string;
  value: string;
}

type ManagedTypeFilter = 'all' | ManagedImageKind;

const ALL_CHARACTER_KEY = '__all_character__';
const ALL_CHAT_KEY = '__all_chat__';

const typeOptions: FilterOption[] = [
  { label: '全部', value: 'all' },
  { label: '收藏', value: 'favorite' },
  { label: '临时', value: 'temporary' },
];

const props = defineProps<{
  items: ManagedImageItem[];
  loading: boolean;
  busy: boolean;
}>();

const emit = defineEmits<{
  'download-items': [keys: string[]];
  'delete-items': [keys: string[]];
  'toggle-kind': [key: string];
}>();

const selectedType = ref<ManagedTypeFilter>('all');
const selectedCharacterKey = ref(ALL_CHARACTER_KEY);
const selectedChatId = ref(ALL_CHAT_KEY);
const isSelecting = ref(false);
const selectedKeys = ref<string[]>([]);
// 每张卡片一个浮层实例；虚拟滚动行卸载时由函数 ref 自动移除，无需响应式
const cardMenuPopovers = new Map<string, MacroPopoverInstance>();

const typedItems = computed(() => filterItemsByType(props.items, selectedType.value));
const characterOptions = computed(() => buildCharacterOptions(typedItems.value));
const characterItems = computed(() => filterItemsByCharacter(typedItems.value, selectedCharacterKey.value));
const chatOptions = computed(() => buildChatOptions(characterItems.value));
const visibleItems = computed(() => filterItemsByChat(characterItems.value, selectedChatId.value));
const selectedCount = computed(() => selectedKeys.value.length);
const isAllSelected = computed(
  () => visibleItems.value.length > 0 && selectedCount.value === visibleItems.value.length,
);
const isSelectionToggleDisabled = computed(() => props.loading || props.busy || !visibleItems.value.length);
// 顶层解构以获得模板自动解包（嵌套在普通对象里的 ref 不会解包）
const { containerProps, wrapperProps, visibleRows, rowRef, scrollToRow } = useVirtualCardGrid<ManagedImageItem>(
  () => visibleItems.value,
);

// 可见窗口 key → 按需加载缩略图 object URL（滚出窗口即回收）
const visibleCardKeys = computed(() => visibleRows.value.flatMap(row => row.items.map(item => item.key)));
const { previewUrls, previewStatus } = useManagedImagePreviews(() => visibleItems.value, visibleCardKeys);

// 筛选变化时回到列表顶部；删除/刷新等数据变化保持原滚动位置
watch([selectedType, selectedCharacterKey, selectedChatId], () => {
  scrollToRow(0);
});

watch(
  () => props.items,
  () => {
    reconcileCharacterSelection(characterOptions.value.map(option => option.value));
  },
  { immediate: true },
);

watch(
  () => selectedType.value,
  () => {
    selectedCharacterKey.value = ALL_CHARACTER_KEY;
    selectedChatId.value = ALL_CHAT_KEY;
  },
);

watch(
  () => selectedCharacterKey.value,
  () => {
    selectedChatId.value = ALL_CHAT_KEY;
  },
);

watch(
  () => chatOptions.value.map(option => option.value),
  values => {
    if (values.includes(selectedChatId.value)) return;
    selectedChatId.value = values[0] ?? ALL_CHAT_KEY;
  },
  { immediate: true },
);

watch(
  () => visibleItems.value.map(item => item.key),
  keys => {
    selectedKeys.value = selectedKeys.value.filter(key => keys.includes(key));
    if (!keys.length) isSelecting.value = false;
  },
);

/** 切换显式多选模式 */
function toggleSelectMode(): void {
  if (isSelectionToggleDisabled.value) return;
  isSelecting.value = !isSelecting.value;
  if (!isSelecting.value) selectedKeys.value = [];
}

/** 退出多选并清空已选项 */
function clearSelection(): void {
  isSelecting.value = false;
  selectedKeys.value = [];
}

/**
 * 判断图片是否已被选中
 * @param key 复合 key
 */
function isItemSelected(key: string): boolean {
  return selectedKeys.value.includes(key);
}

/**
 * 切换单张图片选中状态
 * @param key 复合 key
 */
function toggleItem(key: string): void {
  if (!isSelecting.value || props.busy) return;
  selectedKeys.value = isItemSelected(key)
    ? selectedKeys.value.filter(itemKey => itemKey !== key)
    : [...selectedKeys.value, key];
}

/** 切换当前可见范围的全选状态 */
function toggleSelectAll(): void {
  if (props.busy) return;
  selectedKeys.value = isAllSelected.value ? [] : visibleItems.value.map(item => item.key);
}

/** 批量下载当前已选图片 */
function downloadSelected(): void {
  if (!selectedCount.value || props.busy) return;
  emit('download-items', selectedKeys.value);
}

/** 批量删除当前已选图片 */
function deleteSelected(): void {
  if (!selectedCount.value || props.busy) return;
  emit('delete-items', selectedKeys.value);
}

/**
 * 切换移动端卡片菜单浮层
 * @param event 触发事件
 * @param key 复合 key
 */
function toggleCardMenu(event: Event, key: string): void {
  cardMenuPopovers.get(key)?.toggle(event);
}

/**
 * 执行菜单项动作并收起浮层
 * @param key 复合 key
 * @param action 菜单动作
 */
function invokeCardMenu(key: string, action: () => void): void {
  cardMenuPopovers.get(key)?.hide();
  action();
}

/**
 * 登记卡片菜单浮层实例（行卸载时以 null 回调移除）
 * @param key 复合 key
 * @param el 浮层组件实例
 */
function setCardMenuPopover(key: string, el: unknown): void {
  if (el) cardMenuPopovers.set(key, el as MacroPopoverInstance);
  else cardMenuPopovers.delete(key);
}

/**
 * 读取缩略图预览地址（未就绪时为空串）
 * @param key 复合 key
 */
function getPreviewUrl(key: string): string {
  return previewUrls.value[key] ?? '';
}

/**
 * 类型角标文案
 * @param kind 图片类型
 */
function kindLabel(kind: ManagedImageKind): string {
  return kind === 'favorite' ? '收藏' : '临时';
}

/**
 * 类型角标样式类
 * @param kind 图片类型
 */
function kindBadgeClass(kind: ManagedImageKind): string {
  return kind === 'favorite'
    ? 'bg-[color-mix(in_srgb,var(--cvp-yellow-400)_78%,var(--cv-surface))] text-[color-mix(in_srgb,var(--cvp-yellow-950,#422006)_88%,var(--cv-on-surface))]'
    : 'bg-[color-mix(in_srgb,var(--cv-surface)_82%,transparent)] text-(--cv-on-surface-variant)';
}

/**
 * 状态互换按钮文案
 * @param kind 图片类型
 */
function kindToggleLabel(kind: ManagedImageKind): string {
  return kind === 'favorite' ? '转为临时' : '转为收藏';
}

/**
 * 格式化图片时间标题
 * @param createdAt 创建时间
 */
function formatImageLabel(createdAt: number): string {
  const date = new Date(createdAt);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

/**
 * 去除角色或聊天名称中的 .png 扩展名
 * @param name 原始名称
 */
function stripPngExtension(name: string): string {
  return name.replace('.png', '');
}

/**
 * 校正角色筛选值
 * @param values 当前可选角色值
 */
function reconcileCharacterSelection(values: string[]): void {
  if (values.includes(selectedCharacterKey.value)) return;
  selectedCharacterKey.value = values[0] ?? ALL_CHARACTER_KEY;
}

/**
 * 按类型筛选
 * @param items 管理项
 * @param type 类型筛选
 */
function filterItemsByType(items: ManagedImageItem[], type: ManagedTypeFilter): ManagedImageItem[] {
  if (type === 'all') return items;
  return items.filter(item => item.kind === type);
}

/**
 * 按角色筛选
 * @param items 管理项
 * @param characterKey 角色 key
 */
function filterItemsByCharacter(items: ManagedImageItem[], characterKey: string): ManagedImageItem[] {
  if (characterKey === ALL_CHARACTER_KEY) return items;
  return items.filter(item => item.characterKey === characterKey);
}

/**
 * 按聊天筛选（已按时间倒序的输入保持顺序）
 * @param items 管理项
 * @param chatGroupId 聊天复合 id
 */
function filterItemsByChat(items: ManagedImageItem[], chatGroupId: string): ManagedImageItem[] {
  if (chatGroupId === ALL_CHAT_KEY) return items;
  return items.filter(item => managedChatGroupId(item) === chatGroupId);
}

/**
 * 构建角色筛选项
 * @param items 当前类型下的管理项
 */
function buildCharacterOptions(items: ManagedImageItem[]): FilterOption[] {
  return [{ label: '全部角色', value: ALL_CHARACTER_KEY }, ...collectCharacterOptions(items)];
}

/**
 * 收集去重角色选项
 * @param items 管理项
 */
function collectCharacterOptions(items: ManagedImageItem[]): FilterOption[] {
  return items.reduce((options, item) => {
    if (options.some(option => option.value === item.characterKey)) return options;
    return [...options, { label: stripPngExtension(item.characterKey), value: item.characterKey }];
  }, [] as FilterOption[]);
}

/**
 * 构建聊天筛选项
 * @param items 当前角色下的管理项
 */
function buildChatOptions(items: ManagedImageItem[]): FilterOption[] {
  const seen = new Set<string>();
  const chats: FilterOption[] = [];
  for (const item of items) {
    const id = managedChatGroupId(item);
    if (seen.has(id)) continue;
    seen.add(id);
    chats.push({ label: stripPngExtension(item.chatId), value: id });
  }
  return [{ label: '全部聊天', value: ALL_CHAT_KEY }, ...chats];
}
</script>

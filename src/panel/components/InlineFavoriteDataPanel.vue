<template>
  <CollapsiblePanelItem
    title="收藏图片数据"
    :collapsed="collapsed"
    @toggle="collapsed = !collapsed"
  >
    <template #actions>
      <CvMiniButton
        label="下载全部"
        icon="fa-solid fa-download"
        :disabled="isGlobalActionDisabled"
        :loading="busy"
        size="small"
        @click="$emit('download-all')"
      />
      <CvMiniButton
        label="删除全部"
        icon="fa-solid fa-trash"
        tone="error"
        :disabled="isGlobalActionDisabled"
        :loading="busy"
        size="small"
        @click="$emit('delete-all')"
      />
    </template>

    <div v-if="loading" class="cv-favorite-empty">正在读取收藏图片数据...</div>
    <div v-else-if="!treeNodes.length" class="cv-favorite-empty">暂无收藏图片数据</div>
    <section v-else class="cv-favorite-tree-panel">
      <TreeTable
        v-model:expanded-keys="expandedKeys"
        v-model:selection-keys="selectionKeys"
        :value="treeNodes"
        data-key="key"
        selection-mode="checkbox"
        scrollable
        scroll-height="24rem"
        class="cv-favorite-tree"
        table-class="cv-favorite-tree-table"
      >
        <template #header>
          <div class="cv-favorite-batch-bar">
            <span class="cv-favorite-batch-count">
              {{ selectedImageIds.length ? `已选 ${selectedImageIds.length} 张` : `共 ${totalImageCount} 张` }}
            </span>
            <div class="cv-favorite-batch-actions">
              <CvMiniButton
                label="下载选中"
                :disabled="!selectedImageIds.length || busy"
                size="small"
                @click="handleBatchDownload"
              />
              <CvMiniButton
                label="删除选中"
                tone="error"
                :disabled="!selectedImageIds.length || busy"
                size="small"
                @click="handleBatchDelete"
              />
            </div>
          </div>
        </template>
        <Column expander field="label">
          <template #body="{ node }">
            <div class="cv-favorite-tree-label">
              <img v-if="node.data.previewUrl" :src="node.data.previewUrl" alt="" class="cv-favorite-tree-thumb" />
              <i v-else :class="node.data.icon" />
              <span class="cv-favorite-tree-text" :title="node.data.label">{{ node.data.label }}</span>
            </div>
          </template>
        </Column>
        <Column style="width: 5rem">
          <template #body="{ node }">
            <div v-if="node.data.group" class="cv-favorite-tree-actions">
              <CvMiniButton
                icon="fa-solid fa-download"
                aria-label="下载"
                :disabled="busy"
                @click="$emit('download-group', node.data.group)"
              />
              <CvMiniButton
                icon="fa-solid fa-trash"
                tone="error"
                aria-label="删除"
                :disabled="busy"
                @click="$emit('delete-group', node.data.group)"
              />
            </div>
            <div v-else-if="node.data.imageId !== undefined" class="cv-favorite-tree-actions">
              <CvMiniButton
                icon="fa-solid fa-download"
                aria-label="下载"
                :disabled="busy"
                @click="$emit('download-items', [node.data.imageId])"
              />
              <CvMiniButton
                icon="fa-solid fa-trash"
                tone="error"
                aria-label="删除"
                :disabled="busy"
                @click="$emit('delete-items', [node.data.imageId])"
              />
            </div>
          </template>
        </Column>
      </TreeTable>
    </section>
  </CollapsiblePanelItem>
</template>

<script setup lang="ts">
import type { TreeTableExpandedKeys, TreeTableSelectionKeys } from 'primevue/treetable';
import type { TreeNode } from 'primevue/treenode';
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import CollapsiblePanelItem from '@/panel/components/CollapsiblePanelItem.vue';
import CvMiniButton from '@/panel/components/CvMiniButton.vue';
import type { InlineImageFavoriteGroup, InlineImageFavoriteListItem } from '@/services/inline-image/favorites-cache';

interface InlineFavoriteTreeNodeData {
  label: string;
  icon: string;
  group?: InlineImageFavoriteGroup;
  imageId?: number;
  previewUrl?: string;
}

const props = defineProps<{
  groups: InlineImageFavoriteGroup[];
  loading: boolean;
  busy: boolean;
}>();

const emit = defineEmits<{
  'download-all': [];
  'delete-all': [];
  'download-group': [group: InlineImageFavoriteGroup];
  'delete-group': [group: InlineImageFavoriteGroup];
  'download-items': [ids: number[]];
  'delete-items': [ids: number[]];
}>();

const IMAGE_KEY_PREFIX = 'image:';
const collapsed = ref(true);
const treeNodes = ref<TreeNode[]>([]);
const expandedKeys = ref<TreeTableExpandedKeys>({});
const selectionKeys = ref<TreeTableSelectionKeys>({});
const objectUrls = new Set<string>();
const isGlobalActionDisabled = computed(() => props.loading || props.busy || !props.groups.length);
const totalImageCount = computed(() => props.groups.reduce((sum, group) => sum + group.count, 0));
const selectedImageIds = computed(() => extractSelectedImageIds(selectionKeys.value));

watch(
  () => props.groups,
  groups => {
    syncInlineFavoriteViews(groups);
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  clearInlineFavoritePreviewUrls();
});

/**
 * 批量下载选中图片
 */
function handleBatchDownload(): void {
  if (!selectedImageIds.value.length) return;
  emit('download-items', selectedImageIds.value);
}

/**
 * 批量删除选中图片
 */
function handleBatchDelete(): void {
  if (!selectedImageIds.value.length) return;
  emit('delete-items', selectedImageIds.value);
}

/**
 * 同步收藏图片树与图片数据视图
 * @param groups 原始收藏分组
 */
function syncInlineFavoriteViews(groups: InlineImageFavoriteGroup[]): void {
  clearInlineFavoritePreviewUrls();
  treeNodes.value = buildInlineFavoriteTreeNodes(groups);
  expandedKeys.value = buildInlineFavoriteExpandedKeys(treeNodes.value);
  selectionKeys.value = {};
}

/**
 * 构建收藏图片树节点（角色 > 聊天 > 图片）
 * @param groups 收藏分组列表
 * @returns TreeTable 节点
 */
function buildInlineFavoriteTreeNodes(groups: InlineImageFavoriteGroup[]): TreeNode[] {
  const characterGroups = groups.reduce(
    reduceInlineFavoriteCharacterGroup,
    new Map<string, InlineImageFavoriteGroup[]>(),
  );
  return [...characterGroups.entries()].map(([characterKey, items]) =>
    createInlineFavoriteCharacterNode(characterKey, items),
  );
}

/**
 * 按角色聚合收藏分组
 * @param groups 已聚合角色分组
 * @param group 当前收藏分组
 * @returns 更新后的分组映射
 */
function reduceInlineFavoriteCharacterGroup(
  groups: Map<string, InlineImageFavoriteGroup[]>,
  group: InlineImageFavoriteGroup,
): Map<string, InlineImageFavoriteGroup[]> {
  const items = groups.get(group.characterKey) ?? [];
  items.push(group);
  groups.set(group.characterKey, items);
  return groups;
}

/**
 * 创建角色树节点
 * @param characterKey 角色标识
 * @param groups 该角色下的聊天分组
 * @returns 角色节点
 */
function createInlineFavoriteCharacterNode(characterKey: string, groups: InlineImageFavoriteGroup[]): TreeNode {
  return {
    key: `character:${characterKey}`,
    selectable: true,
    data: { label: stripPngExtension(characterKey), icon: 'fa-solid fa-folder-tree' } satisfies InlineFavoriteTreeNodeData,
    children: groups.map(createInlineFavoriteChatNode),
  };
}

/**
 * 创建聊天树节点
 * @param group 收藏分组
 * @returns 聊天节点
 */
function createInlineFavoriteChatNode(group: InlineImageFavoriteGroup): TreeNode {
  return {
    key: group.id,
    selectable: true,
    data: {
      label: `${stripPngExtension(group.chatId)} (${group.count})`,
      icon: 'fa-solid fa-comments',
      group,
    } satisfies InlineFavoriteTreeNodeData,
    children: group.records.map(createInlineFavoriteImageNode),
  };
}

/**
 * 创建图片树节点
 * @param record 收藏记录
 * @returns 图片节点
 */
function createInlineFavoriteImageNode(record: InlineImageFavoriteListItem): TreeNode {
  return {
    key: `${IMAGE_KEY_PREFIX}${record.id}`,
    selectable: true,
    data: {
      label: formatInlineFavoriteImageLabel(record),
      icon: 'fa-solid fa-image',
      imageId: record.id,
      previewUrl: createInlineFavoritePreviewUrl(record),
    } satisfies InlineFavoriteTreeNodeData,
  };
}

/**
 * 构建图片节点显示文本
 * @param record 收藏记录
 * @returns 文件名风格的展示文本
 */
function formatInlineFavoriteImageLabel(record: InlineImageFavoriteListItem): string {
  const date = new Date(record.createdAt);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

/**
 * 构建默认展开状态（仅展开角色节点）
 * @param nodes 当前树节点
 * @returns 默认展开 key 映射
 */
function buildInlineFavoriteExpandedKeys(nodes: TreeNode[]): TreeTableExpandedKeys {
  return nodes.reduce((keys, node) => ({ ...keys, [node.key as string]: true }), {});
}

/**
 * 从 selection-keys 中提取已选中的图片 ID 列表
 * @param keys TreeTable checkbox 选择映射
 * @returns 图片记录 ID 列表
 */
function extractSelectedImageIds(keys: TreeTableSelectionKeys): number[] {
  if (!keys) return [];
  const ids: number[] = [];
  for (const [key, value] of Object.entries(keys)) {
    if (!key.startsWith(IMAGE_KEY_PREFIX) || !isCheckboxChecked(value)) continue;
    const id = Number(key.slice(IMAGE_KEY_PREFIX.length));
    if (Number.isFinite(id)) ids.push(id);
  }
  return ids;
}

/**
 * 判断 TreeTable checkbox 选择项是否处于完全选中态
 * @param value selection-keys 中的值
 * @returns 是否完全选中
 */
function isCheckboxChecked(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (value && typeof value === 'object' && 'checked' in value) {
    return Boolean((value as { checked?: boolean }).checked);
  }
  return false;
}

/**
 * 创建收藏缩略图 Object URL
 * @param record 收藏记录
 * @returns 可渲染预览 URL
 */
function createInlineFavoritePreviewUrl(record: InlineImageFavoriteListItem): string {
  const objectUrl = URL.createObjectURL(record.imageBlob);
  objectUrls.add(objectUrl);
  return objectUrl;
}

/**
 * 清理全部收藏缩略图 Object URL
 */
function clearInlineFavoritePreviewUrls(): void {
  objectUrls.forEach(url => URL.revokeObjectURL(url));
  objectUrls.clear();
}

/**
 * 去除名称中的 .png 扩展名
 * @param name 文件名，如 "Claude.png" 或 "Claude.png - 2026-06-29@13h58m44s"
 * @returns 去掉 .png 后的名称
 */
function stripPngExtension(name: string): string {
  return name.replace('.png', '');
}
</script>

<style scoped>
@reference '../../global.css';

.cv-favorite-batch-bar {
  @apply flex flex-wrap items-center justify-between;
  gap: var(--cv-space-md);
}

.cv-favorite-batch-count {
  color: var(--cv-on-surface-variant);
  font-size: var(--cv-font-size-xs);
}

.cv-favorite-batch-actions {
  @apply flex flex-wrap items-center justify-end;
  gap: var(--cv-space-3xl);
}

.cv-favorite-tree-panel {
  @apply overflow-hidden;
}

.cv-favorite-tree :deep(.p-treetable-table) {
  table-layout: fixed;
  width: 100%;
}

/* 列表头行无内容，隐藏避免空白行 */
.cv-favorite-tree :deep(.p-treetable-thead) {
  display: none;
}

/* 第一列：确保内容不溢出 */
.cv-favorite-tree :deep(.p-treetable-tbody > tr > td:first-child) {
  overflow: hidden;
}

.cv-favorite-tree-label {
  @apply flex min-w-0 items-center;
  gap: var(--cv-space-md);
}

.cv-favorite-tree-label > i {
  @apply shrink-0;
  color: var(--cv-on-surface-variant);
}

.cv-favorite-tree-thumb {
  @apply shrink-0 object-cover;
  width: 2rem;
  height: 2rem;
  border-radius: var(--cv-radius-sm);
  background: var(--cv-surface-container-high);
}

.cv-favorite-tree-text {
  @apply overflow-hidden text-ellipsis whitespace-nowrap;
}

.cv-favorite-tree-actions {
  @apply inline-flex items-center;
  gap: var(--cv-space-2xl);
}

/* 下载按钮（第一个操作按钮）使用次要前景色 */
.cv-favorite-tree-actions > :first-child :deep(.cv-prime-icon) {
  color: var(--cv-on-surface-variant);
}

.cv-favorite-empty {
  @apply flex items-center justify-center text-center;
  min-height: 9rem;
  padding: var(--cv-space-2xl);
  border: var(--cv-border-width) dashed var(--cv-surface-variant);
  border-radius: var(--cv-radius);
  background: color-mix(in srgb, var(--cv-surface-container-low) 42%, transparent);
  color: var(--cv-on-surface-variant);
}
</style>

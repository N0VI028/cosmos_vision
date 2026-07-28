<template>
  <Dialog
    v-model:visible="visible"
    modal
    :base-z-index="VARIABLE_PICKER_DIALOG_Z_INDEX"
    :auto-z-index="true"
    :pt="variablePickerDialogPt"
    :closable="true"
    :close-on-escape="true"
    :draggable="false"
    :class="dialogClass"
    header="插入宏变量"
    :style="dialogStyle"
    :content-style="contentStyle"
    @show="onDialogShow"
  >
    <div class="flex h-[32rem] max-h-[75vh] w-full flex-col gap-(--cv-space-lg) overflow-hidden">
      <!-- 作用域切换按钮组与搜索框 -->
      <div class="flex shrink-0 flex-col gap-(--cv-space-md)">
        <div class="grid w-full grid-cols-4 gap-(--cv-space-sm) max-[36rem]:grid-cols-2 max-[24rem]:grid-cols-1">
          <Button
            v-for="scope in VARIABLE_SCOPES"
            :key="scope.type"
            :label="scope.label"
            :size="'small'"
            :severity="activeScope === scope.type ? 'primary' : 'secondary'"
            :outlined="activeScope !== scope.type"
            class="w-full"
            @click="selectScope(scope.type)"
          />
        </div>
        <div class="relative w-full">
          <InputText v-model="searchKeyword" placeholder="搜索变量名称、路径或摘要..." class="w-full text-(length:--cv-font-size-base)" />
        </div>
      </div>

      <!-- 主区域：树视图或状态提示 -->
      <div
        class="custom-scrollbar min-h-0 flex-1 overflow-x-hidden overflow-y-auto rounded border border-(--cv-outline-variant)"
      >
        <div
          v-if="currentScopeResult?.error"
          class="flex flex-col items-center justify-center p-8 text-center text-(--cv-error)"
        >
          <i class="fa-solid fa-triangle-exclamation mb-2 text-(length:--cv-font-size-2xl)"></i>
          <span>{{ currentScopeResult.error }}</span>
        </div>

        <div
          v-else-if="!fullTreeNodes.length"
          class="flex flex-col items-center justify-center p-8 text-center text-(--cv-on-surface-variant)"
        >
          <i class="fa-regular fa-folder-open mb-2 text-(length:--cv-font-size-2xl)"></i>
          <span>该作用域暂无变量数据</span>
        </div>

        <div
          v-else-if="!filteredTreeNodes.length"
          class="flex flex-col items-center justify-center p-8 text-center text-(--cv-on-surface-variant)"
        >
          <i class="fa-solid fa-magnifying-glass mb-2 text-(length:--cv-font-size-2xl)"></i>
          <span>未匹配到相关变量</span>
        </div>

        <Tree
          v-else
          :value="filteredTreeNodes"
          selection-mode="single"
          :selection-keys="selectionKeys"
          :expanded-keys="expandedKeys"
          class="w-full overflow-x-hidden text-(length:--cv-font-size-xs) [&_.p-tree-node-content]:w-full [&_.p-tree-node-content]:min-w-0 [&_.p-tree-node-label]:w-full [&_.p-tree-node-label]:min-w-0 [&_.p-tree-node-label]:break-all [&_.p-tree-node-label]:whitespace-normal"
          @node-select="onNodeSelect"
          @node-expand="onNodeExpand"
          @node-collapse="onNodeCollapse"
        >
          <template #default="slotProps">
            <div
              class="flex w-full min-w-0 flex-1 cursor-pointer flex-wrap items-baseline justify-start gap-x-(--cv-space-md) gap-y-0.5 py-0.5 select-none"
              :class="{ 'opacity-50': !slotProps.node.insertable }"
            >
              <div class="flex min-w-0 shrink-0 items-center gap-(--cv-space-xs)">
                <span class="font-mono text-(length:--cv-font-size-xs) font-medium break-all text-(--cv-on-surface)">
                  {{ slotProps.node.label }}{{ slotProps.node.summary ? ':' : '' }}
                </span>
                <span v-if="!slotProps.node.insertable" class="shrink-0 text-(length:--cv-font-size-xs) text-(--cv-error)"> (不可用) </span>
              </div>
              <span
                v-if="slotProps.node.summary"
                class="min-w-0 flex-1 text-left font-mono text-(length:--cv-font-size-xs) break-all whitespace-normal text-(--cv-on-surface-variant)"
              >
                {{ slotProps.node.summary }}
              </span>
            </div>
          </template>
        </Tree>
      </div>

      <!-- 底部预览与确认 -->
      <div class="flex shrink-0 flex-col gap-(--cv-space-xs) pt-2">
        <div v-if="selectedNode" class="flex flex-col gap-1 text-(length:--cv-font-size-xs)">
          <div class="flex items-center gap-2 font-mono">
            <span class="text-(--cv-on-surface-variant)">宏预览:</span>
            <span class="rounded bg-(--cv-surface-container) px-1.5 py-0.5 font-bold text-(--cv-on-surface)">
              {{ currentMacroPreview }}
            </span>
          </div>
          <div v-if="!selectedNode.insertable" class="text-(length:--cv-font-size-xs) text-(--cv-error)">
            {{ selectedNode.disableReason }}
          </div>
        </div>
        <div v-else class="py-1 text-(length:--cv-font-size-xs) text-(--cv-on-surface-variant)">请选择要插入的变量节点</div>
      </div>
    </div>

    <template #footer>
      <div class="cv-confirm-actions">
        <Button label="取消" text @click="closeDialog" />
        <Button label="插入" :disabled="!canInsert" @click="confirmInsert" />
      </div>
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useMediaQuery } from '@vueuse/core';
import Dialog, { type DialogPassThroughOptions } from 'primevue/dialog';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Tree from 'primevue/tree';
import type { TreeNode } from 'primevue/treenode';

import { DARK_CLASS } from '@/constants/default-settings';
import {
  VARIABLE_SCOPES,
  type VariableScopeType,
  fetchScopeVariables,
  type ScopeVariableFetchResult,
} from '@/services/tavern-helper/variables';
import {
  type VariableTreeNode,
  buildVariableTree,
  buildVariableMacro,
  filterVariableTreeNodes,
  collectExpandedKeys,
} from '@/panel/components/prompt-variable-picker';

const visible = defineModel<boolean>('visible', { required: true });

const props = withDefaults(defineProps<{ darkMode?: boolean }>(), {
  darkMode: false,
});

const emit = defineEmits<{
  insert: [macro: string];
}>();

const isMobile = useMediaQuery('(max-width: 87.5em)');
const activeScope = ref<VariableScopeType>('global');
const searchKeyword = ref('');
const selectedNode = ref<VariableTreeNode | null>(null);

const scopeResults = ref<Record<VariableScopeType, ScopeVariableFetchResult>>({
  global: { data: null, error: null },
  character: { data: null, error: null },
  chat: { data: null, error: null },
  message: { data: null, error: null },
});

const scopeExpandedKeys = ref<Record<VariableScopeType, Record<string, boolean>>>({
  global: {},
  character: {},
  chat: {},
  message: {},
});

const VARIABLE_PICKER_DIALOG_Z_INDEX = 120000;
const variablePickerDialogPt = {
  mask: {
    class: 'cv-dialog-mask',
    style: { zIndex: VARIABLE_PICKER_DIALOG_Z_INDEX },
  },
} satisfies DialogPassThroughOptions;

const dialogClass = computed(() => [
  'cv-confirm-dialog',
  'cv-variable-picker-dialog',
  { [DARK_CLASS]: props.darkMode },
]);

const dialogStyle = computed(() =>
  isMobile.value
    ? { width: 'calc(100vw - 2rem)', maxWidth: '36rem' }
    : { width: '38rem', maxWidth: 'calc(100vw - 3rem)' },
);

const contentStyle = { overflow: 'hidden' } as const;

const currentScopeResult = computed(() => scopeResults.value[activeScope.value]);

const fullTreeNodes = computed(() => buildVariableTree(currentScopeResult.value?.data, activeScope.value));

const filteredTreeNodes = computed(() => filterVariableTreeNodes(fullTreeNodes.value, searchKeyword.value));

const expandedKeys = computed({
  get: () => {
    if (searchKeyword.value.trim()) {
      return collectExpandedKeys(filteredTreeNodes.value);
    }
    return scopeExpandedKeys.value[activeScope.value] || {};
  },
  set: (val: Record<string, boolean>) => {
    if (!searchKeyword.value.trim()) {
      scopeExpandedKeys.value[activeScope.value] = val;
    }
  },
});

const selectionKeys = computed(() => {
  if (!selectedNode.value) return {};
  return { [selectedNode.value.key]: true };
});

const currentMacroPreview = computed(() => {
  if (!selectedNode.value) return '';
  return buildVariableMacro(activeScope.value, selectedNode.value.segments);
});

const canInsert = computed(() => {
  return Boolean(selectedNode.value && selectedNode.value.insertable);
});

/**
 * 切换活动作用域并清空当前选中项
 * @param scope 目标作用域
 */
function selectScope(scope: VariableScopeType): void {
  activeScope.value = scope;
  selectedNode.value = null;
}

/**
 * 处理 Tree 节点选中
 * @param node 选中的 TreeNode
 */
function onNodeSelect(node: TreeNode): void {
  selectedNode.value = (node as unknown as VariableTreeNode) || null;
}

/**
 * 展开节点回调
 * @param node 展开的节点
 */
function onNodeExpand(node: TreeNode): void {
  if (!searchKeyword.value.trim()) {
    scopeExpandedKeys.value[activeScope.value] = {
      ...scopeExpandedKeys.value[activeScope.value],
      [node.key as string]: true,
    };
  }
}

/**
 * 折叠节点回调
 * @param node 折叠的节点
 */
function onNodeCollapse(node: TreeNode): void {
  if (!searchKeyword.value.trim()) {
    const next = { ...scopeExpandedKeys.value[activeScope.value] };
    delete next[node.key as string];
    scopeExpandedKeys.value[activeScope.value] = next;
  }
}

/**
 * 打开弹窗时重新抓取所有作用域的最新变量快照
 */
function onDialogShow(): void {
  searchKeyword.value = '';
  selectedNode.value = null;
  activeScope.value = 'global';
  for (const s of VARIABLE_SCOPES) {
    scopeResults.value[s.type] = fetchScopeVariables(s.type);
  }
}

/**
 * 关闭弹窗
 */
function closeDialog(): void {
  visible.value = false;
}

/**
 * 提交插入选中的变量宏
 */
function confirmInsert(): void {
  if (!canInsert.value || !selectedNode.value) return;
  const macro = currentMacroPreview.value;
  visible.value = false;
  emit('insert', macro);
}
</script>

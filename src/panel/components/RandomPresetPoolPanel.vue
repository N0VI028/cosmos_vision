<template>
  <div class="flex flex-col gap-(--cv-space-lg)">
    <!-- 总开关 -->
    <div class="cv-field-control">
      <div class="cv-field-inline mb-0!">
        <span>启用随机提示词预设池</span>
        <ToggleSwitch v-model="settings.randomPresetPools.enabled" />
      </div>
      <div class="cv-field-hint">
        开启后，新触发的生图会按下方已启用预设池的匹配条件随机选用池内预设，用于增加画风等内容的随机性。
      </div>
    </div>

    <!-- 预设池列表 -->
    <div class="flex flex-col gap-(--cv-space-lg)">
      <CollapsiblePanelItem
        v-for="(pool, index) in visiblePools"
        :key="pool.id"
        :title="getPoolTitle(pool, index)"
        :collapsed="!expandedIds.has(pool.id)"
        :is-editing="editingPoolId === pool.id"
        @toggle="togglePool(pool.id)"
      >
        <template #title>
          <div v-if="editingPoolId === pool.id" class="flex h-8 min-w-0 flex-1 items-center gap-(--cv-space-md)">
            <InputText
              v-model="editingDraft"
              class="h-8 min-w-0 flex-1"
              size="small"
              autofocus
              @click.stop
              @keydown.enter.stop.prevent="finishEditing(pool)"
              @keydown.esc.stop.prevent="finishEditing(pool)"
            />
            <CvMiniButton icon="fa-regular fa-check" title="完成" aria-label="完成重命名" @click.stop="finishEditing(pool)" />
          </div>
          <div v-else class="flex h-8 min-w-0 items-center gap-(--cv-space-sm)">
            <span
              class="block min-w-0 flex-[0_1_auto] overflow-hidden text-ellipsis whitespace-nowrap font-semibold text-(--cv-on-surface) leading-8"
            >
              {{ getPoolTitle(pool, index) }}
            </span>
            <CvMiniButton icon="fa-regular fa-pen" title="重命名" aria-label="重命名预设池" @click.stop="toggleEditing(pool)" />
          </div>
        </template>

        <template #actions>
          <CvMiniToggleSwitch v-model="pool.enabled" title="启用/禁用" aria-label="启用或禁用预设池" />
          <CvMiniButton
            icon="fa-regular fa-trash"
            tone="danger"
            title="删除预设池"
            aria-label="删除预设池"
            @click="deletePool(pool.id)"
          />
        </template>

        <!-- 折叠面板内容区：预设池配置表单 -->
        <div class="flex flex-col gap-(--cv-space-xl) p-(--cv-space-xl)">
          <!-- 范围 (Select) -->
          <label class="cv-field">
            <span>适用范围</span>
            <div class="cv-field-control">
              <Select
                :model-value="pool.side"
                :options="sideOptions"
                option-label="label"
                option-value="value"
                fluid
                @update:model-value="(side: RandomPresetPoolSide) => handleSideChange(pool, side)"
              />
            </div>
          </label>

          <!-- 触发模式 (Select) -->
          <label class="cv-field">
            <span>触发模式</span>
            <div class="cv-field-control">
              <Select
                v-model="pool.triggerMode"
                :options="triggerModeOptions"
                option-label="label"
                option-value="value"
                fluid
              />
            </div>
          </label>

          <!-- 按模型触发时的多选 -->
          <label v-if="pool.triggerMode === 'model'" class="cv-field">
            <span>匹配 NovelAI 模型</span>
            <div class="cv-field-control">
              <MultiSelect
                v-model="pool.triggerModels"
                :options="modelOptions"
                option-label="label"
                option-value="value"
                placeholder="请选择生效的模型（可多选）"
                display="chip"
                fluid
              />
            </div>
          </label>

          <!-- 按工作流触发时的多选 -->
          <label v-if="pool.triggerMode === 'workflow'" class="cv-field">
            <span>匹配 ComfyUI 工作流</span>
            <div class="cv-field-control">
              <MultiSelect
                v-model="pool.triggerWorkflowIds"
                :options="workflowOptions"
                option-label="label"
                option-value="value"
                placeholder="请选择生效的工作流（可多选）"
                display="chip"
                fluid
              />
            </div>
          </label>

          <!-- 池内预设选择 (多选下拉) -->
          <div class="cv-field">
            <span>包含预设</span>
            <div class="cv-field-control">
              <MultiSelect
                v-model="pool.presetIds"
                :options="getAvailablePresetsForSide(pool.side)"
                option-label="name"
                option-value="id"
                placeholder="请选择包含的预设（可多选）"
                display="chip"
                fluid
              />
            </div>
          </div>
        </div>
      </CollapsiblePanelItem>
    </div>

    <!-- 添加预设池按钮 -->
    <div class="flow-root">
      <CvAddEntryButton label="添加预设池" @click="addPool" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { uuidv4 } from '@sillytavern/scripts/utils';
import { NOVELAI_MODELS } from '@/constants/novelai';
import {
  createRandomPresetPool,
  type RandomPresetPool,
  type RandomPresetPoolSide,
  type RandomPresetPoolTriggerMode,
} from '@/constants/random-preset-pool';
import CollapsiblePanelItem from '@/panel/components/CollapsiblePanelItem.vue';
import CvAddEntryButton from '@/panel/components/CvAddEntryButton.vue';
import CvMiniButton from '@/panel/components/CvMiniButton.vue';
import CvMiniToggleSwitch from '@/panel/components/CvMiniToggleSwitch.vue';
import { getPoolsForSource } from '@/services/image-prompt/random-preset-pool';
import { useSettingsStore } from '@/store/settings';

const props = defineProps<{
  /** 当前面板所在 Tab 的图像源（决定可见池与可选项） */
  source: 'novelai' | 'comfyui';
}>();

const { settings } = useSettingsStore();

/** 展开的折叠面板 ID 集合 */
const expandedIds = ref(new Set<string>());

/** 正在重命名的预设池 ID */
const editingPoolId = ref<string | null>(null);

/** 重命名草稿：进入编辑时预填旧名称，确认时写回 pool.name */
const editingDraft = ref<string>('');

/** 对当前图像源可能生效的预设池列表 */
const visiblePools = computed(() => getPoolsForSource(settings.randomPresetPools.pools, props.source));

/** 范围选项（lora 仅 ComfyUI） */
const sideOptions = computed<Array<{ label: string; value: RandomPresetPoolSide }>>(() =>
  props.source === 'comfyui'
    ? [
        { label: '正面', value: 'positive' },
        { label: '负面', value: 'negative' },
        { label: 'LoRA', value: 'lora' },
      ]
    : [
        { label: '正面', value: 'positive' },
        { label: '负面', value: 'negative' },
      ],
);

/** 触发模式选项（按模型仅 NovelAI，按工作流仅 ComfyUI） */
const triggerModeOptions = computed<Array<{ label: string; value: RandomPresetPoolTriggerMode }>>(() =>
  props.source === 'comfyui'
    ? [
        { label: '全部生效', value: 'always' },
        { label: '按工作流', value: 'workflow' },
      ]
    : [
        { label: '全部生效', value: 'always' },
        { label: '按模型', value: 'model' },
      ],
);

/** NovelAI 模型选项列表 */
const modelOptions = [...NOVELAI_MODELS];

/** ComfyUI 工作流预设选项列表 */
const workflowOptions = computed(() =>
  settings.comfyui.workflowPresets.presets.map(p => ({
    label: p.name,
    value: p.id,
  })),
);

/**
 * 获取预设池标题（无名称时回退序号）
 * @param pool 预设池
 * @param index 可见列表中的序号
 * @returns 标题字符串
 */
function getPoolTitle(pool: RandomPresetPool, index: number): string {
  return pool.name || `预设池 ${index + 1}`;
}

/**
 * 进入重命名模式，预填当前名称
 * @param pool 目标预设池
 */
function toggleEditing(pool: RandomPresetPool): void {
  editingPoolId.value = pool.id;
  editingDraft.value = pool.name;
}

/**
 * 完成重命名，将草稿写回预设池名称（trim 防止纯空格绕过序号回退）
 * @param pool 目标预设池
 */
function finishEditing(pool: RandomPresetPool): void {
  if (editingPoolId.value !== pool.id) return;
  pool.name = editingDraft.value.trim();
  editingPoolId.value = null;
  editingDraft.value = '';
}

/**
 * 切换指定预设池的展开/折叠状态
 * @param poolId 预设池 ID
 */
function togglePool(poolId: string): void {
  const next = new Set(expandedIds.value);
  if (next.has(poolId)) {
    next.delete(poolId);
  } else {
    next.add(poolId);
  }
  expandedIds.value = next;
}

/**
 * 添加新的预设池
 */
function addPool(): void {
  const newPool = createRandomPresetPool(uuidv4(), { name: '新预设池', side: 'positive' });
  settings.randomPresetPools.pools.push(newPool);
  expandedIds.value = new Set([...expandedIds.value, newPool.id]);
}

/**
 * 删除指定预设池
 * @param poolId 预设池 ID
 */
function deletePool(poolId: string): void {
  const pools = settings.randomPresetPools.pools;
  const index = pools.findIndex(p => p.id === poolId);
  if (index >= 0) {
    pools.splice(index, 1);
  }
  const next = new Set(expandedIds.value);
  next.delete(poolId);
  expandedIds.value = next;
  if (editingPoolId.value === poolId) {
    editingPoolId.value = null;
    editingDraft.value = '';
  }
}

/**
 * 获取指定范围的可用预设（lora 侧为 ComfyUI LoRA 预设组）
 * @param side 范围
 * @returns 预设列表
 */
function getAvailablePresetsForSide(side: RandomPresetPoolSide): Array<{ id: string; name: string }> {
  if (side === 'lora') {
    return settings.comfyui.loraPresets.presets;
  }
  return settings.imagePromptPresets[side] ?? [];
}

/**
 * 切换范围时的处理：过滤掉非当前范围的预设 ID
 * @param pool 目标预设池
 * @param newSide 新范围
 */
function handleSideChange(pool: RandomPresetPool, newSide: RandomPresetPoolSide): void {
  pool.side = newSide;
  const availablePresetIds = new Set(getAvailablePresetsForSide(newSide).map(p => p.id));
  pool.presetIds = pool.presetIds.filter(id => availablePresetIds.has(id));
}
</script>

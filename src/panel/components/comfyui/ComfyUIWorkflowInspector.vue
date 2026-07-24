<template>
  <!-- 非全屏且无节点选中时展示空状态 -->
  <div
    v-if="!fullscreen && (!nodeId || !node)"
    class="rounded-(--cv-radius) border-(length:--cv-border-width) border-solid border-(--cv-surface-variant) bg-(--cv-surface-container) p-(--cv-space-5xl) text-center text-(length:--cv-font-size-sm) text-(--cv-on-surface-variant)"
  >
    点击画布节点以编辑参数
  </div>

  <!-- 有节点选中时渲染详情面板；cv-lightbox-info 供 Editor 全屏叠层任意后代选择器 -->
  <div
    v-else-if="nodeId && node"
    class="cv-workflow-inspector flex flex-col"
    :class="[
      fullscreen
        ? 'cv-lightbox-info max-h-[80%] rounded-t-(--cv-radius) border-t-(length:--cv-border-width) border-r-(length:--cv-border-width) border-l-(length:--cv-border-width) border-solid border-(--cv-surface-variant) bg-(--cv-surface-container-low)'
        : 'cv-workflow-inspector__container overflow-hidden rounded-(--cv-radius-sm) border-(length:--cv-border-width) border-solid border-(--cv-surface-variant) bg-(--cv-surface-container-low)',
      { 'cv-info-collapsed max-h-14': isCollapsed && fullscreen },
    ]"
  >
    <div
      :class="
        fullscreen
          ? 'cv-lightbox-info-header cursor-pointer select-none'
          : 'flex cursor-pointer items-center justify-between bg-(--cv-surface-container-low) px-(--cv-space-xl) py-(--cv-space-lg) select-none'
      "
      @click="isCollapsed = !isCollapsed"
    >
      <div class="flex min-w-0 flex-auto items-center gap-(--cv-space-lg) overflow-hidden">
        <i
          class="fa-solid shrink-0 text-(--cv-on-surface-variant)"
          :class="isCollapsed ? 'fa-chevron-right' : 'fa-chevron-down'"
        />
        <span
          class="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-semibold text-(--cv-on-surface)"
        >{{ displayName }}</span>
        <span
          class="shrink-0 font-mono text-(length:--cv-font-size-sm) text-(--cv-on-surface-variant)"
        >#{{ nodeId }}</span>
      </div>
      <div class="flex shrink-0 items-center gap-(--cv-space-md)" @click.stop>
        <CvMiniButton
          :icon="isFavorite ? 'fa-solid fa-star' : 'fa-regular fa-star'"
          :label="isFavorite ? '取消收藏' : '收藏'"
          :tone="isFavorite ? 'warn' : 'neutral'"
          :title="isFavorite ? '取消收藏该节点' : '收藏该节点以便快速定位'"
          @click="emit('toggle-favorite')"
        />
        <template v-if="fullscreen">
          <button
            type="button"
            class="cv-lightbox-toggle-btn"
            :title="isCollapsed ? '展开参数' : '隐藏参数'"
            @click="isCollapsed = !isCollapsed"
          >
            <i class="fa-solid" :class="isCollapsed ? 'fa-eye' : 'fa-eye-slash'" aria-hidden="true" />
            <span>{{ isCollapsed ? '显示参数' : '隐藏参数' }}</span>
          </button>
        </template>
      </div>
    </div>

    <!-- 非全屏用 v-show；全屏由 CSS opacity 过渡，v-show 恒显示 -->
    <div
      v-show="fullscreen || !isCollapsed"
      :class="['flex flex-col overflow-y-auto', { 'cv-lightbox-info-body': fullscreen }]"
    >
      <section class="flex flex-col border-t-(length:--cv-border-width) border-t-solid border-t-(--cv-surface-variant)">
        <div
          class="flex min-h-11 items-center justify-between gap-(--cv-space-lg) bg-(--cv-surface-container) px-(--cv-space-xl) py-(--cv-space-md)"
        >
          <div
            class="flex min-w-0 items-center gap-(--cv-space-sm) text-(length:--cv-font-size-sm) font-semibold text-(--cv-on-surface)"
          >
            <i class="fa-solid fa-sliders w-4 text-center text-(--cv-on-surface-variant)" aria-hidden="true" />
            <span>可调参数</span>
            <span
              class="min-w-5 rounded-full bg-(--cv-surface-container-highest) px-(--cv-space-xs) py-[0.05rem] text-center font-mono text-(length:--cv-font-size-2xs) text-(--cv-on-surface-variant)"
            >{{ parameterCount }}</span>
          </div>
        </div>
        <div class="flex flex-col px-(--cv-space-xl)">
          <ComfyUILoraPresetPanel
            v-if="showLoraPanel && loraPresetSettings"
            :preset-settings="loraPresetSettings"
            :lora-options="loraOptions"
            :is-loading-loras="isLoadingLoras"
            @update:preset-settings="emit('update:lora-preset-settings', $event)"
            @refresh-options="emit('refresh-lora-options')"
          />
          <Divider
            v-if="showLoraPanel && loraPresetSettings && parameterControls.length"
            :dt="dividerTokens"
          />
          <ComfyUIWorkflowInput
            v-for="control in parameterControls"
            :key="`${control.nodeId}:${control.inputName}`"
            :control="control"
            :online="online"
            :comfyui-url="comfyuiUrl"
            @update:value="value => emit('update:input', control.inputName, value)"
            @update:prompt-binding="binding => emit('update:prompt-binding', control.inputName, binding)"
            @update:seed-mode="mode => emit('update:seed-mode', control.inputName, mode)"
          />
          <div
            v-if="!parameterCount"
            class="py-(--cv-space-lg) text-(length:--cv-font-size-xs) text-(--cv-on-surface-variant)"
          >无可调参数</div>
        </div>
      </section>

      <section class="flex flex-col border-t-(length:--cv-border-width) border-t-solid border-t-(--cv-surface-variant)">
        <div
          class="flex min-h-11 items-center justify-between gap-(--cv-space-lg) bg-(--cv-surface-container) px-(--cv-space-xl) py-(--cv-space-md)"
        >
          <div
            class="flex min-w-0 items-center gap-(--cv-space-sm) text-(length:--cv-font-size-sm) font-semibold text-(--cv-on-surface)"
          >
            <i class="fa-solid fa-arrow-right-to-bracket w-4 text-center text-(--cv-on-surface-variant)" aria-hidden="true" />
            <span>输入</span>
            <span
              class="min-w-5 rounded-full bg-(--cv-surface-container-highest) px-(--cv-space-xs) py-[0.05rem] text-center font-mono text-(length:--cv-font-size-2xs) text-(--cv-on-surface-variant)"
            >{{ inputControls.length }}</span>
          </div>
        </div>
        <div class="flex flex-col px-(--cv-space-xl) pt-(--cv-space-sm) pb-(--cv-space-lg)">
          <div
            v-for="control in inputControls"
            :key="control.inputName"
            class="group/port flex min-h-10 items-center justify-between gap-(--cv-space-xl) border-b-(length:--cv-border-width) border-b-solid border-b-(--cv-surface-variant) py-(--cv-space-sm) last:border-b-0"
          >
            <div class="flex min-w-0 items-center gap-(--cv-space-sm)">
              <span class="min-w-7 font-mono text-(length:--cv-font-size-2xs) text-(--cv-on-surface-variant)">IN</span>
              <span
                class="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-(length:--cv-font-size-sm) font-semibold text-(--cv-on-surface)"
              >{{ control.label }}</span>
              <span
                class="rounded-(--cv-radius-sm) border-(length:--cv-border-width) border-solid border-(--cv-outline) px-(--cv-space-sm) py-[0.1rem] font-mono text-(length:--cv-font-size-2xs) text-(--cv-on-surface-variant)"
              >{{ control.dataType ?? 'UNKNOWN' }}</span>
            </div>
            <div class="flex shrink-0 items-center gap-(--cv-space-lg)">
              <ComfyUIResultBindingButton
                v-if="isResultInput(control)"
                :active="isImageOutput"
                :disabled="!online"
                @click="emit('set-image-output', nodeId!)"
              />
            </div>
          </div>
          <div
            v-if="!inputControls.length"
            class="py-(--cv-space-lg) text-(length:--cv-font-size-xs) text-(--cv-on-surface-variant)"
          >无连线输入</div>
        </div>
      </section>

      <section class="flex flex-col border-t-(length:--cv-border-width) border-t-solid border-t-(--cv-surface-variant)">
        <div
          class="flex min-h-11 items-center justify-between gap-(--cv-space-lg) bg-(--cv-surface-container) px-(--cv-space-xl) py-(--cv-space-md)"
        >
          <div
            class="flex min-w-0 items-center gap-(--cv-space-sm) text-(length:--cv-font-size-sm) font-semibold text-(--cv-on-surface)"
          >
            <i class="fa-solid fa-arrow-right-from-bracket w-4 text-center text-(--cv-on-surface-variant)" aria-hidden="true" />
            <span>输出</span>
            <span
              class="min-w-5 rounded-full bg-(--cv-surface-container-highest) px-(--cv-space-xs) py-[0.05rem] text-center font-mono text-(length:--cv-font-size-2xs) text-(--cv-on-surface-variant)"
            >{{ outputs.length }}</span>
          </div>
        </div>
        <div class="flex flex-col px-(--cv-space-xl) pt-(--cv-space-sm) pb-(--cv-space-lg)">
          <div
            v-for="output in outputs"
            :key="output.index"
            class="group/port flex min-h-10 items-center justify-between gap-(--cv-space-xl) border-b-(length:--cv-border-width) border-b-solid border-b-(--cv-surface-variant) py-(--cv-space-sm) last:border-b-0"
          >
            <div class="flex min-w-0 items-center gap-(--cv-space-sm)">
              <span class="min-w-7 font-mono text-(length:--cv-font-size-2xs) text-(--cv-on-surface-variant)">{{ output.index }}</span>
              <span
                class="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-(length:--cv-font-size-sm) font-semibold text-(--cv-on-surface)"
              >{{ output.name }}</span>
              <span
                class="rounded-(--cv-radius-sm) border-(length:--cv-border-width) border-solid border-(--cv-outline) px-(--cv-space-sm) py-[0.1rem] font-mono text-(length:--cv-font-size-2xs) text-(--cv-on-surface-variant)"
              >{{ output.type }}</span>
              <span
                v-if="output.isList"
                class="rounded-(--cv-radius-sm) border-(length:--cv-border-width) border-solid border-(--p-primary-color) px-(--cv-space-sm) py-[0.1rem] font-mono text-(length:--cv-font-size-2xs) text-(--p-primary-color)"
              >LIST</span>
            </div>
            <div class="flex shrink-0 items-center gap-(--cv-space-lg)">
              <ComfyUIResultBindingButton
                v-if="isResultOutput(output)"
                :active="isImageOutput"
                :disabled="!online"
                @click="emit('set-image-output', nodeId!)"
              />
            </div>
          </div>
          <div
            v-if="!outputs.length"
            class="py-(--cv-space-lg) text-(length:--cv-font-size-xs) text-(--cv-on-surface-variant)"
          >{{ outputEmptyText }}</div>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ComfyUILoraPresetSettings } from '@/constants/comfyui';
import CvMiniButton from '@/panel/components/CvMiniButton.vue';
import ComfyUILoraPresetPanel from '@/panel/components/ComfyUILoraPresetPanel.vue';
import ComfyUIResultBindingButton from '@/panel/components/comfyui/ComfyUIResultBindingButton.vue';
import ComfyUIWorkflowInput from '@/panel/components/comfyui/ComfyUIWorkflowInput.vue';
import { readNodeDisplayName } from '@/services/comfyui/layout';
import { isLoraPanelManagedInput, isSupportedLoraNode } from '@/services/comfyui/lora-adapter';
import { readNodeMeta } from '@/services/comfyui/meta';
import type {
  ComfyUIInputControlDesc,
  ComfyUIObjectInfoOutputSpec,
  ComfyUIWorkflowNode,
  PromptBinding,
  SeedMode,
} from '@/services/comfyui/types';
import type { DividerDesignTokens } from '@primeuix/themes/types/divider';

/** 紧凑 inspector：去掉水平分割线默认上下外边距 */
const dividerTokens = {
  horizontal: { margin: '0' },
} as const satisfies DividerDesignTokens;

const props = withDefaults(
  defineProps<{
    nodeId: string | null;
    node: ComfyUIWorkflowNode | null;
    controls: ComfyUIInputControlDesc[];
    outputs: ComfyUIObjectInfoOutputSpec[];
    canSetOutput: boolean;
    online: boolean;
    isFavorite?: boolean;
    loraPresetSettings?: ComfyUILoraPresetSettings;
    loraOptions: { value: string; label: string }[];
    isLoadingLoras: boolean;
    fullscreen?: boolean;
    comfyuiUrl?: string;
  }>(),
  {
    fullscreen: false,
    isFavorite: false,
    loraPresetSettings: undefined,
    comfyuiUrl: '',
  },
);

const emit = defineEmits<{
  'set-image-output': [nodeId: string];
  'toggle-favorite': [];
  'update:input': [inputName: string, value: unknown];
  'update:prompt-binding': [inputName: string, binding: PromptBinding | null];
  'update:seed-mode': [inputName: string, mode: SeedMode | null];
  'update:lora-preset-settings': [settings: ComfyUILoraPresetSettings];
  'refresh-lora-options': [];
}>();

const isCollapsed = ref(false);

const displayName = computed(() => {
  if (!props.node || !props.nodeId) return '';
  return readNodeDisplayName(props.node, props.nodeId);
});

const isImageOutput = computed(() => Boolean(props.node && readNodeMeta(props.node).imageOutput));
/** 候选可设，或已绑定（便于取消） */
const showOutputChip = computed(() => props.canSetOutput || isImageOutput.value);
const showLoraPanel = computed(() => isSupportedLoraNode(props.node ?? undefined));

/** LoRA 节点隐藏面板已托管的 text/loras */
const visibleControls = computed(() =>
  props.controls.filter(control => !isLoraPanelManagedInput(props.node ?? undefined, control.inputName)),
);
const parameterControls = computed(() => visibleControls.value.filter(control => control.kind !== 'link'));
const inputControls = computed(() => visibleControls.value.filter(control => control.kind === 'link'));
const parameterCount = computed(() => parameterControls.value.length + Number(showLoraPanel.value));
const outputEmptyText = computed(() => (props.online ? '该节点未声明输出端口' : '同步节点定义后显示输出端口'));
const resultInputName = computed(
  () => inputControls.value.find(control => control.dataType?.toUpperCase() === 'IMAGE')?.inputName ?? null,
);
const resultOutputIndex = computed(() => {
  if (resultInputName.value) return null;
  return props.outputs.find(output => output.type === 'IMAGE')?.index ?? null;
});

/**
 * 判断输入端口是否承载段落生图结果操作
 * @param control 输入控件
 * @returns 是否显示操作
 */
function isResultInput(control: ComfyUIInputControlDesc): boolean {
  return showOutputChip.value && control.inputName === resultInputName.value;
}

/**
 * 判断输出端口是否承载段落生图结果操作
 * @param output 输出端口
 * @returns 是否显示操作
 */
function isResultOutput(output: ComfyUIObjectInfoOutputSpec): boolean {
  return showOutputChip.value && output.index === resultOutputIndex.value;
}

watch(
  () => props.nodeId,
  () => {
    isCollapsed.value = false;
  },
);
</script>

<template>
  <div class="cv-lightbox-image-info-panel" @click.stop>
    <div class="cv-lightbox-image-info-header">
      <span class="cv-lightbox-image-info-title">生成信息</span>
      <span class="cv-lightbox-image-info-badge" :class="sourceKind ? `badge-${sourceKind}` : 'badge-unknown'">{{
        imageSourceBadge
      }}</span>
    </div>

    <div class="cv-lightbox-image-info-body">
      <template v-if="paramRows.length">
        <div v-for="row in paramRows" :key="row.label" class="cv-lightbox-param-row">
          <span class="cv-lightbox-param-label">{{ row.label }}</span>
          <span class="cv-lightbox-param-value" :class="{ 'is-code': row.code }">{{ row.value }}</span>
        </div>
      </template>
      <div v-else class="cv-lightbox-image-info-empty">暂无生成信息</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { InlinePromptSnapshot } from '@/composables/inlineImageLightbox';
import type { NovelAIRequestInfo } from '@/services/novelai/types';
import type { ComfyUILoraSnapshot, ComfyUIRequestSnapshot } from '@/services/comfyui/types';
import { formatLoraDisplayName } from '@/services/comfyui/lora-presets';

interface ParamRow {
  label: string;
  value: string;
  code?: boolean;
}

const props = defineProps<{
  snapshot?: InlinePromptSnapshot;
}>();

/**
 * 格式化数值列表（保留两位小数，以斜杠连接）
 * @param values 数值列表
 * @returns 格式化后的文本
 */
function formatNumberList(values: readonly number[]): string {
  return values.map(value => value.toFixed(2)).join(' / ');
}

/**
 * 构建 NovelAI Vibe 参数摘要行
 * @param vibes Vibe 快照
 * @returns 参数展示行列表
 */
function buildVibeParamRows(vibes?: NovelAIRequestInfo['vibes']): ParamRow[] {
  if (!vibes || !vibes.count) return [{ label: 'Vibe', value: '未启用' }];
  return [
    { label: 'Vibe', value: `${vibes.count} 个（${vibes.resolved ? '已解析' : '待解析'}）` },
    { label: 'Vibe 参考强度', value: formatNumberList(vibes.referenceStrengths), code: true },
    { label: 'Vibe 信息提取', value: formatNumberList(vibes.informationExtracted), code: true },
  ];
}

/**
 * 格式化 ComfyUI 提示词绑定列表
 * @param bindings 提示词绑定列表
 * @returns 格式化后的绑定文本
 */
function formatPromptBindings(bindings?: ComfyUIRequestSnapshot['promptBindings']): string {
  if (!bindings || !bindings.length) return '无';
  return bindings.map(item => `${item.nodeId}.${item.inputName}=${item.binding}`).join(', ');
}

/**
 * 格式化 ComfyUI Seed 列表
 * @param seeds Seed 参数列表
 * @returns 格式化后的 Seed 文本
 */
function formatSeedValues(seeds?: ComfyUIRequestSnapshot['seedValues']): string {
  if (!seeds || !seeds.length) return '无';
  return seeds.map(item => `${item.nodeId}.${item.inputName}:${item.mode}=${item.value}`).join(', ');
}

/**
 * 格式化 ComfyUI 启用的 LoRA 列表
 * @param loras LoRA 快照列表
 * @returns 格式化后的 LoRA 文本
 */
function formatSnapshotLoras(loras?: ComfyUILoraSnapshot[]): string {
  if (!loras || !loras.length) return '无';
  return loras.map(lora => `${formatLoraDisplayName(lora.name)} (${lora.strength})`).join(', ');
}

/**
 * 构建 NovelAI 参数展示行列表
 * @param request NovelAI 请求信息
 * @returns 参数行列表
 */
function buildNovelAIParamRows(request: NovelAIRequestInfo): ParamRow[] {
  return [
    // 优先显示命中账号名称，存量未记录 accountName 的旧快照兜底显示 endpoint 避免空行
    { label: '账号名称', value: request.accountName || request.endpoint, code: true },
    { label: '模型', value: request.model, code: true },
    { label: '图像尺寸', value: `${request.width}x${request.height}` },
    { label: '图片数', value: String(request.imageCount) },
    { label: '采样器', value: request.sampler, code: true },
    { label: 'Seed', value: String(request.seed) },
    { label: '步数', value: String(request.steps) },
    { label: '提示词引导', value: String(request.guidance) },
    { label: 'Auto 采样器', value: request.autoSampler ? '开启' : '关闭' },
    { label: 'Variety+', value: request.varietyPlus ? '开启' : '关闭' },
    { label: 'SMEA', value: request.smea ? '开启' : '关闭' },
    { label: 'DYN', value: request.smeaDyn ? '开启' : '关闭' },
    { label: 'Decrisp', value: request.decrisp ? '开启' : '关闭' },
    { label: '旧版提示词条件模式', value: request.legacyPromptMode ? '开启' : '关闭' },
    { label: '提示词引导重缩放', value: String(request.promptGuidanceRescale) },
    { label: '噪声调度', value: request.noiseSchedule, code: true },
    { label: '负面提示词程度', value: request.ucPreset },
    { label: '正面质量词预设', value: request.qualityPreset },
    ...buildVibeParamRows(request.vibes),
  ];
}

/**
 * 构建 ComfyUI 参数展示行列表
 * @param snapshot ComfyUI 请求快照
 * @returns 参数行列表
 */
function buildComfyUIParamRows(snapshot: ComfyUIRequestSnapshot): ParamRow[] {
  const rows: ParamRow[] = [
    { label: '接口地址', value: `${snapshot.endpoint}/prompt`, code: true },
    { label: '段落生图结果节点', value: snapshot.imageOutputNodeId, code: true },
    { label: '提示词绑定', value: formatPromptBindings(snapshot.promptBindings), code: true },
    { label: 'Seed', value: formatSeedValues(snapshot.seedValues), code: true },
    { label: '启用 LoRA', value: formatSnapshotLoras(snapshot.loras), code: true },
  ];
  if (snapshot.loraPresetId) {
    rows.push({ label: 'LoRA 预设组 ID', value: snapshot.loraPresetId, code: true });
  }
  return rows;
}

/** 推断生图源（极旧快照无 imageSource 时按子对象兜底） */
const sourceKind = computed<'novelai' | 'comfyui' | undefined>(() => {
  const snapshot = props.snapshot;
  if (snapshot?.imageSource) return snapshot.imageSource;
  if (snapshot?.comfyui) return 'comfyui';
  if (snapshot?.novelai || snapshot?.novelaiRequest) return 'novelai';
  return undefined;
});

/** 计算当前生图源展示文案 */
const imageSourceBadge = computed(() => {
  if (sourceKind.value === 'novelai') return 'NovelAI';
  if (sourceKind.value === 'comfyui') return 'ComfyUI';
  return '未知';
});

/** 计算所有参数展示行 */
const paramRows = computed<ParamRow[]>(() => {
  if (props.snapshot?.novelaiRequest) {
    return buildNovelAIParamRows(props.snapshot.novelaiRequest);
  }
  if (props.snapshot?.comfyui) {
    return buildComfyUIParamRows(props.snapshot.comfyui);
  }
  return [];
});
</script>

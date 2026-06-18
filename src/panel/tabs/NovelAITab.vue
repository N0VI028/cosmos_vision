<template>
  <div class="cv-tab-content">
    <!-- API Tab -->
    <template v-if="subTab === 'api'">
      <h2 class="cv-section-title">连接信息</h2>
      <label class="cv-field">
        <span>路由模式</span>
        <Select
          v-model="settings.novelai.routingMode"
          :options="routingModeOptions"
          option-label="label"
          option-value="value"
        />
        <div class="cv-field-hint">{{ routingModeHint }}</div>
      </label>
      <NovelAIAccountList v-model="settings.novelai.accounts" />
      <label class="cv-field">
        <span>CORS 代理 URL</span>
        <InputText v-model="settings.novelai.corsProxy" placeholder="https://your-worker.workers.dev" />
        <div class="cv-field-hint">{{ proxyPreview }}</div>
        <div class="cv-field-warn">⚠ 代理需为"主机重写"型反向代理;第三方代理会看到你的 API Key,推荐自建。</div>
      </label>

      <SubscriptionCard />
    </template>

    <!-- 配置 Tab -->
    <template v-else-if="subTab === 'config'">
      <h2 class="cv-section-title">模型与尺寸</h2>
      <label class="cv-field">
        <span>模型</span>
        <Select v-model="settings.novelai.model" :options="modelOptions" option-label="label" option-value="value" />
      </label>
      <label class="cv-field">
        <span>尺寸预设</span>
        <Select
          v-model="settings.novelai.resolutionPreset"
          :options="resolutionPresetOptions"
          option-label="label"
          option-value="value"
        />
      </label>
      <div v-if="isCustomResolution" class="cv-field-grid">
        <label class="cv-field">
          <span>宽度</span>
          <InputNumber
            v-model="settings.novelai.width"
            :min="imageSizeLimits.min"
            :max="imageSizeLimits.max"
            :step="imageSizeLimits.step"
            :use-grouping="false"
            show-buttons
            @update:model-value="markCustomResolution"
          />
        </label>
        <label class="cv-field">
          <span>高度</span>
          <InputNumber
            v-model="settings.novelai.height"
            :min="imageSizeLimits.min"
            :max="imageSizeLimits.max"
            :step="imageSizeLimits.step"
            :use-grouping="false"
            show-buttons
            @update:model-value="markCustomResolution"
          />
        </label>
      </div>

      <h2 class="cv-section-title">采样参数</h2>
      <div class="cv-field-grid">
        <label class="cv-field">
          <span>步数</span>
          <InputNumber v-model="settings.novelai.steps" :min="1" :max="50" show-buttons />
        </label>
        <label class="cv-field">
          <span>CFG Scale</span>
          <InputNumber v-model="settings.novelai.cfgScale" :min="1" :max="20" :step="0.5" :min-fraction-digits="1" />
        </label>
      </div>
      <label class="cv-field">
        <span>采样器</span>
        <Select
          v-model="settings.novelai.sampler"
          :options="samplerOptions"
          option-label="label"
          option-value="value"
        />
      </label>
      <label class="cv-field">
        <span>负向提示词程度</span>
        <Select
          v-model="settings.novelai.ucPreset"
          :options="ucPresetOptions"
          option-label="label"
          option-value="value"
        />
      </label>
      <label class="cv-field-inline">
        <ToggleSwitch v-model="settings.novelai.addQualityTags" />
        <span>使用官方质量词</span>
      </label>

      <h2 class="cv-section-title">生图提示词</h2>
      <ImagePromptPresetPanel
        :preset-settings="settings.imagePromptPresets"
        :positive-preset-id="settings.novelai.positivePromptPresetId"
        :negative-preset-id="settings.novelai.negativePromptPresetId"
        @update:preset-settings="settings.imagePromptPresets = $event"
        @update:positive-preset-id="settings.novelai.positivePromptPresetId = $event"
        @update:negative-preset-id="settings.novelai.negativePromptPresetId = $event"
      />
    </template>

    <!-- 测试 Tab -->
    <NovelAITestTab v-else />
  </div>
</template>

<script setup lang="ts">
import { useResolutionPreset } from '@/composables/useResolutionPreset';
import {
  NOVELAI_CUSTOM_RESOLUTION_PRESET,
  NOVELAI_IMAGE_SIZE_LIMITS,
  NOVELAI_ROUTING_MODES,
  NOVELAI_MODELS,
  NOVELAI_RESOLUTION_PRESETS,
  NOVELAI_SAMPLERS,
  NOVELAI_UC_PRESETS,
} from '@/constants/novelai';
import ImagePromptPresetPanel from '@/panel/components/ImagePromptPresetPanel.vue';
import SubscriptionCard from '@/panel/components/SubscriptionCard.vue';
import { buildProxiedUrl } from '@/services/novelai/subscription';
import { useSettingsStore } from '@/store/settings';
import NovelAIAccountList from '@/panel/components/NovelAIAccountList.vue';
import NovelAITestTab from './NovelAITestTab.vue';

type NovelAISubTab = 'api' | 'config' | 'test';

const { settings } = useSettingsStore();

const props = defineProps<{ subTab: NovelAISubTab }>();
const subTab = computed(() => props.subTab);

// 注入父组件提供的刷新方法
const refreshSections = inject<(() => void) | undefined>('refreshSections');

// 监听 subTab 变化，通知父组件刷新 section
watch(subTab, () => {
  nextTick(() => {
    refreshSections?.();
  });
});

const modelOptions = [...NOVELAI_MODELS];
const routingModeOptions = [...NOVELAI_ROUTING_MODES];
const resolutionPresetOptions = [
  ...NOVELAI_RESOLUTION_PRESETS,
  { value: NOVELAI_CUSTOM_RESOLUTION_PRESET, label: 'Custom' },
];
const samplerOptions = [...NOVELAI_SAMPLERS];
const ucPresetOptions = [...NOVELAI_UC_PRESETS];
const imageSizeLimits = NOVELAI_IMAGE_SIZE_LIMITS;
const { isCustomResolution, markCustomResolution } = useResolutionPreset(
  settings.novelai,
  NOVELAI_RESOLUTION_PRESETS,
  NOVELAI_CUSTOM_RESOLUTION_PRESET,
);
const routingModeHint = computed(() => {
  return settings.novelai.routingMode === 'load_balance'
    ? '每次请求都会轮换首选账号，失败后继续尝试其它账号'
    : '每次都从列表第一组账号开始，失败后按顺序继续尝试';
});

const proxyPreview = computed(() => {
  const trimmed = settings.novelai.corsProxy.trim();
  if (!trimmed) return '未配置代理时不显示订阅信息，不影响图片生成操作';
  try {
    return `请求 URL: ${buildProxiedUrl(trimmed)}`;
  } catch (err) {
    return err instanceof Error ? err.message : '代理 URL 无效,请检查格式';
  }
});
</script>

<style scoped>
.cv-tab-content {
  display: flex;
  flex-direction: column;
  gap: 0;
}
</style>

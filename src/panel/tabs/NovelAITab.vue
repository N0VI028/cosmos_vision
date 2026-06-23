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
        <div class="cv-field">
          <div class="cv-nai-field-title-row">
            <span>提示词引导</span>
            <div v-if="supportsVarietyPlus || isV3Model" class="cv-nai-title-actions">
              <ToggleButton
                v-if="supportsVarietyPlus"
                v-model="settings.novelai.varietyPlus"
                class="cv-nai-mini-toggle"
                on-label="Var+"
                off-label="Var+"
                on-icon="fa-solid fa-check"
                off-icon="fa-solid fa-xmark"
                aria-label="切换 Variety+"
                size="small"
              />
              <ToggleButton
                v-if="isV3Model"
                v-model="settings.novelai.decrisp"
                class="cv-nai-mini-toggle"
                on-label="Dec"
                off-label="Dec"
                on-icon="fa-solid fa-check"
                off-icon="fa-solid fa-xmark"
                aria-label="切换 Dec"
                size="small"
              />
            </div>
          </div>
          <InputNumber
            v-model="settings.novelai.guidance"
            :min="0"
            :max="10"
            :step="0.1"
            :min-fraction-digits="1"
          />
        </div>
      </div>
      <div class="cv-field cv-nai-sampler-field">
        <div class="cv-nai-field-title-row">
          <span>采样器</span>
          <ToggleButton
            v-if="isV3Model"
            v-model="settings.novelai.autoSampler"
            class="cv-nai-mini-toggle"
            on-label="Auto"
            off-label="Auto"
            on-icon="fa-solid fa-check"
            off-icon="fa-solid fa-xmark"
            aria-label="切换 Auto 采样器"
            size="small"
          />
        </div>
        <Select
          v-model="settings.novelai.sampler"
          :options="samplerOptions"
          option-label="label"
          option-value="value"
          :disabled="settings.novelai.autoSampler && isV3Model"
        />
        <div v-if="isV3Model" class="cv-nai-option-row">
          <label class="cv-nai-check-option">
            <Checkbox v-model="settings.novelai.smea" binary />
            <span>SMEA</span>
          </label>
          <label class="cv-nai-check-option" :class="{ 'cv-nai-check-option--disabled': !settings.novelai.smea }">
            <Checkbox v-model="settings.novelai.smeaDyn" binary :disabled="!settings.novelai.smea" />
            <span>DYN</span>
          </label>
        </div>
      </div>
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

      <h2 class="cv-section-title">高级设置</h2>
      <div class="cv-nai-advanced-block">
        <div class="cv-field-grid">
          <label class="cv-field">
            <span>提示词引导重缩放</span>
            <InputNumber
              v-model="settings.novelai.promptGuidanceRescale"
              :min="0"
              :max="1"
              :step="0.01"
              :min-fraction-digits="2"
            />
          </label>
          <label class="cv-field">
            <span>噪声调度</span>
            <Select
              v-model="settings.novelai.noiseSchedule"
              :options="noiseScheduleOptions"
              option-label="label"
              option-value="value"
            />
          </label>
        </div>
        <label v-if="isV4OnlyModel" class="cv-nai-check-option cv-nai-legacy-option">
          <Checkbox v-model="settings.novelai.legacyPromptMode" binary />
          <span>旧版提示词条件模式（不推荐）</span>
        </label>
      </div>

    </template>

    <!-- 预设 Tab -->
    <template v-else-if="subTab === 'preset'">
      <ImagePromptPresetPanel
        :preset-settings="settings.imagePromptPresets"
        :positive-preset-id="settings.novelai.positivePromptPresetId"
        :negative-preset-id="settings.novelai.negativePromptPresetId"
        :novelai-settings="settings.novelai"
        show-vibe-section
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
  NOVELAI_NOISE_SCHEDULES,
  NOVELAI_RESOLUTION_PRESETS,
  NOVELAI_SAMPLERS,
  NOVELAI_UC_PRESETS,
  NOVELAI_V3_NOISE_SCHEDULES,
  isNovelAIV3Model,
  isNovelAIV45Model,
  isNovelAIV4OnlyModel,
} from '@/constants/novelai';
import ImagePromptPresetPanel from '@/panel/components/ImagePromptPresetPanel.vue';
import SubscriptionCard from '@/panel/components/SubscriptionCard.vue';
import { buildProxiedUrl } from '@/services/novelai/subscription';
import { useSettingsStore } from '@/store/settings';
import NovelAIAccountList from '@/panel/components/NovelAIAccountList.vue';
import NovelAITestTab from './NovelAITestTab.vue';

type NovelAISubTab = 'api' | 'config' | 'preset' | 'test';

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
const isV3Model = computed(() => isNovelAIV3Model(settings.novelai.model));
const isV45Model = computed(() => isNovelAIV45Model(settings.novelai.model));
const isV4OnlyModel = computed(() => isNovelAIV4OnlyModel(settings.novelai.model));
const supportsVarietyPlus = computed(() => isV3Model.value || isV45Model.value);
const noiseScheduleOptions = computed(() => {
  return isV3Model.value ? [...NOVELAI_V3_NOISE_SCHEDULES] : [...NOVELAI_NOISE_SCHEDULES];
});
const { isCustomResolution, markCustomResolution } = useResolutionPreset(
  settings.novelai,
  NOVELAI_RESOLUTION_PRESETS,
  NOVELAI_CUSTOM_RESOLUTION_PRESET,
);

watch(
  () => settings.novelai.model,
  () => normalizeModelScopedOptions(),
);

watch(
  () => settings.novelai.smea,
  enabled => {
    if (!enabled) settings.novelai.smeaDyn = false;
  },
);

/**
 * 清理当前模型不支持的 NovelAI 选项
 * 模型切换后避免把 V3 专属字段或 native 噪声调度带到 V4 请求中
 */
function normalizeModelScopedOptions(): void {
  if (!isV3Model.value) {
    settings.novelai.autoSampler = false;
    settings.novelai.smea = false;
    settings.novelai.smeaDyn = false;
    settings.novelai.decrisp = false;
    settings.novelai.legacyPromptMode = false;
    if (settings.novelai.noiseSchedule === 'native') settings.novelai.noiseSchedule = 'karras';
  }
  if (!supportsVarietyPlus.value) settings.novelai.varietyPlus = false;
  if (!isV4OnlyModel.value) settings.novelai.legacyPromptMode = false;
}

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

.cv-nai-option-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--cv-space-xl);
}

.cv-nai-field-title-row {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--cv-space-lg);
  font-weight: 600;
  color: var(--cv-on-surface);
}

.cv-nai-title-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: flex-end;
  gap: var(--cv-space-xs);
  margin-left: auto;
}

.cv-nai-sampler-field {
  display: flex;
  flex-direction: column;
  gap: var(--cv-space-lg);
}

.cv-nai-advanced-block {
  display: flex;
  flex-direction: column;
  gap: var(--cv-space-xl);
}

.cv-nai-mini-toggle {
  min-width: 0;
  --p-togglebutton-sm-padding: var(--cv-space-xs) var(--cv-space-md);
  --p-togglebutton-content-sm-padding: var(--cv-space-xs) var(--cv-space-md);
  --p-togglebutton-sm-font-size: calc(var(--mainFontSize) * 0.75);
}

.cv-nai-mini-toggle:deep(.p-togglebutton-content) {
  gap: var(--cv-space-xs);
  border-radius: var(--cv-radius-sm);
  line-height: 1;
}

.cv-nai-check-option {
  display: inline-flex;
  align-items: center;
  gap: var(--cv-space-lg);
  min-height: 1.75rem;
  color: var(--cv-on-surface);
  font-size: calc(var(--mainFontSize) * 0.9);
}

.cv-nai-check-option > span {
  min-width: 0;
  line-height: 1.35;
}

.cv-nai-check-option--disabled {
  color: var(--cv-on-surface-variant);
  opacity: 0.62;
}

.cv-nai-legacy-option {
  align-self: flex-start;
}
</style>

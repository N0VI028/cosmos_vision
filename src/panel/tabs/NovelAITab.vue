<template>
  <div class="flex flex-col gap-0">
    <!-- API Tab -->
    <template v-if="subTab === 'api'">
      <h2 class="cv-section-title">连接信息</h2>
      <div class="cv-section-body" data-cv-tutorial="novelai-connection">
        <label class="cv-field">
          <span>路由模式</span>
          <div class="cv-field-control">
            <Select
              v-model="settings.novelai.routingMode"
              :options="routingModeOptions"
              option-label="label"
              option-value="value"
              fluid
            />
            <div class="cv-field-hint">{{ routingModeHint }}</div>
          </div>
        </label>
        <label class="cv-field">
          <span>超时时间</span>
          <div class="cv-field-control">
            <InputNumber v-model="settings.novelai.timeout" :min="1" :max="3600" show-buttons />
            <div class="cv-field-hint">请求超时截断时间，单位为秒</div>
          </div>
        </label>
        <NovelAIAccountList v-model="settings.novelai.accounts" />
        <label class="cv-field">
          <span>CORS 代理 URL</span>
          <div class="cv-field-control">
            <InputText v-model="settings.novelai.corsProxy" placeholder="https://your-worker.workers.dev" />
            <div class="cv-field-hint">{{ proxyPreview }}</div>
            <div class="cv-field-warn">⚠ 代理需为"主机重写"型反向代理;第三方代理会看到你的 API Key,推荐自建。</div>
          </div>
        </label>

        <SubscriptionCard />
      </div>
    </template>

    <!-- 配置 Tab -->
    <template v-else-if="subTab === 'config'">
      <h2 class="cv-section-title">模型与尺寸</h2>
      <div class="cv-section-body" data-cv-tutorial="novelai-image-config">
        <label class="cv-field">
          <span>模型</span>
          <Select
            v-model="settings.novelai.model"
            :options="modelOptions"
            option-label="label"
            option-value="value"
            fluid
          />
        </label>
        <label class="cv-field">
          <span>尺寸预设</span>
          <Select
            v-model="settings.novelai.resolutionPreset"
            :options="resolutionPresetOptions"
            option-label="label"
            option-value="value"
            fluid
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
      </div>

      <h2 class="cv-section-title">采样参数</h2>
      <div class="cv-section-body">
        <div class="cv-field-grid">
          <label class="cv-field">
            <span>步数</span>
            <InputNumber v-model="settings.novelai.steps" :min="1" :max="50" show-buttons />
          </label>
          <div class="cv-field">
            <div
              class="flex flex-wrap items-end justify-between gap-(--cv-space-lg) font-semibold text-(--cv-on-surface)"
            >
              <span>提示词引导</span>
              <div
                v-if="supportsVarietyPlus || isV3Model"
                class="ml-auto flex flex-wrap items-end justify-end gap-(--cv-space-xs)"
              >
                <ToggleButton
                  v-if="supportsVarietyPlus"
                  v-model="settings.novelai.varietyPlus"
                  class="min-w-0 shrink-0 grow-0 basis-auto"
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
                  class="min-w-0 shrink-0 grow-0 basis-auto"
                  on-label="Dec"
                  off-label="Dec"
                  on-icon="fa-solid fa-check"
                  off-icon="fa-solid fa-xmark"
                  aria-label="切换 Dec"
                  size="small"
                />
              </div>
            </div>
            <InputNumber v-model="settings.novelai.guidance" :min="0" :max="10" :step="0.1" :min-fraction-digits="1" />
          </div>
        </div>
        <div class="cv-field-grid">
          <label class="cv-field">
            <span>图片数</span>
            <InputNumber
              v-model="settings.novelai.imageCount"
              :min="imageCountLimits.min"
              :max="imageCountLimits.max"
              :allow-empty="false"
              :use-grouping="false"
              show-buttons
            />
          </label>
          <div class="cv-field">
            <div
              class="flex flex-wrap items-end justify-between gap-(--cv-space-lg) font-semibold text-(--cv-on-surface)"
            >
              <span>种子</span>
              <div class="ml-auto flex flex-wrap items-end justify-end gap-(--cv-space-xs)">
                <ToggleButton
                  v-model="seedRandom"
                  class="min-w-0 shrink-0 grow-0 basis-auto"
                  on-label="随机"
                  off-label="随机"
                  on-icon="fa-solid fa-check"
                  off-icon="fa-solid fa-xmark"
                  aria-label="切换随机种子"
                  size="small"
                />
              </div>
            </div>
            <InputNumber
              v-model="settings.novelai.seed"
              :min="0"
              :max="maxSeed"
              :use-grouping="false"
              :disabled="seedRandom"
              placeholder="固定种子"
            />
          </div>
        </div>
        <div class="cv-field">
          <div
            class="flex flex-wrap items-end justify-between gap-(--cv-space-lg) font-semibold text-(--cv-on-surface)"
          >
            <span>采样器</span>
            <ToggleButton
              v-if="isV3Model"
              v-model="settings.novelai.autoSampler"
              class="min-w-0 shrink-0 grow-0 basis-auto"
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
            fluid
            :disabled="settings.novelai.autoSampler && isV3Model"
          />
          <div v-if="isV3Model" class="flex flex-wrap items-center gap-(--cv-space-xl)">
            <label
              class="inline-flex min-h-7 items-center gap-(--cv-space-lg) text-(length:--cv-font-size-base) text-(--cv-on-surface)"
            >
              <Checkbox v-model="settings.novelai.smea" binary />
              <span class="min-w-0 leading-[1.35]">SMEA</span>
            </label>
            <label
              class="inline-flex min-h-7 items-center gap-(--cv-space-lg) text-(length:--cv-font-size-base)"
              :class="settings.novelai.smea ? 'text-(--cv-on-surface)' : 'text-(--cv-on-surface-variant) opacity-62'"
            >
              <Checkbox v-model="settings.novelai.smeaDyn" binary :disabled="!settings.novelai.smea" />
              <span class="min-w-0 leading-[1.35]">DYN</span>
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
            fluid
          />
        </label>
        <label class="cv-field-inline">
          <ToggleSwitch v-model="settings.novelai.addQualityTags" />
          <span>使用官方正面质量词</span>
        </label>
      </div>

      <h2 class="cv-section-title">高级设置</h2>
      <div class="cv-section-body">
        <label v-if="!isV3Model" class="cv-field-inline">
          <ToggleSwitch v-model="settings.novelai.autoCharacterCoords" />
          <span>多角色提示词时自动安排位置</span>
        </label>
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
              fluid
            />
          </label>
        </div>
        <label
          v-if="isV4OnlyModel"
          class="inline-flex min-h-7 items-center gap-(--cv-space-lg) self-start text-(length:--cv-font-size-base) text-(--cv-on-surface)"
        >
          <Checkbox v-model="settings.novelai.legacyPromptMode" binary />
          <span class="min-w-0 leading-[1.35]">旧版提示词条件模式（不推荐）</span>
        </label>
      </div>
    </template>

    <!-- 预设 Tab -->
    <template v-else-if="subTab === 'preset'">
      <ImagePromptPresetPanel
        :preset-settings="settings.imagePromptPresets"
        :positive-preset-id="settings.novelai.positivePromptPresetId"
        :negative-preset-id="settings.novelai.negativePromptPresetId"
        show-section-title
        @update:preset-settings="settings.imagePromptPresets = $event"
        @update:positive-preset-id="settings.novelai.positivePromptPresetId = $event"
        @update:negative-preset-id="settings.novelai.negativePromptPresetId = $event"
      />
      <h2 class="cv-section-title">Vibe Transfer</h2>
      <div class="cv-section-body">
        <NovelAIVibePresetPanel
          :preset-settings="settings.novelai.novelAIVibePresets"
          :settings="settings.novelai"
          @update:preset-settings="settings.novelai.novelAIVibePresets = $event"
        />
      </div>
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
  NOVELAI_MAX_SEED,
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
  NOVELAI_IMAGE_COUNT_LIMITS,
} from '@/constants/novelai';
import ImagePromptPresetPanel from '@/panel/components/ImagePromptPresetPanel.vue';
import NovelAIVibePresetPanel from '@/panel/components/NovelAIVibePresetPanel.vue';
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
const imageCountLimits = NOVELAI_IMAGE_COUNT_LIMITS;
const maxSeed = NOVELAI_MAX_SEED;
const isV3Model = computed(() => isNovelAIV3Model(settings.novelai.model));
const isV45Model = computed(() => isNovelAIV45Model(settings.novelai.model));
const isV4OnlyModel = computed(() => isNovelAIV4OnlyModel(settings.novelai.model));
const supportsVarietyPlus = computed(() => isV3Model.value || isV45Model.value);
/** 种子随机开关：开启时 seed 为 null，关闭时写入固定种子并启用输入 */
const seedRandom = computed({
  get: () => settings.novelai.seed === null,
  set: (enabled: boolean) => {
    if (enabled) {
      settings.novelai.seed = null;
      return;
    }
    if (settings.novelai.seed === null) {
      settings.novelai.seed = Math.floor(Math.random() * (NOVELAI_MAX_SEED + 1));
    }
  },
});
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

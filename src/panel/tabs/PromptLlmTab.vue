<template>
  <div class="cv-tab-content">
    <!-- 语言模型设置页 -->
    <template v-if="subTab === 'settings'">
      <h2 class="cv-section-title">连接信息</h2>
      <label class="cv-field-inline">
        <span>使用酒馆代理预设</span>
        <ToggleSwitch v-model="useTavernProxy" />
      </label>

      <label v-if="useTavernProxy" class="cv-field">
        <span>代理预设</span>
        <Select
          v-model="settings.promptLlm.proxyPreset"
          :options="proxyPresetOptions"
          option-label="name"
          option-value="name"
          placeholder="选择酒馆中已配置的代理预设"
        />
      </label>

      <template v-else>
        <label class="cv-field">
          <span>接口地址</span>
          <InputText v-model="settings.promptLlm.apiUrl" placeholder="https://api.openai.com/v1" />
        </label>
        <label class="cv-field">
          <span>接口密钥</span>
          <Password v-model="settings.promptLlm.apiKey" :feedback="false" toggle-mask :input-class="'w-full'" />
        </label>
      </template>

      <label class="cv-field">
        <span>来源标识</span>
        <Select
          v-model="settings.promptLlm.source"
          :options="CHAT_COMPLETION_SOURCE_OPTIONS"
          option-label="label"
          option-value="value"
          placeholder="选择聊天补全来源"
        />
      </label>

      <div class="cv-field">
        <span>模型名</span>
        <div class="cv-model-row">
          <Select
            v-model="settings.promptLlm.model"
            :options="modelOptions"
            placeholder="选择模型"
            :loading="isLoadingModels"
            class="cv-model-input"
          />
          <Button
            icon="fa-solid fa-rotate"
            severity="secondary"
            outlined
            rounded
            :loading="isLoadingModels"
            aria-label="刷新模型列表"
            @click="fetchModels"
          />
        </div>
      </div>

      <h2 class="cv-section-title">生成参数</h2>
      <div class="cv-field-grid">
        <label class="cv-field">
          <span>温度</span>
          <InputNumber
            v-model="settings.promptLlm.temperature"
            :min="0"
            :max="2"
            :step="0.1"
            :min-fraction-digits="1"
          />
        </label>
        <label class="cv-field">
          <span>最大令牌数</span>
          <InputNumber v-model="settings.promptLlm.maxTokens" :min="1" :max="4000" show-buttons />
        </label>
      </div>
      <div class="cv-field-grid">
        <label class="cv-field">
          <span>Top P</span>
          <Slider v-model="settings.promptLlm.topP" :min="0" :max="1" :step="0.01" />
          <div class="cv-slider-value">{{ settings.promptLlm.topP.toFixed(2) }}</div>
        </label>
        <label class="cv-field">
          <span>Top K</span>
          <Slider v-model="settings.promptLlm.topK" :min="0" :max="100" :step="1" />
          <div class="cv-slider-value">{{ settings.promptLlm.topK }}</div>
        </label>
      </div>
    </template>

    <!-- 提示词构建器页 -->
    <PromptBuilderTab v-else-if="subTab === 'builder'" />

    <!-- 连接测试页 -->
    <PromptLlmTestTab v-else-if="subTab === 'test'" />
  </div>
</template>

<script setup lang="ts">
import PromptBuilderTab from './PromptBuilderTab.vue';
import PromptLlmTestTab from './PromptLlmTestTab.vue';
import { useSettingsStore } from '@/store/settings';
import {
  CHAT_COMPLETION_SOURCE_OPTIONS,
  findProxyPreset,
  getProxyPresets,
  type ProxyPresetOption,
} from '@/services/sillytavern/openai-config';

type SubTab = 'settings' | 'builder' | 'test';

const props = defineProps<{ subTab: SubTab }>();
const subTab = computed(() => props.subTab);

const { settings } = useSettingsStore();

// 注入父组件提供的刷新方法
const refreshSections = inject<(() => void) | undefined>('refreshSections');

// 监听 subTab 变化，通知父组件刷新 section
watch(subTab, () => {
  nextTick(() => {
    refreshSections?.();
  });
});

const proxyPresetOptions = ref<ProxyPresetOption[]>(getProxyPresets());

const useTavernProxy = ref(findProxyPreset(settings.promptLlm.proxyPreset) !== null);

watch(
  () => settings.promptLlm.proxyPreset,
  presetName => {
    useTavernProxy.value = findProxyPreset(presetName) !== null;
  },
);

watch(useTavernProxy, useProxy => {
  if (!useProxy) {
    settings.promptLlm.proxyPreset = '';
  }
});

const fetchedModels = ref<string[]>([]);
const isLoadingModels = ref(false);

// 模型下拉选项:合并已拉取列表与当前已选模型,避免关闭重开后已选模型从列表中消失导致 UI 显示空白
const modelOptions = computed<string[]>(() => {
  const values = new Set(fetchedModels.value);
  const selected = settings.promptLlm.model.trim();
  if (selected) values.add(selected);
  return [...values];
});

async function fetchModels(): Promise<void> {
  const preset = findProxyPreset(settings.promptLlm.proxyPreset);
  const apiUrl = (preset?.url ?? settings.promptLlm.apiUrl).trim();
  const apiKey = (preset?.password ?? settings.promptLlm.apiKey).trim();

  if (!apiUrl) {
    toastr.warning(preset ? '所选代理预设未配置地址' : '请先填写接口地址');
    return;
  }

  isLoadingModels.value = true;

  try {
    const modelsUrl = `${apiUrl.replace(/\/+$/, '')}/models`;
    const response = await fetch(modelsUrl, {
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    if (!data.data || !Array.isArray(data.data)) {
      throw new Error('响应格式不符合兼容接口规范');
    }

    fetchedModels.value = data.data.map((m: { id: string }) => m.id);
    toastr.success(`成功获取 ${fetchedModels.value.length} 个模型`);
  } catch (error) {
    const message = error instanceof Error ? error.message : '获取模型列表失败';
    toastr.error(message);
    console.error('[PromptLlmTab]', error);
  } finally {
    isLoadingModels.value = false;
  }
}
</script>

<style scoped>
@reference '../../global.css';

.cv-tab-content {
  @apply flex flex-col gap-0;
}

/* 滑块数值显示 */
.cv-slider-value {
  @apply mt-[var(--cv-space-lg)] text-center;
  text-align: center;
  font-size: var(--cv-font-size-md);
  color: var(--cv-on-surface-variant);
  font-weight: 500;
}

/* 模型选择行 */
.cv-model-row {
  @apply flex items-center;
  gap: var(--cv-space-3xl);
}

.cv-model-row > .cv-model-input {
  @apply min-w-0;
  flex: 1;
}

/* 非 rounded 变体统一圆角;rounded 按钮交还 PrimeVue 自身规则 */
.cv-model-row > .cv-prime-button:not([data-p~='rounded']) {
  @apply shrink-0;
  border-radius: var(--cv-radius);
}
</style>

<template>
  <div class="flex flex-col gap-0">
    <!-- 语言模型设置页 -->
    <template v-if="subTab === 'settings'">
      <h2 class="cv-section-title">连接信息</h2>
      <div class="cv-section-body" data-cv-tutorial="prompt-llm-connection">
        <label class="cv-field">
          <span>路由模式</span>
          <div class="cv-field-control">
            <Select
              v-model="settings.promptLlm.routingMode"
              :options="routingModeOptions"
              option-label="label"
              option-value="value"
              fluid
            />
            <div class="cv-field-hint">{{ routingModeHint }}</div>
          </div>
        </label>
        <PromptLlmAccountList v-model="settings.promptLlm.accounts" />
      </div>

      <h2 class="cv-section-title">生成参数</h2>
      <div class="cv-section-body">
        <label class="cv-field-inline">
          <span>启用流式请求</span>
          <ToggleSwitch v-model="settings.promptLlm.shouldStream" />
        </label>

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
            <span>最大输出令牌数</span>
            <InputNumber v-model="settings.promptLlm.maxTokens" :min="1" show-buttons />
          </label>
        </div>
        <div class="cv-field-grid">
          <div class="cv-field">
            <div class="cv-field-header">
              <span>Top P</span>
              <span class="text-(length:--cv-font-size-base) font-medium text-(--cv-on-surface-variant)">
                {{ settings.promptLlm.topP.toFixed(2) }}
              </span>
            </div>
            <Slider v-model="settings.promptLlm.topP" :min="0" :max="1" :step="0.01" />
          </div>
          <div class="cv-field">
            <div class="cv-field-header">
              <span>Top K</span>
              <span class="text-(length:--cv-font-size-base) font-medium text-(--cv-on-surface-variant)">
                {{ settings.promptLlm.topK }}
              </span>
            </div>
            <Slider v-model="settings.promptLlm.topK" :min="0" :max="100" :step="1" />
          </div>
        </div>
        <label class="cv-field">
          <span>超时时间</span>
          <div class="cv-field-control">
            <InputNumber v-model="settings.promptLlm.timeout" :min="1" :max="3600" show-buttons />
            <div class="cv-field-hint">请求超时截断时间，单位为秒</div>
          </div>
        </label>
      </div>
    </template>

    <!-- 提示词构建器页 -->
    <KeepAlive>
      <PromptBuilderTab v-if="subTab === 'builder'" />
    </KeepAlive>

    <!-- 连接测试页 -->
    <PromptLlmTestTab v-if="subTab === 'test'" />
  </div>
</template>

<script setup lang="ts">
import PromptBuilderTab from './PromptBuilderTab.vue';
import PromptLlmTestTab from './PromptLlmTestTab.vue';
import PromptLlmAccountList from '@/panel/components/PromptLlmAccountList.vue';
import { PROMPT_LLM_ROUTING_MODES } from '@/constants/prompt-llm';
import { getRoutingModeHint } from '@/constants/routing';
import { useSettingsStore } from '@/store/settings';

type SubTab = 'settings' | 'builder' | 'test';

const props = defineProps<{ subTab: SubTab }>();
const subTab = computed(() => props.subTab);

const { settings } = useSettingsStore();

const routingModeOptions = [...PROMPT_LLM_ROUTING_MODES];

const routingModeHint = computed(() => getRoutingModeHint(settings.promptLlm.routingMode));
</script>

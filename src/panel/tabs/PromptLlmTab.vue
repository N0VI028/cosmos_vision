<template>
  <div class="flex flex-col gap-0">
    <!-- 语言模型设置页 -->
    <template v-if="subTab === 'settings'">
      <!-- 上：请求行为（路由方式 + 超时时间） -->
      <h2 class="cv-section-title">请求行为</h2>
      <div class="cv-section-body">
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
        <label class="cv-field">
          <span>超时时间</span>
          <div class="cv-field-control">
            <InputNumber v-model="settings.promptLlm.timeout" :min="1" :max="3600" show-buttons />
            <div class="cv-field-hint">请求超时截断时间，单位为秒</div>
          </div>
        </label>
      </div>

      <!-- 下：账号列表 -->
      <h2 class="cv-section-title">账号列表</h2>
      <div class="cv-section-body" data-cv-tutorial="prompt-llm-connection">
        <PromptLlmAccountList v-model="settings.promptLlm.accounts" />
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

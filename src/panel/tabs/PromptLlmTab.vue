<template>
  <div class="cv-tab-content">
    <!-- 语言模型设置页 -->
    <template v-if="subTab === 'settings'">
      <h2 class="cv-section-title">连接信息</h2>
      <div class="cv-section-body">
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
            fluid
          />
        </label>

        <template v-else>
          <label class="cv-field">
            <span>接口地址</span>
            <InputText v-model="settings.promptLlm.apiUrl" placeholder="https://api.openai.com/v1" />
          </label>
          <label class="cv-field">
            <span>接口密钥</span>
            <Password v-model="settings.promptLlm.apiKey" fluid :feedback="false" toggle-mask />
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
            fluid
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
              class="cv-model-input min-w-0 flex-1"
              fluid
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

        <template v-if="settings.promptLlm.source === 'custom'">
          <label class="cv-field">
            <span>包含请求体参数</span>
            <div class="cv-field-control">
              <Textarea v-model="settings.promptLlm.customIncludeBody" rows="3" class="w-full" />
              <div class="cv-field-hint">YAML 格式，附加到请求 body 的字段（如 reasoning_effort: high），留空则不发送</div>
            </div>
          </label>

          <label class="cv-field">
            <span>排除请求体参数</span>
            <div class="cv-field-control">
              <Textarea v-model="settings.promptLlm.customExcludeBody" rows="2" class="w-full" />
              <div class="cv-field-hint">YAML 格式，从请求 body 移除的字段名数组（如 - logit_bias），留空则不发送</div>
            </div>
          </label>

          <label class="cv-field">
            <span>包含请求头</span>
            <div class="cv-field-control">
              <Textarea v-model="settings.promptLlm.customIncludeHeaders" rows="2" class="w-full" />
              <div class="cv-field-hint">YAML 格式，附加的 HTTP headers（如 X-Custom-Auth: token），留空则不发送</div>
            </div>
          </label>
        </template>
        
      </div>

      <h2 class="cv-section-title">生成参数</h2>
      <div class="cv-section-body">
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
          <label class="cv-field">
            <span>Top P</span>
            <Slider v-model="settings.promptLlm.topP" :min="0" :max="1" :step="0.01" />
            <div class="mt-(--cv-space-lg) text-center text-(length:--cv-font-size-md) font-medium text-(--cv-on-surface-variant)">
              {{ settings.promptLlm.topP.toFixed(2) }}
            </div>
          </label>
          <label class="cv-field">
            <span>Top K</span>
            <Slider v-model="settings.promptLlm.topK" :min="0" :max="100" :step="1" />
            <div class="mt-(--cv-space-lg) text-center text-(length:--cv-font-size-md) font-medium text-(--cv-on-surface-variant)">
              {{ settings.promptLlm.topK }}
            </div>
          </label>
        </div>
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

/**
 * 获取并更新可用模型列表
 */
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
    if (!TavernHelper || typeof TavernHelper.getModelList !== 'function') {
      throw new Error('未检测到兼容的酒馆助手模型拉取接口，请更新扩展');
    }
    fetchedModels.value = await TavernHelper.getModelList({
      apiurl: apiUrl,
      key: apiKey,
    });
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

/* 模型选择行 */
.cv-model-row {
  @apply flex items-center gap-(--cv-space-3xl);
}
</style>

<template>
  <div class="cv-tab-content cv-test-tab">
    <h2 class="cv-section-title">测试模式</h2>
    <div class="cv-section-body">
      <div class="cv-field">
        <div class="cv-field-control">
          <div class="cv-field-inline cv-mode-switch">
            <span>{{ modeTitle }}</span>
            <ToggleSwitch v-model="useLlmMode" />
          </div>
          <div class="cv-field-hint">{{ modeHint }}</div>
        </div>
      </div>

      <FocusedParagraphField
        v-if="useLlmMode"
        v-model="llmParagraphText"
        :has-focused-paragraph="hasFocusedParagraph"
      />

      <template v-else>
        <div class="cv-field">
          <span>正面提示词</span>
          <Textarea
            v-model="directPositivePrompt"
            rows="3"
            auto-resize
            class="w-full resize-y text-(length:--cv-font-size-lg)"
          />
        </div>
        <div class="cv-field">
          <span>负面提示词</span>
          <Textarea
            v-model="directNegativePrompt"
            rows="3"
            auto-resize
            class="w-full resize-y text-(length:--cv-font-size-lg)"
          />
        </div>
        <div class="cv-direct-character-list">
          <CollapsiblePanelItem
            v-for="(character, index) in directCharacterPrompts"
            :key="character.id"
            :title="`角色 ${index + 1}`"
            :collapsed="!expandedDirectCharacterIds.has(character.id)"
            @toggle="toggleDirectCharacter(character.id)"
          >
            <template #actions>
              <Button
                icon="fa-solid fa-trash"
                severity="danger"
                text
                size="small"
                aria-label="删除角色"
                @click="removeDirectCharacter(character.id)"
              />
            </template>
            <div class="cv-direct-character-body">
              <div class="cv-field">
                <span>角色正面提示词</span>
                <Textarea
                  v-model="character.positivePrompt"
                  rows="3"
                  auto-resize
                  class="w-full resize-y text-(length:--cv-font-size-lg)"
                />
              </div>
              <div class="cv-field">
                <span>角色负面提示词</span>
                <Textarea
                  v-model="character.negativePrompt"
                  rows="3"
                  auto-resize
                  class="w-full resize-y text-(length:--cv-font-size-lg)"
                />
              </div>
              <div class="cv-field-grid cv-direct-character-coordinates">
                <label class="cv-field">
                  <span>X坐标</span>
                  <InputNumber
                    v-model="character.x"
                    :min="0"
                    :max="1"
                    :step="0.05"
                    :max-fraction-digits="2"
                    :allow-empty="false"
                  />
                </label>
                <label class="cv-field">
                  <span>Y坐标</span>
                  <InputNumber
                    v-model="character.y"
                    :min="0"
                    :max="1"
                    :step="0.05"
                    :max-fraction-digits="2"
                    :allow-empty="false"
                  />
                </label>
              </div>
            </div>
          </CollapsiblePanelItem>
        </div>
        <div class="cv-direct-character-actions">
          <CvAddEntryButton label="添加角色" @click="addDirectCharacter" />
        </div>
      </template>
    </div>

    <div class="cv-action-row">
      <Button
        :label="actionLabel"
        :icon="actionIcon"
        :severity="actionSeverity"
        :outlined="actionOutlined"
        class="w-full"
        @click="onActionClick"
      />
    </div>

    <h2 class="cv-section-title">测试结果</h2>
    <div class="cv-section-body">
      <div class="cv-log-container">
        <div v-if="testStatus === 'running'" class="cv-status-banner cv-status-banner--pending">
          <i class="fa-solid fa-spinner fa-spin" />
          <span>{{ runningStateText }}</span>
        </div>
        <div v-else-if="testStatus === 'success'" class="cv-status-banner cv-status-banner--success">
          <i class="fa-solid fa-circle-check" />
          <span>{{ successStateText }}</span>
        </div>
        <div v-else-if="testStatus === 'error'" class="cv-status-banner cv-status-banner--error">
          <i class="fa-solid fa-circle-exclamation" />
          <span>{{ errorMessage }}</span>
        </div>
        <TestImageGallery
          :image-blobs="previewBlobs"
          :snapshot="previewPromptSnapshot"
          :placeholder="previewPlaceholderText"
        />
      </div>
    </div>

    <h2 class="cv-section-title">{{ promptTitle }}</h2>
    <div class="cv-section-body">
      <div class="cv-log-container">
        <div v-if="novelaiSnapshot" class="cv-prompt-log">
          <div class="preview-header">正面提示词</div>
          <pre class="preview-content">{{ novelaiSnapshot.positivePrompt || '(空)' }}</pre>
          <div class="preview-header">负面提示词</div>
          <pre class="preview-content">{{ novelaiSnapshot.negativePrompt || '(空)' }}</pre>
          <div class="preview-header">角色提示词（{{ novelaiSnapshot.characterPrompts.length }}）</div>
          <div v-if="novelaiSnapshot.characterPrompts.length" class="flex flex-col gap-(--cv-space-lg)">
            <CollapsiblePanelItem
              v-for="(item, index) in novelaiSnapshot.characterPrompts"
              :key="index"
              :title="getCharacterPromptTitle(item, index)"
              :collapsed="!expandedCharacterIndexes.has(index)"
              @toggle="toggleCharacterPrompt(index)"
            >
              <div class="flex flex-col gap-(--cv-space-xl) p-(--cv-space-xl)">
                <div class="preview-header">角色正面</div>
                <pre class="preview-content">{{ item.positivePrompt || '(空)' }}</pre>
                <div class="preview-header">角色负面</div>
                <pre class="preview-content">{{ item.negativePrompt || '(空)' }}</pre>
                <div class="preview-header">坐标</div>
                <pre class="preview-content">{{ formatCharacterPosition(item) }}</pre>
              </div>
            </CollapsiblePanelItem>
          </div>
          <div v-else class="cv-empty-state p-(--cv-space-2xl)">无角色提示词</div>
        </div>
        <div v-else class="cv-empty-state">尚未生成最终提示词</div>
      </div>
    </div>

    <h2 class="cv-section-title">{{ paramTitle }}</h2>
    <div class="cv-section-body">
      <div class="cv-log-container">
        <div v-if="novelaiSnapshot" class="cv-log-param-grid">
          <div v-for="row in novelaiParamRows" :key="row.label" class="cv-log-param-row">
            <span class="param-label">{{ row.label }}</span>
            <span class="param-value" :class="{ 'code-font': row.code }">{{ row.value }}</span>
          </div>
        </div>
        <div v-else class="cv-empty-state">{{ emptyParamText }}</div>
      </div>
    </div>

    <template v-if="showLlmLogs">
      <h2 class="cv-section-title">LLM 原始返回</h2>
      <div class="cv-section-body">
        <div class="cv-log-container">
          <pre class="preview-content">{{ llmRawResponse || '尚未收到 LLM 返回结果' }}</pre>
        </div>
      </div>

      <h2 class="cv-section-title">LLM 参数配置</h2>
      <div class="cv-section-body">
        <div class="cv-log-container">
          <div class="cv-log-param-grid">
            <div v-for="row in llmParamRows" :key="row.label" class="cv-log-param-row">
              <span class="param-label">{{ row.label }}</span>
              <span class="param-value" :class="{ 'code-font': row.code }">{{ row.value }}</span>
            </div>
          </div>
        </div>
      </div>

      <h2 class="cv-section-title">LLM 发送请求日志</h2>
      <div class="cv-section-body">
        <div class="cv-log-container">
          <pre class="preview-content">{{ llmSentPromptLog || '尚未发送 LLM 测试请求' }}</pre>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import type { InlinePromptSnapshot } from '@/composables/inlineImageLightbox';
import { useFocusedParagraphInput } from '@/composables/useFocusedParagraphInput';
import { useTestActionButton } from '@/composables/useTestActionButton';
import { useTestRequestSession, type TestRequestSession } from '@/composables/useTestRequestSession';
import type { CharacterPromptItem } from '@/constants/novelai';
import CollapsiblePanelItem from '@/panel/components/CollapsiblePanelItem.vue';
import CvAddEntryButton from '@/panel/components/CvAddEntryButton.vue';
import FocusedParagraphField from '@/panel/components/FocusedParagraphField.vue';
import TestImageGallery from '@/panel/components/TestImageGallery.vue';

import {
  buildNovelAILlmPromptOverrides,
  buildNovelAIResolvedRequest,
  generateNovelAIImagesFromResolvedRequest,
  type NovelAIPromptOverrides,
  type NovelAIRequestSnapshot,
} from '@/services/novelai/api';
import { useSettingsStore } from '@/store/settings';
import { buildPromptLlmSchemaFields, getPromptLlmRequestError } from '@/services/tavern-helper/prompt-llm';
import {
  buildPromptLlmLogParams,
  buildPromptLlmParamRows,
  formatPromptLlmRequestLog,
  requestPromptLlmRaw,
  type PromptLlmLogParams,
} from '@/services/tavern-helper/prompt-llm-test';
import {
  buildPromptLlmRuntimeRequestFromContext,
  buildPromptLlmTriggerContext,
} from '@/services/prompt-llm/runtime-request';

type NovelAITestMode = 'direct' | 'llm';
type TestStatus = 'idle' | 'running' | 'success' | 'error';

interface ParamRow {
  label: string;
  value: string;
  code?: boolean;
}

interface DirectCharacterPromptDraft {
  id: number;
  positivePrompt: string;
  negativePrompt: string;
  x: number;
  y: number;
}

interface Props {
  serviceName?: string;
}

let nextDirectCharacterId = 0;

const props = withDefaults(defineProps<Props>(), {
  serviceName: 'NovelAI',
});

const { settings } = useSettingsStore();
const { paragraphText: llmParagraphText, hasFocusedParagraph, buildTestContext } = useFocusedParagraphInput();
const requestSession = useTestRequestSession();

const currentMode = ref<NovelAITestMode>('direct');
const lastRunMode = ref<NovelAITestMode | null>(null);
const testStatus = ref<TestStatus>('idle');
const errorMessage = ref('');
const previewBlobs = ref<Blob[]>([]);

const directPositivePrompt = ref('1girl');
const directNegativePrompt = ref('');
const directCharacterPrompts = ref<DirectCharacterPromptDraft[]>([]);
const expandedDirectCharacterIds = ref(new Set<number>());
const novelaiSnapshot = ref<NovelAIRequestSnapshot | null>(null);
const expandedCharacterIndexes = ref(new Set<number>());
const llmRawResponse = ref('');
const llmSentPromptLog = ref('');
const llmLogParams = ref<PromptLlmLogParams | null>(null);

const isRunning = computed(() => testStatus.value === 'running');
const useLlmMode = computed({
  get: () => currentMode.value === 'llm',
  set: value => {
    currentMode.value = value ? 'llm' : 'direct';
  },
});

const activeLogMode = computed(() => lastRunMode.value ?? currentMode.value);
const showLlmLogs = computed(() => activeLogMode.value === 'llm');
const promptTitle = computed(() => `${props.serviceName} 最终提示词`);
const paramTitle = computed(() => `${props.serviceName} 参数配置`);
const emptyParamText = computed(() => `尚未生成 ${props.serviceName} 参数快照`);
const modeTitle = computed(() => {
  return useLlmMode.value ? `LLM + ${props.serviceName} 联动测试` : `仅 ${props.serviceName} 连接测试`;
});
const modeHint = computed(() => {
  return useLlmMode.value
    ? `先使用当前 LLM 配置生成tag，再按 ${props.serviceName} 提取规则和固定模板生图`
    : '直接把输入内容作为LLM提取结果，不经过AI生成tag';
});
const idleActionLabel = computed(() => (useLlmMode.value ? '开始联动测试' : '开始生图测试'));
const {
  label: actionLabel,
  icon: actionIcon,
  severity: actionSeverity,
  outlined: actionOutlined,
} = useTestActionButton(isRunning, { label: idleActionLabel });
const runningStateText = computed(() => {
  return useLlmMode.value
    ? `正在请求 LLM 并等待 ${props.serviceName} 返回图像`
    : `正在等待 ${props.serviceName} 返回图像`;
});
const successStateText = computed(() => {
  return activeLogMode.value === 'llm' ? '联动测试成功，已返回图像' : `${props.serviceName} 测试成功，已返回图像`;
});
const previewPlaceholderText = computed(() => {
  if (testStatus.value === 'running') return runningStateText.value;
  if (testStatus.value === 'error') return '本次测试未返回图像';
  return '测试结果将在这里显示';
});
const previewPromptSnapshot = computed<InlinePromptSnapshot | undefined>(() => {
  if (!novelaiSnapshot.value) return undefined;
  return {
    positivePrompt: novelaiSnapshot.value.positivePrompt,
    negativePrompt: novelaiSnapshot.value.negativePrompt,
  };
});
const displayLlmLogParams = computed(() => {
  return llmLogParams.value ?? buildPromptLlmLogParams(settings.promptLlm);
});

const novelaiParamRows = computed<ParamRow[]>(() => {
  if (!novelaiSnapshot.value) return [];
  return [
    { label: '接口地址', value: novelaiSnapshot.value.endpoint, code: true },
    { label: '模型', value: novelaiSnapshot.value.model, code: true },
    { label: '图像尺寸', value: `${novelaiSnapshot.value.width}x${novelaiSnapshot.value.height}` },
    { label: '图片数', value: String(novelaiSnapshot.value.imageCount) },
    { label: '采样器', value: novelaiSnapshot.value.sampler, code: true },
    { label: 'Seed', value: String(novelaiSnapshot.value.seed) },
    { label: '步数', value: String(novelaiSnapshot.value.steps) },
    { label: '提示词引导', value: String(novelaiSnapshot.value.guidance) },
    { label: 'Auto 采样器', value: novelaiSnapshot.value.autoSampler ? '开启' : '关闭' },
    { label: 'Variety+', value: novelaiSnapshot.value.varietyPlus ? '开启' : '关闭' },
    { label: 'SMEA', value: novelaiSnapshot.value.smea ? '开启' : '关闭' },
    { label: 'DYN', value: novelaiSnapshot.value.smeaDyn ? '开启' : '关闭' },
    { label: 'Decrisp', value: novelaiSnapshot.value.decrisp ? '开启' : '关闭' },
    { label: '旧版提示词条件模式', value: novelaiSnapshot.value.legacyPromptMode ? '开启' : '关闭' },
    { label: '提示词引导重缩放', value: String(novelaiSnapshot.value.promptGuidanceRescale) },
    { label: '噪声调度', value: novelaiSnapshot.value.noiseSchedule, code: true },
    { label: '负向提示词程度', value: novelaiSnapshot.value.ucPreset },
    { label: '使用官方正面质量词', value: novelaiSnapshot.value.addQualityTags ? '开启' : '关闭' },
    ...buildVibeParamRows(novelaiSnapshot.value.vibes),
  ];
});

const llmParamRows = computed(() => buildPromptLlmParamRows(displayLlmLogParams.value));

/**
 * 主操作按钮点击：运行中终止，否则启动测试
 */
function onActionClick(): void {
  if (isRunning.value) stopTest();
  else void runTest();
}

/**
 * 执行当前模式的测试
 */
async function runTest(): Promise<void> {
  resetTestResult();
  lastRunMode.value = currentMode.value;
  testStatus.value = 'running';

  await requestSession.run(
    async session => {
      if (currentMode.value === 'llm') {
        await runLlmModeTest(session);
      } else {
        await runDirectModeTest(session);
      }
      if (!requestSession.isCurrent(session)) return;
      testStatus.value = 'success';
      toastr.success(successStateText.value);
    },
    markAborted,
    handleTestError,
  );
}

/**
 * 终止当前测试请求
 */
function stopTest(): void {
  if (!requestSession.stop()) return;
  markAborted();
}

/**
 * 写入用户终止状态
 */
function markAborted(): void {
  testStatus.value = 'error';
  errorMessage.value = '已终止测试';
  toastr.info('已终止测试');
}

/**
 * 执行仅 NovelAI 测试
 * @param session 当前测试会话
 */
async function runDirectModeTest(session: TestRequestSession): Promise<void> {
  await runNovelAIWithOverrides(createDirectPromptOverrides(), session);
}

/**
 * 执行 LLM + NovelAI 联动测试
 * @param session 当前测试会话
 */
async function runLlmModeTest(session: TestRequestSession): Promise<void> {
  llmLogParams.value = buildPromptLlmLogParams(settings.promptLlm);
  const requestError = getPromptLlmRequestError(settings.promptLlm);
  if (requestError) throw new Error(requestError);

  const request = await buildLlmModeRequest();
  if (!requestSession.isCurrent(session)) return;
  llmSentPromptLog.value = formatPromptLlmRequestLog(request);
  llmRawResponse.value = await requestPromptLlmRaw(request, { generationId: session.generationId });
  if (!requestSession.isCurrent(session)) return;

  await runNovelAIWithOverrides(buildNovelAILlmPromptOverrides(settings.promptLlm, llmRawResponse.value), session);
}

/**
 * 使用覆写提示词执行 NovelAI 生图
 * @param overrides 提示词覆写参数
 * @param session 当前测试会话
 */
async function runNovelAIWithOverrides(
  overrides: NovelAIPromptOverrides,
  session: TestRequestSession,
): Promise<void> {
  const request = buildNovelAIResolvedRequest(
    settings.novelai,
    settings.imagePromptPresets,
    settings.promptLlm,
    overrides,
  );
  novelaiSnapshot.value = request.snapshot;
  const result = await generateNovelAIImagesFromResolvedRequest(request, settings.novelai.imageCount, {
    signal: session.signal,
  });
  if (!requestSession.isCurrent(session)) return;
  novelaiSnapshot.value = result.snapshot;
  previewBlobs.value = result.imageBlobs;
}

/**
 * 构建联动测试请求
 * @returns generateRaw 请求体
 */
function buildLlmModeRequest() {
  const context = buildTestContext();
  const schemaFields = buildPromptLlmSchemaFields(settings.promptLlm);
  return buildPromptLlmRuntimeRequestFromContext(
    context,
    settings.promptLlm,
    settings.promptLlmMessagePresets,
    settings.promptProfiles,
    schemaFields,
    buildPromptLlmTriggerContext(settings, 'novelai'),
  );
}

/**
 * 创建仅 NovelAI 模式的提示词覆写
 * @returns 直接拼接模板的覆写参数
 */
function createDirectPromptOverrides(): NovelAIPromptOverrides {
  return {
    positiveLLMPrompt: directPositivePrompt.value,
    negativeLLMPrompt: directNegativePrompt.value,
    positivePromptMode: 'direct',
    negativePromptMode: 'direct',
    characterPrompts: directCharacterPrompts.value.map(toCharacterPromptItem),
  };
}

/**
 * 创建手动角色提示词草稿
 * @returns 新角色草稿
 */
function createDirectCharacterPrompt(): DirectCharacterPromptDraft {
  return { id: ++nextDirectCharacterId, positivePrompt: '', negativePrompt: '', x: 0.5, y: 0.5 };
}

/**
 * 添加手动角色提示词
 */
function addDirectCharacter(): void {
  const character = createDirectCharacterPrompt();
  directCharacterPrompts.value.push(character);
  expandedDirectCharacterIds.value = new Set([...expandedDirectCharacterIds.value, character.id]);
}

/**
 * 删除手动角色提示词
 * @param id 角色草稿标识
 */
function removeDirectCharacter(id: number): void {
  directCharacterPrompts.value = directCharacterPrompts.value.filter(character => character.id !== id);
  const expanded = new Set(expandedDirectCharacterIds.value);
  expanded.delete(id);
  expandedDirectCharacterIds.value = expanded;
}

/**
 * 切换手动角色提示词折叠状态
 * @param id 角色草稿标识
 */
function toggleDirectCharacter(id: number): void {
  expandedDirectCharacterIds.value = toggleSetItem(expandedDirectCharacterIds.value, id);
}

/**
 * 转换手动角色提示词为请求参数
 * @param character 角色草稿
 * @returns NovelAI 角色提示词
 */
function toCharacterPromptItem(character: DirectCharacterPromptDraft): CharacterPromptItem {
  return {
    positivePrompt: character.positivePrompt,
    negativePrompt: character.negativePrompt,
    position: { x: character.x, y: character.y },
  };
}

/**
 * 构建 vibe 参数摘要行
 * @param vibes vibe 快照
 * @returns 参数展示行
 */
function buildVibeParamRows(vibes: NovelAIRequestSnapshot['vibes']): ParamRow[] {
  if (!vibes.count) return [{ label: 'Vibe', value: '未启用' }];
  return [
    { label: 'Vibe', value: `${vibes.count} 个（${vibes.resolved ? '已解析' : '待解析'}）` },
    { label: 'Vibe 参考强度', value: formatNumberList(vibes.referenceStrengths), code: true },
    { label: 'Vibe 信息提取', value: formatNumberList(vibes.informationExtracted), code: true },
  ];
}

/**
 * 生成角色提示词折叠标题
 * @param item 角色提示词
 * @param index 角色序号
 * @returns 标题文本
 */
function getCharacterPromptTitle(item: CharacterPromptItem, index: number): string {
  const preview = item.positivePrompt.trim() || '(空)';
  const short = preview.length > 40 ? `${preview.slice(0, 40)}…` : preview;
  return `角色 ${index + 1} · ${short}`;
}

/**
 * 格式化角色坐标
 * @param item 角色提示词
 * @returns 坐标展示文本
 */
function formatCharacterPosition(item: CharacterPromptItem): string {
  return `x: ${item.position.x.toFixed(2)}, y: ${item.position.y.toFixed(2)}`;
}

/**
 * 切换角色提示词折叠状态
 * @param index 角色序号
 */
function toggleCharacterPrompt(index: number): void {
  expandedCharacterIndexes.value = toggleSetItem(expandedCharacterIndexes.value, index);
}

/**
 * 切换集合中的成员（不可变）
 * @param source 原集合
 * @param item 目标成员
 * @returns 新集合
 */
function toggleSetItem<T>(source: ReadonlySet<T>, item: T): Set<T> {
  const next = new Set(source);
  if (next.has(item)) next.delete(item);
  else next.add(item);
  return next;
}

/**
 * 格式化数值列表
 * @param values 数值列表
 * @returns 展示文本
 */
function formatNumberList(values: readonly number[]): string {
  return values.map(value => value.toFixed(2)).join(' / ');
}

/**
 * 清空上一次测试结果
 */
function resetTestResult(): void {
  testStatus.value = 'idle';
  errorMessage.value = '';
  novelaiSnapshot.value = null;
  expandedCharacterIndexes.value = new Set();
  llmRawResponse.value = '';
  llmSentPromptLog.value = '';
  llmLogParams.value = null;
  previewBlobs.value = [];
}

/**
 * 记录测试失败状态
 * @param error 捕获到的异常
 */
function handleTestError(error: unknown): void {
  testStatus.value = 'error';
  errorMessage.value = error instanceof Error ? error.message : '测试失败，未知错误';
  toastr.error(errorMessage.value);
}

</script>

<style scoped>
@reference '../../global.css';

.cv-test-tab {
  @apply flex flex-col gap-0;
}

.cv-mode-switch {
  @apply justify-start;
  justify-content: flex-start;
  gap: var(--cv-space-xl);
  margin-bottom: 0;
}

.cv-action-row {
  margin-top: var(--cv-space-5xl);
  margin-bottom: 0;
}

.cv-direct-character-list {
  @apply flex flex-col;
  gap: var(--cv-space-xl);
}

.cv-direct-character-body {
  @apply flex flex-col;
  gap: var(--cv-space-xl);
  padding: var(--cv-space-xl);
}

.cv-direct-character-actions {
  display: flow-root;
}

.cv-direct-character-coordinates {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.cv-log-container {
  @apply overflow-hidden;
  background: var(--cv-surface-container);
  border: var(--cv-border-width) solid var(--cv-surface-variant);
  border-radius: var(--cv-radius);
  padding: var(--cv-space-2xl);
}

.cv-status-banner {
  @apply mb-(--cv-space-2xl) flex items-center;
  gap: var(--cv-space-lg);
  padding: var(--cv-space-xl);
  border-radius: var(--cv-radius-sm);
  font-weight: 600;
}

.cv-status-banner--pending {
  background: color-mix(in srgb, var(--p-primary-color) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--p-primary-color) 30%, transparent);
  color: var(--p-primary-color);
}

.cv-status-banner--success {
  background: color-mix(in srgb, var(--p-green-500) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--p-green-500) 30%, transparent);
  color: var(--p-green-500);
}

.cv-status-banner--error {
  background: color-mix(in srgb, var(--p-red-500) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--p-red-500) 30%, transparent);
  color: var(--p-red-500);
}

.cv-prompt-log {
  @apply flex flex-col;
  gap: var(--cv-space-xl);
}

.cv-log-param-grid {
  @apply flex flex-col;
  gap: var(--cv-space-xl);
}

.cv-log-param-row {
  @apply flex items-center justify-between;
  gap: var(--cv-space-xl);
  border-bottom: 1px solid var(--cv-surface-variant);
  padding-bottom: var(--cv-space-md);
}

.cv-log-param-row:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

.param-label {
  color: var(--cv-on-surface-variant);
  font-size: var(--cv-font-size-md);
}

.param-value {
  @apply text-right break-all;
  color: var(--cv-on-surface);
}

.code-font {
  font-family: Consolas, Monaco, monospace;
  font-size: var(--cv-font-size-sm);
}

.preview-header {
  font-size: var(--cv-font-size-md);
  color: var(--cv-on-surface-variant);
  font-weight: 600;
}

.preview-content {
  @apply m-0 overflow-y-auto break-all whitespace-pre-wrap;
  background: var(--cv-surface-variant);
  border: var(--cv-border-width) solid var(--cv-surface-variant);
  color: var(--cv-on-surface);
  font-family: Consolas, Monaco, monospace;
  font-size: var(--cv-font-size-sm);
  padding: var(--cv-space-2xl);
  border-radius: var(--cv-radius-sm);
  max-height: 20rem;
}

.cv-empty-state {
  @apply p-(--cv-space-8xl) text-center;
  color: var(--cv-on-surface-variant);
}
</style>

<template>
  <Dialog
    v-model:visible="visible"
    modal
    :show-header="false"
    :closable="false"
    :close-on-escape="true"
    :dismissable-mask="true"
    :draggable="false"
    :class="dialogClass"
    :style="dialogStyle"
    :content-style="contentStyle"
    append-to="body"
    aria-label="LLM 请求监视"
  >
    <div class="cv-llm-inspector" :class="{ 'cv-llm-inspector--rail-collapsed': railCollapsed }">
      <!-- 关闭按钮：与设置窗共用 .cv-close（绝对定位右上角，位置/尺寸由同组 token 驱动） -->
      <button type="button" class="cv-close" aria-label="关闭" title="关闭" @click="closeDialog">
        <i class="fa-solid fa-xmark" aria-hidden="true" />
      </button>
      <!-- 侧栏收起/展开切换钮（骑跨分界线，与设置窗共用） -->
      <SidebarRailToggle :collapsed="railCollapsed" @toggle="toggleRail" />
      <!-- 主体：左右排布（会话侧栏 + 详情），无独立顶栏 -->
      <div class="cv-llm-inspector-body">
        <!-- 会话列表侧栏 -->
        <nav class="cv-llm-inspector-rail" aria-label="请求记录">
          <div class="cv-llm-inspector-rail-inner">
            <div class="cv-llm-inspector-rail-header">
              <span class="cv-llm-inspector-rail-title">请求记录</span>
              <span class="cv-llm-inspector-rail-count">{{ sessions.length }}</span>
              <button
                type="button"
                class="cv-llm-inspector-icon-btn cv-llm-inspector-rail-clear"
                :disabled="!sessions.length"
                aria-label="清空记录"
                title="清空记录"
                @click="clearSessions"
              >
                <i class="fa-solid fa-trash" aria-hidden="true" />
              </button>
            </div>
            <div class="cv-llm-inspector-list custom-scrollbar">
              <div v-if="!sessions.length" class="cv-llm-inspector-empty">
                <i class="fa-regular fa-comment-dots" aria-hidden="true" />
                <span>暂无请求记录</span>
              </div>
              <button
                v-for="session in sessions"
                :key="session.id"
                type="button"
                class="cv-llm-inspector-list-item"
                :class="{ 'cv-llm-inspector-list-item--active': session.id === selectedId }"
                :aria-label="railCollapsed ? session.label : undefined"
                :title="railCollapsed ? `${session.label}（${formatTime(session.startedAt, false)}）` : session.label"
                @click="selectedId = session.id"
              >
                <!-- 左：信息（标签 + 时间·模型，模型过长省略号） -->
                <span class="cv-llm-inspector-list-text">
                  <span class="cv-llm-inspector-list-label" :title="session.label">{{ session.label }}</span>
                  <span class="cv-llm-inspector-list-meta"
                    >{{ formatTime(session.startedAt, false) }} · {{ session.model }}</span
                  >
                </span>
                <!-- 右：状态指示器（圆形勾/感叹号，运行中为主题色转动圆环） -->
                <span class="cv-llm-inspector-list-status" :class="`cv-llm-inspector-list-status--${session.status}`">
                  <i
                    v-if="session.status !== 'running'"
                    class="fa-solid"
                    :class="session.status === 'completed' ? 'fa-check' : 'fa-exclamation'"
                    aria-hidden="true"
                  />
                </span>
              </button>
            </div>
          </div>
        </nav>

        <!-- 详情 -->
        <div class="cv-llm-inspector-detail">
          <div v-if="!selectedSession" class="cv-llm-inspector-empty">
            <i class="fa-regular fa-hand-point-left" aria-hidden="true" />
            <span>选择会话查看交互详情</span>
          </div>
          <template v-else>
            <!-- 元信息区 -->
            <div class="cv-llm-inspector-meta">
              <div class="cv-llm-inspector-meta-main">
                <div class="cv-llm-inspector-meta-title-group">
                  <h2 class="cv-llm-inspector-meta-title" :title="selectedSession.label">
                    {{ selectedSession.label }}
                  </h2>
                  <div class="cv-llm-inspector-meta-subtitle">
                    <span
                      class="cv-llm-inspector-meta-status-text"
                      :style="{ color: statusColor(selectedSession.status) }"
                    >
                      {{ statusLabel(selectedSession) }}
                    </span>
                    <span class="cv-llm-inspector-meta-sep">/</span>
                    <span class="cv-llm-inspector-meta-time">
                      {{ formatTime(selectedSession.startedAt, false) }}
                    </span>
                    <template v-if="selectedSession.attempts.length >= 2">
                      <span class="cv-llm-inspector-meta-sep">/</span>
                      <span class="cv-llm-inspector-meta-attempts-hint">
                        {{ selectedSession.attempts.length }} 次尝试
                      </span>
                    </template>
                  </div>
                </div>
              </div>

              <div class="cv-llm-inspector-meta-chips">
                <span class="cv-llm-inspector-chip" :title="selectedSession.endpoint">
                  <i class="fa-solid fa-cube" aria-hidden="true" />
                  {{ selectedSession.model }}
                </span>
                <span class="cv-llm-inspector-chip">
                  <i class="fa-solid fa-user-circle" aria-hidden="true" />
                  {{ selectedSession.accountName }}
                </span>
                <span class="cv-llm-inspector-chip">
                  <i
                    class="fa-solid"
                    :class="selectedSession.streamEnabled ? 'fa-bolt' : 'fa-hourglass'"
                    aria-hidden="true"
                  />
                  {{ selectedSession.streamEnabled ? '流式' : '非流式' }}
                </span>
              </div>
            </div>

            <!-- 小节滚动区：三个小节整体滚动，元信息区置顶不滚 -->
            <div ref="sectionsEl" class="cv-llm-inspector-sections custom-scrollbar">
              <!-- 请求消息小节 -->
              <LlmInspectorPromptList
                :key="selectedSession.id"
                :prompts="selectedSession.prompts"
              />

              <!-- AI 回复小节 -->
              <LlmInspectorResponse
                :key="selectedSession.id"
                :thinking-text="selectedSession.thinkingText"
                :thinking-streaming="selectedSession.thinkingStreaming"
                :content-text="selectedSession.contentText"
                :running="selectedSession.status === 'running'"
                :error="selectedSession.error"
              />

              <!-- 账号请求列表小节 -->
              <LlmInspectorAttemptList
                :key="selectedSession.id"
                :attempts="selectedSession.attempts"
              />
            </div>
          </template>
        </div>
      </div>
    </div>
  </Dialog>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { computed, nextTick, ref, watch } from 'vue';
import { DARK_CLASS } from '@/constants/default-settings';
import '@/panel/styles/settings-dialog.css';
import '@/panel/styles/llm-inspector.css';
import '@/panel/styles/llm-inspector-bubbles.css';
import '@/panel/styles/llm-inspector-requests.css';
import { useLlmInspectorStore, type LlmInspectorSession } from '@/store/llm-inspector';
import SidebarRailToggle from '@/panel/components/SidebarRailToggle.vue';
import LlmInspectorPromptList from '@/panel/components/llm-inspector/LlmInspectorPromptList.vue';
import LlmInspectorResponse from '@/panel/components/llm-inspector/LlmInspectorResponse.vue';
import LlmInspectorAttemptList from '@/panel/components/llm-inspector/LlmInspectorAttemptList.vue';
import { useSettingsStore } from '@/store/settings';
import { useShellDialogStyle } from '@/composables/useShellDialogStyle';
import { formatDurationMs } from '@/utils/duration';

const settingsStore = useSettingsStore();
const { darkMode } = storeToRefs(settingsStore);

const inspectorStore = useLlmInspectorStore();
const { sessions } = storeToRefs(inspectorStore);

/** 弹窗开合状态（由父级控制） */
const open = defineModel<boolean>('open', { default: false });

/** visible computed 转发，Dialog 关闭时同步更新 open */
const visible = computed({
  get: () => open.value,
  set: (val: boolean) => {
    open.value = val;
  },
});

/** 壳级共享 Dialog 尺寸与窄屏断点（与设置窗同源，见 useShellDialogStyle） */
const { isMobile, dialogStyle } = useShellDialogStyle();

/** 桌面端手动收起侧栏标记 */
const railManuallyCollapsed = ref(false);
/** 窄屏侧栏收起标记（默认收起，可展开为浮层） */
const narrowRailCollapsed = ref(true);
/** 侧栏收起态：桌面手动切换；窄屏默认收起、可点切换钮展开（浮层不挤主区） */
const railCollapsed = computed(() => (isMobile.value ? narrowRailCollapsed.value : railManuallyCollapsed.value));

/** 当前选中会话 ID */
const selectedId = ref<string | null>(null);

/** 小节滚动区容器（整体滚动，切换会话时回顶） */
const sectionsEl = ref<HTMLElement | null>(null);

const selectedSession = computed<LlmInspectorSession | null>(
  () => sessions.value.find(session => session.id === selectedId.value) ?? null,
);

const dialogClass = computed(() => ['cv-llm-inspector-dialog', { [DARK_CLASS]: darkMode.value }]);

const contentStyle = {
  padding: '0',
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  minHeight: '0',
  overflow: 'hidden',
} as const;

/** 弹窗打开且未选会话时自动选中最新一条 */
watch(
  visible,
  isVisible => {
    if (isVisible && !selectedId.value && sessions.value.length) {
      selectedId.value = sessions.value[0]!.id;
    }
  },
  { immediate: true },
);

/** 新会话出现：弹窗未打开或当前会话已非 running 时自动切最新 */
watch(
  () => sessions.value[0]?.id,
  (newestId, previousId) => {
    if (!newestId || newestId === previousId) return;
    const current = selectedSession.value;
    if (!open.value || !current || current.status !== 'running') {
      selectedId.value = newestId;
    }
  },
);

/** 切换会话时：小节滚动区回到顶部 */
watch(
  () => selectedId.value,
  () => {
    void nextTick(() => {
      if (sectionsEl.value) sectionsEl.value.scrollTop = 0;
    });
  },
);

/**
 * 切换侧栏收起/展开状态（按当前断点翻转对应标记）
 */
function toggleRail(): void {
  if (isMobile.value) {
    narrowRailCollapsed.value = !narrowRailCollapsed.value;
  } else {
    railManuallyCollapsed.value = !railManuallyCollapsed.value;
  }
}

/**
 * 关闭监视弹窗
 */
function closeDialog(): void {
  open.value = false;
}

/**
 * 清空会话记录并重置选中状态
 */
function clearSessions(): void {
  inspectorStore.clearSessions();
  selectedId.value = null;
}

/**
 * 获取状态颜色
 * @param status 会话状态
 */
function statusColor(status: LlmInspectorSession['status']): string {
  if (status === 'running') return 'var(--cv-primary-container)';
  return status === 'completed' ? 'var(--cvp-green-500, #22c55e)' : 'var(--cvp-red-500, #ef4444)';
}

/**
 * 获取状态文案（含耗时：按各账号尝试耗时加总，无记录时回退首尾时间差）
 * @param session 会话对象
 */
function statusLabel(session: LlmInspectorSession): string {
  if (session.status === 'running') return '生成中';
  const totalMs = session.attempts.reduce((sum, attempt) => sum + (attempt.durationMs ?? 0), 0);
  const duration = totalMs || (session.finishedAt ? session.finishedAt - session.startedAt : 0);
  const suffix = session.status === 'completed' && duration > 0 ? ` · ${formatDurationMs(duration)}` : '';
  return `${session.status === 'completed' ? '完成' : '失败'}${suffix}`;
}

/**
 * 格式化时刻（默认 HH:MM:SS，withSeconds 为 false 时精确到分钟）
 * @param timestamp 毫秒时间戳
 * @param withSeconds 是否携带秒数
 */
function formatTime(timestamp: number, withSeconds = true): string {
  const date = new Date(timestamp);
  const pad = (value: number) => String(value).padStart(2, '0');
  const minute = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  return withSeconds ? `${minute}:${pad(date.getSeconds())}` : minute;
}
</script>

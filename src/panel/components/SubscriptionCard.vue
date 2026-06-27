<template>
  <section class="nai-sub-card">
    <!-- 空态:未填接口密钥 -->
    <template v-if="isKeyEmpty">
      <div class="nai-sub-empty">
        <i class="fa-solid fa-lock" />
        <span>填写接口密钥后展示订阅信息</span>
      </div>
    </template>

    <!-- 蒙版态:已填接口密钥但未配置跨域代理 -->
    <template v-else-if="isProxyEmpty">
      <div class="nai-sub-mask">
        <i class="fa-solid fa-lock" />
        <div class="nai-sub-mask-title">需要跨域代理才能查询订阅</div>
        <div class="nai-sub-mask-desc">订阅接口禁止跨域访问,请在上方"跨域代理地址"中填入你的代理地址。</div>
      </div>
    </template>

    <!-- 加载态 / 成功态 / 错误态 -->
    <template v-else>
      <header class="nai-sub-title">
        <div class="nai-sub-title-left">
          <Select
            v-if="savedAccounts.length > 1"
            v-model="selectedIndex"
            :options="accountOptions"
            option-label="label"
            option-value="value"
            class="nai-sub-account-select"
            :pt="SUBSCRIPTION_ACCOUNT_SELECT_PT"
          />
          <span v-else>账号订阅</span>
        </div>
        <div class="nai-sub-title-right">
          <span v-if="loading" class="nai-sub-fetched">更新中...</span>
          <span v-else-if="fetchedAt" class="nai-sub-fetched" :title="new Date(fetchedAt).toLocaleString()">
            {{ formatFetchedAt(fetchedAt) }}
          </span>
          <Button
            v-if="!loading"
            icon="fa-solid fa-rotate"
            class="nai-sub-refresh-btn"
            size="small"
            text
            :loading="loading"
            title="刷新订阅信息"
            @click="refresh"
          />
        </div>
      </header>
      <div v-if="data || loading" class="nai-sub-content" :class="{ 'nai-sub-content--loading': loading }">
        <!-- 剩余点数 (Anlas) -->
        <div class="nai-sub-stat-box">
          <div class="nai-sub-stat-header">
            <span class="nai-sub-stat-title">剩余点数</span>
          </div>
          <div class="nai-sub-anlas-main">
            {{ loading ? '—' : formatNumber(data?.totalAnlas ?? 0) }}
          </div>
        </div>

        <!-- 过期时间 -->
        <div class="nai-sub-stat-box">
          <div class="nai-sub-stat-header">
            <span class="nai-sub-stat-title">过期时间</span>
          </div>
          <div class="nai-sub-expires">
            <span class="nai-sub-expires-main">{{ loading ? '—' : formatExpireDate(data?.expiresAt ?? 0) }}</span>
          </div>
        </div>
      </div>
      <div v-else-if="!error" class="nai-sub-empty">
        <i class="fa-solid fa-floppy-disk" />
        <span>保存设置后查看订阅信息</span>
      </div>

      <!-- 错误 banner -->
      <div v-if="error" class="nai-sub-error">
        <i class="fa-solid fa-triangle-exclamation" />
        <span>{{ error }}</span>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
import { getAvailableNovelAIAccounts } from '@/services/novelai/router';
import { useNovelAISubscription } from '@/composables/useNovelAISubscription';
import { useSettingsStore } from '@/store/settings';

const { settings, savedSettings } = useSettingsStore();
const SUBSCRIPTION_ACCOUNT_SELECT_PT = {
  label: {
    class: 'cv-prime-field-text',
    style: { padding: '0 var(--cv-space-xs) 0 0', color: 'var(--cv-on-surface)', fontWeight: '600' },
  },
  dropdown: { style: { width: 'auto', color: 'var(--cv-on-surface-variant)' } },
} as const;

/** 当前选中的账号序号 (0-based)，用于切换展示哪个账号的订阅 */
const selectedIndex = ref(0);

/** 已保存的可用账号列表，用于生成下拉选项 */
const savedAccounts = computed(() => getAvailableNovelAIAccounts(savedSettings.novelai));

/** 账号列表变短时收敛选中序号，避免越界后取到 null */
watch(
  () => savedAccounts.value.length,
  len => {
    if (selectedIndex.value >= len) selectedIndex.value = Math.max(0, len - 1);
  },
);

/** 下拉选项：账号 1、账号 2 … */
const accountOptions = computed(() => savedAccounts.value.map((_, i) => ({ label: `账号 ${i + 1}`, value: i })));

/** 已保存配置中选中的账号 */
const savedAccount = computed(() => savedAccounts.value[selectedIndex.value] ?? null);

/** 草稿配置中选中的账号（用于空态/蒙版判定，始终取第一个） */
const draftAccount = computed(() => {
  const accounts = settings.novelai.accounts.filter(a => a.apiKey.trim());
  return accounts[0] ?? null;
});

const draftCorsProxy = toRef(settings.novelai, 'corsProxy');
const savedCorsProxy = toRef(savedSettings.novelai, 'corsProxy');

const { data, loading, error, fetchedAt, refresh, isKeyEmpty, isProxyEmpty } = useNovelAISubscription(
  savedAccount,
  savedCorsProxy,
  draftAccount,
  draftCorsProxy,
);

function formatNumber(n: number): string {
  return n.toLocaleString('en-US');
}

function formatExpireDate(ts: number): string {
  if (!ts) return '终身';
  const d = new Date(ts * 1000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatFetchedAt(ts: number): string {
  if (!ts) return '';
  const sec = Math.floor((Date.now() - ts) / 1000);
  if (sec < 60) return '刚刚更新';
  const min = Math.floor(sec / 60);
  return `${min} 分钟前`;
}
</script>

<style scoped>
@reference '../../global.css';

.nai-sub-card {
  @apply my-[var(--cv-space-10xl)] overflow-hidden;
  background: var(--cv-surface-container);
  border: var(--cv-border-width) solid var(--cv-surface-variant);
  border-top-color: var(--cv-surface-bright);
  border-radius: var(--cv-radius-lg);
}

.nai-sub-title {
  @apply flex items-center justify-between;
  padding: var(--cv-space-5xl) var(--cv-space-8xl);
  font-family: var(--cv-font-headline);
  font-size: var(--cv-font-size-xl);
  font-weight: 600;
  color: var(--cv-on-surface);
  border-bottom: var(--cv-border-width) solid var(--cv-surface-variant);
}

.nai-sub-title-right {
  @apply inline-flex items-center;
  gap: var(--cv-space-lg);
}

/* 标题左侧：账号下拉或静态标题 */
.nai-sub-title-left {
  @apply inline-flex items-center;
  gap: var(--cv-space-sm);
}

/* 伪装成标题的 Select：去掉边框/背景，只保留文字和下拉箭头 */
.nai-sub-account-select {
  --p-select-focus-ring-width: 0;
  --p-select-focus-ring-shadow: none;
  @apply inline-flex items-center h-auto cursor-pointer border-0 bg-transparent p-0 shadow-none;
  height: auto !important;
  padding: 0 !important;
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
  font-family: var(--cv-font-headline);
  font-size: var(--cv-font-size-xl);
  font-weight: 600;
  color: var(--cv-on-surface) !important;
}

.nai-sub-empty {
  @apply flex flex-col items-center justify-center;
  gap: var(--cv-space-5xl);
  min-height: 8em;
  padding: var(--cv-space-10xl);
  color: var(--cv-on-surface-variant);
  font-size: var(--cv-font-size-md);
}

.nai-sub-empty i {
  font-size: var(--cv-font-size-4xl);
  opacity: 0.5;
}

.nai-sub-content {
  @apply grid;
  padding: var(--cv-space-8xl) var(--cv-space-10xl);
  grid-template-columns: 1fr 1fr;
  gap: var(--cv-space-8xl);
}

.nai-sub-content--loading {
  opacity: 0.6;
}

.nai-sub-stat-box {
  @apply flex flex-col;
  gap: var(--cv-space-lg);
}

.nai-sub-stat-header {
  height: 1.6em;
}

.nai-sub-stat-title {
  font-family: var(--cv-font-label);
  font-size: var(--cv-font-size-xs);
  font-weight: 500;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--cv-on-surface-variant);
}

.nai-sub-anlas-main {
  font-size: var(--cv-font-size-4xl);
  font-weight: 800;
  color: var(--cv-primary-container);
  font-variant-numeric: tabular-nums;
  line-height: 1.2;
}

.nai-sub-expires {
  @apply flex flex-wrap items-baseline;
  gap: var(--cv-space-lg);
}

.nai-sub-expires-main {
  font-size: var(--cv-font-size-3xl);
  font-weight: 700;
  color: var(--cv-on-surface);
  font-variant-numeric: tabular-nums;
}

.nai-sub-expires-days {
  font-family: var(--cv-font-label);
  font-size: var(--cv-font-size-xs);
  font-weight: 500;
  color: var(--cv-on-surface-variant);
}

.nai-sub-fetched {
  font-family: var(--cv-font-label);
  font-size: var(--cv-font-size-xs);
  color: var(--cv-on-surface-variant);
  font-variant-numeric: tabular-nums;
}

.nai-sub-refresh-btn {
  width: 1.6em !important;
  height: 1.6em !important;
  padding: 0 !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  border-radius: 50% !important;
  color: var(--cv-on-surface-variant) !important;
  transition: all 0.2s ease !important;
}

.nai-sub-refresh-btn:hover {
  background: var(--cv-surface-container-high) !important;
  color: var(--cv-on-surface) !important;
  transform: rotate(45deg);
}

.nai-sub-error {
  @apply flex items-center;
  gap: var(--cv-space-3xl);
  padding: var(--cv-space-3xl) var(--cv-space-10xl);
  background: rgba(239, 68, 68, 0.08);
  border-top: var(--cv-border-width) solid rgba(239, 68, 68, 0.2);
  color: #dc2626;
  font-size: var(--cv-font-size-md);
}

.nai-sub-mask {
  @apply flex flex-col items-center justify-center text-center;
  gap: var(--cv-space-5xl);
  min-height: 9.3333em;
  padding: var(--cv-space-10xl);
  color: var(--cv-on-surface-variant);
}

.nai-sub-mask i {
  font-size: var(--cv-font-size-4xl);
  opacity: 0.5;
}

.nai-sub-mask-title {
  font-size: var(--cv-font-size-xl);
  font-weight: 600;
  color: var(--cv-on-surface);
}

.nai-sub-mask-desc {
  font-size: var(--cv-font-size-md);
  line-height: 1.5;
  max-width: 24em;
}

@media (max-width: 48rem) {
  .nai-sub-content {
    grid-template-columns: 1fr;
    padding: var(--cv-space-5xl) var(--cv-space-7xl);
    gap: var(--cv-space-7xl);
  }
  .nai-sub-title {
    padding: var(--cv-space-4xl) var(--cv-space-7xl);
  }
  .nai-sub-empty,
  .nai-sub-mask {
    padding: var(--cv-space-7xl);
  }
}
</style>

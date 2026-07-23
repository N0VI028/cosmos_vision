<template>
  <section
    class="my-(--cv-space-10xl) overflow-hidden rounded-(--cv-radius-lg) border-(length:--cv-border-width) border-solid border-(--cv-surface-variant) border-t-(--cv-surface-bright) bg-(--cv-surface-container)"
  >
    <!-- 空态:未填接口密钥 -->
    <template v-if="isKeyEmpty">
      <div
        class="flex min-h-32 flex-col items-center justify-center gap-(--cv-space-5xl) p-(--cv-space-10xl) text-(length:--cv-font-size-md) text-(--cv-on-surface-variant) max-[48rem]:p-(--cv-space-7xl)"
      >
        <i class="fa-solid fa-lock text-(length:--cv-font-size-4xl) opacity-50" />
        <span>填写接口密钥后展示订阅信息</span>
      </div>
    </template>

    <!-- 蒙版态:已填接口密钥但未配置跨域代理 -->
    <template v-else-if="isProxyEmpty">
      <div
        class="flex min-h-[9.3333em] flex-col items-center justify-center gap-(--cv-space-5xl) p-(--cv-space-10xl) text-center text-(--cv-on-surface-variant) max-[48rem]:p-(--cv-space-7xl)"
      >
        <i class="fa-solid fa-lock text-(length:--cv-font-size-4xl) opacity-50" />
        <div class="text-(length:--cv-font-size-xl) font-semibold text-(--cv-on-surface)">需要跨域代理才能查询订阅</div>
        <div class="max-w-96 whitespace-normal text-(length:--cv-font-size-md) leading-[1.5]">
          订阅接口禁止跨域访问,请在上方"跨域代理地址"中填入你的代理地址。
        </div>
      </div>
    </template>

    <!-- 加载态 / 成功态 / 错误态 -->
    <template v-else>
      <header
        class="flex items-center justify-between border-b-(length:--cv-border-width) border-b-solid border-b-(--cv-surface-variant) px-(--cv-space-8xl) py-(--cv-space-5xl) font-(family-name:--cv-font-headline) text-(length:--cv-font-size-xl) font-semibold text-(--cv-on-surface) max-[48rem]:px-(--cv-space-7xl) max-[48rem]:py-(--cv-space-4xl)"
      >
        <div class="inline-flex items-center gap-(--cv-space-sm)">
          <!-- 伪装标题 Select：任意后代选择器命中局部 PT 锚点 -->
          <Select
            v-if="savedAccounts.length > 1"
            v-model="selectedIndex"
            :options="accountOptions"
            option-label="label"
            option-value="value"
            class="inline-flex h-auto! cursor-pointer items-center border-0! bg-transparent! p-0! font-(family-name:--cv-font-headline) text-(length:--cv-font-size-xl)! font-semibold text-(--cv-on-surface)! shadow-none! [&_.nai-sub-account-select-dropdown]:w-auto [&_.nai-sub-account-select-dropdown]:text-(--cv-on-surface-variant) [&_.nai-sub-account-select-label]:pr-(--cv-space-xs) [&_.nai-sub-account-select-label]:pl-0 [&_.nai-sub-account-select-label]:font-semibold [&_.nai-sub-account-select-label]:text-(--cv-on-surface)"
            :pt="ACCOUNT_SELECT_PT"
          />
          <span v-else>账号订阅</span>
        </div>
        <div class="inline-flex items-center gap-(--cv-space-lg)">
          <span
            v-if="loading"
            class="font-(family-name:--cv-font-label) text-(length:--cv-font-size-xs) text-(--cv-on-surface-variant) tabular-nums"
          >更新中...</span>
          <span
            v-else-if="fetchedAt"
            class="font-(family-name:--cv-font-label) text-(length:--cv-font-size-xs) text-(--cv-on-surface-variant) tabular-nums"
            :title="new Date(fetchedAt).toLocaleString()"
          >
            {{ formatFetchedAt(fetchedAt) }}
          </span>
          <Button
            v-if="!loading"
            icon="fa-solid fa-rotate"
            class="inline-flex! size-[1.6em]! items-center! justify-center! rounded-full! p-0! text-(--cv-on-surface-variant)! transition-all duration-200 ease-in-out hover:bg-(--cv-surface-container-high)! hover:text-(--cv-on-surface)! hover:rotate-45"
            size="small"
            text
            :loading="loading"
            title="刷新订阅信息"
            @click="refresh"
          />
        </div>
      </header>
      <div
        v-if="data || loading"
        class="grid grid-cols-1 gap-(--cv-space-8xl) px-(--cv-space-10xl) py-(--cv-space-8xl) max-[48rem]:gap-(--cv-space-7xl) max-[48rem]:px-(--cv-space-7xl) max-[48rem]:py-(--cv-space-5xl) min-[48rem]:grid-cols-2"
        :class="{ 'opacity-60': loading }"
      >
        <!-- 剩余点数 (Anlas) -->
        <div class="flex flex-col gap-(--cv-space-lg)">
          <div class="h-[1.6em]">
            <span
              class="font-(family-name:--cv-font-label) text-(length:--cv-font-size-xs) font-medium tracking-[0.05em] text-(--cv-on-surface-variant) uppercase"
            >剩余点数</span>
          </div>
          <div
            class="text-(length:--cv-font-size-4xl) font-extrabold leading-[1.2] text-(--cv-primary-container) tabular-nums"
          >
            {{ loading ? '—' : formatNumber(data?.totalAnlas ?? 0) }}
          </div>
        </div>

        <!-- 过期时间 -->
        <div class="flex flex-col gap-(--cv-space-lg)">
          <div class="h-[1.6em]">
            <span
              class="font-(family-name:--cv-font-label) text-(length:--cv-font-size-xs) font-medium tracking-[0.05em] text-(--cv-on-surface-variant) uppercase"
            >过期时间</span>
          </div>
          <div class="flex flex-wrap items-baseline gap-(--cv-space-lg)">
            <span class="text-(length:--cv-font-size-3xl) font-bold text-(--cv-on-surface) tabular-nums">
              {{ loading ? '—' : formatExpireDate(data?.expiresAt ?? 0) }}
            </span>
          </div>
        </div>
      </div>
      <div
        v-else-if="!error"
        class="flex min-h-32 flex-col items-center justify-center gap-(--cv-space-5xl) p-(--cv-space-10xl) text-(length:--cv-font-size-md) text-(--cv-on-surface-variant) max-[48rem]:p-(--cv-space-7xl)"
      >
        <i class="fa-solid fa-floppy-disk text-(length:--cv-font-size-4xl) opacity-50" />
        <span>保存设置后查看订阅信息</span>
      </div>

      <!-- 错误 banner -->
      <div
        v-if="error"
        class="flex items-center gap-(--cv-space-3xl) border-t-(length:--cv-border-width) border-t-solid border-t-[rgba(239,68,68,0.2)] bg-[rgba(239,68,68,0.08)] px-(--cv-space-10xl) py-(--cv-space-3xl) text-(length:--cv-font-size-md) text-[#dc2626]"
      >
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

/** 订阅卡标题伪装 Select：局部 PT 锚点，避免 :deep(.p-select-*) */
const ACCOUNT_SELECT_PT = {
  label: { class: 'cv-prime-field-text nai-sub-account-select-label' },
  dropdown: { class: 'cv-prime-select-dropdown nai-sub-account-select-dropdown' },
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

/** 下拉选项：展示账号序号与实际账号名称 */
const accountOptions = computed(() =>
  savedAccounts.value.map((account, i) => {
    const prefix = `账号 ${i + 1}`;
    const name = account.name.trim();
    const label = name ? `${prefix} - ${name}` : `${prefix} - 未命名`;
    return { label, value: i };
  }),
);

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

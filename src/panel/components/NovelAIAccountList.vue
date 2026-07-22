<template>
  <section class="cv-account-list">
    <div class="cv-account-list__header">
      <div class="cv-account-list__title">账号列表</div>
      <div class="cv-account-list__actions">
        <Button label="新增账号" icon="fa-solid fa-plus" size="small" @click="addAccount" />
      </div>
    </div>

    <div v-if="accounts.length" class="cv-account-list__items">
      <CollapsiblePanelItem
        v-for="(account, index) in accounts"
        :key="account.id"
        :title="getAccountTitle(account, index)"
        :collapsed="isCollapsed(account.id)"
        :class="{ 'cv-account-item--disabled': !account.enabled }"
        @toggle="toggleCollapse(account.id)"
      >
        <template #title>
          <template v-if="editingAccountId === account.id">
            <InputText
              v-model="editingDraft"
              class="mr-(--cv-space-lg) w-48 min-w-24 max-w-full"
              size="small"
              autofocus
              @click.stop
              @keydown.enter="finishEditing(account)"
              @keydown.esc="finishEditing(account)"
            />
            <CvMiniButton
              icon="fa-solid fa-check"
              size="small"
              title="完成"
              @click.stop="finishEditing(account)"
            />
          </template>
          <template v-else>
            <span class="block min-w-0 flex-[0_1_auto] overflow-hidden text-ellipsis whitespace-nowrap font-semibold text-(--cv-on-surface)">
              {{ getAccountTitle(account, index) }}
            </span>
            <CvMiniButton
              icon="fa-solid fa-pen"
              size="small"
              title="重命名"
              @click.stop="toggleEditing(account)"
            />
          </template>
        </template>

        <template #actions>
          <CvMiniToggleSwitch
            v-model="account.enabled"
            :title="account.enabled ? '禁用账号' : '启用账号'"
            :aria-label="account.enabled ? '禁用账号' : '启用账号'"
          />
          <CvMiniButton
            icon="fa-solid fa-arrow-up"
            size="small"
            :disabled="index === 0"
            title="上移账号"
            @click="moveAccount(index, index - 1)"
          />
          <CvMiniButton
            icon="fa-solid fa-arrow-down"
            size="small"
            :disabled="index === accounts.length - 1"
            title="下移账号"
            @click="moveAccount(index, index + 1)"
          />
          <CvMiniButton
            icon="fa-solid fa-trash"
            size="small"
            tone="danger"
            title="删除账号"
            @click="removeAccount(index)"
          />
        </template>

        <div class="cv-account-item__body">
          <label class="cv-field">
            <span>NovelAI URL</span>
            <InputText v-model="account.url" :placeholder="NOVELAI_DEFAULT_URL" />
          </label>
          <label class="cv-field">
            <span>API Key</span>
            <Password v-model="account.apiKey" fluid :feedback="false" toggle-mask />
          </label>
        </div>
      </CollapsiblePanelItem>
    </div>

    <div v-else class="cv-account-list__empty">
      <i class="fa-regular fa-address-card" />
      <span>当前没有账号，新增后即可参与路由与故障转移</span>
    </div>
  </section>
</template>

<script setup lang="ts">
import { uuidv4 } from '@sillytavern/scripts/utils';

import { createNovelAIAccount, NOVELAI_DEFAULT_URL, type NovelAIAccount } from '@/constants/novelai';
import CollapsiblePanelItem from '@/panel/components/CollapsiblePanelItem.vue';
import CvMiniButton from '@/panel/components/CvMiniButton.vue';
import CvMiniToggleSwitch from '@/panel/components/CvMiniToggleSwitch.vue';

const accounts = defineModel<NovelAIAccount[]>({ required: true });

const collapsedIds = ref<Set<string>>(new Set());
const editingAccountId = ref<string | null>(null);
/** 编辑草稿：进入编辑时预填入旧账号名，确认时写回 account.name */
const editingDraft = ref<string>('');

/**
 * 获取账号标题
 * @param account 账号对象
 * @param index 账号序号
 * @returns 账号标题
 */
function getAccountTitle(account: NovelAIAccount, index: number): string {
  const prefix = `账号 ${index + 1}`;
  if (account.name) return `${prefix} - ${account.name}`;
  return `${prefix} - 未命名`;
}

/**
 * 判断账号是否处于收起状态
 * @param accountId 账号 id
 * @returns 是否收起
 */
function isCollapsed(accountId: string): boolean {
  return collapsedIds.value.has(accountId);
}

/**
 * 切换账号折叠状态
 * @param accountId 账号 id
 */
function toggleCollapse(accountId: string): void {
  if (collapsedIds.value.has(accountId)) {
    collapsedIds.value.delete(accountId);
  } else {
    collapsedIds.value.add(accountId);
  }
}

/**
 * 进入重命名模式，将旧名字预填入草稿
 * @param account 账号对象
 */
function toggleEditing(account: NovelAIAccount): void {
  if (editingAccountId.value === account.id) {
    finishEditing(account);
    return;
  }
  editingAccountId.value = account.id;
  editingDraft.value = account.name;
}

/**
 * 完成编辑，将草稿写回账号名
 * @param account 账号对象
 */
function finishEditing(account: NovelAIAccount): void {
  if (editingAccountId.value !== account.id) return;
  account.name = editingDraft.value;
  editingAccountId.value = null;
  editingDraft.value = '';
}

/**
 * 新增一组 NovelAI 账号
 */
function addAccount(): void {
  accounts.value.push(createNovelAIAccount(uuidv4()));
}

/**
 * 调整账号顺序
 * @param from 原始位置
 * @param to 目标位置
 */
function moveAccount(from: number, to: number): void {
  if (to < 0 || to >= accounts.value.length) return;
  const [account] = accounts.value.splice(from, 1);
  accounts.value.splice(to, 0, account);
}

/**
 * 删除一组 NovelAI 账号
 * @param index 账号序号
 */
function removeAccount(index: number): void {
  const account = accounts.value[index];
  if (account) {
    collapsedIds.value.delete(account.id);
    if (editingAccountId.value === account.id) {
      editingAccountId.value = null;
    }
  }
  accounts.value.splice(index, 1);
}
</script>

<style scoped>
@reference '../../global.css';

.cv-account-list {
  @apply flex w-full flex-col;
  gap: var(--cv-space-4xl);
}

.cv-account-list__header {
  @apply flex w-full flex-col;
  gap: var(--cv-space-md);
}

.cv-account-list__title {
  @apply shrink-0 whitespace-nowrap;
  color: var(--cv-on-surface);
  font-weight: 600;
}

.cv-account-list__actions {
  @apply flex justify-start;
  margin-top: var(--cv-space-sm);
}

.cv-account-list__items {
  @apply flex flex-col;
  gap: var(--cv-space-xl);
}

.cv-account-item__body {
  @apply grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--cv-space-4xl);
  padding: var(--cv-space-2xl);
  border-top: var(--cv-border-width) solid var(--cv-surface-variant);
}

.cv-account-list__empty {
  @apply flex flex-col items-center justify-center text-center;
  gap: var(--cv-space-3xl);
  min-height: 9rem;
  padding: var(--cv-space-5xl);
  border: var(--cv-border-width) dashed var(--cv-surface-variant);
  border-radius: var(--cv-radius);
  color: var(--cv-on-surface-variant);
}

.cv-account-list__empty > i {
  font-size: 1.2rem;
}

.cv-account-item--disabled {
  opacity: 0.62;
}

@media (max-width: 48rem) {
  .cv-account-item__body {
    grid-template-columns: 1fr;
  }
}
</style>

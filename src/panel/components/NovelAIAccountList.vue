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
        :disabled="!account.enabled"
        @toggle="toggleCollapse(account.id)"
      >
        <template #title-extra>
          <CvMiniButton
            :icon="editingAccountId === account.id ? 'fa-solid fa-check' : 'fa-solid fa-pen'"
            size="small"
            :title="editingAccountId === account.id ? '完成' : '重命名'"
            @click.stop="toggleEditing(account.id)"
          />
          <InputText
            v-if="editingAccountId === account.id"
            v-model="account.name"
            class="cv-account-item__name-input"
            size="small"
            placeholder="未命名"
            autofocus
            @click.stop
            @keydown.enter="finishEditing"
            @keydown.esc="finishEditing"
          />
        </template>

        <template #actions>
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
          <ToggleSwitch v-model="account.enabled" :title="account.enabled ? '禁用账号' : '启用账号'" />
          <CvMiniButton
            icon="fa-solid fa-trash"
            size="small"
            tone="danger"
            title="删除账号"
            @click="removeAccount(index)"
          />
        </template>

        <div class="cv-account-item__body">
          <label class="cv-account-field">
            <span>NovelAI URL</span>
            <InputText v-model="account.url" :placeholder="NOVELAI_DEFAULT_URL" />
          </label>
          <label class="cv-account-field">
            <span>API Key</span>
            <Password
              v-model="account.apiKey"
              class="w-full"
              :feedback="false"
              toggle-mask
              :input-class="'w-full'"
            />
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

const accounts = defineModel<NovelAIAccount[]>({ required: true });

const collapsedIds = ref<Set<string>>(new Set());
const editingAccountId = ref<string | null>(null);

/**
 * 获取账号标题
 * @param account 账号对象
 * @param index 账号序号
 * @returns 账号标题
 */
function getAccountTitle(account: NovelAIAccount, index: number): string {
  const prefix = `账号 ${index + 1}`;
  if (editingAccountId.value === account.id) return prefix;
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
 * 切换编辑模式
 * @param accountId 账号 id
 */
function toggleEditing(accountId: string): void {
  if (editingAccountId.value === accountId) {
    editingAccountId.value = null;
  } else {
    editingAccountId.value = accountId;
  }
}

/**
 * 完成编辑
 */
function finishEditing(): void {
  editingAccountId.value = null;
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

.cv-account-item__name-input {
  flex: 1;
  min-width: 8rem;
  max-width: 20rem;
}

.cv-account-item__body {
  @apply grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--cv-space-4xl);
  padding: var(--cv-space-2xl);
  border-top: var(--cv-border-width) solid var(--cv-surface-variant);
}

.cv-account-field {
  @apply mb-0 flex flex-col;
  gap: var(--cv-space-3xl);
}

.cv-account-field > span {
  font-family: var(--cv-font-body);
  font-size: var(--cv-font-size-md);
  font-weight: 500;
  color: var(--cv-on-surface-variant);
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

@media (max-width: 48rem) {
  .cv-account-item__body {
    grid-template-columns: 1fr;
  }
}
</style>

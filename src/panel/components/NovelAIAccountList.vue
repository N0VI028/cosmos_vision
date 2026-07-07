<template>
  <section class="cv-account-list">
    <div class="cv-account-list__header">
      <div class="cv-account-list__title">账号列表</div>
      <div class="cv-account-list__actions">
        <Button label="新增账号" icon="fa-solid fa-plus" size="small" @click="addAccount" />
      </div>
    </div>

    <div v-if="accounts.length" class="cv-account-list__items">
      <div v-for="(account, index) in accounts" :key="account.id" class="cv-account-item">
        <div class="cv-account-item__header" @click="toggleCollapse(account.id)">
          <div class="cv-account-item__header-left">
            <Button
              :icon="isCollapsed(account.id) ? 'fa-solid fa-chevron-right' : 'fa-solid fa-chevron-down'"
              size="small"
              text
              rounded
              :title="isCollapsed(account.id) ? '展开' : '收起'"
              @click.stop="toggleCollapse(account.id)"
            />
            <template v-if="editingAccountId === account.id">
              <InputText
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
            <template v-else>
              <span class="cv-account-item__title" @click.stop>
                <span class="cv-account-item__index">账号 {{ index + 1 }}</span>
                <span v-if="account.name" class="cv-account-item__name">{{ account.name }}</span>
                <span v-else class="cv-account-item__name-placeholder">未命名</span>
              </span>
            </template>
            <Button
              :icon="editingAccountId === account.id ? 'fa-solid fa-check' : 'fa-solid fa-pen'"
              size="small"
              text
              rounded
              :title="editingAccountId === account.id ? '完成' : '重命名'"
              @click.stop="toggleEditing(account.id)"
            />
          </div>

          <div class="cv-account-item__header-actions" @click.stop>
            <Button
              icon="fa-solid fa-arrow-up"
              size="small"
              text
              rounded
              :disabled="index === 0"
              title="上移账号"
              @click="moveAccount(index, index - 1)"
            />
            <Button
              icon="fa-solid fa-arrow-down"
              size="small"
              text
              rounded
              :disabled="index === accounts.length - 1"
              title="下移账号"
              @click="moveAccount(index, index + 1)"
            />
            <ToggleSwitch v-model="account.enabled" :title="account.enabled ? '禁用账号' : '启用账号'" />
            <Button
              icon="fa-solid fa-trash"
              size="small"
              text
              rounded
              severity="danger"
              title="删除账号"
              @click="removeAccount(index)"
            />
          </div>
        </div>

        <Transition name="cv-collapse">
          <div v-if="!isCollapsed(account.id)" class="cv-account-item__body">
            <label class="cv-account-field">
              <span>NovelAI URL</span>
              <InputText v-model="account.url" :placeholder="NOVELAI_DEFAULT_URL" />
            </label>
            <label class="cv-account-field">
              <span>API Key</span>
              <Password
                v-model="account.apiKey"
                :feedback="false"
                toggle-mask
                :input-class="'w-full'"
                :pt="PASSWORD_FIELD_PT"
              />
            </label>
          </div>
        </Transition>
      </div>
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

const accounts = defineModel<NovelAIAccount[]>({ required: true });
const PASSWORD_FIELD_PT = {
  root: { style: { width: '100%' } },
} as const;

const collapsedIds = ref<Set<string>>(new Set());
const editingAccountId = ref<string | null>(null);

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
  gap: var(--cv-space-3xl);
}

.cv-account-item {
  @apply flex flex-col;
  border: var(--cv-border-width) solid var(--cv-surface-variant);
  border-radius: var(--cv-radius);
  background: var(--cv-surface-container);
  overflow: hidden;
}

.cv-account-item__header {
  @apply flex items-center justify-between;
  gap: var(--cv-space-3xl);
  padding: var(--cv-space-4xl) var(--cv-space-5xl);
  cursor: pointer;
  user-select: none;
  transition: background-color 0.15s ease;
}

.cv-account-item__header:hover {
  background: var(--cv-surface-container-high);
}

.cv-account-item__header-left {
  @apply flex items-center;
  gap: var(--cv-space-lg);
  flex: 1;
  min-width: 0;
}

.cv-account-item__title {
  @apply flex items-center;
  gap: var(--cv-space-md);
  min-width: 0;
}

.cv-account-item__index {
  @apply shrink-0;
  color: var(--cv-on-surface);
  font-weight: 600;
}

.cv-account-item__name {
  color: var(--cv-on-surface);
  font-weight: 500;
}

.cv-account-item__name-placeholder {
  color: var(--cv-on-surface-variant);
  font-style: italic;
  opacity: 0.7;
}

.cv-account-item__name-input {
  flex: 1;
  min-width: 8rem;
  max-width: 20rem;
}

.cv-account-item__header-actions {
  @apply inline-flex items-center;
  gap: var(--cv-space-md);
}

.cv-account-item__body {
  @apply grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--cv-space-4xl);
  padding: 0 var(--cv-space-5xl) var(--cv-space-5xl);
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

/* 折叠过渡动画 */
.cv-collapse-enter-active,
.cv-collapse-leave-active {
  transition: all 0.2s ease;
  overflow: hidden;
}

.cv-collapse-enter-from,
.cv-collapse-leave-to {
  opacity: 0;
  max-height: 0;
}

.cv-collapse-enter-to,
.cv-collapse-leave-from {
  opacity: 1;
  max-height: 500px;
}

@media (max-width: 48rem) {
  .cv-account-item__header {
    @apply flex-col items-stretch;
  }

  .cv-account-item__header-actions {
    @apply justify-end;
  }

  .cv-account-item__body {
    grid-template-columns: 1fr;
  }
}
</style>

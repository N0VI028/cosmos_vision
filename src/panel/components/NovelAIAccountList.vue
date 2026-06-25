<template>
  <section class="cv-account-list">
    <div class="cv-account-list__header">
      <div class="cv-account-list__title">账号列表</div>
      <div class="cv-account-list__actions">
        <Button label="新增账号" icon="fa-solid fa-plus" size="small" @click="addAccount" />
      </div>
    </div>

    <div v-if="accounts.length" class="cv-account-list__items">
      <div v-for="(account, index) in accounts" :key="account.id" class="cv-account-row">
        <div class="cv-account-row__head">
          <span class="cv-account-row__title">账号 {{ index + 1 }}</span>
          <div class="cv-account-row__actions">
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

        <div class="cv-account-row__fields">
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

.cv-account-list__hint {
  color: var(--cv-on-surface-variant);
  font-size: calc(var(--mainFontSize) * 0.9);
  line-height: 1.5;
}

.cv-account-list__items {
  @apply flex flex-col;
  gap: var(--cv-space-4xl);
}

.cv-account-row {
  @apply flex flex-col;
  gap: var(--cv-space-4xl);
  padding: var(--cv-space-5xl);
  border: var(--cv-border-width) solid var(--cv-surface-variant);
  border-radius: var(--cv-radius);
  background: var(--cv-surface-container);
}

.cv-account-row__head {
  @apply flex items-center justify-between;
  gap: var(--cv-space-3xl);
}

.cv-account-row__title {
  color: var(--cv-on-surface);
  font-weight: 600;
}

.cv-account-row__actions {
  @apply inline-flex items-center;
  gap: var(--cv-space-sm);
}

.cv-account-row__fields {
  @apply grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--cv-space-4xl);
}

.cv-account-field {
  @apply mb-0 flex flex-col;
  gap: var(--cv-space-3xl);
}

.cv-account-field > span {
  font-family: var(--cv-font-body);
  font-size: calc(var(--mainFontSize) * 0.9);
  font-weight: 500;
  color: var(--cv-on-surface-variant);
}

.cv-account-list__empty {
  @apply flex flex-col items-center justify-center text-center;
  gap: var(--cv-space-3xl);
  min-height: 9rem;
  padding: var(--cv-space-6xl);
  border: var(--cv-border-width) dashed var(--cv-surface-variant);
  border-radius: var(--cv-radius);
  color: var(--cv-on-surface-variant);
}

.cv-account-list__empty > i {
  font-size: 1.2rem;
}

@media (max-width: 48rem) {
  .cv-account-row__head {
    @apply flex-col items-stretch;
  }

  .cv-account-row__actions {
    @apply justify-end;
  }

  .cv-account-row__fields {
    grid-template-columns: 1fr;
  }
}
</style>

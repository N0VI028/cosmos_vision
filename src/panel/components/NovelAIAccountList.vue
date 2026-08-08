<template>
  <section class="flex w-full flex-col gap-(--cv-space-4xl)">
    <div class="flex w-full flex-col gap-(--cv-space-md)">
      <div class="shrink-0 whitespace-nowrap font-semibold text-(--cv-on-surface)">账号列表</div>
      <div class="mt-(--cv-space-sm) flex justify-start">
        <Button label="新增账号" icon="fa-solid fa-plus" @click="addAccount" />
      </div>
    </div>

    <div v-if="accounts.length" class="flex flex-col gap-(--cv-space-xl)">
      <CollapsiblePanelItem
        v-for="(account, index) in accounts"
        :key="account.id"
        :title="getAccountTitle(account)"
        :collapsed="isCollapsed(account.id)"
        :is-editing="editingAccountId === account.id"
        :class="{ 'opacity-[0.62]': !account.enabled }"
        @toggle="toggleCollapse(account.id)"
      >
        <template #title>
          <div v-if="editingAccountId === account.id" class="flex h-8 min-w-0 flex-1 items-center gap-(--cv-space-md)">
            <InputText
              v-model="editingDraft"
              class="h-8 min-w-0 flex-1"
              size="small"
              autofocus
              @click.stop
              @keydown.enter="finishEditing(account)"
              @keydown.esc="finishEditing(account)"
            />
            <CvMiniButton
              icon="fa-regular fa-check"
              title="完成"
              @click.stop="finishEditing(account)"
            />
          </div>
          <div v-else class="flex h-8 min-w-0 items-center gap-(--cv-space-sm)">
            <span
              class="block min-w-0 flex-[0_1_auto] overflow-hidden text-ellipsis whitespace-nowrap font-semibold text-(--cv-on-surface) leading-8"
            >
              {{ getAccountTitle(account) }}
            </span>
            <CvMiniButton
              icon="fa-regular fa-pen"
              title="重命名"
              @click.stop="toggleEditing(account)"
            />
          </div>
        </template>

        <template #actions>
          <CvMiniToggleSwitch
            v-model="account.enabled"
            :title="account.enabled ? '禁用账号' : '启用账号'"
            :aria-label="account.enabled ? '禁用账号' : '启用账号'"
          />
          <CvMiniButton
            icon="fa-regular fa-arrow-up"
            :disabled="index === 0"
            title="上移账号"
            @click="moveAccount(index, index - 1)"
          />
          <CvMiniButton
            icon="fa-regular fa-arrow-down"
            :disabled="index === accounts.length - 1"
            title="下移账号"
            @click="moveAccount(index, index + 1)"
          />
          <CvMiniButton
            icon="fa-regular fa-trash"
            tone="danger"
            title="删除账号"
            @click="confirmRemoveAccount(index)"
          />
        </template>

        <div class="grid grid-cols-1 gap-(--cv-space-4xl) md:grid-cols-2">
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

    <div
      v-else
      class="flex min-h-36 flex-col items-center justify-center gap-(--cv-space-3xl) rounded-(--cv-radius) border-(length:--cv-border-width) border-dashed border-(--cv-surface-variant) p-(--cv-space-5xl) text-center text-(--cv-on-surface-variant) [&_i]:text-(length:--cv-font-size-2xl)"
    >
      <i class="fa-regular fa-address-card" />
      <span>当前没有账号，新增后即可参与路由与故障转移</span>
    </div>
  </section>
</template>

<script setup lang="ts">
import { uuidv4 } from '@sillytavern/scripts/utils';

import { requestConfirmation, type ShowConfirm } from '@/panel/confirm-action';

import { createNovelAIAccount, NOVELAI_DEFAULT_URL, type NovelAIAccount } from '@/constants/novelai';
import CollapsiblePanelItem from '@/panel/components/CollapsiblePanelItem.vue';
import CvMiniButton from '@/panel/components/CvMiniButton.vue';
import CvMiniToggleSwitch from '@/panel/components/CvMiniToggleSwitch.vue';

const accounts = defineModel<NovelAIAccount[]>({ required: true });
const showConfirm = inject<ShowConfirm>('showConfirm');

/** 记录展开的账号 ID 集合，默认为空即全部折叠 */
const expandedAccountIds = ref<Set<string>>(new Set());
const editingAccountId = ref<string | null>(null);
/** 编辑草稿：进入编辑时预填入旧账号名，确认时写回 account.name */
const editingDraft = ref<string>('');

/**
 * 获取账号标题
 * @param account 账号对象
 * @returns 账号标题
 */
function getAccountTitle(account: NovelAIAccount): string {
  return account.name || '未命名账号';
}

/**
 * 判断账号是否处于收起状态
 * @param accountId 账号 id
 * @returns 是否收起
 */
function isCollapsed(accountId: string): boolean {
  return !expandedAccountIds.value.has(accountId);
}

/**
 * 切换账号折叠状态
 * @param accountId 账号 id
 */
function toggleCollapse(accountId: string): void {
  if (expandedAccountIds.value.has(accountId)) {
    expandedAccountIds.value.delete(accountId);
  } else {
    expandedAccountIds.value.add(accountId);
  }
}

/**
 * 进入重命名模式，将旧名字（或默认显示标题）预填入草稿
 * @param account 账号对象
 */
function toggleEditing(account: NovelAIAccount): void {
  if (editingAccountId.value === account.id) {
    finishEditing(account);
    return;
  }
  editingAccountId.value = account.id;
  editingDraft.value = account.name || getAccountTitle(account);
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
 * 新增一组 NovelAI 账号，并自动展开该账号
 */
function addAccount(): void {
  const newAccount = createNovelAIAccount(uuidv4());
  accounts.value.push(newAccount);
  expandedAccountIds.value.add(newAccount.id);
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
 * 确认后删除 NovelAI 账号
 * @param index 账号序号
 */
async function confirmRemoveAccount(index: number): Promise<void> {
  const account = accounts.value[index];
  if (!account) return;
  const confirmed = await requestConfirmation(showConfirm, {
    title: '删除 NovelAI 账号',
    message: `确定要删除 NovelAI 账号“${getAccountTitle(account)}”吗？此操作不可撤销。`,
    acceptLabel: '确认删除',
    cancelLabel: '取消',
    severity: 'danger',
  });
  if (confirmed) removeAccount(index);
}

/**
 * 删除一组 NovelAI 账号
 * @param index 账号序号
 */
function removeAccount(index: number): void {
  const account = accounts.value[index];
  if (account) {
    expandedAccountIds.value.delete(account.id);
    if (editingAccountId.value === account.id) {
      editingAccountId.value = null;
    }
  }
  accounts.value.splice(index, 1);
}
</script>

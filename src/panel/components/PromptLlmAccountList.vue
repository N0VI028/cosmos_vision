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

        <div class="flex flex-col gap-(--cv-space-4xl) px-(--cv-space-2xl) py-(--cv-space-5xl)">
          <label class="cv-field">
            <span>使用酒馆代理预设</span>
            <ToggleSwitch
              :model-value="isProxyAccount(account)"
              @update:model-value="toggleProxyPreset(account, $event)"
            />
          </label>
          <label v-if="isProxyAccount(account)" class="cv-field">
            <span>代理预设</span>
            <Select
              v-model="account.proxyPreset"
              :options="proxyPresetOptions"
              option-label="name"
              option-value="name"
              placeholder="选择酒馆中已配置的代理预设"
              fluid
            />
          </label>
          <div v-else class="grid grid-cols-1 gap-(--cv-space-4xl) md:grid-cols-2">
            <label class="cv-field">
              <span>接口地址</span>
              <InputText v-model="account.apiUrl" placeholder="https://api.openai.com/v1" />
            </label>
            <label class="cv-field">
              <span>接口密钥</span>
              <Password v-model="account.apiKey" fluid :feedback="false" toggle-mask />
            </label>
          </div>

          <label class="cv-field">
            <span>来源标识</span>
            <Select
              v-model="account.source"
              :options="CHAT_COMPLETION_SOURCE_OPTIONS"
              option-label="label"
              option-value="value"
              placeholder="选择聊天补全来源"
              fluid
            />
          </label>

          <div class="cv-field">
            <span>模型名</span>
            <div class="flex items-center gap-(--cv-space-3xl)">
              <Select
                v-model="account.model"
                :options="getModelOptions(account)"
                placeholder="选择或输入模型"
                :loading="loadingModelAccountId === account.id"
                class="min-w-0 flex-1"
                editable
                fluid
              />
              <Button
                icon="fa-solid fa-rotate"
                severity="secondary"
                outlined
                rounded
                :loading="loadingModelAccountId === account.id"
                aria-label="刷新模型列表"
                @click="fetchModels(account)"
              />
            </div>
          </div>

          <template v-if="account.source === 'custom'">
            <label class="cv-field">
              <span>包含请求体参数</span>
              <div class="cv-field-control">
                <Textarea v-model="account.customIncludeBody" rows="3" class="w-full" />
                <div class="cv-field-hint">
                  YAML 格式，附加到请求 body 的字段（如 reasoning_effort: high），留空则不发送
                </div>
              </div>
            </label>

            <label class="cv-field">
              <span>排除请求体参数</span>
              <div class="cv-field-control">
                <Textarea v-model="account.customExcludeBody" rows="2" class="w-full" />
                <div class="cv-field-hint">YAML 格式，从请求 body 移除的字段名数组（如 - logit_bias），留空则不发送</div>
              </div>
            </label>

            <label class="cv-field">
              <span>包含请求头</span>
              <div class="cv-field-control">
                <Textarea v-model="account.customIncludeHeaders" rows="2" class="w-full" />
                <div class="cv-field-hint">YAML 格式，附加的 HTTP headers（如 X-Custom-Auth: token），留空则不发送</div>
              </div>
            </label>
          </template>
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

import { createPromptLlmAccount, getPromptLlmAccountDisplayName, type PromptLlmAccount } from '@/constants/prompt-llm';
import CollapsiblePanelItem from '@/panel/components/CollapsiblePanelItem.vue';
import CvMiniButton from '@/panel/components/CvMiniButton.vue';
import CvMiniToggleSwitch from '@/panel/components/CvMiniToggleSwitch.vue';
import {
  CHAT_COMPLETION_SOURCE_OPTIONS,
  findProxyPreset,
  getProxyPresets,
  type ProxyPresetOption,
} from '@/services/sillytavern/openai-config';
import { useSyncCacheStore } from '@/store/sync-cache';

const accounts = defineModel<PromptLlmAccount[]>({ required: true });
const showConfirm = inject<ShowConfirm>('showConfirm');
const syncCacheStore = useSyncCacheStore();

/** 酒馆代理预设下拉选项 */
const proxyPresetOptions = ref<ProxyPresetOption[]>(getProxyPresets());

/** 正在拉取模型列表的账号 id */
const loadingModelAccountId = ref<string>('');

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
function getAccountTitle(account: PromptLlmAccount): string {
  return getPromptLlmAccountDisplayName(account);
}

/**
 * 判断账号是否走酒馆代理预设
 * 旧数据缺少 proxyPreset 字段时按 falsy 处理为自定义接口
 * @param account 账号对象
 * @returns 是否使用代理预设
 */
function isProxyAccount(account: PromptLlmAccount): boolean {
  return Boolean(account.proxyPreset);
}

/**
 * 切换账号连接方式
 * 切到预设时默认选中第一个可用预设；切回自定义时清空预设名
 * @param account 账号对象
 * @param useProxy 是否使用酒馆代理预设
 */
function toggleProxyPreset(account: PromptLlmAccount, useProxy: boolean): void {
  account.proxyPreset = useProxy ? (proxyPresetOptions.value[0]?.name ?? '') : '';
}

/**
 * 读取账号的模型下拉选项
 * 合并已拉取列表与账号当前已选模型，避免已选模型从列表中消失导致显示空白
 * @param account 账号对象
 * @returns 模型选项列表
 */
function getModelOptions(account: PromptLlmAccount): string[] {
  const values = new Set(syncCacheStore.fetchedLlmModels);
  const selected = account.model.trim();
  if (selected) values.add(selected);
  return [...values];
}

/**
 * 按账号连接信息拉取可用模型列表
 * @param account 账号对象
 */
async function fetchModels(account: PromptLlmAccount): Promise<void> {
  const preset = findProxyPreset(account.proxyPreset);
  const apiUrl = (preset?.url ?? account.apiUrl).trim();
  const apiKey = (preset?.password ?? account.apiKey).trim();

  if (!apiUrl) {
    toastr.warning(preset ? '所选代理预设未配置地址' : '请先填写该账号的接口地址');
    return;
  }

  loadingModelAccountId.value = account.id;
  try {
    if (!TavernHelper || typeof TavernHelper.getModelList !== 'function') {
      throw new Error('未检测到兼容的酒馆助手模型拉取接口，请更新扩展');
    }
    const models = await TavernHelper.getModelList({ apiurl: apiUrl, key: apiKey });
    syncCacheStore.setLlmModels(models);
    toastr.success(`成功获取 ${syncCacheStore.fetchedLlmModels.length} 个模型`);
  } catch (error) {
    const message = error instanceof Error ? error.message : '获取模型列表失败';
    toastr.error(message);
    console.error('[PromptLlmAccountList]', error);
  } finally {
    loadingModelAccountId.value = '';
  }
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
function toggleEditing(account: PromptLlmAccount): void {
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
function finishEditing(account: PromptLlmAccount): void {
  if (editingAccountId.value !== account.id) return;
  account.name = editingDraft.value;
  editingAccountId.value = null;
  editingDraft.value = '';
}

/**
 * 新增一组 LLM 账号，并自动展开该账号
 */
function addAccount(): void {
  const newAccount = createPromptLlmAccount(uuidv4());
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
 * 确认后删除 LLM 账号
 * @param index 账号序号
 */
async function confirmRemoveAccount(index: number): Promise<void> {
  const account = accounts.value[index];
  if (!account) return;
  const confirmed = await requestConfirmation(showConfirm, {
    title: '删除 LLM 账号',
    message: `确定要删除 LLM 账号“${getAccountTitle(account)}”吗？此操作不可撤销。`,
    acceptLabel: '确认删除',
    cancelLabel: '取消',
    severity: 'danger',
  });
  if (confirmed) removeAccount(index);
}

/**
 * 删除一组 LLM 账号
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

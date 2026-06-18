import type { NovelAIAccount } from '@/constants/novelai';
import { fetchNovelAISubscription, type SubscriptionInfo } from '@/services/novelai/subscription';

/**
 * 订阅卡片状态封装
 * 仅在已应用配置 (savedAccount/savedCorsProxy) 变化时刷新;草稿编辑不触发请求,需点击"应用更改"后才拉取
 * @param savedAccount 已应用的订阅查询账号,变化时触发刷新并发起请求
 * @param savedCorsProxy 已应用的 CORS 代理,变化时触发刷新并发起请求
 * @param draftAccount 草稿订阅查询账号,驱动空态显示
 * @param draftCorsProxy 草稿 CORS 代理,驱动蒙版显示
 * @returns 订阅数据 / 加载态 / 错误态 / 拉取时间 / 手动刷新 / 空 key 判定 / 空代理判定
 */
export function useNovelAISubscription(
  savedAccount: Ref<NovelAIAccount | null>,
  savedCorsProxy: Ref<string>,
  draftAccount: Ref<NovelAIAccount | null>,
  draftCorsProxy: Ref<string>,
) {
  /** 订阅信息,失败时不清空以避免视觉抖动 */
  const data = ref<SubscriptionInfo | null>(null);
  /** 是否正在拉取 */
  const loading = ref(false);
  /** 最近一次错误消息;空字符串表示无错误 */
  const error = ref('');
  /** 最近一次成功拉取的时间戳 (ms),0 表示从未成功 */
  const fetchedAt = ref(0);

  /** 草稿 API Key 为空判定;trim 后判断,驱动空态显示 */
  const isKeyEmpty = computed(() => !draftAccount.value?.apiKey.trim());
  /** 草稿 CORS 代理为空判定;trim 后判断,驱动蒙版显示 */
  const isProxyEmpty = computed(() => !draftCorsProxy.value.trim());

  /** 拉取计数,旧请求结果晚到时丢弃,避免覆盖最新数据 */
  let pendingId = 0;

  /**
   * 强制重新拉取订阅信息 (基于已应用配置)
   * 进入即递增 pendingId 作废飞行中旧请求;已应用 key 或代理为空时同步停止 loading 并清空数据
   */
  async function refresh(): Promise<void> {
    const id = ++pendingId;
    if (!savedAccount.value?.apiKey.trim() || !savedCorsProxy.value.trim()) {
      loading.value = false;
      error.value = '';
      data.value = null;
      return;
    }
    loading.value = true;
    error.value = '';
    try {
      const result = await fetchNovelAISubscription(savedAccount.value, savedCorsProxy.value);
      if (id !== pendingId) return;
      data.value = result;
      fetchedAt.value = Date.now();
    } catch (err) {
      if (id !== pendingId) return;
      error.value = err instanceof Error ? err.message : '订阅信息拉取失败';
    } finally {
      if (id === pendingId) loading.value = false;
    }
  }

  /** 账号切换时立即清空旧数据，避免错误账号残留上一个账号的信息 */
  watch(savedAccount, (newAcc, oldAcc) => {
    if (newAcc?.id !== oldAcc?.id) {
      data.value = null;
      error.value = '';
    }
  });

  /** 已应用配置变化时刷新 (保存 / 放弃 / 重置后触发) */
  watch([savedAccount, savedCorsProxy], () => {
    void refresh();
  });

  /** 组件挂载时基于已应用配置拉取一次 */
  onMounted(() => {
    void refresh();
  });

  /** 组件卸载时作废未完成请求,避免回写到已销毁组件 */
  onBeforeUnmount(() => {
    pendingId++;
  });

  return { data, loading, error, fetchedAt, refresh, isKeyEmpty, isProxyEmpty };
}

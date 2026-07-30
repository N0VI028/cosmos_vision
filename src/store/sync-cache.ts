import { defineStore } from 'pinia';
import { ref } from 'vue';

/**
 * 同步数据缓存 Store
 * 在页面刷新前长久保存 LLM 模型列表与 ComfyUI LoRA 列表同步结果
 */
export const useSyncCacheStore = defineStore('cosmos_vision_sync_cache', () => {
  /** LLM 模型名称同步缓存 */
  const fetchedLlmModels = ref<string[]>([]);
  /** ComfyUI LoRA 名称同步缓存 */
  const fetchedComfyUiLoras = ref<string[]>([]);

  /**
   * 更新 LLM 模型同步列表
   * @param models 模型名称列表
   */
  function setLlmModels(models: string[]): void {
    fetchedLlmModels.value = [...models];
  }

  /**
   * 更新 ComfyUI LoRA 同步列表
   * @param loras LoRA 名称列表
   */
  function setComfyUiLoras(loras: string[]): void {
    fetchedComfyUiLoras.value = [...loras];
  }

  return {
    fetchedLlmModels,
    fetchedComfyUiLoras,
    setLlmModels,
    setComfyUiLoras,
  };
});

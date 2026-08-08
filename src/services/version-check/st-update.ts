import { getRequestHeaders } from '@sillytavern/script';
import { ref } from 'vue';

/** ST 扩展版本信息响应 */
export interface UpdateCheckResult {
  currentBranchName: string;
  currentCommitHash: string;
  isUpToDate: boolean;
  remoteUrl: string;
}

/** 检测到新版本的事实（会话内保持，设置页版本号箭头据此显示） */
export const updateDetected = ref(false);

/**
 * 调用 ST 原生扩展更新检查（基于 git 提交对比）
 * @returns 版本信息；检测失败时返回 null（静默处理）
 */
export async function checkExtensionUpdate(): Promise<UpdateCheckResult | null> {
  try {
    const response = await fetch('/api/extensions/version', {
      method: 'POST',
      headers: getRequestHeaders(),
      body: JSON.stringify({ extensionName: 'cosmos_vision', global: false }),
    });
    if (!response.ok) return null;
    return (await response.json()) as UpdateCheckResult;
  } catch {
    return null;
  }
}

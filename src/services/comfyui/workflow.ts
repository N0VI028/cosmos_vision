/**
 * ComfyUI 工作流请求兼容入口
 * 新代码优先从 parse / request / types 分模块导入
 */
export {
  getComfyUIWorkflowValidationError,
  normalizeComfyUIUrl,
  parseComfyUIWorkflow,
  serializeComfyUIWorkflow,
  isLinkRef,
  isWritableScalar,
} from '@/services/comfyui/parse';

export {
  buildComfyUIResolvedRequest,
  buildComfyUIResolvedRequestFromPrompts,
  getComfyUIRequestError,
} from '@/services/comfyui/request';

export type {
  ComfyUILoraSnapshot,
  ComfyUIRequestSnapshot,
  ComfyUIResolvedRequest,
  ComfyUIWorkflow,
} from '@/services/comfyui/types';

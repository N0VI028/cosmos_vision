/** 数据导入导出 section 标识 */
export const DATA_PORTABILITY_SECTION_IDS = [
  'basicSettings',
  'novelAISettings',
  'novelAISecrets',
  'comfyUISettings',
  'comfyUIBasicSettings',
  'comfyUIWorkflowPresets',
  'comfyUILoraPresets',
  'imagePromptPresets',
  'novelAIVibeBundle',
  'promptLlmSettings',
  'promptLlmMessagePresets',
  'promptProfiles',
  'inlineFavoritesBundle',
  'uiPreferences',
] as const;

export type DataPortabilitySectionId = (typeof DATA_PORTABILITY_SECTION_IDS)[number];

/** 数据导入导出 section 展示定义 */
export interface DataPortabilitySectionDefinition {
  id: DataPortabilitySectionId;
  label: string;
  description: string;
  defaultSelected: boolean;
  sensitive?: boolean;
  media?: boolean;
}

export const DATA_PORTABILITY_SECTIONS: DataPortabilitySectionDefinition[] = [
  { id: 'basicSettings', label: '基础偏好', description: '启用状态、图像来源、临时图片上限与常用短语', defaultSelected: true },
  { id: 'novelAISettings', label: 'NovelAI 配置', description: '模型、尺寸、采样与路由设置', defaultSelected: true },
  { id: 'novelAISecrets', label: 'NovelAI 密钥', description: '账号 API Key 与跨域代理', defaultSelected: true, sensitive: true },
  { id: 'comfyUIBasicSettings', label: 'ComfyUI 基础配置', description: 'URL、超时与生图提示词预设引用', defaultSelected: true },
  { id: 'comfyUIWorkflowPresets', label: 'ComfyUI 工作流', description: '工作流预设与收藏节点', defaultSelected: true },
  { id: 'comfyUILoraPresets', label: 'ComfyUI LoRA 预设', description: 'LoRA 预设与权重配置', defaultSelected: true },
  { id: 'imagePromptPresets', label: '固定提示词预设', description: '正面/负面生图固定提示词', defaultSelected: true },
  { id: 'novelAIVibeBundle', label: 'NovelAI Vibe', description: 'Vibe 引用、缓存与缩略图', defaultSelected: true, media: true },
  { id: 'promptLlmSettings', label: 'LLM 配置', description: '来源、模型参数、API Key 与提取规则', defaultSelected: true, sensitive: true },
  { id: 'promptLlmMessagePresets', label: 'LLM 生成TAG预设', description: '用于生成图片TAG的预设', defaultSelected: true },
  { id: 'promptProfiles', label: '人物资料', description: '用户/角色资料与触发词', defaultSelected: true },
  { id: 'inlineFavoritesBundle', label: '收藏图片', description: '收藏记录、提示词与图片', defaultSelected: true, media: true },
  { id: 'uiPreferences', label: '界面偏好', description: '暗色模式等本地 UI 偏好', defaultSelected: true },
];

/**
 * 读取默认选中的 section
 * @returns 默认 section id 列表
 */
export function getDefaultSelectedSections(): DataPortabilitySectionId[] {
  return DATA_PORTABILITY_SECTIONS.filter(section => section.defaultSelected).map(section => section.id);
}

/**
 * 判断输入是否为合法 section id
 * @param value 待判断值
 * @returns 是否合法
 */
export function isDataPortabilitySectionId(value: unknown): value is DataPortabilitySectionId {
  return typeof value === 'string' && DATA_PORTABILITY_SECTION_IDS.includes(value as DataPortabilitySectionId);
}

/** 旧版 section 标签，仅用于导入旧文件时展示人类可读名称 */
export const DATA_PORTABILITY_LEGACY_SECTION_LABELS: Partial<Record<DataPortabilitySectionId, string>> = {
  comfyUISettings: 'ComfyUI 配置（旧版）',
};

import { DEFAULT_COMFYUI_TUTORIAL_NODE_IDS } from '@/constants/comfyui';

export type TutorialSource = 'novelai' | 'comfyui';

export type TutorialSettingsScene =
  | { kind: 'settings'; tab: 'main'; subTab: 'general' }
  | { kind: 'settings'; tab: 'novelai'; subTab: 'api' | 'config' }
  | { kind: 'settings'; tab: 'comfyui'; subTab: 'api' | 'config' }
  | { kind: 'settings'; tab: 'prompt-llm'; subTab: 'settings' | 'builder' }
  | { kind: 'settings'; tab: 'prompt-profiles'; subTab: 'character' | 'user' };

export type TutorialScene = { kind: 'selection' } | { kind: 'chat' } | TutorialSettingsScene;

export interface TutorialTarget {
  selectors: readonly string[];
  missingText: string;
}

export interface TutorialStep {
  id: string;
  title: string;
  description: string;
  tip?: string;
  scene: TutorialScene;
  target?: TutorialTarget;
  /** 是否需要注入模拟画廊（用角色头像占位） */
  needsMockGallery?: boolean;
  /** 是否需要注入模拟选区（段落选中效果 + 生图按钮） */
  needsMockSelection?: boolean;
  /** 是否需要注入模拟人物（用于演示角色配置） */
  needsMockPerson?: boolean;
  /** 是否需要注入模拟条目编辑弹窗（用于演示角色配置条目编辑） */
  needsMockEntryEditor?: boolean;
  /** ComfyUI 默认工作流演示时自动选中的节点 ID */
  comfyuiDemoNodeId?: string;
}

export const TUTORIAL_SOURCE_OPTIONS = [
  { value: 'novelai', label: 'NovelAI', icon: 'fa-solid fa-pen-nib' },
  { value: 'comfyui', label: 'ComfyUI', icon: 'fa-solid fa-diagram-project' },
] as const satisfies ReadonlyArray<{ value: TutorialSource; label: string; icon: string }>;

export const TUTORIAL_SELECTION_STEP: TutorialStep = {
  id: 'source-selection',
  title: '选择图像来源',
  description: '请选择你准备使用的生图后端。这个选择只决定教程路线，不会修改当前设置。',
  scene: { kind: 'selection' },
};

const IMAGE_SOURCE_STEP: TutorialStep = {
  id: 'image-source',
  title: '确认图像来源',
  description: '图像来源决定实际使用的生图服务。教程只指出这个字段，不会替你切换。',
  scene: { kind: 'settings', tab: 'main', subTab: 'general' },
  target: {
    selectors: ['[data-cv-tutorial="image-source"]'],
    missingText: '当前页面未找到图像来源字段，你仍可继续教程。',
  },
};

const NOVELAI_STEPS: readonly TutorialStep[] = [
  {
    id: 'novelai-connection',
    title: '连接 NovelAI',
    description: '在这里选择路由模式、维护账号，如果需要查看剩余点数，需要配置可信的 CORS 代理，留空并不会影响生图功能。',
    scene: { kind: 'settings', tab: 'novelai', subTab: 'api' },
    target: {
      selectors: ['[data-cv-tutorial="novelai-connection"]'],
      missingText: 'NovelAI 连接区域暂不可见，你仍可继续教程。',
    },
  },
  {
    id: 'novelai-image-config',
    title: '配置图片参数',
    description: '选择模型、尺寸与采样参数；这些值会影响画面质量、构图和点数消耗。',
    scene: { kind: 'settings', tab: 'novelai', subTab: 'config' },
    target: {
      selectors: ['[data-cv-tutorial="novelai-image-config"]'],
      missingText: 'NovelAI 图片配置区域暂不可见，你仍可继续教程。',
    },
  },
];

const COMFYUI_STEPS: readonly TutorialStep[] = [
  {
    id: 'comfyui-connection',
    title: '连接 ComfyUI',
    description:
      '填写 ComfyUI 服务地址并测试连接，需要确保 Comfyui 监听端口并且启用 CORS 头，设置为 * 允许所有域，或填写具体域名。',
    scene: { kind: 'settings', tab: 'comfyui', subTab: 'api' },
    target: {
      selectors: ['[data-cv-tutorial="comfyui-connection"]'],
      missingText: 'ComfyUI 连接区域暂不可见，你仍可继续教程。',
    },
  },
  {
    id: 'comfyui-workflow',
    title: '准备工作流',
    description: '导入 API 格式工作流或选择预设，插件已经准备了默认工作流。',
    scene: { kind: 'settings', tab: 'comfyui', subTab: 'config' },
    target: {
      selectors: ['[data-cv-tutorial="comfyui-workflow"]'],
      missingText: 'ComfyUI 工作流区域暂不可见，你仍可继续教程。',
    },
  },
  {
    id: 'comfyui-output-binding',
    title: '绑定图像输出节点',
    description:
      '为了将最终图像展示到酒馆，你需要选择一个节点绑定到图像输出。默认预设已经绑定了节点，你无需修改；全工作流只能绑定一个。',
    tip: '如果不连接 ComfyUI，将不会显示绑定按钮。请先在连接设置中测试并成功连接服务。',
    scene: { kind: 'settings', tab: 'comfyui', subTab: 'config' },
    target: {
      selectors: [
        '[data-cv-tutorial="comfyui-output-binding"]',
        '[data-cv-tutorial="comfyui-output-node"]',
        '[data-cv-tutorial="comfyui-result-binding"]',
      ],
      missingText: '绑定控件需要节点定义；若未成功连接 ComfyUI，将不会显示绑定按钮。',
    },
    comfyuiDemoNodeId: DEFAULT_COMFYUI_TUTORIAL_NODE_IDS.output,
  },
  {
    id: 'comfyui-positive-binding',
    title: '绑定正向提示词',
    description: 'LLM 生成的正向 Prompt 需要绑定到工作流的正向提示词节点。默认预设已经绑定了节点，你无需修改。',
    tip: '如果不连接 ComfyUI，将不会显示绑定按钮。请先在连接设置中测试并成功连接服务。',
    scene: { kind: 'settings', tab: 'comfyui', subTab: 'config' },
    target: {
      selectors: [
        '[data-cv-tutorial="comfyui-positive-binding"]',
        '[data-cv-tutorial="comfyui-positive-node"]',
        '[data-cv-tutorial="comfyui-result-binding"]',
      ],
      missingText: '绑定控件需要节点定义；若未成功连接 ComfyUI，将不会显示绑定按钮。',
    },
    comfyuiDemoNodeId: DEFAULT_COMFYUI_TUTORIAL_NODE_IDS.positive,
  },
  {
    id: 'comfyui-negative-binding',
    title: '绑定负向提示词',
    description: 'LLM 生成的负向 Prompt 需要绑定到工作流的负向提示词节点。默认预设已经绑定了节点，你无需修改。',
    tip: '如果不连接 ComfyUI，将不会显示绑定按钮。请先在连接设置中测试并成功连接服务。',
    scene: { kind: 'settings', tab: 'comfyui', subTab: 'config' },
    target: {
      selectors: [
        '[data-cv-tutorial="comfyui-negative-binding"]',
        '[data-cv-tutorial="comfyui-negative-node"]',
        '[data-cv-tutorial="comfyui-result-binding"]',
      ],
      missingText: '绑定控件需要节点定义；若未成功连接 ComfyUI，将不会显示绑定按钮。',
    },
    comfyuiDemoNodeId: DEFAULT_COMFYUI_TUTORIAL_NODE_IDS.negative,
  },
  {
    id: 'comfyui-lora-binding',
    title: '配置 LoRA 组节点',
    description: '插件已经兼容 ComfyUI-Lora-Manager 的 Lora 组节点用于设置 Lora 组。',
    tip: '若提示节点丢失，需要先在 ComfyUI 中下载并安装 [ComfyUI-Lora-Manager](https://github.com/willmiao/ComfyUI-Lora-Manager) 自定义节点插件。',
    scene: { kind: 'settings', tab: 'comfyui', subTab: 'config' },
    target: {
      selectors: [
        '[data-cv-tutorial="comfyui-lora-binding"]',
        '[data-cv-tutorial="comfyui-lora-node"]',
        '[data-cv-tutorial="comfyui-result-binding"]',
      ],
      missingText: '绑定控件需要节点定义；若未成功连接 ComfyUI，将不会显示绑定按钮。',
    },
    comfyuiDemoNodeId: DEFAULT_COMFYUI_TUTORIAL_NODE_IDS.lora,
  },
];

const SHARED_STEPS: readonly TutorialStep[] = [
  {
    id: 'prompt-llm-connection',
    title: '配置提示词 LLM',
    description: '选择酒馆代理预设或自定义url，再选择用于生成图片提示词的模型，推荐使用速度较快的模型。',
    scene: { kind: 'settings', tab: 'prompt-llm', subTab: 'settings' },
    target: {
      selectors: ['[data-cv-tutorial="prompt-llm-connection"]'],
      missingText: 'LLM 连接区域暂不可见，你仍可继续教程。',
    },
  },
  {
    id: 'prompt-llm-builder-preset',
    title: '提示词生成预设',
    description:
      '此处可以管理 LLM 生成生图提示词的消息预设。插件内置了默认预设，你也可以在此自定义 Prompt 结构、导入导出或管理模板。',
    scene: { kind: 'settings', tab: 'prompt-llm', subTab: 'builder' },
    target: {
      selectors: ['[data-cv-tutorial="prompt-llm-builder-preset"]'],
      missingText: '提示词预设区域暂不可见，你仍可继续教程。',
    },
  },
  {
    id: 'prompt-profiles-overview',
    title: '角色配置概述',
    description:
      '插件仅拾取最近几条聊天记录生成提示词，无法捕捉角色的完整特质。建议在此处为当前角色卡和用户各创建一个人物，发送角色信息给 LLM。',
    scene: { kind: 'settings', tab: 'prompt-profiles', subTab: 'character' },
    target: {
      selectors: ['[data-cv-tutorial="prompt-profiles-overview"]'],
      missingText: '人物配置区域暂不可见，你仍可继续教程。',
    },
    needsMockPerson: true,
  },
  {
    id: 'prompt-profiles-static-tags',
    title: '固定 tag 配置',
    description:
      '固定 tag 描述角色长期不变的特征，会被原样保留在最终提示词中。可填入 girl、blue eyes 等标签；你也可以用“从资料解析”按钮自动生成。',
    scene: { kind: 'settings', tab: 'prompt-profiles', subTab: 'character' },
    target: {
      selectors: ['[data-cv-tutorial="prompt-profiles-static-tags"]'],
      missingText: '固定 tag 区域暂不可见，你仍可继续教程。',
    },
    needsMockPerson: true,
  },
  {
    id: 'prompt-profiles-template-entries',
    title: '人物模板条目',
    description:
      '条目编辑器中可切换来源类型：自定义、角色描述、用户人设、世界书。建议选择“角色描述”直接插入该角色卡的完整描述，让 LLM 自动总结角色特性。',
    scene: { kind: 'settings', tab: 'prompt-profiles', subTab: 'character' },
    target: {
      selectors: [
        '[data-cv-tutorial="prompt-profiles-entry-editor"]',
        '[data-cv-tutorial="prompt-profiles-template-entries"]',
      ],
      missingText: '条目编辑器暂不可见，改为提示模板条目区域。',
    },
    needsMockPerson: true,
    needsMockEntryEditor: true,
  },
  {
    id: 'apply-settings',
    title: '应用设置',
    description: '完成配置后点击“应用更改”保存。教程不会代替你保存，也不会改动草稿。',
    scene: { kind: 'settings', tab: 'main', subTab: 'general' },
    target: {
      selectors: ['[data-cv-tutorial="apply-settings"]'],
      missingText: '应用按钮暂不可见，你仍可继续教程。',
    },
  },
  {
    id: 'inline-generate-fab',
    title: '进入段落生图模式',
    description: '回到聊天后，点击悬浮球进入段落选择模式。',
    scene: { kind: 'chat' },
    target: {
      selectors: ['[data-cv-tutorial="inline-generate-fab"]', '#chat'],
      missingText: '悬浮球未显示，通常是插件尚未启用；当前改为提示聊天区域。',
    },
  },
  {
    id: 'inline-paragraph',
    title: '选择聊天段落',
    description: '进入选择模式后点击目标段落；可继续点击相邻段落扩展范围。',
    scene: { kind: 'chat' },
    target: {
      selectors: ['.mes_text p', '#chat'],
      missingText: '当前没有可见聊天段落；有消息内容后即可选择。',
    },
  },
  {
    id: 'inline-action',
    title: '提交生图任务',
    description: '选中段落后会出现“生成图片”操作条，随后可填写本次临时追加要求并确认生成。',
    scene: { kind: 'chat' },
    target: {
      selectors: ['.cv-inline-toolbar', '.mes_text p', '#chat'],
      missingText: '操作条只在选中段落后出现；当前改为提示段落或聊天区域。',
    },
    needsMockSelection: true,
  },
  {
    id: 'inline-gallery',
    title: '管理生成结果',
    description: '图像生成结果会显示在段落下方，你可以在这里查看、重新生成、编辑提示词或下载图片。',
    tip: '生成的临时结果会在更换浏览器时丢失。喜欢的图片请务必点击右下角的“★”图标收藏到本地。',
    scene: { kind: 'chat' },
    target: {
      selectors: ['.cv-render', '.mes_text p', '#chat'],
      missingText: '当前没有图片结果；生成完成后它会出现在目标段落下方。',
    },
    needsMockGallery: true,
  },
];

/**
 * 按图像来源构建完整教程步骤
 * @param source 用户选择的图像来源
 * @returns 完整教程步骤序列：选择来源 → 图像源配置 → LLM配置 → 角色配置 → 应用设置 → 聊天操作
 */
export function buildTutorialSteps(source: TutorialSource): TutorialStep[] {
  const sourceSteps = source === 'novelai' ? NOVELAI_STEPS : COMFYUI_STEPS;
  return [TUTORIAL_SELECTION_STEP, IMAGE_SOURCE_STEP, ...sourceSteps, ...SHARED_STEPS];
}

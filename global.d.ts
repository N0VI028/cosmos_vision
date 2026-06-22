import type { TavernHelperGenerateRawConfig } from '@/services/tavern-helper/prompt-llm';

// 全局类型声明扩展(按需补充 SillyTavern 注入的全局对象/常量)

declare global {
  interface TavernPersonaConnection {
    type: 'character' | 'group';
    id: string;
  }

  interface TavernPersona {
    avatar_id: string;
    avatar: `${string}.png` | Blob;
    name: string;
    title: string;
    description: string;
    position: number;
    depth: number;
    role: number;
    lorebook: string;
    connections: TavernPersonaConnection[];
    is_default: boolean;
  }

  interface TavernHelperCharacterWorldbooks {
    primary: string | null;
    additional: string[];
  }

  interface TavernHelperCharacterBookEntry {
    keys: string[];
    secondary_keys?: string[];
    comment: string;
    content: string;
    constant: boolean;
    selective: boolean;
    insertion_order: number;
    enabled: boolean;
    position: string;
    extensions: unknown;
    id: number;
  }

  interface TavernHelperCharacterBook {
    name: string;
    entries: TavernHelperCharacterBookEntry[];
  }

  interface TavernHelperWorldbookEntry {
    uid: number;
    name: string;
    enabled: boolean;
    content: string;
  }

  /**
   * JS-Slash-Runner 注入的全局入口
   * 提供 generateRaw 等方法用于调用 LLM
   */
  const TavernHelper:
    | {
        /**
         * 调用 LLM 生成文本,使用对象式 generateRaw 配置
         * @param config generateRaw 请求配置
         * @returns LLM 返回的字符串
         */
        generateRaw(config: TavernHelperGenerateRawConfig): Promise<string>;
        /**
         * 替换文本中的 ST 宏
         * @param text 原始文本
         * @returns 宏替换后的文本
         */
        substitudeMacros(text: string): string;
        /**
         * 按生成请求 ID 停止指定 generate/generateRaw 请求
         * @param generationId 生成请求 ID
         * @returns 是否成功停止
         */
        stopGenerationById(generationId: string): boolean;
        /**
         * 获取角色卡名称列表
         * @returns 角色卡名称列表
         */
        getCharacterNames(): string[];
        /**
         * 获取当前角色卡名称
         * @returns 当前角色卡名称
         */
        getCurrentCharacterName(): string | null;
        /**
         * 获取 persona 名称列表
         * @returns persona 名称列表
         */
        getPersonaNames(): string[];
        /**
         * 获取 persona 头像 id 列表
         * @returns persona 头像 id 列表
         */
        getPersonaIds(): string[];
        /**
         * 获取当前 persona 名称
         * @returns 当前 persona 名称
         */
        getCurrentPersonaName(): string | null;
        /**
         * 获取当前 persona 头像 id
         * @returns 当前 persona 头像 id
         */
        getCurrentPersonaId(): string | null;
        /**
         * 获取 persona 头像路径
         * @param personaId persona 名称、头像 id 或 current
         * @returns persona 头像路径
         */
        getPersonaAvatarPath(personaId?: 'current' | string): string | null;
        /**
         * 获取 persona 内容
         * @param personaId persona 名称、头像 id 或 current
         * @returns persona 内容
         */
        getPersona(personaId: 'current' | string): TavernPersona;
        /**
         * 获取角色卡原始数据
         * @param name 角色卡名称
         * @returns 角色卡数据
         */
        getCharData(name: 'current' | string): Record<string, unknown> | null;
        /**
         * 获取角色卡内容
         * @param name 角色卡名称
         * @returns 角色卡对象
         */
        getCharacter(name: 'current' | string): Promise<{
          description?: string;
          worldbook?: string | null;
        }>;
        /**
         * 获取全部世界书名称列表
         * @returns 世界书名称列表
         */
        getWorldbookNames(): string[];
        /**
         * 获取角色卡绑定的世界书
         * @param name 角色卡名称
         * @returns 角色卡世界书绑定
         */
        getCharWorldbookNames(name: 'current' | string): TavernHelperCharacterWorldbooks;
        /**
         * 获取世界书条目
         * @param worldbookName 世界书名称
         * @returns 世界书条目列表
         */
        getWorldbook(worldbookName: string): Promise<TavernHelperWorldbookEntry[]>;
      }
    | undefined;

  /**
   * ST 自带 `public/lib/jszip.min.js` 暴露的全局 JSZip
   * 通过 `import '@sillytavern/lib/jszip.min'` 触发加载后可用
   */
  const JSZip: {
    loadAsync(data: Blob | ArrayBuffer | Uint8Array): Promise<{
      files: Record<string, JSZipObject>;
    }>;
  };

  interface JSZipObject {
    name: string;
    dir: boolean;
    async(type: 'blob'): Promise<Blob>;
    async(type: 'uint8array'): Promise<Uint8Array>;
    async(type: 'arraybuffer'): Promise<ArrayBuffer>;
    async(type: 'string'): Promise<string>;
  }
}

export {};

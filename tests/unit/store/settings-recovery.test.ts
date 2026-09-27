import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { extension_settings } from '@sillytavern/scripts/extensions';
import {
  DEFAULT_COMFYUI_LORA_PRESET_ID,
  DEFAULT_COMFYUI_WORKFLOW_JSON,
  DEFAULT_COMFYUI_WORKFLOW_PRESET_ID,
  DEFAULT_COMFYUI_WORKFLOW_PRESET_ID_K2_ANIMA,
  DEFAULT_COMFYUI_WORKFLOW_PRESET_NAME,
  COMFYUI_DEFAULT_TIMEOUT,
} from '@/constants/comfyui';
import {
  DEFAULT_PROMPT_LLM_COMFYUI_ANIMA_RULES_MESSAGE_ID,
  DEFAULT_PROMPT_LLM_COMFYUI_KREA_RULES_MESSAGE_ID,
  DEFAULT_PROMPT_LLM_PRESET_ID,
  DEFAULT_PROMPT_LLM_START_MESSAGE_ID,
  DEFAULT_PROMPT_LLM_SYSTEM_MESSAGE_ID,
} from '@/constants/default-prompt-llm-preset';
import { DEFAULT_POSITIVE_PROMPT_PRESET_ID } from '@/constants/default-settings';
import { DEFAULT_NOVELAI_VIBE_PRESET_ID } from '@/constants/novelai-vibe';
import { useSettingsStore } from '@/store/settings';

const extensionSettings = extension_settings as Record<string, unknown>;

describe('settings store recovery and state management', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    Object.keys(extensionSettings).forEach(key => delete extensionSettings[key]);
    (window as any).extension_settings = {};
  });

  it('initializes default settings and updates dark mode', () => {
    const store = useSettingsStore();
    expect(store.settings.imageSource).toBe('novelai');
    expect(store.settings.randomPresetPools).toEqual({ enabled: false, pools: [] });
    expect(store.isDirty).toBe(false);

    store.settings.imageSource = 'comfyui';
    expect(store.isDirty).toBe(true);

    store.applySettings();
    expect(store.savedSettings.imageSource).toBe('comfyui');
    expect(store.isDirty).toBe(false);
  });

  it('resets to defaults cleanly', () => {
    const store = useSettingsStore();
    store.settings.imageSource = 'comfyui';
    store.applySettings();

    store.resetToDefaults();
    expect(store.settings.imageSource).toBe('novelai');
    expect(store.savedSettings.imageSource).toBe('novelai');
  });

  it('handles imported settings application', () => {
    const store = useSettingsStore();
    const imported = {
      imageSource: 'comfyui',
      comfyui: { url: 'http://127.0.0.1:8188' },
    };

    store.applyImportedSettings(imported);
    expect(store.settings.imageSource).toBe('comfyui');
    expect(store.settings.comfyui.url).toBe('http://127.0.0.1:8188');
  });

  it('migrates legacy single-account prompt llm settings on load', () => {
    extensionSettings.cosmos_vision = {
      promptLlm: {
        proxyPreset: 'my-proxy',
        apiUrl: 'https://api.example.com/v1',
        apiKey: 'sk-legacy-key',
        model: 'gpt-4o',
        source: 'deepseek',
        timeout: 90,
        temperature: 0.5,
        shouldStream: true,
        customIncludeBody: 'reasoning_effort: high',
      },
    };

    const store = useSettingsStore();
    const promptLlm = store.settings.promptLlm;

    expect(promptLlm.accounts).toHaveLength(1);
    expect(promptLlm.accounts[0].proxyPreset).toBe('my-proxy');
    expect(promptLlm.accounts[0].apiUrl).toBe('https://api.example.com/v1');
    expect(promptLlm.accounts[0].apiKey).toBe('sk-legacy-key');
    expect(promptLlm.accounts[0].model).toBe('gpt-4o');
    expect(promptLlm.accounts[0].source).toBe('deepseek');
    expect(promptLlm.accounts[0].customIncludeBody).toBe('reasoning_effort: high');
    expect(promptLlm.timeout).toBe(90);
    expect(promptLlm.accounts[0].temperature).toBe(0.5);
    expect(promptLlm.accounts[0].shouldStream).toBe(true);
  });

  it('recovers random preset pools with enabled defaulting to false when legacy data lacks it', () => {
    extensionSettings.cosmos_vision = {
      randomPresetPools: { pools: [{ id: 'pool-1', name: '旧池', side: 'positive', enabled: true, triggerMode: 'always', triggerModels: [], triggerWorkflowIds: [], presetIds: ['a'] }] },
    };

    const store = useSettingsStore();
    expect(store.settings.randomPresetPools.enabled).toBe(false);
    expect(store.settings.randomPresetPools.pools).toHaveLength(1);
  });

  it('keeps fresh default account when no legacy connection fields exist', () => {
    extensionSettings.cosmos_vision = {
      promptLlm: { temperature: 0.9 },
    };

    const store = useSettingsStore();
    const promptLlm = store.settings.promptLlm;

    expect(promptLlm.accounts).toHaveLength(1);
    expect(promptLlm.accounts[0].id).toBe('prompt-llm-account-1');
    expect(promptLlm.accounts[0].apiUrl).toBe('');
    expect(promptLlm.accounts[0].temperature).toBe(0.9);
  });

  it('does not backfill the k2-anima workflow preset for legacy settings', () => {
    extensionSettings.cosmos_vision = {
      comfyui: {
        workflowPresets: {
          activePresetId: DEFAULT_COMFYUI_WORKFLOW_PRESET_ID,
          presets: [
            {
              id: DEFAULT_COMFYUI_WORKFLOW_PRESET_ID,
              name: DEFAULT_COMFYUI_WORKFLOW_PRESET_NAME,
              workflowJson: DEFAULT_COMFYUI_WORKFLOW_JSON,
              favoriteNodeIds: [],
            },
          ],
        },
      },
    };

    const store = useSettingsStore();
    const workflowPresets = store.settings.comfyui.workflowPresets;

    expect(workflowPresets.presets.map(preset => preset.id)).toEqual([DEFAULT_COMFYUI_WORKFLOW_PRESET_ID]);
    expect(workflowPresets.activePresetId).toBe(DEFAULT_COMFYUI_WORKFLOW_PRESET_ID);
  });

  it('does not revive deleted default workflow presets on reload', () => {
    extensionSettings.cosmos_vision = {
      comfyui: {
        workflowPresets: {
          activePresetId: 'my-workflow',
          presets: [{ id: 'my-workflow', name: '我的工作流', workflowJson: '{"1":{}}', favoriteNodeIds: [] }],
        },
      },
    };

    const firstLoad = useSettingsStore();
    expect(firstLoad.settings.comfyui.workflowPresets.presets.map(preset => preset.id)).toEqual(['my-workflow']);

    setActivePinia(createPinia());
    const secondLoad = useSettingsStore();
    const presetIds = secondLoad.settings.comfyui.workflowPresets.presets.map(preset => preset.id);

    expect(presetIds).toEqual(['my-workflow']);
    expect(presetIds).not.toContain(DEFAULT_COMFYUI_WORKFLOW_PRESET_ID);
    expect(presetIds).not.toContain(DEFAULT_COMFYUI_WORKFLOW_PRESET_ID_K2_ANIMA);
  });

  it('leaves rebuilt workflow preset lists untouched', () => {
    extensionSettings.cosmos_vision = {
      comfyui: {
        workflowPresets: {
          activePresetId: 'my-workflow',
          presets: [{ id: 'my-workflow', name: '我的工作流', workflowJson: '{"1":{}}', favoriteNodeIds: [] }],
        },
      },
    };

    const store = useSettingsStore();
    const workflowPresets = store.settings.comfyui.workflowPresets;

    expect(workflowPresets.presets.map(preset => preset.id)).toEqual(['my-workflow']);
    expect(workflowPresets.activePresetId).toBe('my-workflow');
  });

  it('does not revive deleted default LLM messages on reload', () => {
    extensionSettings.cosmos_vision = {
      promptLlmMessagePresets: {
        activePresetId: DEFAULT_PROMPT_LLM_PRESET_ID,
        presets: [
          {
            id: DEFAULT_PROMPT_LLM_PRESET_ID,
            name: '默认预设',
            // 用户已删除中间大部分默认条目，仅剩首尾两条
            messages: [
              { id: DEFAULT_PROMPT_LLM_START_MESSAGE_ID, title: '启动', role: 'system', content: 'a' },
              { id: DEFAULT_PROMPT_LLM_SYSTEM_MESSAGE_ID, title: '系统提示词', role: 'system', content: 'b' },
            ],
          },
        ],
      },
    };

    const firstLoad = useSettingsStore();
    const messageIds = firstLoad.settings.promptLlmMessagePresets.presets[0].messages.map(message => message.id);

    expect(messageIds).toEqual([DEFAULT_PROMPT_LLM_START_MESSAGE_ID, DEFAULT_PROMPT_LLM_SYSTEM_MESSAGE_ID]);
    expect(messageIds).not.toContain(DEFAULT_PROMPT_LLM_COMFYUI_KREA_RULES_MESSAGE_ID);
    expect(messageIds).not.toContain(DEFAULT_PROMPT_LLM_COMFYUI_ANIMA_RULES_MESSAGE_ID);
  });

  it('does not revive deleted default vibe presets on reload', () => {
    extensionSettings.cosmos_vision = {
      novelai: {
        novelAIVibePresets: {
          activePresetId: 'my-vibe',
          presets: [{ id: 'my-vibe', name: '我的 Vibe 预设' }],
        },
      },
    };

    const store = useSettingsStore();
    const vibePresetIds = store.settings.novelai.novelAIVibePresets.presets.map(preset => preset.id);

    expect(vibePresetIds).toEqual(['my-vibe']);
    expect(vibePresetIds).not.toContain(DEFAULT_NOVELAI_VIBE_PRESET_ID);
  });

  it('does not revive deleted default image prompt presets on reload', () => {
    extensionSettings.cosmos_vision = {
      imagePromptPresets: {
        positive: [{ id: 'my-positive', name: '我的正向', text: 'hello' }],
        negative: [{ id: 'my-negative', name: '我的负向', text: 'world' }],
      },
    };

    const store = useSettingsStore();
    const { positive, negative } = store.settings.imagePromptPresets;

    expect(positive.map(preset => preset.id)).toEqual(['my-positive']);
    expect(negative.map(preset => preset.id)).toEqual(['my-negative']);
    expect(positive.map(preset => preset.id)).not.toContain(DEFAULT_POSITIVE_PROMPT_PRESET_ID);
  });

  it('does not revive deleted default lora presets on reload', () => {
    extensionSettings.cosmos_vision = {
      comfyui: {
        loraPresets: {
          activePresetId: 'my-lora',
          presets: [{ id: 'my-lora', name: '我的 LoRA 组' }],
        },
      },
    };

    const store = useSettingsStore();
    const loraPresetIds = store.settings.comfyui.loraPresets.presets.map(preset => preset.id);

    expect(loraPresetIds).toEqual(['my-lora']);
    expect(loraPresetIds).not.toContain(DEFAULT_COMFYUI_LORA_PRESET_ID);
  });

  it('fills missing prompt llm account fields via schema defaults without losing keys', () => {
    extensionSettings.cosmos_vision = {
      promptLlm: {
        // 模拟后版本新增字段（topK/shouldStream 等）尚未写入的旧账号
        accounts: [{ id: 'acc-1', name: '我的账号', apiUrl: 'https://api.example.com/v1', apiKey: 'sk-my-key', source: 'deepseek', model: 'deepseek-chat' }],
      },
    };

    const store = useSettingsStore();
    const account = store.settings.promptLlm.accounts[0];

    expect(account.apiKey).toBe('sk-my-key');
    expect(account.topK).toBe(0);
    expect(account.topP).toBe(1.0);
    expect(account.shouldStream).toBe(false);
    expect(account.temperature).toBe(0.7);
    expect(account.enabled).toBe(true);
  });

  it('fills missing novelai account connection fields via schema defaults', () => {
    extensionSettings.cosmos_vision = {
      novelai: {
        // 模拟缺 url/apiKey 键的旧数据/导入数据
        accounts: [{ id: 'nai-1', name: '我的账号', enabled: false }],
      },
    };

    const store = useSettingsStore();
    const account = store.settings.novelai.accounts[0];

    expect(account.url).toBe('');
    expect(account.apiKey).toBe('');
    expect(account.name).toBe('我的账号');
    expect(account.enabled).toBe(false);
  });

  it('does not revive deleted default novelai and prompt llm accounts on reload', () => {
    extensionSettings.cosmos_vision = {
      novelai: { accounts: [] },
      promptLlm: { accounts: [] },
    };

    const store = useSettingsStore();

    expect(store.settings.novelai.accounts).toEqual([]);
    expect(store.settings.promptLlm.accounts).toEqual([]);
  });

  it('keeps user scalars while filling missing nested defaults', () => {
    extensionSettings.cosmos_vision = {
      comfyui: { url: 'http://192.168.1.5:8188' },
    };

    const store = useSettingsStore();
    const comfyui = store.settings.comfyui;

    expect(comfyui.url).toBe('http://192.168.1.5:8188');
    expect(comfyui.timeout).toBe(COMFYUI_DEFAULT_TIMEOUT);
    expect(comfyui.workflowPresets.presets.length).toBeGreaterThan(0);
  });
});

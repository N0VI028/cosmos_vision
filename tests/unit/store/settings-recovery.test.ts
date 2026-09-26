import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { extension_settings } from '@sillytavern/scripts/extensions';
import {
  DEFAULT_COMFYUI_WORKFLOW_JSON,
  DEFAULT_COMFYUI_WORKFLOW_K2_ANIMA_JSON,
  DEFAULT_COMFYUI_WORKFLOW_PRESET_ID,
  DEFAULT_COMFYUI_WORKFLOW_PRESET_ID_K2_ANIMA,
  DEFAULT_COMFYUI_WORKFLOW_PRESET_NAME,
} from '@/constants/comfyui';
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

  it('backfills the k2-anima workflow preset for legacy settings', () => {
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

    expect(workflowPresets.presets.map(preset => preset.id)).toEqual([
      DEFAULT_COMFYUI_WORKFLOW_PRESET_ID,
      DEFAULT_COMFYUI_WORKFLOW_PRESET_ID_K2_ANIMA,
    ]);
    expect(workflowPresets.presets[1].workflowJson).toBe(DEFAULT_COMFYUI_WORKFLOW_K2_ANIMA_JSON);
    expect(workflowPresets.activePresetId).toBe(DEFAULT_COMFYUI_WORKFLOW_PRESET_ID);
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
});

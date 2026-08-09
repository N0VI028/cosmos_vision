import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { extension_settings } from '@sillytavern/scripts/extensions';
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
    expect(promptLlm.temperature).toBe(0.5);
    expect(promptLlm.shouldStream).toBe(true);
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
    expect(promptLlm.temperature).toBe(0.9);
  });
});

import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '@/constants/default-settings';
import { promptLlmSettingsSchema, recoverPromptLlmSettings } from '@/store/prompt-llm-settings';

describe('prompt-llm settings schema and recovery', () => {
  it('validates default prompt-llm settings schema', () => {
    const result = promptLlmSettingsSchema.safeParse(DEFAULT_SETTINGS.promptLlm);
    expect(result.success).toBe(true);
  });

  it('recovers corrupted settings gracefully with fallback defaults', () => {
    const corrupted = {
      temperature: 'invalid', // bad type
      historyFloorCount: -5, // bad value
      shouldStream: 'yes', // bad type
    };

    const recovered = recoverPromptLlmSettings(corrupted);
    expect(recovered.temperature).toBe(DEFAULT_SETTINGS.promptLlm.temperature);
    expect(recovered.historyFloorCount).toBe(DEFAULT_SETTINGS.promptLlm.historyFloorCount);
    expect(recovered.shouldStream).toBe(false);
  });

  it('migrates legacy single account fields into the first account', () => {
    const legacy = {
      apiUrl: 'https://api.example.com/v1',
      apiKey: 'sk-secret-key',
      model: 'gpt-4o',
      source: 'deepseek',
    };

    const recovered = recoverPromptLlmSettings(legacy);
    expect(recovered.accounts).toHaveLength(1);
    expect(recovered.accounts[0].apiUrl).toBe('https://api.example.com/v1');
    expect(recovered.accounts[0].apiKey).toBe('sk-secret-key');
    expect(recovered.accounts[0].model).toBe('gpt-4o');
    expect(recovered.accounts[0].source).toBe('deepseek');
    expect(recovered.accounts[0].enabled).toBe(true);
    expect(recovered.routingMode).toBe('sequential');
  });

  it('keeps existing account list when already migrated', () => {
    const migrated = {
      accounts: [
        {
          id: 'acc-a',
          name: 'A',
          proxyPreset: '',
          apiUrl: 'https://a.example.com',
          apiKey: 'key-a',
          source: 'openai',
          model: 'gpt-4o',
          enabled: true,
        },
        {
          id: 'acc-b',
          name: '',
          proxyPreset: '',
          apiUrl: 'https://b.example.com',
          apiKey: 'key-b',
          source: 'claude',
          model: 'claude-sonnet-4',
          enabled: false,
        },
      ],
      routingMode: 'load_balance',
    };

    const recovered = recoverPromptLlmSettings(migrated);
    expect(recovered.accounts.map(account => account.id)).toEqual(['acc-a', 'acc-b']);
    expect(recovered.accounts[1].enabled).toBe(false);
    expect(recovered.accounts[1].source).toBe('claude');
    expect(recovered.routingMode).toBe('load_balance');
  });

  it('migrates legacy global connection fields into the first account', () => {
    const legacy = {
      proxyPreset: 'my-proxy',
      model: 'gpt-4o-mini',
      source: 'xai',
      accounts: [{ id: 'acc-a', name: 'A', apiUrl: 'https://a.example.com', apiKey: 'key-a', enabled: true }],
    };

    const recovered = recoverPromptLlmSettings(legacy);
    expect(recovered.accounts[0].proxyPreset).toBe('my-proxy');
    expect(recovered.accounts[0].model).toBe('gpt-4o-mini');
    expect(recovered.accounts[0].source).toBe('xai');
    expect(recovered).not.toHaveProperty('proxyPreset');
    expect(recovered).not.toHaveProperty('model');
    expect(recovered).not.toHaveProperty('source');
  });

  it('keeps per-account connection fields when already set', () => {
    const migrated = {
      proxyPreset: 'old-global',
      model: 'old-model',
      accounts: [
        {
          id: 'acc-a',
          name: 'A',
          proxyPreset: 'acc-proxy',
          apiUrl: '',
          apiKey: '',
          source: 'claude',
          model: 'claude-opus-4',
          enabled: true,
        },
        { id: 'acc-b', name: 'B', apiUrl: 'https://b.example.com', apiKey: 'key-b', enabled: true },
      ],
    };

    const recovered = recoverPromptLlmSettings(migrated);
    expect(recovered.accounts[0].proxyPreset).toBe('acc-proxy');
    expect(recovered.accounts[0].model).toBe('claude-opus-4');
    expect(recovered.accounts[1].proxyPreset).toBe('');
    expect(recovered.accounts[1].model).toBe('');
    expect(recovered.accounts[1].source).toBe('openai');
  });
});

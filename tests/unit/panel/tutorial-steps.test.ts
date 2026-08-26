import { describe, expect, it } from 'vitest';
import { buildTutorialSteps, type TutorialStep } from '@/panel/components/onboarding/tutorial-steps';

describe('onboarding tutorial steps', () => {
  it('includes prompt-llm-auto-character-info between prompt-llm-builder-preset and prompt-profiles-overview in novelai', () => {
    const novelAiSteps = buildTutorialSteps('novelai');
    const builderPresetIndex = novelAiSteps.findIndex((s: TutorialStep) => s.id === 'prompt-llm-builder-preset');
    const autoCharIndex = novelAiSteps.findIndex((s: TutorialStep) => s.id === 'prompt-llm-auto-character-info');
    const profilesOverviewIndex = novelAiSteps.findIndex((s: TutorialStep) => s.id === 'prompt-profiles-overview');

    expect(builderPresetIndex).toBeGreaterThan(-1);
    expect(autoCharIndex).toBe(builderPresetIndex + 1);
    expect(profilesOverviewIndex).toBe(autoCharIndex + 1);

    const autoCharStep = novelAiSteps[autoCharIndex];
    expect(autoCharStep.title).toBe('自动人物信息');
    expect(autoCharStep.scene).toEqual({ kind: 'settings', tab: 'prompt-llm', subTab: 'builder' });
    expect(autoCharStep.target?.selectors).toContain('[data-cv-tutorial="prompt-llm-builder-auto-character-info"]');
  });

  it('includes prompt-llm-auto-character-info in comfyui tutorial flow as well', () => {
    const comfySteps = buildTutorialSteps('comfyui');
    const autoCharStep = comfySteps.find((s: TutorialStep) => s.id === 'prompt-llm-auto-character-info');
    expect(autoCharStep).toBeDefined();
  });
});

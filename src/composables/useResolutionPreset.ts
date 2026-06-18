import type { ComputedRef } from 'vue';

interface ResolutionPresetOption<TPreset extends string> {
  value: TPreset;
  width: number;
  height: number;
}

interface ResolutionPresetState<TPreset extends string> {
  resolutionPreset: TPreset;
  width: number;
  height: number;
}

interface UseResolutionPresetResult {
  isCustomResolution: ComputedRef<boolean>;
  markCustomResolution: () => void;
}

/**
 * 复用尺寸预设切换逻辑
 * @param settings 当前图像设置
 * @param presetOptions 可用尺寸预设
 * @param customPreset 自定义尺寸预设值
 * @returns 自定义尺寸状态与切换方法
 */
export function useResolutionPreset<TPreset extends string>(
  settings: ResolutionPresetState<TPreset>,
  presetOptions: readonly ResolutionPresetOption<TPreset>[],
  customPreset: TPreset,
): UseResolutionPresetResult {
  watch(
    () => settings.resolutionPreset,
    value => {
      const preset = presetOptions.find(option => option.value === value);
      if (!preset) return;
      settings.width = preset.width;
      settings.height = preset.height;
    },
  );

  const isCustomResolution = computed(() => settings.resolutionPreset === customPreset);

  /**
   * 标记当前图像尺寸为自定义
   */
  function markCustomResolution(): void {
    settings.resolutionPreset = customPreset;
  }

  return { isCustomResolution, markCustomResolution };
}

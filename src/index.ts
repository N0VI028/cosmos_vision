import '@/global.css';
import '@/styles/inline-image.css';
import App from '@/App.vue';
import { DARK_CLASS } from '@/constants/theme';
import { cosmosPrimePt } from '@/services/primevue/primevue-pt';
import { cosmosPrimePreset } from '@/services/primevue/primevue-theme';
import { syncThemeColorToPrimary } from '@/services/primevue/theme-adapter';
import { whenSillyTavernReady } from '@/services/sillytavern/theme';
import PrimeVue from 'primevue/config';

/**
 * CosmosVision 扩展入口
 * 在 ST 加载完成后挂载到 #extensions_settings,使用 jQuery 兼容 ST 的生命周期
 */
const app = createApp(App);

app.use(createPinia());

app.use(PrimeVue, {
  theme: {
    preset: cosmosPrimePreset,
    options: {
      darkModeSelector: `.cosmos-vision-root.${DARK_CLASS}`,
      // 关闭 cssLayer:让 PrimeVue 规则保持 unlayered,凭类选择器特异性压过 ST 全局标签规则
      cssLayer: false,
    },
  },
  pt: cosmosPrimePt,
});

$(async () => {
  // 等 ST APP_READY 后再读取 --SmartThemeQuoteColor,避免读到空串导致 PrimeVue 退回灰阶
  await whenSillyTavernReady();
  syncThemeColorToPrimary();
  const $container = $('<div id="cosmos_vision">').appendTo('#extensions_settings');
  app.mount($container[0]);
});

// 命名空间 + off 先解绑:防止 HMR / 重复注入累计 handler 导致多次 unmount
$(window)
  .off('pagehide.cosmosVision')
  .on('pagehide.cosmosVision', () => {
    app.unmount();
  });

import vue from '@vitejs/plugin-vue';
import { PrimeVueResolver } from '@primevue/auto-import-resolver';
import path from 'node:path';
import unpluginAutoImport from 'unplugin-auto-import/vite';
import unpluginVueComponents from 'unplugin-vue-components/vite';
import { defineConfig } from 'vitest/config';
import pluginExternal from 'vite-plugin-external';

/**
 * SillyTavern 全局对象外部化映射
 * 将打包时的依赖名映射到运行时全局变量,避免重复打包
 */
const externals = {
  jquery: '$',
  lodash: '_',
  toastr: 'toastr',
} as const;

// 运行时 dist/index.js 通过 dist 路径回溯到 ST public 根
// ST_IMPORT_DEPTH 用于离 ST 目录外构建时手动指定层级
const relative_sillytavern_path = process.env.ST_IMPORT_DEPTH
  ? '../'.repeat(Number(process.env.ST_IMPORT_DEPTH)).slice(0, -1)
  : path.relative(path.join(__dirname, 'dist'), __dirname.substring(0, __dirname.lastIndexOf('public') + 6));

export default defineConfig(({ mode }) => ({
  define: {
    // 直接替换整个表达式，避免运行时计算
    '__PRIMEUI_LICENSE__': JSON.stringify(process.env.VITE_PRIMEUI_LICENSE || ''),
  },
  plugins: [
    vue({
      features: {
        prodDevtools: false,
        prodHydrationMismatchDetails: false,
      },
    }),
    unpluginAutoImport({
      dts: true,
      dtsMode: 'overwrite',
      imports: ['vue', 'pinia'],
      dirs: [],
    }),
    unpluginVueComponents({
      dts: true,
      syncMode: 'overwrite',
      globs: ['src/panel/*.vue'],
      resolvers: [PrimeVueResolver()],
    }),
    !process.env.VITEST && {
      name: 'sillytavern_resolver',
      enforce: 'pre',
      resolveId(id) {
        if (id.startsWith('@sillytavern/')) {
          return {
            id: path.join(relative_sillytavern_path, id.replace('@sillytavern/', '')).replaceAll('\\', '/') + '.js',
            external: true,
          };
        }
      },
    },
    !process.env.VITEST &&
      pluginExternal({
        externals: libname => {
          if (libname in externals) {
            return externals[libname as keyof typeof externals];
          }
        },
      }),
  ].filter(Boolean),

  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      ...(process.env.VITEST
        ? {
            '@sillytavern/script': path.resolve(__dirname, 'tests/helpers/sillytavern-script-mock.ts'),
            '@sillytavern/scripts/extensions': path.resolve(__dirname, 'tests/helpers/sillytavern-extensions-mock.ts'),
            '@sillytavern/scripts/utils': path.resolve(__dirname, 'tests/helpers/sillytavern-utils-mock.ts'),
            '@sillytavern/scripts/openai': path.resolve(__dirname, 'tests/helpers/sillytavern-openai-mock.ts'),
            '@sillytavern/lib/jszip.min': path.resolve(__dirname, 'tests/helpers/sillytavern-jszip-mock.ts'),
          }
        : {}),
    },
  },

  build: {
    rollupOptions: {
      input: 'src/index.ts',
      output: {
        format: 'es',
        entryFileNames: '[name].js',
        chunkFileNames: '[name].[hash].chunk.js',
        assetFileNames: '[name].[ext]',
        preserveModules: false,
      },
    },

    outDir: 'dist',
    emptyOutDir: true,

    sourcemap: mode === 'production' ? true : 'inline',

    minify: mode === 'production' ? 'terser' : false,
    terserOptions:
      mode === 'production'
        ? {
            format: { quote_style: 1 },
            mangle: { reserved: ['_', 'toastr', '$'] },
          }
        : {
            format: { beautify: true, indent_level: 2 },
            compress: false,
            mangle: false,
          },

    target: 'esnext',
  },

  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.ts'],
    coverage: {
      reporter: ['text', 'html'],
    },
  },
}));

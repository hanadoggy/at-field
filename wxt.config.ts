import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  publicDir: 'src/public',
  outDir: 'dist',
  manifestVersion: 3,
  imports: false,
  webExt: { disabled: true },
  zip: { excludeSources: ['docs/**', 'web-ext-artifacts/**'] },
  vite: () => ({ build: { minify: false } }),
  manifest: ({ browser }) => ({
    name: '__MSG_extName__',
    description: '__MSG_extDescription__',
    default_locale: 'en',
    ...(browser === 'firefox' && {
      browser_specific_settings: {
        gecko: {
          id: 'custom-mask-overlay@hanayor',
          strict_min_version: '142.0',
          data_collection_permissions: { required: ['none'] },
        } as Record<string, unknown>,
      },
    }),
    icons: { 48: 'icons/icon.svg', 96: 'icons/icon.svg' },
    permissions: ['storage'],
    host_permissions: ['*://www.youtube.com/*'],
    action: {
      default_title: '__MSG_extName__',
      default_icon: { 48: 'icons/icon.svg', 96: 'icons/icon.svg' },
    },
  }),
});

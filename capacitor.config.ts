import type { CapacitorConfig } from '@capacitor/cli';

const DUB_HUB_RUNTIME_BG = '#0f1324';

const config: CapacitorConfig = {
  appId: 'uk.dubhub.app',
  appName: 'dub hub',
  webDir: 'dist/public',
  /**
   * Runtime WKWebView underlay. Keep this aligned with app shell dark surface so
   * iOS keyboard viewport reveals never flash the brand launch blue.
   */
  backgroundColor: DUB_HUB_RUNTIME_BG,
  ios: {
    backgroundColor: DUB_HUB_RUNTIME_BG,
  },
};

export default config;

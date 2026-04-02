import type { CapacitorConfig } from '@capacitor/cli';

const DUB_HUB_BLUE = '#1e38f9';

const config: CapacitorConfig = {
  appId: 'uk.dubhub.app',
  appName: 'dub hub',
  webDir: 'dist/public',
  /** WKWebView + scroll view chrome: avoids white flash before first HTML paint. */
  backgroundColor: DUB_HUB_BLUE,
  ios: {
    backgroundColor: DUB_HUB_BLUE,
  },
};

export default config;

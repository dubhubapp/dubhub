/// <reference types="@capacitor/splash-screen" />

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
  plugins: {
    SplashScreen: {
      /**
       * SPLASH-HANDOFF-2: hold native PremiumLaunchScreen until app-ready
       * (dismissStartupOverlay). Hide is issued from App.tsx — not on React mount.
       */
      launchAutoHide: false,
      backgroundColor: DUB_HUB_RUNTIME_BG,
      showSpinner: false,
    },
    StatusBar: {
      /** Draw web content under the status bar; status-bar taps emit `statusTap` (not web touches). */
      overlaysWebView: true,
    },
  },
};

export default config;

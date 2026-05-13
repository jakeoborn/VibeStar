import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.plursky.app',
  appName: 'Plursky',
  webDir: 'dist',
  ios: {
    contentInset: 'always',
  },
};

export default config;

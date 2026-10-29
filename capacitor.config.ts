import type { CapacitorConfig } from '@capacitor/cli';

/** Android kabuğu. Web derlemesi (dist) uygulama içine paketlenir; ağdan kod yüklenmez. */
const config: CapacitorConfig = {
  appId: 'io.github.eirahoutmoss.nexlearn',
  appName: 'NexLearn',
  webDir: 'dist',
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    CapacitorHttp: { enabled: false },
  },
};

export default config;

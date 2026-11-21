import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor 配置：把 apps/web 的生产构建产物包成 Android 应用。
 * web 代码 100% 复用——领域逻辑在 packages/*，界面是同一份 React PWA。
 *
 * 为什么不用 webDir 指向 dev server：App 要能离线启动、装到手机上独立运行，
 * 必须把构建好的静态资源复制进原生包（cap sync 完成这件事）。
 */
const config: CapacitorConfig = {
  appId: 'com.atomic.english',
  appName: 'Atomic English',
  webDir: '../web/dist',
  android: {
    // 允许 WebView 访问 http 后端（本地联调用自托管 Supabase）
    mixedContentMode: 'always',
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      backgroundColor: '#ffffff',
    },
  },
};

export default config;

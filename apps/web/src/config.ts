/**
 * 运行时配置：让同一个 Docker 镜像能连不同后端，不必为每个环境重新构建。
 *
 * 优先级：
 *   1. window.__ATOMIC_CONFIG__（由 /config.js 在运行时注入，Docker 部署用）
 *   2. import.meta.env.VITE_*（本地开发用，构建时固化）
 *
 * /config.js 由 nginx 容器在启动时根据环境变量生成，不在仓库里。
 */

declare global {
  interface Window {
    __ATOMIC_CONFIG__?: {
      supabaseUrl?: string;
      supabaseAnonKey?: string;
    };
  }
}

export interface RuntimeConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
}

export function getRuntimeConfig(): RuntimeConfig | null {
  const runtime = typeof window !== 'undefined' ? window.__ATOMIC_CONFIG__ : undefined;
  const url =
    runtime?.supabaseUrl || (import.meta.env.VITE_SUPABASE_URL as string | undefined);
  const key =
    runtime?.supabaseAnonKey || (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined);

  if (!url || !key) return null;
  return { supabaseUrl: url, supabaseAnonKey: key };
}

/* eslint-env serviceworker */
/**
 * Atomic Learning Service Worker（手写，不引 Workbox）。
 *
 * 缓存策略按请求类型分开，不搞全局一把梭（依据 framework-selection §10 阶段二要求）：
 *   导航请求      → network-first，失败回落到缓存的 index.html（应用壳离线可用）
 *   /assets/ 指纹资源 → cache-first，内容不可变，永不重新下载
 *   图标/manifest   → stale-while-revalidate
 *   /api/ 数据读取   → network-first + 短期缓存兜底（离线时给陈旧数据，好过报错）
 *   跨域请求      → 不拦截，交给浏览器（Supabase 直连）
 *
 * 缓存带版本号，activate 时清理旧版本，避免旧产物泄漏。
 */

const VERSION = 'v1';
const SHELL_CACHE = `atomic-shell-${VERSION}`;
const ASSET_CACHE = `atomic-asset-${VERSION}`;
const DATA_CACHE = `atomic-data-${VERSION}`;

const SHELL_URLS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
  '/icons/apple-touch-icon.png',
];

const DATA_TTL_MS = 5 * 60 * 1000;

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // 逐个添加：单个资源失败不应让整个 SW 安装失败
      await Promise.all(
        SHELL_URLS.map((url) => cache.add(new Request(url, { cache: 'reload' })).catch(() => undefined)),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([SHELL_CACHE, ASSET_CACHE, DATA_CACHE]);
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k.startsWith('atomic-') && !keep.has(k)).map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }
  if (url.origin !== self.location.origin) return; // 跨域（Supabase 等）不拦截

  if (req.mode === 'navigate') {
    event.respondWith(handleNavigate(req));
    return;
  }
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirst(req, ASSET_CACHE));
    return;
  }
  if (url.pathname.startsWith('/icons/') || url.pathname === '/manifest.webmanifest') {
    event.respondWith(staleWhileRevalidate(req, SHELL_CACHE));
    return;
  }
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(req, DATA_CACHE, DATA_TTL_MS));
    return;
  }
  event.respondWith(networkFirst(req, null, 0));
});

/** 导航：优先网络，离线时回落到缓存的应用壳 */
async function handleNavigate(req) {
  try {
    const fresh = await fetch(req);
    if (fresh && fresh.ok) {
      const cache = await caches.open(SHELL_CACHE);
      cache.put('/index.html', fresh.clone());
    }
    return fresh;
  } catch {
    const cached = (await caches.match('/index.html')) || (await caches.match('/'));
    if (cached) return cached;
    return new Response('离线且没有可用的缓存版本', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
}

/** 指纹资源：命中即返回，未命中则取回并缓存 */
async function cacheFirst(req, cacheName) {
  const cached = await caches.match(req);
  if (cached) return cached;
  const fresh = await fetch(req);
  if (fresh && fresh.ok && cacheName) {
    const cache = await caches.open(cacheName);
    cache.put(req, fresh.clone());
  }
  return fresh;
}

/** 先给缓存再后台更新 */
async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  const network = fetch(req)
    .then((fresh) => {
      if (fresh && fresh.ok) cache.put(req, fresh.clone());
      return fresh;
    })
    .catch(() => undefined);
  return cached || (await network) || new Response('', { status: 504 });
}

/**
 * 优先网络。ttlMs > 0 时把响应缓存下来做离线兜底（超出 TTL 则视为过期）。
 */
async function networkFirst(req, cacheName, ttlMs) {
  try {
    const fresh = await fetch(req);
    if (fresh && fresh.ok && cacheName) {
      const cache = await caches.open(cacheName);
      const body = await fresh.clone().arrayBuffer();
      const stamped = new Response(body, {
        status: fresh.status,
        statusText: fresh.statusText,
        headers: fresh.headers,
      });
      stamped.headers.set('x-atomic-cached-at', String(Date.now()));
      await cache.put(req, stamped);
    }
    return fresh;
  } catch (err) {
    if (!cacheName) throw err;
    const cached = await caches.match(req);
    if (!cached) throw err;
    const stampedAt = Number(cached.headers.get('x-atomic-cached-at') || 0);
    if (ttlMs > 0 && Date.now() - stampedAt > ttlMs) {
      // 过期数据仍比没有数据强，但标注出来，避免上层把陈旧数据当成新鲜数据
      const headers = new Headers(cached.headers);
      headers.set('x-atomic-stale', '1');
      return new Response(await cached.blob(), {
        status: cached.status,
        statusText: cached.statusText,
        headers,
      });
    }
    return cached;
  }
}

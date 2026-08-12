/**
 * PrivaHub PWA Service Worker
 * 提供离线缓存能力，支持手机/平板/桌面多端
 */

const CACHE_VERSION = 'privahub-v1';
const CACHE_NAME = `${CACHE_VERSION}-${self.registration ? self.registration.scope : ''}`;

// 需要预缓存的核心资源（运行时动态缓存其余资源）
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
];

// 不缓存的请求类型
const SKIP_CACHE_HOSTS = [
  'supabase.co',
  'supabase.in',
  'googleapis.com',
  'gstatic.com',
];

// 安装：预缓存核心资源
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_URLS).catch(() => {
        // 预缓存失败不阻止安装
      });
    })
  );
  self.skipWaiting();
});

// 激活：清理旧缓存
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME && key.startsWith('privahub-v'))
          .map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// 请求拦截：缓存优先，回退到网络
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // 只处理 GET 请求
  if (request.method !== 'GET') return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  // 跳过 API 请求和不支持缓存的域名
  if (SKIP_CACHE_HOSTS.some((host) => url.hostname.includes(host))) {
    return;
  }

  // 跳过 chrome-extension 和 data URI
  if (url.protocol === 'chrome-extension:' || url.protocol === 'data:') {
    return;
  }

  // 同源请求：缓存优先策略
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const fetchPromise = fetch(request)
          .then((response) => {
            // 只缓存有效的响应
            if (response && response.status === 200 && response.type === 'basic') {
              const clone = response.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(request, clone).catch(() => {});
              });
            }
            return response;
          })
          .catch(() => {
            // 网络失败：返回缓存的响应或离线页面
            if (cached) return cached;
            // 对于导航请求，返回缓存的 index.html
            if (request.mode === 'navigate') {
              return caches.match('./index.html');
            }
          });

        return cached || fetchPromise;
      })
    );
  }
});

// 接收消息：手动更新
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

const CACHE_VERSION = 'sphereweb3-shell-v7'
const STATIC_CACHE = `${CACHE_VERSION}:static`
const API_CACHE = `${CACHE_VERSION}:api`
const STATIC_ASSETS = [
  '/favicon.svg',
  '/icons.svg',
]
const API_ASSETS = [
  '/api/i18n',
  '/api/version',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => {
        const staleKeys = keys.filter((key) => !key.startsWith(CACHE_VERSION))
        const hasStaleShellCache = staleKeys.some((key) => key.startsWith('sphereweb3-shell-'))
        return Promise.all(staleKeys.map((key) => caches.delete(key)))
          .then(() => self.clients.claim())
          .then(() => {
            if (hasStaleShellCache) {
              return reloadWindowClients()
            }
          })
      }),
  )
})

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') {
    return
  }

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) {
    return
  }

  if (isNavigationRequest(request)) {
    return
  }

  if (url.pathname.startsWith('/assets/')) {
    return
  }

  if (STATIC_ASSETS.includes(url.pathname)) {
    event.respondWith(cacheFirst(request, STATIC_CACHE))
    return
  }

  if (API_ASSETS.includes(url.pathname)) {
    event.respondWith(networkFirst(request, API_CACHE))
  }
})

function isNavigationRequest(request) {
  return request.mode === 'navigate' || (request.headers.get('accept') || '').includes('text/html')
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName)
  const cached = await cache.match(request)
  if (cached) {
    return cached
  }
  const response = await fetch(request)
  if (response.ok) {
    cache.put(request, response.clone())
  }
  return response
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName)
  try {
    const response = await fetch(request)
    if (response.ok) {
      cache.put(request, response.clone())
    }
    return response
  } catch (error) {
    const cached = await cache.match(request)
    if (cached) {
      return cached
    }
    throw error
  }
}

async function reloadWindowClients() {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
  await Promise.all(clients.map((client) => {
    if (!client.url || typeof client.navigate !== 'function') {
      return undefined
    }
    return client.navigate(client.url).catch(() => undefined)
  }))
}

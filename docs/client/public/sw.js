/**
 * docs service worker — network-first for navigation, cache-first for
 * hashed assets. API calls are never cached.
 */
const CACHE = "vdocs-v1"

self.addEventListener("install", () => {
  self.skipWaiting()
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener("fetch", (event) => {
  const req = event.request
  if (req.method !== "GET") return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith("/api/")) return

  // Navigations: try the network, fall back to the cached app shell.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          cachePut("/", res.clone())
          return res
        })
        .catch(() => caches.match("/").then((r) => r || caches.match(req)))
    )
    return
  }

  // Static assets: cache-first.
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached
      return fetch(req)
        .then((res) => {
          if (res.ok) cachePut(req, res.clone())
          return res
        })
        .catch(() => cached)
    })
  )
})

function cachePut(request, response) {
  if (!response || !response.ok) return
  caches.open(CACHE).then((cache) => cache.put(request, response)).catch(() => {})
}
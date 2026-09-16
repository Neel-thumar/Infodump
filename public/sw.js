/* infodump offline service worker.
 *
 * Its whole job is reading: serve what is cached when the network is gone. Downloads are
 * driven from the page, not from here, because a worker whose waitUntil runs for minutes is
 * terminated by the browser mid-job. The page also writes to Cache Storage, so this file
 * never needs a message channel.
 *
 * Three caches, on purpose:
 *   id-shell-<v>   pages the reader happened to visit, trimmed to a bounded size
 *   id-assets      /_next/static/* and /thumb — content-hashed or stable, never auto-purged,
 *                  because dropping them would break every downloaded course's HTML
 *   id-course-<id> one cache per downloaded course, so "remove" is a single caches.delete
 *
 * The app navigates with plain anchors (no next/link), so every page transition is a real
 * navigation request. That means no RSC payloads to cache — plain HTML documents are enough.
 *
 * COURSE_PREFIX below must match src/lib/offline/cache.js.
 */

const VERSION = 'v1';
const SHELL = `id-shell-${VERSION}`;
const ASSETS = 'id-assets';
const COURSE_PREFIX = 'id-course-';
const SHELL_LIMIT = 60;

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    // Course and asset caches outlive a version bump; only stale shells are dropped.
    for (const name of await caches.keys()) {
      if (name.startsWith('id-shell-') && name !== SHELL) await caches.delete(name);
    }
    // Nothing is precached here on purpose. Storing a page's HTML without the chunks it
    // imports produces a broken page offline, which is worse than an honest offline notice.
    // Pages earn their place in the cache by being visited (the fetch handler stores the
    // document and its assets together) or by being part of a download.
    await self.clients.claim();
  })());
});

const isAsset = url => url.pathname.startsWith('/_next/static/') || url.pathname === '/thumb';
// The query is part of the key: continuous reading renders a different page at the volume's
// own URL, and /thumb is addressed entirely by its query.
const keyFor = url => url.pathname + url.search;

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // An RSC payload is tied to one build and is never what a cold offline load needs.
  if (url.searchParams.has('_rsc')) return;
  if (isAsset(url)) return event.respondWith(cacheFirst(request, event));
  if (url.pathname === '/api/search') return event.respondWith(search(request));
  if (url.pathname.startsWith('/api/')) return;
  if (request.mode === 'navigate') return event.respondWith(navigate(request, url, event));
});

async function cacheFirst(request, event) {
  const key = keyFor(new URL(request.url));
  const hit = await caches.match(key);
  if (hit) return hit;
  try {
    const response = await fetch(request);
    // waitUntil, not await: the page gets its bytes now and the write outlives the response.
    if (response.ok) event.waitUntil(caches.open(ASSETS).then(cache => cache.put(key, response.clone())));
    return response;
  } catch {
    return new Response('', { status: 504, statusText: 'Offline and not cached' });
  }
}

async function search(request) {
  try { return await fetch(request); }
  catch { return Response.json({ results: [], truncated: false, offline: true }); }
}

async function navigate(request, url, event) {
  const key = keyFor(url);
  try {
    const response = await fetch(request);
    // Storing is a side effect; making the reader wait for it would tax every page view.
    if (response.ok && !response.redirected) event.waitUntil(store(key, response.clone()));
    return response;
  } catch {
    // Fall back to the bare path so a link carrying tracking parameters still resolves.
    return (await caches.match(key)) || (url.search && await caches.match(url.pathname)) || offlinePage();
  }
}

// A page belonging to a downloaded course refreshes that course's copy; anything else is
// a casual visit and goes in the trimmed shell cache.
async function store(key, response) {
  for (const name of (await caches.keys()).filter(n => n.startsWith(COURSE_PREFIX))) {
    const cache = await caches.open(name);
    if (await cache.match(key)) return cache.put(key, response);
  }
  const shell = await caches.open(SHELL);
  await shell.put(key, response);
  const keys = await shell.keys();
  for (const stale of keys.slice(0, Math.max(0, keys.length - SHELL_LIMIT))) await shell.delete(stale);
}

function offlinePage() {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline · infodump</title>
<style>:root{color-scheme:light dark}body{box-sizing:border-box;margin:0;min-height:100vh;display:grid;place-items:center;
background:#f7f7f2;color:#222922;font:15px/1.6 ui-sans-serif,-apple-system,"Segoe UI",sans-serif;text-align:center;padding:24px}
main{max-width:30rem}h1{font:400 32px/1.1 Georgia,serif;letter-spacing:-1px;margin:0 0 14px}
p{color:#697168}a,button{display:inline-block;margin:18px 6px 0;padding:11px 20px;border-radius:7px;
border:1px solid #dde2d8;background:#fff;color:inherit;font:inherit;cursor:pointer;text-decoration:none}
@media(prefers-color-scheme:dark){body{background:#14181f;color:#e9edf3}p{color:#adb9c9}
a,button{background:#1c222c;border-color:#354151}}</style></head><body><main>
<h1>You're offline</h1><p>This page isn't saved on your device. Courses you downloaded for offline
reading are still available from the library.</p>
<a href="/">Go to the library</a><button onclick="location.reload()">Try again</button>
</main></body></html>`;
  return new Response(html, { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

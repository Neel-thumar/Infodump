## Caching — Avoiding Unnecessary Backend Work

### The Problem

Your API returns a product list. 1,000 users request it within 10 seconds. Without caching, your backend processes the same query 1,000 times, returning the same result. With caching, nginx stores the first response and serves it to the next 999 users without touching the backend.

### Two Kinds of Caching

| Kind | Where it happens | What it does |
|---|---|---|
| **Proxy cache** (nginx stores responses) | At nginx, on disk or in memory | nginx saves backend responses and serves them for subsequent identical requests |
| **Browser cache** (client stores responses) | At the client browser | The browser stores the response and reuses it without contacting the server at all |

nginx can do both: it can cache responses itself (proxy cache) and it can set headers that tell browsers to cache responses (`Cache-Control`, `Expires`).

### Proxy Cache Setup

```nginx
http {
    proxy_cache_path /var/cache/nginx/api
                     levels=1:2
                     keys_zone=api_cache:10m
                     max_size=100m
                     inactive=10m;

    server {
        ...

        location /api/ {
            proxy_pass http://api_backends;
            proxy_cache api_cache;
            proxy_cache_valid 200 5m;
            proxy_cache_valid 404 1m;

            add_header X-Cache-Status $upstream_cache_status;
        }
    }
}
```

Let's understand each part.

### `proxy_cache_path`

```nginx
proxy_cache_path /var/cache/nginx/api
                 levels=1:2
                 keys_zone=api_cache:10m
                 max_size=100m
                 inactive=10m;
```

- **`/var/cache/nginx/api`** — Directory on disk where cached responses are stored.
- **`levels=1:2`** — Subdirectory structure for cache files (avoids putting millions of files in one directory).
- **`keys_zone=api_cache:10m`** — A named shared memory zone (10 MB) for storing cache keys and metadata. The name `api_cache` is what you reference in `proxy_cache`.
- **`max_size=100m`** — Total disk space for cached data. When exceeded, nginx removes the least recently used entries.
- **`inactive=10m`** — Remove entries not accessed within 10 minutes, regardless of their validity.

This directive goes in the `http` context, outside of any `server` block.

### `proxy_cache` and `proxy_cache_valid`

```nginx
proxy_cache api_cache;
proxy_cache_valid 200 5m;
proxy_cache_valid 404 1m;
```

- **`proxy_cache api_cache`** — Enable caching for this location, using the zone defined above.
- **`proxy_cache_valid 200 5m`** — Cache HTTP 200 responses for 5 minutes.
- **`proxy_cache_valid 404 1m`** — Cache 404 responses for 1 minute (so nginx doesn't keep asking the backend for a resource that doesn't exist).

### `X-Cache-Status` — Is This Response Cached?

```nginx
add_header X-Cache-Status $upstream_cache_status;
```

This adds a response header that tells you whether the response came from cache. The values:

| Value | Meaning |
|---|---|
| `MISS` | Not in cache; fetched from backend |
| `HIT` | Served from cache |
| `EXPIRED` | Was cached, but expired; re-fetched from backend |
| `BYPASS` | Caching was intentionally bypassed |
| `STALE` | Serving an expired cache entry (backend unreachable) |

This header is invaluable for debugging. When you suspect caching problems, curl the endpoint and check `X-Cache-Status`.

### Cache Keys — What Makes Two Requests "the Same"?

The **cache key** determines which cached response serves which request. By default, the key is:

```text
$scheme$proxy_host$request_uri
```

This means: protocol + upstream name + URI (including query string).

So `GET /api/products?page=1` and `GET /api/products?page=2` are different cache entries (different query strings). But `GET /api/products?page=1` from User A and the same request from User B share the same cache entry.

**This is where caching gets dangerous.**

### The Cache Poisoning Risk

If your API returns user-specific data, and the cache key doesn't include anything user-specific, nginx will cache User A's response and serve it to User B.

Example of what goes wrong:

1. User A requests `GET /api/profile` → backend returns User A's profile → nginx caches it.
2. User B requests `GET /api/profile` → nginx serves User A's cached profile to User B.

User B sees User A's data. This is a **data leak** caused by incorrect caching.

### Preventing Cache Mistakes

**Rule 1:** Never cache user-specific responses unless the cache key includes the user identity.

The safest approach is to not cache authenticated API endpoints at all:

```nginx
location /api/ {
    proxy_pass http://api_backends;

    # Don't cache if there's an Authorization header
    proxy_cache_bypass $http_authorization;
    proxy_no_cache     $http_authorization;
}
```

`proxy_no_cache` prevents nginx from storing the response. `proxy_cache_bypass` skips the cache when looking up responses.

**Rule 2:** Only cache responses that are genuinely the same for all users — public data, product listings, static API responses.

**Rule 3:** Respect the backend's cache headers. If the backend sends `Cache-Control: no-store` or `Cache-Control: private`, nginx should not cache.

```nginx
# This is the default behavior — nginx respects Cache-Control from the backend.
# But if you set proxy_cache_valid, it overrides the backend's headers.
# Be deliberate about which one controls caching.
```

### Cache Invalidation — The Hard Problem

The backend updates a product's price. The cache still holds the old price for the remaining cache lifetime. Users see stale data.

There is no elegant solution to cache invalidation. Here are the practical approaches:

| Approach | How it works | Tradeoff |
|---|---|---|
| Short TTL | `proxy_cache_valid 200 30s` — cache expires quickly | Still 30 seconds of stale data; backend gets more requests |
| Cache purge | Send a PURGE request to remove a specific cache entry | Requires the `ngx_cache_purge` module (not in default nginx); adds operational complexity |
| Cache bypass | Client sends a specific header to skip cache | Useful for admin/refresh scenarios |
| Versioned URLs | `/api/products?v=2` — change the version when data changes | Works for assets, awkward for API responses |

In practice, short TTLs are the most common approach for API caching. For static assets (CSS, JS, images), longer TTLs with versioned filenames (`app.abc123.js`) are standard.

---


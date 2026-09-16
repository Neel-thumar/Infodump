## Caching Serving Stale or Wrong Content

We covered the mechanics of this in Volume 3. Here's the systematic investigation process.

### Investigation

**Step 1: Check `X-Cache-Status` on the affected response.**

```bash
curl -k -s -D - https://localhost:8443/api/affected-endpoint -o /dev/null | grep -i x-cache
```

- `HIT` — serving from cache. If the content is wrong, the cache holds outdated or incorrect data.
- `STALE` — serving an expired cache entry, likely because the backend is unreachable and `proxy_cache_use_stale` is configured.

**Step 2: Check if this is a wrong-user problem (cache poisoning) or a stale-data problem.**

- **Wrong-user problem:** One user sees another user's data. This means the cache key doesn't differentiate between users, but it should. This is a security bug — fix immediately by adding `proxy_no_cache`/`proxy_cache_bypass` for that endpoint or including a user-specific value in the cache key.

- **Stale-data problem:** Everyone sees the same (outdated) data. The TTL (`proxy_cache_valid`) is too long relative to how often the data changes, or a manual invalidation didn't happen.

**Step 3: Check the actual cache TTL configuration.**

```bash
grep proxy_cache_valid nginx.conf
```

### Fix

- For wrong-user issues: immediately add `proxy_no_cache`/`proxy_cache_bypass` for the endpoint. Consider clearing the existing (poisoned) cache entries.
- For stale-data issues: reduce the TTL, or implement a purge mechanism for when data changes.

### Emergency: Clear the Cache

```bash
docker compose exec nginx rm -rf /var/cache/nginx/api/*
docker compose exec nginx nginx -s reload
```

This clears all cached entries immediately. Use this as an emergency measure, then fix the underlying TTL or cache-key configuration.

---


## Config Loads, But the Wrong `location` Block Matches

### What It Means

`nginx -t` passes, nginx reloads successfully, but requests are handled by a different `location` block than you expected.

### Common Causes

- A regex location is unexpectedly matching before your intended prefix location.
- A `^~` preferential prefix is blocking regex evaluation you expected to happen.
- Location blocks were reordered, changing regex matching order (prefix order doesn't matter, but regex order does).
- A more specific prefix exists elsewhere in the config that you forgot about.

### Investigation

**Step 1: Temporarily add a debug marker.**

```nginx
location /api/special/ {
    add_header X-Debug-Location "api-special-block" always;
    proxy_pass http://api_backends;
}
```

```bash
curl -k -s -D - https://localhost:8443/api/special/test -o /dev/null | grep X-Debug-Location
```

If the header doesn't appear, this block isn't matching — something else is intercepting the request.

**Step 2: List all location blocks and their types.**

```bash
grep -n "location" nginx.conf
```

Manually trace through the matching algorithm from Volume 1: find the longest prefix, check for `=` or `^~`, then check regexes top to bottom.

**Step 3: Check for regex locations that might unexpectedly match.**

A regex like `location ~ \.(json|api)$` could match paths you didn't anticipate. Review all regex locations for overly broad patterns.

### Fix

- Add `^~` to a prefix location if you need it to take priority over regex matching.
- Reorder regex locations if match order matters (first matching regex wins).
- Make regex patterns more specific to avoid unintended matches.
- Remove the debug header once you've confirmed the fix.

### Prevention

- Keep location blocks organized and commented, especially when mixing prefix and regex types.
- When adding a new location block, always check whether it could be shadowed by an existing regex location, or whether it shadows an existing prefix location.

---


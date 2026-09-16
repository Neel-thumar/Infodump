## Gzip Compression

Compression reduces the size of responses sent to clients. Less data over the network means faster page loads and lower bandwidth costs.

```nginx
http {
    gzip on;
    gzip_types text/plain text/css application/json application/javascript
               text/xml application/xml application/xml+rss text/javascript;
    gzip_min_length 256;
    gzip_comp_level 5;
    gzip_vary on;
    gzip_proxied any;
}
```

### What Each Directive Does

**`gzip on`** — Enable compression.

**`gzip_types`** — Which content types to compress. By default, nginx only compresses `text/html`. You need to explicitly add CSS, JavaScript, JSON, XML, etc. Don't compress already-compressed formats (images, videos, zip files) — it wastes CPU and doesn't reduce size.

**`gzip_min_length 256`** — Don't compress responses smaller than 256 bytes. The overhead of compression (CPU and the gzip header) isn't worth it for tiny responses. They might even get larger after compression.

**`gzip_comp_level 5`** — Compression level, 1 (fastest, least compression) to 9 (slowest, most compression). The sweet spot is usually 4–6. Going from 5 to 9 adds significant CPU for only marginally smaller output. Going below 3 saves CPU but compresses poorly.

Here's the general relationship:

```text
Level 1-3:  Fast, light compression.  Good for CPU-constrained servers.
Level 4-6:  Balanced.  Good default range.
Level 7-9:  Slow, heavy compression.  Rarely worth the CPU cost.
```

**`gzip_vary on`** — Adds `Vary: Accept-Encoding` to responses. This tells caches (CDNs, proxies) that the response varies based on whether the client supports gzip. Without this, a cache might serve a gzip-compressed response to a client that doesn't support it.

**`gzip_proxied any`** — Compress responses even when the request came through a proxy (identified by the `Via` header). Without this, proxied requests might not get compressed.

### The CPU vs Bandwidth Tradeoff

Compression uses CPU on every response. On a CPU-constrained server with many small responses, aggressive compression might slow things down. On a bandwidth-constrained server (or for clients on slow networks), compression is a significant win.

For most web applications, enabling gzip at level 4–6 is a clear net positive. The CPU cost is small compared to the bandwidth savings.

### Testing Compression

```bash
# Request without Accept-Encoding (no compression):
curl -k -s -D - https://localhost:8443/api/test -o /dev/null | grep -i content-length

# Request with Accept-Encoding (compressed):
curl -k -s -D - -H "Accept-Encoding: gzip" https://localhost:8443/api/test -o /dev/null | grep -iE "content-encoding|content-length"
```

If compression is working, the second request should show `Content-Encoding: gzip` and a smaller or missing `Content-Length` (chunked transfer).

---


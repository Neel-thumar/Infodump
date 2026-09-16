## Proxy Buffering — How nginx Manages the Speed Difference

Your backend can generate a response very quickly. But the client might be on a slow mobile network. Without buffering, the backend would have to wait while the client slowly downloads the response — tying up a backend thread for seconds or minutes.

nginx solves this with **proxy buffering**. It is enabled by default and works like this:

1. The backend sends the response to nginx as fast as it can.
2. nginx stores (buffers) the entire response in memory (or on disk if it's large).
3. The backend connection is freed immediately.
4. nginx sends the buffered response to the slow client at whatever speed the client can handle.

```text
Without buffering:
  Backend ────slow trickle────> Client
  (backend thread held until client finishes downloading)

With buffering (default):
  Backend ──fast──> nginx (buffer) ────slow trickle────> Client
  (backend thread freed immediately)
```

This is a major performance benefit. Your backend handles a request in 50ms and moves on to the next one. nginx holds the response and deals with the slow client.

### When to Disable Buffering

For **streaming responses** (server-sent events, streaming APIs, long-polling), you don't want nginx to buffer — you want data to flow through as it arrives:

```nginx
location /api/stream/ {
    proxy_pass http://backend;
    proxy_buffering off;
}
```

For normal API and web traffic, keep buffering on (the default).

### Buffer Size Tuning

The defaults are usually fine, but if your backend sends very large responses:

```nginx
proxy_buffer_size    4k;   # for the initial response (status line + headers)
proxy_buffers        8 4k; # 8 buffers of 4k each for the response body
proxy_busy_buffers_size 8k;
```

If the response doesn't fit in memory buffers, nginx writes the overflow to a temporary file on disk. This is fine for large responses but slower than pure memory buffering.

We will tune these properly in Volume 4. For now, know that buffering exists and what it does.

---


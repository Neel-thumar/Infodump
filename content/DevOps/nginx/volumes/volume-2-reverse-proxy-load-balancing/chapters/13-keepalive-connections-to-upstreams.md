## Keepalive Connections to Upstreams

By default, nginx opens a new TCP connection to the backend for every proxied request and closes it when the response is complete. With high traffic, this creates and destroys thousands of connections per second — each one costing a TCP handshake.

**Keepalive connections** keep TCP connections to backends open and reuse them for multiple requests:

```nginx
upstream api_backends {
    server backend1:3001;
    server backend2:3001;

    keepalive 32;
}
```

`keepalive 32` means each worker keeps up to 32 idle connections to this upstream group alive and ready for reuse.

For keepalive to work, you must also tell nginx to use HTTP/1.1 to the backend (HTTP/1.0 doesn't support persistent connections):

```nginx
location /api/ {
    proxy_pass http://api_backends;
    include /etc/nginx/proxy_params;

    proxy_http_version 1.1;
    proxy_set_header Connection "";
}
```

`proxy_http_version 1.1` switches from the default HTTP/1.0 to 1.1 for the upstream connection. `proxy_set_header Connection ""` clears the Connection header so the backend doesn't close the connection after each response.

### Why This Matters in Production

Without keepalive, at 1,000 requests/second, nginx creates and destroys 1,000 TCP connections per second to your backends. Each connection requires a TCP handshake (and potentially TLS handshake if you encrypt internal traffic). With keepalive, established connections are reused, eliminating that overhead.

The performance difference is measurable, especially under high load.

---


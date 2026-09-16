## Logging — Making nginx Observable

### Access Log — What Happened to Each Request

The access log records every request nginx handles. The default format:

```text
172.18.0.1 - - [16/Sep/2026:10:23:45 +0000] "GET /api/test HTTP/1.1" 200 134 "-" "curl/8.5.0"
```

This tells you: client IP, time, request method/URI/protocol, response status, body size, referrer, and user agent. It's useful but missing critical information: **how long did it take?** **Which backend handled it?** **Was it cached?**

### Custom Log Format

A production-grade log format includes upstream timing, cache status, and request details:

```nginx
http {
    log_format main
        '$remote_addr - $remote_user [$time_local] '
        '"$request" $status $body_bytes_sent '
        '"$http_referer" "$http_user_agent" '
        'rt=$request_time '
        'urt=$upstream_response_time '
        'us=$upstream_status '
        'ua=$upstream_addr '
        'cs=$upstream_cache_status';

    access_log /var/log/nginx/access.log main;
}
```

### What Each Variable Means

| Variable | What it records |
|---|---|
| `$remote_addr` | Client IP |
| `$remote_user` | Client username (from HTTP basic auth; usually `-`) |
| `$time_local` | Timestamp |
| `$request` | Full request line (`GET /api/test HTTP/1.1`) |
| `$status` | Response status code |
| `$body_bytes_sent` | Size of the response body sent to the client |
| `$http_referer` | Referrer header |
| `$http_user_agent` | User-Agent header |
| `$request_time` | Total time from first byte received from client to last byte sent to client (in seconds, with millisecond precision) |
| `$upstream_response_time` | Time the backend took to respond (from connection to last byte of response) |
| `$upstream_status` | Status code from the backend (not the same as `$status` if nginx modifies it) |
| `$upstream_addr` | Which backend server handled the request |
| `$upstream_cache_status` | Cache status: HIT, MISS, EXPIRED, BYPASS, etc. |

### Reading a Custom Log Line

```text
172.18.0.1 - - [16/Sep/2026:10:23:45 +0000] "GET /api/orders HTTP/1.1" 200 1234 "-" "Mozilla/5.0" rt=0.052 urt=0.048 us=200 ua=172.18.0.3:3001 cs=MISS
```

This tells a complete story:

- Client `172.18.0.1` requested `GET /api/orders`.
- Total request time: 52 ms (`rt=0.052`).
- Backend response time: 48 ms (`urt=0.048`). The 4 ms difference is nginx overhead (TLS, buffering, network).
- Backend `172.18.0.3:3001` handled it and returned status 200.
- Cache status: MISS — the response was fetched from the backend, not cache.

Compare with a cached response:

```text
172.18.0.1 - - [16/Sep/2026:10:23:46 +0000] "GET /api/orders HTTP/1.1" 200 1234 "-" "Mozilla/5.0" rt=0.001 urt=- us=- ua=- cs=HIT
```

Request time: 1 ms. Upstream fields are `-` because the backend was never contacted. Cache: HIT.

### Why This Matters for Debugging

With this log format, you can answer questions that are impossible with default logging:

| Question | What to look at |
|---|---|
| "Why is the site slow?" | `$request_time` and `$upstream_response_time`. If `urt` is high, the backend is slow. If `rt` is high but `urt` is low, the problem is between nginx and the client (slow network, large response). |
| "Which backend is slow?" | `$upstream_addr`. Filter logs by backend address and compare response times. |
| "Is caching working?" | `$upstream_cache_status`. If everything is MISS, caching isn't configured correctly or the cache key is too specific. |
| "Are we getting 502s?" | `$status` and `$upstream_status`. If `$status` is 502 and `$upstream_addr` is `-`, nginx couldn't reach any backend. |
| "Is one backend getting more errors?" | Combine `$upstream_addr` and `$upstream_status`. |

### JSON Log Format

For logs that feed into a log aggregation system (ELK, Loki, Datadog), JSON format is easier to parse:

```nginx
log_format json_log escape=json
    '{'
      '"time": "$time_iso8601", '
      '"remote_addr": "$remote_addr", '
      '"request": "$request", '
      '"status": $status, '
      '"body_bytes_sent": $body_bytes_sent, '
      '"request_time": $request_time, '
      '"upstream_response_time": "$upstream_response_time", '
      '"upstream_addr": "$upstream_addr", '
      '"upstream_status": "$upstream_status", '
      '"upstream_cache_status": "$upstream_cache_status", '
      '"http_user_agent": "$http_user_agent"'
    '}';

access_log /var/log/nginx/access.json json_log;
```

`escape=json` ensures special characters in variables are properly escaped for valid JSON output.

This produces lines like:

```json
{"time": "2026-09-16T10:23:45+00:00", "remote_addr": "172.18.0.1", "request": "GET /api/test HTTP/1.1", "status": 200, "body_bytes_sent": 134, "request_time": 0.052, "upstream_response_time": "0.048", "upstream_addr": "172.18.0.3:3001", "upstream_status": "200", "upstream_cache_status": "MISS", "http_user_agent": "curl/8.5.0"}
```

Each line is a valid JSON object. Log aggregation tools can parse and index every field automatically.

---


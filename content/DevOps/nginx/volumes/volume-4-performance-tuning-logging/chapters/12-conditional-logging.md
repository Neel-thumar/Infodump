## Conditional Logging

Sometimes you want to log only certain requests — errors, slow requests, or specific paths.

### Log Only Errors

```nginx
map $status $loggable_error {
    ~^[23] 0;
    default 1;
}

access_log /var/log/nginx/errors-only.log main if=$loggable_error;
```

This logs only requests with status codes that don't start with 2 or 3 (i.e., 4xx and 5xx). The `map` directive creates a variable: `$loggable_error` is `0` (don't log) for 2xx/3xx, `1` (log) for everything else.

### Log Slow Requests

```nginx
map $request_time $slow_request {
    ~^[0-9]\.[0-4]  0;
    default          1;
}

access_log /var/log/nginx/slow.log main if=$slow_request;
```

This is a rough filter that logs requests taking 0.5 seconds or more. The regex is imprecise but illustrates the concept. In practice, you'd use log aggregation tools to filter by `$request_time` rather than doing it in nginx.

### Multiple Log Files

nginx supports multiple `access_log` directives in the same context:

```nginx
access_log /var/log/nginx/access.log main;
access_log /var/log/nginx/access.json json_log;
```

Both log files are written simultaneously. This lets you keep a human-readable log and a machine-parseable JSON log.

### Disabling Logging for Health Checks

Load balancers and monitoring systems hit your nginx every few seconds with health checks. These flood the access log with noise:

```nginx
location = /health {
    access_log off;
    return 200 "ok\n";
    default_type text/plain;
}
```

`access_log off` suppresses logging for this location. The health check still works; it just doesn't fill your logs.

---


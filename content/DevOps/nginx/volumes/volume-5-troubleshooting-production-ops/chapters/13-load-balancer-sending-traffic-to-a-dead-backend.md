## Load Balancer Sending Traffic to a Dead Backend

### What It Means

One backend is down, but nginx keeps sending some requests to it, causing a portion of traffic to fail.

### Investigation

**Step 1: Check `max_fails` and `fail_timeout` settings.**

```nginx
upstream api_backends {
    server backend1:3001 max_fails=3 fail_timeout=30s;
    server backend2:3001 max_fails=3 fail_timeout=30s;
}
```

If `max_fails` is high (e.g., 10), nginx tolerates many failures before marking the backend unavailable — meaning more requests fail during the detection window.

**Step 2: Check whether `proxy_next_upstream` is configured.**

Without it, a request that hits the dead backend fails outright instead of being retried on a healthy one.

**Step 3: Remember: health checking is passive in open-source nginx.**

nginx only learns a backend is down from a real request failing. There's an inherent window where some requests will hit the dead backend before it's marked unavailable.

### Fix

- Lower `max_fails` and `fail_timeout` to detect failures faster (tradeoff: more sensitive to transient blips).
- Configure `proxy_next_upstream` so failed requests retry on a healthy backend transparently.
- For faster, more reliable detection, consider nginx Plus's active health checks, or an external health-checking sidecar/orchestrator (Kubernetes readiness probes, for example) that removes unhealthy backends from nginx's config entirely via reload.

### Prevention

- If running in Kubernetes, use readiness probes so unhealthy pods are removed from service endpoints before nginx (or ingress-nginx) ever routes to them.
- Combine passive detection (`max_fails`) with proactive orchestration-level health checks for faster, more reliable failover.

---


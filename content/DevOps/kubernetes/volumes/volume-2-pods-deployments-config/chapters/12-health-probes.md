## Health Probes

Kubernetes cannot guess whether your application is working. You have to tell it, with probes.

There are three, and they answer three different questions.

| Probe | Question | Action on failure |
|---|---|---|
| **Startup** | Has it finished starting? | Kill and restart the container |
| **Readiness** | Can it serve traffic *right now*? | Remove the Pod from Service endpoints |
| **Liveness** | Is it broken beyond recovery? | Kill and restart the container |

The distinction people miss: **readiness removes traffic, liveness kills the container.** Getting these backwards causes outages.

```yaml
containers:
  - name: app
    image: myapp:1.0
    startupProbe:
      httpGet:
        path: /healthz
        port: 8080
      failureThreshold: 30
      periodSeconds: 5          # allows up to 150s to start
    readinessProbe:
      httpGet:
        path: /ready
        port: 8080
      periodSeconds: 5
    livenessProbe:
      httpGet:
        path: /healthz
        port: 8080
      periodSeconds: 10
      failureThreshold: 3
```

Probe types are `httpGet`, `tcpSocket`, `exec` and `grpc`.

### How the startup probe saves you

Before startup probes existed, a slow-starting application needed a long `initialDelaySeconds` on its liveness probe — which meant a genuinely hung application also went undetected for that long.

A startup probe fixes this: **liveness and readiness are disabled until the startup probe succeeds.** Give the startup probe a generous budget and keep the liveness probe fast. Best of both.

### Probe mistakes that cause real outages

**1. Liveness probe pointing at a dependency.** If your `/healthz` checks the database, then a database blip restarts every Pod at once — turning a slow database into a total outage. Liveness should only answer "is this process broken?"

**2. Same endpoint for readiness and liveness.** Then "temporarily busy" is treated as "permanently broken", and Kubernetes kills Pods that would have recovered.

**3. Timeouts too tight.** `timeoutSeconds` defaults to 1 second. An application under load that takes 1.2 seconds to answer gets killed.

**4. No readiness probe at all.** Kubernetes assumes a started container is ready and sends traffic to an application still loading. Rollouts then complete "successfully" while returning errors.


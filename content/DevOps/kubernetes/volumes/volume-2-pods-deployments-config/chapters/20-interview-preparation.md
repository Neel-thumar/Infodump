## Interview Preparation

### Level 1 — Fundamentals

**Q: What is a Pod?**

Answer: The smallest unit Kubernetes runs. It is one or more containers that share a network address and can share storage, always scheduled together on the same node. Usually one container, with extra containers only for helpers like a log shipper or proxy.

**Q: What is the difference between a Deployment and a ReplicaSet?**

Answer: A ReplicaSet keeps a fixed number of identical Pods running. A Deployment manages ReplicaSets so you can update versions — it creates a new ReplicaSet for the new version and shifts Pods over gradually. The old ReplicaSet is kept, which is how rollback works.

**Q: ConfigMap vs Secret?**

Answer: Both hold configuration. Secrets are for sensitive values and are handled a bit more carefully — but they are only base64-encoded, so the real protection is RBAC and encryption at rest.

### Level 2 — Practical

**Q: What is the difference between a readiness and a liveness probe?**

How to think: state the *action*, not just the meaning.

Answer: Readiness decides whether the Pod receives traffic — if it fails, the Pod is removed from the Service endpoints but keeps running. Liveness decides whether the container is broken — if it fails, the container is killed and restarted. Readiness is for temporary problems, liveness is for permanent ones.

**Q: How do you perform a zero-downtime deployment?**

Answer: Use a Deployment with a rolling update, `maxUnavailable: 0` so capacity never drops, and a genuine readiness probe so a new Pod only receives traffic when it can serve. The application also needs to handle SIGTERM and finish in-flight requests during the grace period.

**Q: You changed a ConfigMap but the app behaviour did not change. Why?**

Answer: If the values are injected as environment variables, they are only read at container start — the Pods need to be recreated, usually with `kubectl rollout restart`. If it is mounted as a volume, the files do update, but the application has to reload them.

### Level 3 — Scenario

**Q: A Pod is in `CrashLoopBackOff`. Walk me through your investigation.**

How to think: describe evidence gathering, not a fix.

Answer: First `kubectl describe pod` to see the restart count, exit code and events. Then `kubectl logs --previous`, because the current container may have just started and the useful output is from the failed attempt. Exit code 137 with `OOMKilled` points to memory limits. Exit 127 means the command was not found. A clean application stack trace usually means missing configuration or an unreachable dependency. I would also check whether it is actually a failing liveness probe restarting a healthy app rather than a real crash.

**Q: Your rollout is stuck at 2 of 5 Pods updated. What is happening?**

Answer: New Pods are not becoming ready, so the Deployment will not remove old ones — which is the safety behaviour working correctly. I would `kubectl describe` a new Pod and look at events and probe failures. Common causes are a bad image, a failing readiness probe, or insufficient cluster capacity for the surge Pods. The old Pods are still serving, so there is no outage; I would fix or `rollout undo`.

**Q: A team reports that every deployment causes a spike of 502 errors.**

Answer: Most likely the application does not handle SIGTERM, so it is killed mid-request, or it stops accepting connections before Kubernetes removes it from endpoints. I would check the shutdown handling, consider a `preStop` hook with a short sleep so endpoint removal propagates first, and confirm `maxUnavailable` is not letting capacity drop too far.

### Level 4 — Senior Thinking

**Q: When would you use a StatefulSet instead of a Deployment?**

Answer: Only when Pods need individual identity — a stable network name, their own persistent volume, and ordered startup or shutdown. Databases and clustered systems like Kafka need this. For anything stateless, a Deployment is simpler, faster to roll out, and easier to operate. Using a StatefulSet unnecessarily adds ordering constraints that slow every deployment down.

**Q: How would you design health checks for a service with a slow start and an unreliable downstream dependency?**

Answer: A startup probe with a generous failure budget so slow starts are not mistaken for failures. A liveness probe that only checks the process itself — never the dependency — so a downstream outage does not restart every Pod. A readiness probe that *can* consider the dependency, so the Pod stops taking traffic while it cannot serve, but is not killed and can recover when the dependency returns.


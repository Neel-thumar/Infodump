## Things Senior Engineers Notice

1. **A rollout finishing does not mean the release works.** It means new Pods reported ready. If readiness is weak, you have shipped a broken version with a green light.
2. **`imagePullPolicy` is silently set by your tag.** With tag `latest` it defaults to `Always`; with a fixed tag it defaults to `IfNotPresent`. That is why "I pushed a new image to the same tag and nothing changed".
3. **`maxUnavailable: 0` with only one node** means a rollout can deadlock if the node cannot fit an extra Pod.
4. **A liveness probe that checks a dependency turns a small outage into a large one.**
5. **Environment variables from ConfigMaps never update.** Half of "config not applied" tickets are this.
6. **Secrets in environment variables leak.** Crash dumps, debug endpoints and process listings all expose them. Mount files instead.
7. **`kubectl delete pod` is not a restart.** It is a delete; the controller creates a new one. Fine for stateless apps, potentially harmful for StatefulSets.
8. **If the app does not handle SIGTERM, every deploy drops requests** — and the graphs will blame Kubernetes.
9. **Deployment `selector` cannot be changed.** Design labels carefully at creation time.
10. **Init containers run on every Pod restart**, not once per Deployment. Migrations in an init container will run many times — they must be safe to repeat.
11. **`kubectl edit` changes disappear** on the next apply from your manifests. Change the source of truth.


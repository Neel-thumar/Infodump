# Volume 3 — From CI to CD

**Tool:** GitLab CI/CD

---

## Purpose of this volume

| Goal | What it means here |
|---|---|
| Learning goal | Understand why "build once, promote many" is the core of safe delivery |
| Practical goal | Containerise the app, push to the GitLab Container Registry, deploy to a test environment |
| Production goal | Image identity, tags vs digests, registry authentication, environment separation |
| Troubleshooting goal | Image push failures, registry auth, deployment jobs that succeed while the app is down |
| Interview goal | Explain image tagging strategy, environments, promotion, and manual gates |

You now have a pipeline that produces a tested artifact. This volume answers: **how does that artifact get somewhere it can actually run?**

---


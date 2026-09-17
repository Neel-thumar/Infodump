# Volume 2 — Building Real CI Pipelines

**Tool:** GitLab CI/CD

---

## Purpose of this volume

| Goal | What it means here |
|---|---|
| Learning goal | Understand what makes a CI pipeline *useful*, not just green |
| Practical goal | Build a multi-stage pipeline with real build, tests, reports, artifacts and caching |
| Production goal | Understand cost, speed, and reliability tradeoffs in pipeline design |
| Troubleshooting goal | Missing artifacts, stale cache, flaky tests, slow pipelines |
| Interview goal | Artifacts vs cache, rules, MR pipelines, `needs`, dependency handling |

At the end of Volume 1 you had two jobs and an uncomfortable observation: `npm ci` ran twice, because jobs do not share a filesystem. That waste is the entry point to this entire volume.

---


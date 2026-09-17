## Part 3 — Production CI/CD at scale

### 12. What changes from 10 to 500 developers

| | 10 developers, 5 deploys/day | 500 developers, 500 deploys/day |
|---|---|---|
| Runners | A couple of static runners | Autoscaling fleets, segmented by trust and capability |
| Pipeline config | One file per project, hand-written | Shared templates/components, versioned and owned |
| Secrets | A dozen project variables | Central secret management, short-lived credentials, automated rotation |
| Failures | Someone notices | Alerting, dashboards, an owner |
| Ownership | "The DevOps guy" | A platform team with users and an SLA |
| Cost | Invisible | A budget line with attribution per team |
| A broken shared template | Annoying | An outage for everyone at once |

The mindset shift: **at scale, CI/CD is a product with internal customers.** It needs versioning, deprecation policy, documentation, support, and a way to change without breaking 200 repositories on a Tuesday.

### 13. Scaling levers

- **Autoscaling runners.** Capacity follows demand; you don't pay for idle at 3 a.m. or queue at 5 p.m.
- **Ephemeral job environments.** Clean state every time — reliability and security in the same decision.
- **Shared templates or CI/CD components**, versioned and pinned. Consumers upgrade deliberately, not accidentally.
- **Caching strategy at the fleet level** — distributed cache rather than per-runner local caches, otherwise cache hit rates collapse as the fleet grows.
- **Merge trains** for busy repositories, so changes are validated against the actual merge result rather than a stale base.
- **Fail fast.** Cheap checks first: a 10-second lint that catches the problem shouldn't run after a 6-minute build.

### 14. Cost

Pipelines cost compute, storage, and engineer waiting time. The waiting time is usually the largest and least measured.

Controls that work: `rules:` so pipelines don't run for irrelevant changes; `interruptible: true` so superseded pipelines are cancelled when someone pushes again; artifact expiry and registry cleanup policies; right-sized runners; and pinned base images that cache well.

---


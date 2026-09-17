## 2. The four strategies

### Recreate

**What:** stop all old instances, then start the new ones.

```text
v1 v1 v1  →  (nothing)  →  v2 v2 v2
              ↑ downtime
```

**Why it exists:** it's the simplest thing that works, and sometimes it's the only option — a database schema change that old and new code cannot both tolerate forces old instances to be gone before new ones start.

**Advantages:** simple, cheap, no version mixing, easy to reason about.

**Problems:** guaranteed downtime, proportional to startup time. If the new version fails to start, you have an outage *and* nothing running.

**Use when:** internal tools, batch systems, an approved maintenance window, or incompatible schema changes.

**Don't use when:** users expect availability.

**Failure looks like:** the service is down and stays down until you deploy something that works.

**Rollback:** redeploy the previous image — which means another downtime window.

---

### Rolling

**What:** replace instances a few at a time. The default on most orchestration platforms.

```text
v1 v1 v1 v1  →  v2 v1 v1 v1  →  v2 v2 v1 v1  →  v2 v2 v2 v2
```

**Why:** no downtime, no doubled infrastructure.

**Advantages:** zero-downtime, gradual, cheap. If the platform performs health checks, a broken version stalls the rollout instead of completing it.

**Problems:** **two versions run at the same time.** Your API must tolerate that, and so must your database schema and any shared cache. Rollback is also gradual, so recovery is not instant.

**Use when:** stateless services, backward-compatible changes — the common case.

**Don't use when:** versions genuinely cannot coexist.

**Failure looks like:** a partial rollout, some requests hitting broken instances, and a confusing period where behaviour depends on which instance answered. This is why "it works sometimes" during a deployment is normal for rolling and alarming for anything else.

**Rollback:** roll forward to the previous image — another gradual rollout.

---

### Blue/Green

**What:** run two complete environments. Blue serves traffic; deploy to green; test green; switch traffic; keep blue idle as the escape route.

```text
        ┌── blue (v1) ── serving ──┐
router ─┤                          │
        └── green (v2) ── idle ────┘

   deploy + verify green, then flip the router:

        ┌── blue (v1) ── idle ─────┐   ← rollback = flip back
router ─┤                          │
        └── green (v2) ── serving ─┘
```

**Why:** it makes rollback nearly instant, because the old version is still running.

**Advantages:** near-zero downtime; you can test the new version on real infrastructure before it takes traffic; rollback is a router change measured in seconds.

**Problems:** double the infrastructure during the switch. Shared state is the hard part — both sides usually talk to the same database, so a destructive migration cannot be undone by flipping back. In-flight sessions and connections need handling.

**Use when:** rollback speed matters more than infrastructure cost.

**Failure looks like:** the flip happens and everyone gets the bad version at once — but you notice and flip back within seconds.

**Rollback:** switch the router back. The fastest rollback of any strategy — provided the database is still compatible.

---

### Canary

**What:** send a small percentage of traffic to the new version, watch, then increase.

```text
100% → v1
  ↓
 95% → v1     5% → v2      watch error rate, latency
  ↓
 75% → v1    25% → v2
  ↓
              100% → v2
```

**Why:** some failures only appear under real production traffic, real data, and real load. Staging cannot manufacture those.

**Advantages:** smallest blast radius; real production signal; failures are caught while affecting few users.

**Problems:** requires traffic splitting and **good metrics** — canary without monitoring is just a slow rolling deploy. Two versions coexist, with the same compatibility demands as rolling, for longer. Small samples take time to produce statistically meaningful signal.

**Use when:** high-traffic user-facing systems, risky changes, strong observability.

**Don't use when:** you cannot measure the difference between the two groups. Then it's ceremony.

**Failure looks like:** the canary's error rate rises above baseline while most users are unaffected — the intended outcome.

**Rollback:** route the canary's traffic back to the stable version. Fast and small.

### Choosing

| Question | If the answer is… | Then… |
|---|---|---|
| Can users tolerate downtime? | Yes | Recreate is fine |
| Can two versions coexist? | No | Recreate or blue/green (with a clean cut) |
| Is rollback speed critical? | Yes | Blue/green |
| Do you have per-version metrics? | Yes | Canary is available |
| Standard stateless service, backward-compatible change? | Yes | Rolling |

> A senior answer to "which strategy should we use?" never starts with a name. It starts with: **what's the cost of downtime, can the versions coexist, and how fast can we detect a bad release?**

---


# Volume 4 — Production Deployments and Release Engineering

**Tool:** GitLab CI/CD

---

## Purpose of this volume

| Goal | What it means here |
|---|---|
| Learning goal | Understand that *how* you deploy determines what failure costs you |
| Practical goal | Add real verification and an exercised rollback to the pipeline |
| Production goal | Choose a deployment strategy with reasoning; know what each one's failure looks like |
| Troubleshooting goal | Deploy succeeded but app is down; rollback doesn't work |
| Interview goal | Compare recreate / rolling / blue-green / canary, and explain rollback design |

Volume 3 ended with an uncomfortable fact: **your deploy job reports on your deploy script, not on your application.** This volume closes that gap.

---

## 1. Deployment is a moment of risk, not a command

Running `deploy.sh` is trivial. The engineering question is:

> **While the new version is replacing the old one, what do users experience — and if the new version is broken, how many of them find out?**

Every deployment strategy is an answer to those two questions, trading cost and complexity against blast radius.

```text
                 users affected if the release is bad
                 ───────────────────────────────────►
Recreate         ████████████████████████  everyone, plus downtime
Rolling          ████████████░░░░░░░░░░░░  a growing share during rollout
Blue/Green       ████████████████████████  everyone — but for a very short time
Canary           ██░░░░░░░░░░░░░░░░░░░░░░  a small, chosen slice
                 ───────────────────────────────────►
                 cost and complexity increase downward
```

---

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

## 3. The compatibility problem nobody warns you about

Every zero-downtime strategy requires old and new code to run simultaneously. That constraint reaches into your database.

Consider renaming a column:

```sql
ALTER TABLE users RENAME COLUMN email TO email_address;
```

The instant that runs, every still-running old instance breaks. Rollback doesn't save you — the old code can't work against the new schema.

The discipline is the **expand / contract** pattern: make changes additive first, and remove only when nothing needs the old shape.

```text
Release 1 (expand)     add email_address; write to BOTH columns; read from email
Release 2              read from email_address; keep writing both
Release 3 (contract)   drop email — only after all old instances are gone
```

Three deployments instead of one. In return, **every individual release is rollback-safe**.

> **Rollback is only real if the database can roll back too.** A deployment strategy chosen without considering schema changes gives you a false sense of safety. Most "we couldn't roll back" incidents are database incidents.

---

## 4. Verification: proving the application works

Here is the gap stated plainly:

```text
Deploy job exit code 0  =  "my deploy command ran without error"
Application healthy     =  something INDEPENDENT checked and confirmed
```

These are different claims. A pipeline that only makes the first one is not finished.

### Health endpoints

Your application should expose:

- **Liveness** — is the process alive? (restart if not)
- **Readiness** — can it serve traffic *right now*? Dependencies reachable, migrations applied, caches warm.

Readiness is what deployment cares about, and it must be honest. An endpoint that returns 200 unconditionally is worse than none, because it manufactures false confidence throughout the system.

### A verification job

```yaml
verify-production:
  stage: verify
  image: curlimages/curl:latest
  needs: ["deploy-production"]
  environment:
    name: production
    action: verify
  script:
    - |
      echo "Waiting for the application to become ready..."
      for i in $(seq 1 30); do
        if curl -fsS "https://app.example.com/health/ready" > /dev/null; then
          echo "Ready after ${i} attempts."
          break
        fi
        if [ "$i" -eq 30 ]; then
          echo "Application did not become ready in time."
          exit 1
        fi
        sleep 10
      done
    - |
      DEPLOYED=$(curl -fsS "https://app.example.com/version" | tr -d '"')
      echo "Reported version: ${DEPLOYED}"
      if [ "$DEPLOYED" != "$CI_COMMIT_SHA" ]; then
        echo "Wrong version live. Expected ${CI_COMMIT_SHA}."
        exit 1
      fi
    - ./smoke-tests.sh https://app.example.com
  rules:
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH
```

Three checks, three different lies caught:

1. **Readiness with a bounded wait** — catches a container that never starts. Bounded, so a broken deploy fails in five minutes instead of hanging the pipeline.
2. **Version assertion** — catches the deployment that "succeeded" while the old image kept running. This one bug has caused more confused debugging sessions than almost anything else: the deploy is green, the fix isn't live, and everyone stares at the code.
3. **Smoke tests** — a handful of critical paths: can a user log in, can the main page load, does a core API return sane data. Small and fast. This is not your test suite; it is a pulse check.

> **A deployment stage without verification is an opinion. With verification, it's evidence.**

---

## 5. Rollback

### The four requirements

Rollback is not a command. It is a property of your system, and it requires all four of these:

1. **The previous artifact still exists** — immutable image, still in the registry, not expired by a cleanup policy.
2. **You know exactly which version was previously deployed** — the GitLab environment history gives you this.
3. **The previous version still works against current state** — database, config, and external contracts. The hardest one.
4. **The rollback path has been executed before** — recently, on purpose.

Skip any one and you don't have rollback. You have a plan to improvise during an outage.

### An explicit rollback job

GitLab's environment page can re-deploy a previous deployment. That's useful, but an explicit job is better: it's reviewable, it can include verification, and it works when you need to roll back to a specific version rather than "the previous one".

```yaml
rollback-production:
  stage: deploy
  environment:
    name: production
    action: start
  variables:
    ROLLBACK_SHA: ""          # set when running the job manually
  script:
    - |
      if [ -z "$ROLLBACK_SHA" ]; then
        echo "Set ROLLBACK_SHA to the commit SHA you want live."
        exit 1
      fi
    - ./deploy.sh production "$CI_REGISTRY_IMAGE:$ROLLBACK_SHA"
    - ./verify.sh https://app.example.com "$ROLLBACK_SHA"
  rules:
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH
      when: manual
  tags:
    - production-deploy
```

Notice: rollback is **just a deployment of a known-good image**. That is only possible because Volume 3 tagged images immutably by commit SHA. If you had deployed `:latest`, this job could not be written.

Also notice it verifies. A rollback that isn't verified is another unverified deployment, performed under stress.

### Roll back or roll forward?

| | Roll back | Roll forward |
|---|---|---|
| What | Redeploy the previous known-good version | Deploy a fix |
| Speed | Minutes, if prepared | However long writing and testing a fix takes |
| Risk | Low — that version was running | Unknown — untested code written under pressure |
| Blocked by | Irreversible schema/data changes | Nothing, but it's slower |

**Default to rolling back.** Stop the bleeding, then diagnose calmly. Teams that default to rolling forward end up debugging production while users suffer, because "the fix is nearly ready" is always true and never quite true.

### Actually exercise it

Do this now, on the project, before you need it:

1. Deploy a version. Record its SHA.
2. Deploy a deliberately broken version (a typo in the startup command works fine).
3. **Watch the verification job fail.** Confirm it caught the problem rather than passing anyway.
4. Run the rollback job with the recorded SHA.
5. Confirm the application is healthy and `/version` reports the old SHA.
6. **Time it.** From "we noticed" to "we recovered".

That number is your recovery time. If you have never measured it, you do not know it — and that is what the exercise is for. Most teams discover something surprising here: a missing permission, an expired image, a rollback job nobody could run because it was tagged for a runner they lacked access to. Better to find it on a Tuesday afternoon.

---

## 6. Release tracking

Deployments are technical events. **Releases** are what humans and auditors talk about.

```yaml
create-release:
  stage: release
  image: registry.gitlab.com/gitlab-org/release-cli:latest
  rules:
    - if: $CI_COMMIT_TAG
  script:
    - echo "Creating release $CI_COMMIT_TAG"
  release:
    tag_name: "$CI_COMMIT_TAG"
    description: "Release $CI_COMMIT_TAG from commit $CI_COMMIT_SHA"
```

What this buys you, under **Deploy → Releases**: a permanent record tying a version name to a commit, an image, and a time; a changelog between releases; and an answer to "what changed between v1.4.1 and v1.4.2?" during an incident, at 3 a.m., when nobody's memory is reliable.

Traceability chain worth being able to draw:

```text
Release v1.4.2
    → commit abc123
        → pipeline #5821
            → image registry/app:abc123 (digest sha256:…)
                → deployed to production on 12 Sept, 14:22, by <user>
```

Every link is recorded automatically if you've built the pipeline as described. That chain is the difference between an engineering organisation and a group of people who deploy things.

---

## 7. The project pipeline now

```text
Merge Request → build, test, lint
       ↓
main → image built, tagged by commit SHA, pushed
       ↓
deploy TEST → verify
       ↓
deploy STAGING → verify
       ↓
[ manual approval — production ]
       ↓
deploy PRODUCTION (restricted runner, protected environment)
       ↓
verify: readiness + version assertion + smoke tests
       ↓
healthy?  ── no ──►  rollback-production (manual, verified)
   │
  yes → release recorded
```

---

## 8. Troubleshooting

### "New release is broken and rollback does not work"

The worst one, and it's always one of four causes:

| Cause | Evidence | Prevention |
|---|---|---|
| The old image is gone | Registry pull fails, `manifest unknown` | Cleanup policies that keep deployed/release tags forever |
| The old version can't run against the new database | App starts, then errors on queries | Expand/contract migrations; never contract in the same release |
| Nobody knows what the previous version was | Guessing at SHAs during an incident | Environment history; version endpoint; release records |
| The rollback path was never tested | Permission errors, missing runner, a script that no longer works | Exercise it on a schedule |

**During the incident:** stabilise however you can — scale the old version if any instances survive, disable the feature by flag, take traffic off the broken path. Then fix the rollback mechanism afterwards as a real work item, not a note in a retro nobody reads.

### "Deployment succeeded, application is unavailable"

Now you have verification, so the *pipeline* should catch this. If it didn't, the verification is wrong. Check in this order:

1. Did the verification job run at all? (`rules:` may have excluded it.)
2. Does the health endpoint actually check dependencies, or return 200 blindly?
3. Did the version assertion run? If the old image is live, the deploy targeted the wrong reference.
4. Is it environment-specific configuration — a variable present in staging and missing in production?
5. Is it load-related — fine on staging's traffic, failing under production's?

### "It worked in staging"

Staging and production differ in ways that bite in a predictable order: **data volume** (queries fast on 1,000 rows, catastrophic on 10 million), **traffic and concurrency**, **configuration**, **integrations** (sandbox APIs behave differently from real ones), and **scale** (one instance versus twenty, where caching and state assumptions break).

The honest conclusion: staging reduces risk; it never eliminates it. That is precisely the argument for canary deployments and for fast, practised rollback.

---

## Production reality

- **Deployment frequency and rollback ability reinforce each other.** Small, frequent releases are easier to verify and safer to reverse; large rare releases are the opposite of both.
- **The approval button is often a formality.** Give the approver something real: what changed, staging verification results, and the rollback plan.
- **Deployment windows exist for a reason in some organisations** — regulated change control, business-critical hours. Automation fits inside them; it doesn't abolish them.
- **Feature flags decouple deploy from release.** Ship code dark, enable it separately. Then "rollback" can mean flipping a flag in seconds, without a deployment at all. Flags have their own cost — they accumulate and must be cleaned up.
- **The deploy script is the most safety-critical code in the repository** and is usually the least reviewed and least tested. Fix that imbalance.

---

## Common mistakes

- Deploying without verification, then relying on users to report outages.
- A health endpoint that always returns 200.
- Choosing canary without per-version metrics.
- Irreversible schema migrations shipped alongside application changes.
- A rollback procedure documented but never executed.
- `expire_in` / registry cleanup that deletes the image you need to roll back to.
- Defaulting to roll-forward during an incident.
- Unbounded waits in verification jobs that hang the pipeline instead of failing it.

---

## Things senior engineers notice

1. **Deployment strategy is a database decision as much as a traffic decision.** The strategy is bounded by what your schema allows.
2. **Rollback is a property you build in advance, not an action you take later.** By the time you need it, its feasibility is already decided.
3. **Time-to-recover matters more than deployment success rate.** Failures are inevitable; how long they last is the part you control.
4. **An unverified health check is worse than no health check** — it converts uncertainty into false confidence and spreads it to every automated decision downstream.
5. **The version-assertion check catches a whole class of "impossible" bugs**, because deploying the wrong thing successfully is common and invisible.
6. **Blue/green's fast rollback stops at the database.** Flipping the router doesn't unflip a migration.
7. **Feature flags turn releases into configuration changes**, which is the fastest rollback mechanism that exists — and a new kind of debt.
8. **A rollback path exercised quarterly is worth more than three documented ones that were never run.**
9. **Practised recovery is a capability, not a document.** The number you can quote from a real drill is the only honest answer to "how fast can you recover?".

---

## Interview questions

**Q: Compare rolling, blue/green, and canary.**
Rolling replaces instances gradually — zero downtime, no extra infrastructure, but two versions coexist and rollback is also gradual. Blue/green runs two full environments and switches traffic at once — near-instant rollback by switching back, at the cost of double infrastructure and with shared database state as the limiting factor. Canary sends a small share of traffic to the new version and increases it while watching metrics — smallest blast radius and real production signal, but it requires traffic splitting and per-version observability to be meaningful.

**Q: How do you design rollback?**
Make artifacts immutable and identified by commit SHA or digest so a previous version can be redeployed exactly; retain those images rather than expiring them; record which version is deployed where, using environment history and a version endpoint; keep database changes backward-compatible using expand/contract so the previous release still runs against current schema; provide an explicit, verified rollback job; and exercise the whole path regularly so you know it works and how long it takes.

**Q: Your deployment job passed but the application is down. What went wrong in the pipeline design?**
The pipeline is only checking that the deploy command exited zero, which says nothing about application health. It needs a verification step that independently confirms readiness with a bounded wait, asserts that the version now serving matches the commit that was deployed, and runs smoke tests on critical paths — failing the pipeline and triggering rollback if any of those fail.

**Q: How do you handle a database migration in a zero-downtime deployment?**
Use expand/contract. First deploy an additive change that both old and new code tolerate, then deploy code that uses the new shape, and only remove the old shape in a later release once nothing depends on it. This keeps every individual release reversible, because at no point does the previous version become incompatible with the current schema.

**Q: Roll back or roll forward?**
Default to rolling back: the previous version is known to work, recovery is fast, and it stops user impact immediately, leaving diagnosis to happen calmly afterwards. Roll forward when rollback is genuinely blocked — typically by an irreversible data change — or when the fix is trivial, well understood, and verifiable. Writing new code under incident pressure is the riskiest option available.

**Q: What makes a good health check?**
It distinguishes liveness from readiness, and readiness genuinely reflects the ability to serve — dependencies reachable, migrations applied, startup complete. It must be able to fail. A check that always returns 200 is actively harmful, because deployment automation, load balancers, and orchestrators all treat it as truth.

---

## Volume 4 checklist

- [ ] I can pick a deployment strategy and justify it from downtime tolerance, version coexistence, and detection speed
- [ ] My pipeline verifies readiness, asserts the deployed version, and runs smoke tests
- [ ] I have an explicit rollback job that deploys a specific known-good SHA
- [ ] **I have actually executed a rollback and timed it**
- [ ] I understand why schema changes are the real limit on rollback
- [ ] Releases are recorded, and I can trace release → commit → image → deployment

**Next:** Volume 5 — Security, Troubleshooting and Production CI/CD. How secrets actually leak, scanning in the pipeline, runner architecture, and a systematic method applied to broken pipelines.

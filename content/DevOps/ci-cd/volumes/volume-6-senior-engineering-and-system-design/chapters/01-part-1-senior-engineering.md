## Part 1 — Senior Engineering

### 1. What actually changes at senior level

Junior work is "make the pipeline do X". Senior work is deciding **whether X should be done, what it costs, and what breaks when it fails**.

| Junior question | Senior question |
|---|---|
| How do I cache dependencies? | Is the cache saving more time than it costs to store and transfer? |
| How do I add a deployment job? | Who is allowed to run it, on which runner, with which credentials, and how do we undo it? |
| How do I make the pipeline faster? | Which part is on the critical path, and is anyone actually blocked? |
| How do I add security scanning? | Who triages the findings, and what blocks a release? |
| How do I fix this flaky test? | Why does our team tolerate a pipeline it doesn't believe? |

The pattern: seniors optimise for **the system's behaviour under failure and over time**, not for the happy path today.

### 2. From 10 developers to 500

The transition isn't gradual — specific things break at specific sizes.

**At ~10 developers, 5 deploys/day:** a couple of static runners, one hand-written `.gitlab-ci.yml` per project, secrets as project variables, failures noticed by whoever pushed. All of this works, and premature platform-building here is waste.

**What breaks first (~50 developers):** runner queues at peak hours; the same YAML copy-pasted into 15 repositories, now inconsistent; nobody knows which projects have which secrets; pipeline failures nobody owns.

**What breaks next (~150):** cache hit rates collapse because runners each keep local caches; merge conflicts on `main` because changes are validated against stale bases; registry storage costs become visible; a shared template change breaks many projects at once.

**At 500 developers, 500 deploys/day:** CI/CD is a product. It has users, an SLA, a support channel, a deprecation policy, and a budget with per-team attribution.

```text
                     10 devs              500 devs
Runners              static, shared       autoscaled fleets, segmented by trust
Config               per-project YAML     versioned shared components
Secrets              project variables    central management, short-lived credentials
Cache                local to runner      distributed
Merging              push and hope        merge trains
Failures             someone notices      alerting, dashboards, ownership
Cost                 invisible            attributed budget line
Change to shared CI  annoying             an outage for everyone at once
```

**The judgment call:** build the platform slightly *before* you need it, never long before. A four-person startup with a CI/CD platform team has misallocated its entire engineering capacity.

### 3. Tradeoffs you should be able to argue both sides of

**Speed vs thoroughness.** Everything on every commit is slow and gets circumvented. Too little and defects reach production. Resolution: layer it — fast checks on every push, full suites on merge to main, expensive scans (DAST, performance) scheduled.

**Parallelism vs cost and debuggability.** Splitting a 20-minute suite five ways is worth it. Splitting a 40-second one is not.

**Standardisation vs team autonomy.** Shared templates give consistency and one place to fix things; they also make every team a hostage to the platform team's release schedule. Resolution: shared components with pinned versions, so teams upgrade deliberately.

**Automation vs control.** Continuous Deployment maximises flow but requires excellent tests, monitoring and rollback. Manual approval adds safety only if the approver is genuinely informed.

**Monorepo vs multi-repo.** Monorepo: atomic cross-service changes, one pipeline definition — but pipelines must become change-aware or every commit builds everything. Multi-repo: simple independent pipelines — but cross-service changes need coordination and version compatibility management.

**Build in CI vs build in the image.** Reproducible container builds are slower than cached native builds on a warm runner. Usually reproducibility wins, but not always.

> The interview signal isn't which option you pick. It's whether you name the cost of the one you picked.

### 4. Things senior engineers notice (consolidated)

1. A green pipeline means every command exited zero — nothing more.
2. Pipeline speed is a reliability property: slow pipelines get bypassed, and bypassed pipelines protect nothing.
3. A runner is a trust boundary; tags are how you enforce it.
4. Build reproducibility matters more than a build that merely passes.
5. Secrets leak through logs, artifacts, caches and image layers — not just through Git.
6. The deployment system is part of the production system; its downtime blocks incident response.
7. Rollback only exists if the previous artifact is retained, identified, and still compatible with current data.
8. Most CI/CD failures originate outside application code.
9. A pipeline with hundreds of steps is not mature; it's usually unowned.
10. More automation isn't better automation — automating a broken process just runs it faster.
11. "Just re-run it" is an incident report about trust.
12. The build job is the highest-value attack target in the system.
13. Time-to-restore tells you more than deployment success rate.
14. `allow_failure: true` quietly converts a quality gate into decoration.
15. The critical path is the pipeline's real duration; sum-of-jobs is vanity.

---


## Part 3 — System Design Exercise

> **Design a CI/CD platform for a company with 40 microservices, 4 environments, 300 developers, ~200 deployments per day, regulatory audit requirements, and a mandatory rollback capability.**

### How to approach it

Do not start naming tools. Start with requirements, constraints, and what failure costs. Then design. Then state what you traded away. Interviewers are grading the order.

### Requirements

*Functional:* build/test/scan every change; deploy through four environments; audited production approval; rollback to any recent version; support 40 services with different languages.

*Non-functional:* CI feedback under 10 minutes; production deploy under 15 minutes; pipeline availability comparable to production (you can't ship fixes without it); full traceability from release back to commit and approver; secrets never long-lived.

### Design decisions, with reasoning

**Repository strategy — multi-repo, one service each.** 40 services with independent lifecycles and 300 developers means independent pipelines and clear ownership. A monorepo would need sophisticated change-detection to avoid building everything on every commit. *Cost:* cross-service changes need coordination, so we standardise on backward-compatible API evolution.

**Pipeline configuration — shared CI/CD components, pinned by version.** Ten language templates rather than 40 hand-written files. Teams include a pinned version and upgrade deliberately. *Cost:* a platform team owning them, with a deprecation policy. *Why pinned:* an unpinned shared template means one platform commit can break 40 pipelines simultaneously.

**Runner architecture — three segmented fleets:**

```text
Fleet A  general build/test   autoscaled, ephemeral, no prod credentials, runs all MRs
Fleet B  image build          rootless builder, registry write only
Fleet C  deployment           small, hardened, protected branches only, prod credentials
```

Rationale: untrusted code (any merge request) must never execute where production credentials live. *Cost:* more infrastructure to manage than one fleet.

**Secrets — central secret manager plus OIDC federation to the cloud.** Jobs exchange a short-lived GitLab token for temporary cloud credentials; no long-lived keys stored in CI variables. Deployment secrets remain protected and environment-scoped. *Cost:* setup complexity; *benefit:* rotation becomes largely automatic and a leaked token expires in minutes.

**Artifacts — one registry, images tagged by commit SHA, deployed by digest.** Cleanup policies expire untagged and old branch images; anything ever deployed or released is retained indefinitely, because that retention *is* the rollback capability.

**Environments — dev (auto), test (auto on main), staging (auto, full verification), production (manual approval, protected environment, restricted runner).**

**Deployment strategy — rolling by default; canary for the highest-traffic services; blue/green where rollback speed is critical.** Not one strategy for everything: the choice follows downtime tolerance, version coexistence, and available metrics. Database changes follow expand/contract, mandatory, no exceptions — that is what keeps every release reversible.

**Approvals and audit —** protected environments restrict who can deploy; GitLab records who approved, which commit, which artifact, and when; releases tie version names to commits. That chain is the audit evidence, produced as a by-product of the pipeline rather than as separate paperwork.

**Rollback —** explicit job deploying a specified known-good SHA, with verification; exercised on a schedule per service, with recovery time recorded.

**Observability —** pipeline duration p50/p95, queue time, failure rate per job, default-branch success rate, deployment frequency, time-to-restore. Alerting on default-branch failure and on pipeline-system degradation.

**Scale mechanics —** autoscaling runners, distributed cache, `interruptible: true` to cancel superseded pipelines, merge trains on the busiest repositories, cheap checks before expensive ones.

### What this design gives up

- Multi-repo makes atomic cross-service changes harder.
- Pinned shared components mean security fixes propagate slower than forced upgrades would.
- Three runner fleets cost more than one.
- Manual production approval slows delivery relative to continuous deployment — accepted deliberately because of the audit requirement.

**Saying this section out loud is what separates a senior answer from a confident one.**

---


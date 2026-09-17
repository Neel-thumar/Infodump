# Volume 6 — Senior CI/CD Engineering, System Design and Final Revision

**Tool:** GitLab CI/CD

---

## Purpose of this volume

| Goal | What it means here |
|---|---|
| Learning goal | Move from building pipelines to making delivery decisions and defending them |
| Practical goal | Present the finished project as one coherent system |
| Production goal | Design a CI/CD platform for an organisation, with tradeoffs stated |
| Troubleshooting goal | Consolidate the investigation method into something you can run under pressure |
| Interview goal | Handle scenario and system-design questions, not just definitions |

This volume adds few new features. It adds judgment, and it closes the loop.

---

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

## Part 2 — Production Architecture

### 5. The full picture

```text
                        Developer
                            │
                            ▼
                    GitLab Repository
                            │
                    ┌───────┴────────┐
                    ▼                ▼
             Merge Request      Default branch
                    │                │
                    ▼                │
        ┌───────────────────────┐    │
        │  CI PIPELINE          │    │
        │  lint · build · test  │    │
        │  secret · SAST · deps │    │
        └───────────┬───────────┘    │
                    │                │
          BUILD/TEST RUNNER FLEET    │
          (untrusted code, no prod   │
           credentials, ephemeral)   │
                    │                │
                    └────────┬───────┘
                             ▼
                   Build image ONCE
                   tag = commit SHA
                             │
                             ▼
                  Container Registry ◄── container scanning
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
            TEST         STAGING       PRODUCTION
              │              │              ▲
           verify         verify            │
                             │      [ manual approval ]
                             └──────────────┘
                                            │
                                  DEPLOYMENT RUNNER
                                  (protected branches only,
                                   prod credentials, restricted)
                                            │
                                            ▼
                                     Verification
                                  readiness · version
                                  assertion · smoke tests
                                            │
                                  ┌─────────┴─────────┐
                                  ▼                   ▼
                              Monitoring          Rollback
                                                (known-good SHA)
```

Why each component exists, in one line each:

| Component | Exists because |
|---|---|
| Merge request pipeline | Feedback must arrive before merge, not after |
| Build/test runner fleet | Untrusted code must execute somewhere with no path to production |
| Build once, SHA-tagged | The thing tested must be the thing deployed, and be identifiable later |
| Container registry | Artifacts need immutable, versioned, retrievable storage |
| Scanning | Vulnerabilities are cheaper to fix before release than after |
| Environments | Risk staging, configuration separation, and a record of what's where |
| Manual approval | Continuous Delivery's human decision point |
| Deployment runner | Production credentials must never sit where untrusted code runs |
| Verification | A deploy job's exit code says nothing about application health |
| Rollback | Failures are inevitable; recovery time is the variable you control |
| Monitoring | Some failures only appear after the pipeline has finished |

---

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

## Part 4 — The Final Project

What you built, end to end:

```text
1  Developer opens a Merge Request
2  Pipeline: lint (needs: []), build, unit tests with JUnit report,
   secret detection, SAST, dependency scanning
3  Test report widget shows newly failing tests in the MR
4  "Pipelines must succeed" blocks the merge on red
5  Merge to main
6  Image built once, tagged $CI_COMMIT_SHA, pushed to the Container Registry
7  Container scanning on the built image
8  Deploy to TEST (same image) → verify
9  Deploy to STAGING (same image) → verify
10 Manual approval gate on a protected environment
11 Deploy to PRODUCTION via the restricted deployment runner — same image
12 Verification: readiness wait, version assertion, smoke tests
13 Release recorded, tying version → commit → image → deployment
14 Rollback job available, tested, with a known recovery time
```

### How to present it in an interview

Don't list features. Tell it as a chain of problems and solutions:

> "The pipeline builds the image exactly once and tags it with the commit SHA, then promotes that identical image through test, staging and production. I did it that way because rebuilding per environment means the artifact you tested isn't the one you released — dependencies and base images move between builds. Tagging by SHA is also what makes rollback possible: rolling back is just deploying a previous known-good image, which I've actually run and timed rather than only documented. The production job runs on a separate restricted runner, because the build runners execute code from any merge request and must not have production credentials."

Four things happened in that paragraph: a decision, its reasoning, the failure it prevents, and evidence you actually did it. That's the shape to aim for.

### Questions an interviewer will probe

- "What's the slowest part, and what would you do about it?" — know your critical path.
- "How do you know production is healthy after deploy?" — readiness, version assertion, smoke tests.
- "What happens if the deploy runner is compromised?" — blast radius, credential scope, what you'd rotate.
- "Show me the rollback." — the job, the SHA, the measured recovery time.
- "What would you change with three more months?" — have a real answer: artifact signing, canary for the busiest path, distributed cache, migration automation.

---

## Part 5 — Final Revision

### Complete CI/CD mental model

```text
Code → Commit → Pipeline → Runner → Build → Test → Artifact → Deploy → Verify → Release
                                                                            │
                                                              Monitor → Rollback if needed
```

```text
Pipeline
  ├── Stage
  │     ├── Job ── executed by a Runner in an isolated workspace
  │     └── Job
  └── Stage
        └── Job
```

### What you must remember

1. **Jobs don't share a filesystem.** Artifacts pass data forward; cache only speeds things up.
2. **Exit codes decide pass/fail**, not log text.
3. **Build once, promote many.** The thing tested must be the thing deployed.
4. **Deploy by immutable reference** (commit SHA or digest), never `:latest`.
5. **Masking prevents accidents; scoping prevents attacks.**
6. **A runner that reaches production must never run untrusted code.**
7. **A deploy job's success is a claim about your script, not your application.**
8. **Rollback is designed in advance and proven by execution.**
9. **Schema changes are the real constraint on rollback** — expand/contract.
10. **Identify the failure layer before investigating it.**

### Production checklist

- [ ] `workflow:rules` prevents duplicate pipelines
- [ ] "Pipelines must succeed" enforced on merge requests
- [ ] Protected branches on `main` and release branches
- [ ] Build happens once; the same artifact promotes across environments
- [ ] Images tagged by commit SHA; deployment by SHA or digest
- [ ] Registry cleanup policy retains deployed and released images
- [ ] Artifact `expire_in` set everywhere; test reports use `when: always`
- [ ] Every environment declared, with history visible
- [ ] Protected environments restrict who can deploy to production
- [ ] Verification step after every deployment
- [ ] Rollback job exists, is tested, and its recovery time is known
- [ ] Releases recorded with traceability to commit and artifact
- [ ] Every job has a `timeout`; `retry` limited to infrastructure failure classes
- [ ] `interruptible: true` cancels superseded pipelines
- [ ] Pipeline duration, queue time and failure rate are monitored

### Security checklist

- [ ] No secrets in Git, ever — and any that were there are rotated, not just deleted
- [ ] Deployment credentials: protected + masked + environment-scoped
- [ ] Short-lived credentials (OIDC/federation) preferred over stored static keys
- [ ] Build/test runners have no production credentials or network path
- [ ] Deployment runner restricted by tag, protected branches only
- [ ] Ephemeral, isolated executors; no shared shell runners for untrusted code
- [ ] No privileged containers unless genuinely unavoidable
- [ ] Fork/MR pipelines cannot access protected variables
- [ ] `.gitlab-ci.yml` changes require review (CODEOWNERS)
- [ ] Included templates and components pinned to versions
- [ ] Secret detection, SAST, dependency and container scanning enabled
- [ ] A defined policy for what blocks a release, and a named triage owner
- [ ] Scheduled rebuilds so base-image CVEs are caught without source changes
- [ ] Images run as non-root, built multi-stage

### Troubleshooting checklist

```text
Read the first 10 log lines   → which runner, executor, image
Identify the layer            → Git · trigger · config · runner · environment ·
                                dependencies · build · test · artifact · registry ·
                                credentials · deployment · application · infrastructure
State what you know / don't know
Decide what evidence distinguishes the candidates
Collect exactly that evidence
Read the full error, not the first "error" you see
Change one thing at a time
Verify the fix, then prevent recurrence
```

Quick signatures worth memorising:

| Symptom | Most likely |
|---|---|
| Job pending forever | Tag mismatch or no available runner |
| Works locally, fails in CI | Environment, missing files, or unpinned dependencies |
| Artifact missing downstream | Wrong path, earlier stage, or `needs:` restriction |
| Auth fails on branches, works on main | Protected variable, unprotected branch |
| Same commit, inconsistent results | Flaky test, shared state, or runner drift |
| Deploy green, app down | No verification; possibly wrong image deployed |
| Rollback fails | Image expired, or schema no longer compatible |

### Senior engineer checklist

- [ ] I can state the cost of every optimisation I've added
- [ ] I know my pipeline's critical path, not just its total duration
- [ ] I know who can deploy to production and with what credentials
- [ ] I have measured recovery time, not estimated it
- [ ] Nothing in my pipeline hides a failure (`|| true`, blanket `retry`, unowned `allow_failure`)
- [ ] Someone owns this pipeline by name
- [ ] The scanning findings have a triage owner and a blocking policy
- [ ] I could explain every line of the YAML to a new joiner

### Common mistakes, consolidated

Cache used to pass build output · `node_modules` cached directly · missing `when: always` on test reports · blanket `retry` hiding flaky tests · unprotected deployment variables · `:latest` in production · rebuilding per environment · treating a green deploy job as a healthy app · health endpoints that always return 200 · irreversible migrations shipped with app changes · documented-but-never-run rollback · registry cleanup deleting the rollback target · one runner fleet for everything · scanning with nobody triaging · unpinned shared includes · optimising jobs off the critical path · a 300-line YAML nobody dares touch.

---

## Interview revision

### Fundamentals
- What is CI? *Frequent integration plus automatic verification — the batch size matters as much as the automation.*
- What is CD? *Keeping main always deployable; Delivery stops at a human approval, Deployment doesn't.*
- What's a pipeline / stage / job / runner?
- What's an artifact, and how does it differ from cache?
- Why does pipeline config belong in the repository?

### Practical
- Write a pipeline that builds, tests, and publishes a report.
- How do jobs pass data between each other?
- How do you store and scope secrets?
- How do you build and push a container image from CI, and what are the security tradeoffs?
- How do `rules:` and `workflow:` differ?
- What does `needs:` change?

### Troubleshooting
- A job is stuck pending — what do you check, in what order?
- Tests pass locally and fail in CI — why?
- An artifact disappeared — five things to check.
- Auth works on main but fails on feature branches.
- The pipeline takes 40 minutes.
- Same commit, different results.

### Production
- Design CI/CD for 100 developers.
- How do you secure runners?
- How do you reduce pipeline duration, in priority order?
- How do you design rollback?
- How do you deploy to production safely?

### Scenario-based

**"Production is broken after a release. Walk me through the next 15 minutes."**
Confirm the symptom and its scope. Identify the currently deployed version from environment history. Decide roll back or roll forward — default to rolling back. Run the rollback job with the last known-good SHA. Verify readiness and that the version endpoint reports the expected SHA. Communicate. Only then diagnose the original failure, and afterwards ask why verification didn't catch it before users did.

**"A developer says the pipeline is flaky and asks for automatic retries."**
Push back, with reasoning rather than refusal. Retries hide the failure and make green meaningless, which costs far more than the inconvenience. Identify whether it's one test or random jobs, quarantine the offender so the team isn't blocked, and fix or delete it. Retry only infrastructure failure classes.

**"Your build runner was compromised. What's the blast radius?"**
Everything that runner could reach: source code, any credentials in its environment, registry write access — meaning attacker-controlled artifacts entering the trusted promotion path. Response: revoke and rotate every credential it had access to, audit artifacts built during the window, rebuild and republish from a clean fleet. This is precisely why production credentials live only on a separate restricted runner.

**"Two teams need different pipeline behaviour but share a template."**
Parameterise the component rather than forking it, keep both teams on pinned versions so neither is broken by the other's needs, and if the requirements genuinely diverge, split into two components with a deprecation path. Forking silently is how you end up with 40 inconsistent pipelines again.

**"The team wants to move from manual approval to continuous deployment."**
It's an outcome of maturity, not a switch. Prerequisites: automated tests you trust, verification after deploy, monitoring that detects failure faster than users report it, a proven rollback with a known recovery time, and small frequent changes. Meet those and removing the button is safe. Remove it first and you've deleted your last safety net.

### System design questions
- CI/CD for 40 microservices, 4 environments, 300 developers, audit requirements.
- Migrate 200 projects from Jenkins to GitLab CI without stopping delivery.
- Reduce median pipeline time from 35 to 10 minutes across an organisation.
- Design secrets management for a company that currently stores static cloud keys in CI variables.
- Design CI/CD for a regulated environment with change windows and mandatory approvals.

---

## What to learn next

**Immediately useful:**
- **Kubernetes** — if you deploy there, deployment strategies become concrete objects rather than concepts.
- **Infrastructure as Code** (Terraform/OpenTofu) — environments become reproducible; the same pipeline discipline applies to infrastructure.
- **Observability** — metrics, logs, traces, SLOs. Verification and canary are only as good as your signal.

**To deepen delivery engineering:**
- **GitOps** — the desired state lives in Git, and an agent reconciles the cluster toward it. Changes deployment's shape: the pipeline updates a manifest rather than pushing to production directly.
- **Progressive delivery and feature flags** — decoupling deploy from release.
- **Supply-chain security** — SBOMs, artifact signing, provenance attestations, SLSA levels.
- **Advanced GitLab** — CI/CD components and the catalog, merge trains, dynamic child pipelines, parent-child architectures for monorepos.

**The discipline underneath:** DORA metrics, *Accelerate*, and *Continuous Delivery* by Humble and Farley — which is where most of this volume's reasoning originally comes from.

---

## Where you started, and where you are

Volume 0 asked: how does software get from a developer's laptop to a reliable production release?

You should now be able to say: it moves through a pipeline defined as code and versioned with the application; executed by runners whose trust boundaries you chose deliberately; producing one immutable artifact that is tested once and promoted unchanged through environments; deployed by a strategy matched to the failure cost; verified independently rather than assumed; recorded so that any release traces back to a commit and an approver; and reversible by a rollback path you have actually run and timed.

And when it breaks — which it will — you identify the layer before you dig.

That's the whole discipline. The GitLab keywords are just how you wrote it down this year.

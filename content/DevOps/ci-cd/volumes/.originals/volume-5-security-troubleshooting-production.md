# Volume 5 — Security, Troubleshooting and Production CI/CD

**Tool:** GitLab CI/CD

---

## Purpose of this volume

| Goal | What it means here |
|---|---|
| Learning goal | Understand the pipeline as an attack surface and as a system that fails in layers |
| Practical goal | Add scanning, harden secrets, and diagnose deliberately broken pipelines |
| Production goal | Runner architecture, isolation, scaling, observability, cost |
| Troubleshooting goal | A repeatable investigation method that works on failures you've never seen |
| Interview goal | Explain pipeline security concretely, and reason through a failure out loud |

---

## Part 1 — Security

### 1. Why the pipeline is a high-value target

Your pipeline has, in one place:

- Read access to all source code
- Write access to the artifact registry everyone downstream trusts
- Credentials for test, staging, and production
- Network access into environments developers can't reach directly
- The ability to execute arbitrary commands

An attacker who controls the build doesn't need to break production directly. They put something in the artifact, and your own trusted promotion process delivers it. That's the supply-chain problem in one sentence:

> **Everything downstream trusts the build. So the build is the thing worth attacking.**

### 2. How secrets actually leak

Nobody commits a password on purpose. Secrets escape through paths that all look harmless.

| Path | How it happens |
|---|---|
| **Printed in logs** | `set -x` in a script, a debug `env` dump, a tool echoing its own arguments, a curl command with a token in the URL |
| **Unprotected variables** | Any branch pipeline can read them, so anyone who can push a branch can exfiltrate them |
| **Error messages** | A failing HTTP client printing the full request, including headers |
| **Artifacts** | A generated `.env`, a kubeconfig, or a build log saved as an artifact and downloadable by anyone with project access |
| **Cache** | A credentials file inside a cached directory, restored into other jobs |
| **Baked into images** | `ARG`/`ENV` secrets that persist in image layers — deleting the file in a later layer doesn't remove it |
| **Third-party CI code** | An included template or action from a moving reference that changes underneath you |
| **Wide scope** | A group-level variable inherited by fifty projects, most of which have no business with it |

Masking is a safety net with real holes: base64 the value, split it, or transform it, and masking no longer matches. So:

> **Masking prevents accidents. Scoping prevents attacks.**

### 3. Practical secret hygiene

**Scope narrowly.** Project-level over group-level. Environment-scoped where possible. A test-environment credential should not exist in a production job, and vice versa.

**Protect everything that deploys.** Protected variable + protected branch + protected environment + a tagged, restricted runner. Any one of those alone is weak; together they close the path.

**Short-lived over long-lived.** GitLab's registry credentials expire with the job — that's the model to copy. Prefer OIDC/workload-identity federation with cloud providers over stored static keys: the job exchanges a short-lived GitLab token for temporary cloud credentials, so there is no long-lived secret sitting in settings at all. This is where mature setups have moved.

**Never echo. Check emptiness instead:**

```bash
- if [ -z "$DEPLOY_TOKEN" ]; then echo "DEPLOY_TOKEN not available"; exit 1; fi
```

**Rotate.** On staff changes, on any suspicion, and on a schedule. If rotation requires a person who understands a 12-step process, it won't happen — automate it.

**Assume compromise on exposure.** A secret printed in a log is compromised, even if the log is private and you delete it. Rotate it. "Probably fine" is not a security posture.

### 4. Forks and merge requests

The scenario that surprises people: an outside contributor opens a merge request. Your pipeline runs their code — including their changes to `.gitlab-ci.yml`.

Controls that matter:

- **Protected variables** are unavailable to fork pipelines and unprotected branches. This is the main defence.
- **Merge request pipelines for forks** should require approval before running, for public or externally contributed projects.
- **Protected branches** prevent direct pushes to `main` and make CI a required gate rather than advice.
- **Review `.gitlab-ci.yml` changes like code**, because a change to the pipeline is a change to what runs with your credentials. CODEOWNERS on that file is a cheap, effective control.

### 5. Runner security architecture

The most important structural decision in this volume.

```text
        ┌──────────────────────────────────────┐
        │  BUILD / TEST FLEET                  │
        │  - runs any branch, any MR           │
        │  - runs untrusted contributed code   │
        │  - NO production credentials         │
        │  - ephemeral, isolated, autoscaled   │
        └──────────────────────────────────────┘

        ┌──────────────────────────────────────┐
        │  DEPLOYMENT RUNNER                   │
        │  - tagged: production-deploy         │
        │  - only protected branches           │
        │  - holds production credentials      │
        │  - small, hardened, tightly audited  │
        └──────────────────────────────────────┘
```

The rule behind it:

> **A runner that can reach production must never execute code that anyone can submit.**

Supporting practices:

- **Ephemeral runners.** Destroy and recreate per job. Nothing persists, so nothing leaks between jobs and nothing drifts.
- **Avoid shell executors for anything shared.** No isolation, and state accumulates.
- **Avoid privileged containers** where possible — the Volume 3 DinD discussion is the common example. Rootless builders remove the need.
- **Network segmentation.** Build runners don't need routes into production. Remove them.
- **Least privilege on the credentials themselves.** A deploy token that can only deploy is far better than an admin key, whatever else goes wrong.

### 6. Scanning in the pipeline

GitLab ships CI templates for scanning. Add them with `include:`:

```yaml
include:
  - template: Jobs/Secret-Detection.gitlab-ci.yml
  - template: Jobs/SAST.gitlab-ci.yml
  - template: Jobs/Dependency-Scanning.gitlab-ci.yml
  - template: Security/Container-Scanning.gitlab-ci.yml
```

What each one answers:

| Scan | Question | Typical engine |
|---|---|---|
| **Secret detection** | Did we commit a credential? | Gitleaks |
| **SAST** | Are there insecure patterns in our source? | Semgrep-based analyzers |
| **Dependency scanning** | Do our third-party packages have known CVEs? | Advisory databases + SBOM |
| **Container scanning** | Does the image's OS/packages have known CVEs? | Trivy |
| **DAST** | Does the running application have exploitable issues? | OWASP ZAP |

**Tier reality, stated honestly:** availability differs by GitLab tier and changes between releases. Broadly, SAST and secret detection are available across tiers with the advanced engines and the aggregated Vulnerability Report in Ultimate; container scanning runs in lower tiers with JSON/SBOM reports as artifacts, while the Vulnerability Report view is an Ultimate feature; DAST and several dashboard features are Ultimate. **Check the current docs for your tier rather than trusting any tutorial**, including this one — this is exactly the kind of detail that shifts release to release.

Where scans belong in the pipeline:

```text
Fast, cheap, early:   secret detection, SAST, dependency scanning  (on every MR)
After image build:    container scanning
Against a deployment: DAST (usually staging, usually scheduled — it's slow)
```

**The part that actually matters, and that tools cannot do for you:**

- **Decide what blocks.** Everything blocking on every CVE is unworkable and gets disabled within a month. A common starting policy: secret detection blocks always (a leaked credential is binary); critical/high vulnerabilities block releases; everything else is tracked with an owner and a due date.
- **Findings need triage, not accumulation.** Ten thousand unreviewed findings is the same as zero scanning, with extra cost.
- **Rebuild on a schedule.** Your base image accrues CVEs while your source code sits unchanged. A weekly scheduled pipeline that rebuilds and rescans catches this.
- **Secret detection is retrospective.** It tells you a credential is in Git history — which means it is already compromised. Rotate first, then clean history.

### 7. Artifact integrity

Signing and provenance — proving *this artifact came from this pipeline, from this commit* — is where supply-chain security is heading (SBOM generation, artifact signing, attestations). It's worth knowing the direction even if you don't implement it yet: the goal is that a deployment target can verify an image's origin instead of trusting that whatever is in the registry got there legitimately.

Start with the basics that give most of the value: immutable tags, restricted registry write access, and a build environment that isn't shared with untrusted code.

---

## Part 2 — Troubleshooting

### 8. The method

Beginners debug by pattern-matching to failures they've seen. That fails on anything new. The method below works on failures you've never encountered, which is the point.

```text
What do we know?                    facts from the log, not assumptions
        ↓
What do we NOT know?                name the gap explicitly
        ↓
Which layer could have failed?      narrow before you dig
        ↓
What evidence would distinguish?    what would prove/disprove each candidate
        ↓
Which command or log gives it?      go get exactly that
        ↓
What does the output actually say?  read it; don't skim for the word "error"
        ↓
What do we test next?               one change at a time
```

Two disciplines that separate good debuggers from frustrated ones:

**Change one thing at a time.** Three simultaneous changes that fix the problem teach you nothing and leave two unnecessary changes behind.

**Read the whole error.** The real cause is frequently three lines above the line that caught your eye, or in the first failure of a cascade rather than the last.

### 9. The failure-layer model

```text
Git               repository, access, LFS, submodules
 ↓
Trigger           was a pipeline even created? workflow rules?
 ↓
Configuration     YAML validity, rules evaluation, includes
 ↓
Runner            availability, tags, executor, capacity
 ↓
Environment       image contents, OS, tools, env vars
 ↓
Dependencies      registries, lockfiles, network, proxies
 ↓
Build             compilation, resources, disk
 ↓
Test              assertions, flakiness, test infrastructure
 ↓
Artifact          produced? uploaded? path? expiry?
 ↓
Registry          auth, permissions, quota, storage
 ↓
Credentials       present? protected? scoped? expired?
 ↓
Deployment        target reachable, permissions, manifests
 ↓
Application       startup, configuration, dependencies
 ↓
Infrastructure    network, DNS, certificates, capacity
```

**Locate the layer before investigating.** Most wasted debugging time is spent examining the wrong layer thoroughly. The job log's first ten lines usually identify the layer for free: which runner, which executor, which image, whether the clone succeeded.

### 10. Worked scenarios

#### A. Job stuck in pending

**Known:** pipeline created, job never starts. **Unknown:** whether any runner can take it. **Layer:** Runner.

Check runner availability for the project → compare job tags against runner tags (a typo means no match, ever) → check runners are online → check quota/shared-runner settings → check whether the job needs a protected-branch runner while running on an unprotected branch.

**Prevention:** don't tag jobs that don't need routing; document the tag vocabulary.

#### B. Tests pass locally, fail in CI

**Layer:** Environment or dependencies — rarely the code.

Three differences, always: tooling installed, files available, dependency versions resolved. Temporarily add `printenv | sort`, `which <tool>`, `ls -la`, and the resolved dependency versions to the job. Compare with local.

Also consider: CI is often slower, more parallel, and has different timezone/locale settings — all of which expose latent test assumptions.

**Prevention:** pinned images, lockfile installs, nothing required that isn't in the repository or the image.

#### C. Artifact missing downstream

Producing job passed? → `Uploading artifacts` in the log, or `no matching files`? → is the path relative to `CI_PROJECT_DIR`? → is the consumer in a later stage? → does the consumer use `needs:` (restricting which artifacts arrive)? → has `expire_in` elapsed?

**Prevention:** `ls -la` the artifact directory at the end of the producing job.

#### D. Authentication fails in CI only

Two dominant causes: the runner has none of your laptop's ambient credentials, and **the variable is protected while the branch is not** — so the variable silently doesn't exist and an empty value is sent.

Diagnostic signature: works on `main`, fails on feature branches → protection scoping, every time.

#### E. Pipeline takes 40 minutes

Measure first. Separate **queue time** from **execution time** — if jobs wait for runners, no YAML change helps. Then find the critical path (the longest chain, not the sum). Then: `needs: []` on independent jobs, fix repeated dependency installs, use `rules:` to skip irrelevant work, and only then parallelise.

**Also ask whether the pipeline should be doing all of it.** A full container build and deploy on a README change is waste that no optimisation fixes.

#### F. Flaky pipeline

Same commit, different results. Determine whether it's always the same test (ordering, timing, shared state, real network calls) or random jobs (infrastructure, a shared external resource, a runner with leftover state — check the log header for which runner).

**Never fix flakiness with `retry:`** on test failures. Quarantine, then fix or delete. A pipeline that people don't believe is worse than no pipeline, because it converts a safety system into noise.

#### G. Deploy succeeded, application down

Covered in Volume 4. In one line: the deploy job reports on the deploy command. Verify readiness, assert the live version matches the deployed commit, run smoke tests.

### 11. Observability of the pipeline itself

You cannot improve what you don't measure. Worth tracking:

| Metric | Why |
|---|---|
| Pipeline duration (p50 and p95) | p95 is what people actually feel |
| Queue time | Distinguishes capacity problems from configuration problems |
| Failure rate by job | Finds the flaky and the fragile |
| Success rate on the default branch | The health of your main line |
| Deployment frequency | Delivery throughput |
| Time to restore | Rollback capability, in practice |
| Runner utilisation | Capacity planning and cost |

The last two of those are DORA metrics, and they're the pair that best predicts whether a delivery system is actually working.

**The signal people ignore:** when developers start saying "just re-run it", your pipeline has stopped being trusted. Treat that sentence as an incident report.

---

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

## Common mistakes

- Treating scanning as done once the jobs are added, without a triage owner or a blocking policy.
- A single runner fleet with production credentials that runs every merge request.
- Group-level variables inherited by projects that have no need for them.
- Debugging the application layer when the failure is in the environment layer.
- Fixing flakiness with retries.
- Optimising jobs that aren't on the critical path.
- No cancellation of superseded pipelines, so you pay for work nobody wants.
- Assuming a deleted log means an exposed secret is safe.

---

## Things senior engineers notice

1. **The pipeline is production infrastructure.** If it's down, you can't ship a fix during an incident. Its availability needs the same seriousness as the application's.
2. **Scoping beats masking, always.** Masking is a guard against accidents; scoping is a control against intent.
3. **A runner is a trust boundary, and tags are how you enforce it.** The question "which runner may take this job?" is really "which jobs may touch production?".
4. **Scanning without triage is expensive theatre.** The scanner's output is the start of the work, not the end.
5. **"Just re-run it" is a cultural symptom of an unreliable pipeline**, and it erodes every safety guarantee the pipeline was built to provide.
6. **Most CI/CD failures live outside application code** — environment, credentials, capacity, network. Identify the layer before you dig.
7. **Secret detection findings are already-compromised credentials.** Rotation comes before history cleanup.
8. **Shared templates are a blast-radius decision.** Unpinned includes mean someone else's commit can break 200 pipelines at once.
9. **Time-to-restore and deployment frequency tell you more about a delivery system than any pipeline diagram.**
10. **The cheapest security control here is code review on `.gitlab-ci.yml`**, because that file decides what runs with your credentials.

---

## Interview questions

**Q: How do you secure a CI/CD pipeline?**
Treat it as production infrastructure with broad access. Scope secrets to the narrowest project and environment, mark deployment credentials protected so they only exist on protected branches and protected environments, and prefer short-lived credentials — OIDC federation with cloud providers — over stored static keys. Separate runner fleets so that runners with production access never execute untrusted or contributed code, use ephemeral isolated executors, and avoid privileged containers. Review changes to the pipeline configuration like code, since that file determines what runs with those credentials. Add scanning for secrets, source, dependencies, and images, with a defined policy on what blocks a release.

**Q: How can a secret leak from a pipeline even if it's never committed?**
Through logs (debug output, tools echoing arguments, error messages containing headers), through artifacts or caches that capture a generated credentials file, through image layers if it was passed at build time, through unprotected variables readable by any branch pipeline, and through overly broad group-level scoping. Masking doesn't stop a script that transforms the value before printing it, which is why scoping rather than masking is the real control.

**Q: Why should deployment runners be separate from build runners?**
Because a runner executing a job effectively grants that job everything the runner can reach — its filesystem, environment, and network. Build and test runners must execute code from arbitrary branches and merge requests, which is untrusted. If those same runners hold production credentials, anyone who can open a merge request can potentially extract them. Separating the fleets, restricting the deployment runner by tag to protected branches and protected environments, keeps untrusted execution away from production access.

**Q: Walk me through debugging a pipeline failure you've never seen before.**
Start from the log's first lines to establish which runner, executor, and image ran the job, which usually identifies the layer. State what's known and what isn't, then list candidate layers — Git, config, runner, environment, dependencies, build, test, artifact, registry, credentials, deployment, application, infrastructure — and decide what evidence would distinguish between them. Collect exactly that evidence, read the full error rather than skimming, and change one thing at a time so the fix is attributable. If it reproduces intermittently, that itself is evidence pointing at shared state, timing, or infrastructure.

**Q: How would you reduce a 40-minute pipeline?**
Measure first and separate queue time from execution time, because waiting for runners is a capacity problem that no configuration change fixes. Then identify the critical path — the longest dependency chain — since work off it doesn't affect total duration. Remove artificial waiting with `needs:`, eliminate repeated dependency installation with proper caching, skip work that isn't relevant to the change with `rules:`, cancel superseded pipelines with `interruptible`, run cheap checks before expensive ones, and only then consider parallelism, which costs capacity and debuggability.

**Q: What changes about CI/CD when the organisation grows tenfold?**
It becomes a platform with internal customers rather than a per-project file. Pipeline configuration moves into versioned shared templates or components with a deprecation policy, runners become autoscaling fleets segmented by trust level, secrets move to central management with short-lived credentials and automated rotation, cost becomes a tracked and attributed budget line, and pipeline reliability itself needs monitoring, alerting, and ownership — because a failure in a shared template is now an outage for every team simultaneously.

---

## Volume 5 checklist

- [ ] Scanning runs in my pipeline, and I've decided what blocks a release
- [ ] Deployment credentials are protected, scoped, and short-lived where possible
- [ ] Build runners and deployment runners are separated by trust
- [ ] `.gitlab-ci.yml` changes require review
- [ ] I can name the failure layers in order
- [ ] I've diagnosed at least two deliberately broken pipelines using the method, not guesswork
- [ ] I know my pipeline's p95 duration and queue time
- [ ] I have never fixed a flaky test with `retry:`

**Next:** Volume 6 — Senior CI/CD Engineering, system design, the final project walkthrough, and full revision.

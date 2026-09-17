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

## 1. The problem: a job starts with nothing

Every job gets a clean workspace containing only the repository at that commit. Which means:

```text
Job: compile          Job: unit-tests
─────────────         ──────────────
clone repo            clone repo
npm ci        ← slow  npm ci          ← slow, AGAIN
npm run build         npm test
produces ./dist       ./dist is GONE
```

Two different problems are hiding here, and beginners merge them into one. Separate them now:

| Problem | Nature | GitLab answer |
|---|---|---|
| The **output** of one job is needed by a later job | Correctness — the pipeline is wrong without it | **Artifacts** |
| **Downloading dependencies** repeatedly is slow | Performance — the pipeline works, just slowly | **Cache** |

Getting these two confused is probably the single most common GitLab CI mistake.

---

## 2. Artifacts vs cache

### Artifacts

An artifact is **a file or folder a job produces, uploaded to GitLab, and made available to later jobs and to you**.

```yaml
compile:
  stage: build
  script:
    - npm ci
    - npm run build
  artifacts:
    paths:
      - dist/
    expire_in: 1 week
```

Properties that matter:

- **Uploaded to GitLab**, not left on the runner. Downloadable from the UI.
- **Automatically downloaded** by jobs in *later* stages by default.
- **Versioned to the pipeline** — this is the output of *this* commit.
- **Expire** after a configured time (disk is not free).
- This is the thing you will eventually deploy. Artifacts are how the delivery chain is built.

### Cache

A cache is **a folder saved and restored between jobs and pipelines to avoid repeating slow work**.

```yaml
default:
  cache:
    key:
      files:
        - package-lock.json
    paths:
      - .npm/
```

Properties that matter:

- **A performance optimisation, nothing more.**
- **May be missing.** A new runner, an evicted cache, a changed key — the job must still work without it.
- Shared across pipelines, often per-runner.
- Keyed. A cache keyed on your lockfile is invalidated automatically when dependencies change — which is exactly what you want.

### The rule to remember

> **If the pipeline breaks when the thing is missing, it is an artifact. If the pipeline is only slower, it is cache.**

| | Artifact | Cache |
|---|---|---|
| Purpose | Pass output forward, keep results | Speed up repeated work |
| If missing | Pipeline is broken | Pipeline is slower |
| Scope | One pipeline | Across pipelines |
| Stored | GitLab | Runner/shared storage |
| Typical content | `dist/`, `.jar`, test reports, container digests | `node_modules`, `.m2/`, `.nuget/`, pip cache |
| Downloaded by later jobs | Yes, automatically | Only if the key matches |

Never cache your build output and never use artifacts for `node_modules`. Both "work" on a good day and produce bizarre failures on a bad one.

---

## 3. The project: a real CI pipeline

Building it up piece by piece. This is the same project from Volume 1, now getting serious.

```yaml
stages:
  - build
  - test

default:
  image: node:22
  cache:
    key:
      files:
        - package-lock.json
    paths:
      - .npm/
    policy: pull

variables:
  npm_config_cache: "$CI_PROJECT_DIR/.npm"

install-and-build:
  stage: build
  cache:
    key:
      files:
        - package-lock.json
    paths:
      - .npm/
    policy: pull-push        # this job may WRITE the cache
  script:
    - npm ci --prefer-offline
    - npm run build
  artifacts:
    paths:
      - dist/
    expire_in: 1 week

unit-tests:
  stage: test
  script:
    - npm ci --prefer-offline
    - npm test -- --reporter=junit --outputFile=junit.xml
  artifacts:
    when: always
    reports:
      junit: junit.xml
    expire_in: 1 week

lint:
  stage: test
  script:
    - npm ci --prefer-offline
    - npm run lint
```

Read what each decision is doing:

- **`default:`** sets values inherited by every job — image and cache. Less repetition, one place to change.
- **`policy: pull`** on the default cache means most jobs only read the cache. Only the build job writes it. Multiple jobs writing the same cache key concurrently is a classic source of corrupted, racing caches.
- **`npm_config_cache`** points the package manager's cache inside the project directory, because **cache paths must be inside the project workspace.** A cache path outside it is silently useless. (Every ecosystem has this: `MAVEN_OPTS -Dmaven.repo.local=...`, `PIP_CACHE_DIR`, `NUGET_PACKAGES`.)
- **`artifacts: reports: junit`** does something special — see below.
- **`when: always`** on the test artifacts: **collect the test report even when the job fails.** Without this you lose the report in exactly the situation where you need it. This single line saves more debugging time than most optimisations.

### Test reports

`artifacts:reports:junit` tells GitLab to parse the file, not just store it. The result:

- A **Tests** tab on the pipeline showing pass/fail counts and failure messages.
- In a **merge request**, a widget listing which tests newly failed compared to the target branch.

That second one is the real value. The reviewer sees "these 3 tests broke" instead of "the pipeline is red, go read 2000 lines of log". CI is about feedback quality, not just automation.

### Observe

Push this and check:

- Build job: `Uploading artifacts... dist/: found N matching files`
- Test job log: `Restoring cache` near the start, and on the second run a cache hit that makes `npm ci` noticeably faster
- Pipeline page: a **Tests** tab
- Job page: a **Browse** / **Download** button for artifacts

---

## 4. Variables

Variables are how you avoid hardcoding, and how secrets enter a pipeline without entering Git.

### Where they come from

| Source | Defined in | Use for |
|---|---|---|
| Predefined | GitLab, automatically | Commit SHA, branch, project paths, registry address |
| In `.gitlab-ci.yml` | `variables:` | Non-secret config: app name, build flags, versions |
| Project/Group settings | **Settings → CI/CD → Variables** | **Secrets**: tokens, passwords, keys |
| Manual run | Pipeline run form | One-off overrides |

Predefined ones you will use constantly:

| Variable | Meaning |
|---|---|
| `CI_COMMIT_SHA` | Full commit hash — the only truly unique build identity |
| `CI_COMMIT_SHORT_SHA` | Short form, good for tags |
| `CI_COMMIT_REF_NAME` | Branch or tag name |
| `CI_PROJECT_DIR` | Working directory on the runner |
| `CI_PIPELINE_ID` / `CI_JOB_ID` | Run identifiers |
| `CI_DEFAULT_BRANCH` | `main`, without hardcoding it |
| `CI_REGISTRY`, `CI_REGISTRY_IMAGE` | Container registry address and image path (Volume 3) |

### Secrets: the two flags that matter

When you add a variable in project settings:

- **Masked** — GitLab replaces the value with `[MASKED]` in job logs. Requires the value to meet certain format rules (single line, minimum length, limited character set); values that don't qualify silently stay unmasked, so verify.
- **Protected** — the variable is only available to jobs running on **protected branches or protected tags**.

Why "protected" is the important one:

```text
Someone forks your project, or pushes a branch, and adds this to .gitlab-ci.yml:

  script:
    - echo $PROD_DEPLOY_TOKEN | base64      # masking won't catch this

If PROD_DEPLOY_TOKEN is NOT protected, that pipeline has your production credential.
If it IS protected, the variable simply does not exist in that job.
```

Read that twice. **Masking is a convenience to prevent accidental printing. Protection is the actual security control.** Anyone who can run a pipeline can run arbitrary commands with access to every unprotected variable.

Rules to follow from now on:

1. Never commit a secret to Git — history is forever, and removing it requires rewriting history everywhere.
2. Every deployment credential: **protected + masked**.
3. Protect the branches that matter (`main`, release branches) in **Settings → Repository → Protected branches**.
4. Assume anything a job can read, a job can exfiltrate.

---

## 5. Rules — deciding when jobs run

Without conditions, every job runs on every pipeline. That is wasteful and often wrong: you do not want to deploy from a feature branch.

`rules:` evaluates conditions in order, top to bottom, and the **first match wins**.

```yaml
deploy-test:
  stage: deploy
  script:
    - ./deploy.sh
  rules:
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH
      when: on_success
    - when: never
```

Common building blocks:

```yaml
# Only on merge requests
rules:
  - if: $CI_PIPELINE_SOURCE == "merge_request_event"

# Only on the default branch
rules:
  - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH

# Only when a tag is pushed
rules:
  - if: $CI_COMMIT_TAG

# Only when relevant files changed
rules:
  - changes:
      - src/**/*
      - package-lock.json

# Manual, and not required for the pipeline to succeed
rules:
  - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH
    when: manual
    allow_failure: true
```

`when:` values: `on_success` (default), `always`, `never`, `manual`, `delayed`.

Two traps:

- **`when: manual` without `allow_failure: true`** *blocks* the pipeline until someone clicks. That is correct for a deployment gate, and wrong for an optional utility job. Decide which one you mean.
- **`changes:` is unreliable on some pipeline sources** (for example when there is no clear previous commit to compare against, such as a brand-new branch or a scheduled run). Don't use it as a safety control — use it as an optimisation.

> `only:` / `except:` is the older syntax you will find in existing projects and old tutorials. It still works, but it is not where new features go, and it cannot express what `rules:` can. Write new pipelines with `rules:`. Recognise `only:` when you inherit it.

### Merge request pipelines

The workflow you actually want: **run CI on the merge request, against the proposed change**.

```yaml
workflow:
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH
    - if: $CI_COMMIT_TAG
    - when: never
```

`workflow:` controls whether a **pipeline is created at all**. The rules above mean: create pipelines for merge requests, for the default branch, and for tags — and for nothing else. This single block eliminates the duplicate-pipeline problem, where a branch push and its MR each trigger a full pipeline and you pay twice for the same commit.

Then enforce it: **Settings → Merge requests → "Pipelines must succeed"**. Now CI is not advisory. A red pipeline blocks the merge. That is the moment CI starts actually protecting the main branch.

---

## 6. Job relationships: stages vs `needs`

With stages alone, ordering is strict:

```text
build ─────────────► test ──────────► package
(all build jobs)     (all test jobs)
```

If `lint` takes 20 seconds but sits in a stage behind a 4-minute build it doesn't depend on, you are waiting for nothing.

`needs:` lets a job start as soon as its specific dependencies finish, turning the pipeline into a graph (a DAG):

```yaml
lint:
  stage: test
  needs: []                 # start immediately, depend on nothing
  script:
    - npm ci --prefer-offline
    - npm run lint

unit-tests:
  stage: test
  needs: ["install-and-build"]
  script:
    - npm test
```

`needs: []` is the useful special case: **run this job right away, ignoring stage order.** Linting, formatting checks, and YAML validation almost always qualify.

`needs:` also controls artifact downloads: a job with `needs:` downloads artifacts **only from the jobs it lists**. That is usually good (less data transferred), and occasionally surprising (an artifact you assumed was there isn't).

### Parallel jobs

For a slow test suite that can be split:

```yaml
unit-tests:
  stage: test
  parallel: 5
  script:
    - npm test -- --shard=$CI_NODE_INDEX/$CI_NODE_TOTAL
```

GitLab creates 5 copies of the job, setting `CI_NODE_INDEX` (1..5) and `CI_NODE_TOTAL` (5). Your test tool must support splitting; GitLab just provides the coordinates.

**The tradeoff, stated honestly:** 5x the runner capacity consumed, 5 sets of logs to read, and 5 chances for an infrastructure flake. Parallelism trades money and debuggability for wall-clock time. Worth it for a 20-minute suite. Pointless for a 40-second one.

---

## 7. Reliability keywords

```yaml
integration-tests:
  stage: test
  timeout: 15 minutes
  retry:
    max: 2
    when:
      - runner_system_failure
      - stuck_or_timeout_failure
  script:
    - npm run test:integration
```

- **`timeout:`** — bound every job. Without it, a hung job holds a runner until the project-level timeout (often an hour), blocking everyone else.
- **`retry:`** — retry only on **infrastructure** failure classes, as above.

> **Never write a blanket `retry: 2`.** That retries genuinely failing tests until they happen to pass. You have not fixed flakiness; you have hidden it, and made your pipeline lie. Retrying a runner crash is engineering. Retrying an assertion failure is denial.

---

## 8. Reusable configuration

Copy-pasted YAML rots. Three mechanisms, in increasing order of scope:

**Hidden jobs + `extends:`** — within one file:

```yaml
.node-job:
  image: node:22
  before_script:
    - npm ci --prefer-offline

unit-tests:
  extends: .node-job
  stage: test
  script:
    - npm test
```

A job name starting with `.` is a template — never executed, only inherited.

**YAML anchors** — `&name` / `*name`, older and less readable. You will see them; prefer `extends:`.

**`include:`** — pull configuration from other files or projects:

```yaml
include:
  - local: '/ci/build.yml'
  - project: 'platform/ci-templates'
    ref: v2.3.0
    file: '/templates/security.yml'
```

Note the pinned `ref:`. Including a shared template from a moving branch means someone else's change can alter your pipeline without a commit in your repository. Pin it.

GitLab also has **CI/CD Components** — versioned, parameterised pipeline units published in a catalog, intended as the modern way to share pipeline logic across an organisation. For a single project, `extends:` is enough. For a platform team standardising 50 repositories, components are what you should be reading about.

---

## 9. Troubleshooting

### "Artifact is missing in a later job"

**Layer:** Artifact.

**Check in order:**

1. Did the producing job actually pass? A failed job uploads artifacts only with `when: always`.
2. Does the log say `Uploading artifacts`? If it says `no matching files`, your `paths:` is wrong — usually an absolute path or a wrong relative root. Paths are relative to `CI_PROJECT_DIR`.
3. Is the consuming job in a **later stage**? Artifacts flow forward only.
4. Does the consuming job use `needs:`? Then it only receives artifacts from the listed jobs.
5. Has `expire_in` passed? Relevant for re-running an old pipeline.

**Prevention:** print `ls -la dist/` at the end of the producing job. Cheap, and removes all guessing.

### "Cache doesn't seem to work"

Confirm with the log. `Restoring cache` followed by `Successfully extracted cache` is a hit; `no URL provided, cache will not be downloaded` or `WARNING: file does not exist` is a miss.

Causes: a cache path outside `CI_PROJECT_DIR`; a key that changes every run; different runners with separate local caches; the tool ignoring the cache directory you set.

**Verify the benefit, don't assume it.** Compare job durations with and without. A cache that stores and restores 400MB to save a 30-second install is a net loss.

### "Same commit passes sometimes and fails sometimes"

Flakiness. The most corrosive failure mode, because it teaches the team to ignore red pipelines.

Usual causes:

| Cause | Signal |
|---|---|
| Tests depend on execution order | Fails only when run with others / in a different shard |
| Timing and race conditions | `sleep` in tests, or intermittent timeouts |
| Shared external state (a database, a fixed port) | Fails when two pipelines run simultaneously |
| Network calls to real services | Fails in bursts, correlates with nothing in your code |
| Leftover state on a shell-executor runner | Fails only on one specific runner — check the log header |

**Investigation:** re-run the same commit several times and record which job and which test fails. If it's always the same test, it's the test. If it's random jobs across the pipeline, suspect infrastructure or a shared resource.

**Do not fix it with `retry:`.** Quarantine the flaky test, mark it, and fix or delete it. A test that lies is worse than no test.

### "The pipeline takes 40 minutes"

Measure before optimising. The pipeline page shows per-job duration; the job log header shows queue time.

Order of investigation:

1. **Queue time vs run time.** If jobs sit pending for 10 minutes, no YAML change helps — you need runner capacity.
2. **Find the critical path.** Total duration is the longest chain, not the sum. Speeding up a job that isn't on it changes nothing.
3. **Remove waiting that isn't a dependency.** `needs: []` on independent jobs.
4. **Fix repeated work.** Dependency installation without a cache, the same build done twice.
5. **Only then parallelise.** It costs money and clarity.
6. **Run less.** `rules:` so documentation changes don't trigger a full container build.

---

## Production reality

- **Pipelines cost money** — runner minutes, storage, engineer waiting time. A pipeline that runs 200 times a day is an infrastructure line item.
- **Artifact storage grows relentlessly.** Set `expire_in` on everything. Keep release artifacts long, keep PR build artifacts for days.
- **"Pipelines must succeed" is the switch that makes CI real.** Without it, CI is a suggestion.
- **`allow_failure: true` is how good intentions die.** A job added as "informational" and never fixed is noise that trains people to ignore warnings.
- **Someone owns the pipeline.** Unowned pipelines accumulate skipped tests, disabled jobs, and mysterious `|| true`s.

---

## Common mistakes

- Using cache to pass build output between jobs.
- Caching `node_modules` directly instead of the package manager's cache directory (leads to corrupted, platform-mismatched installs).
- Forgetting `when: always` on test report artifacts, then having no report for failed builds.
- A blanket `retry:` that hides flaky tests.
- Secrets stored as unprotected variables.
- A single 300-line YAML file that nobody dares to change.
- Optimising a job that isn't on the critical path.

---

## Things senior engineers notice

1. **Artifacts are the spine of the delivery chain, not a convenience.** The artifact produced here is what gets deployed in Volume 3. Everything downstream inherits its identity.
2. **Cache is an optimisation that must be allowed to fail.** Any pipeline that *requires* a cache hit is broken and doesn't know it yet.
3. **`allow_failure: true` converts a quality gate into decoration.** Use it deliberately or not at all.
4. **Retrying failures is a way of lying about reliability.** Retry infrastructure classes only.
5. **The critical path is the pipeline's real duration.** Sum-of-jobs is a vanity metric.
6. **Masked ≠ secure.** Protection scoping is the control; masking only stops accidental printing.
7. **Test *reports* matter more than test *logs*.** The MR widget that names three newly failing tests changes reviewer behaviour; a 3000-line log does not.
8. **Pipeline config is code and rots like code.** Duplication, dead jobs, and unexplained flags need refactoring and review just as much as application code.

---

## Interview questions

**Q: Artifacts vs cache?**
Artifacts are job outputs uploaded to GitLab, tied to a pipeline, automatically available to later jobs — used for correctness, to pass build results forward and to keep test reports. Cache is a performance optimisation for reusing dependency downloads across jobs and pipelines; it is keyed, may be absent, and the pipeline must work without it. If the pipeline breaks when it's missing, it's an artifact.

**Q: How do you handle secrets in GitLab CI?**
Store them as CI/CD variables in project or group settings, never in the repository. Mark deployment credentials as masked and, more importantly, protected, so they only exist in jobs on protected branches or tags. Masking prevents accidental printing; protection is what actually prevents an arbitrary branch pipeline from reading a production credential. Combine with protected branches and, later, protected environments.

**Q: What are `rules` and how do they differ from `only/except`?**
`rules:` decides whether a job is added to a pipeline, evaluated top to bottom with first match winning, and can combine conditions with `when`, `changes`, and `allow_failure`. `only/except` is the older, less expressive syntax that is still supported but not actively developed. New pipelines should use `rules:`, plus `workflow:rules` to control whether a pipeline is created at all.

**Q: What does `needs:` do?**
It creates a dependency graph instead of strict stage ordering, so a job starts as soon as the jobs it names have finished rather than waiting for its whole preceding stage. `needs: []` starts a job immediately. It also restricts artifact downloads to the listed jobs.

**Q: Your pipeline takes 40 minutes. How do you approach it?**
Measure first: separate queue time from execution time, because if jobs are waiting for runners the fix is capacity, not configuration. Then find the critical path and work only on it. Remove artificial waiting with `needs:`, eliminate repeated dependency installation with proper caching, skip work that isn't needed via `rules:`, and only then consider parallelism — which costs runner capacity and makes debugging harder.

**Q: A test passes locally and in most pipeline runs, but fails randomly. What do you do?**
Treat it as a defect, not noise. Identify whether it's always the same test (test-level issue: ordering, timing, shared state, real network calls) or random jobs (infrastructure or a shared external resource). Reproduce by re-running the same commit repeatedly. Quarantine it so it stops blocking others, then fix or remove it. Do not mask it with `retry:`, because that makes the pipeline's green status untrustworthy.

---

## Volume 2 checklist

- [ ] I can state the artifact-vs-cache rule without hesitating
- [ ] My pipeline produces a real build artifact and a parsed test report
- [ ] I understand why protected variables matter more than masked ones
- [ ] I can write `workflow:rules` that prevent duplicate pipelines
- [ ] I know when `needs: []` helps and when parallelism is not worth it
- [ ] I can diagnose a missing artifact in five checks
- [ ] "Pipelines must succeed" is enabled on the project

**Next:** Volume 3 — From CI to CD. Containerising the artifact, the GitLab Container Registry, build-once-promote-many, environments, and the first real deployment.

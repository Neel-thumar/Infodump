# Volume 1 — CI/CD Fundamentals and GitLab CI/CD Architecture

**Tool:** GitLab CI/CD

---

## Purpose of this volume

| Goal | What it means here |
|---|---|
| Learning goal | Understand how GitLab actually turns a commit into running jobs |
| Practical goal | Write a working multi-stage pipeline from scratch and read its logs |
| Production goal | Understand runners — who executes your job, on what machine, with what access |
| Troubleshooting goal | Diagnose a stuck job, an invalid config, and a "works locally, fails in CI" failure |
| Interview goal | Explain pipeline/stage/job, runners, executors, and the push-to-result flow |

Project stage after this volume: repository created, first real pipeline running.

---

## 1. The question that organises everything

In Volume 0 you ran a job that printed a line. Something executed that `echo`. Not the GitLab web page. Not your laptop.

> **Who actually executes my CI job?**

Hold on to that question. Most confusion in GitLab CI/CD — missing tools, missing files, stuck jobs, "it works locally" — dissolves the moment you can answer it precisely for your own setup.

---

## 2. The four-layer model

GitLab CI/CD has exactly four things you must keep straight.

```text
.gitlab-ci.yml       the definition   (what should happen)
       ↓
Pipeline             the instance     (this run, for this commit)
       ↓
Stage → Job          the units        (ordering and work)
       ↓
Runner               the executor     (the machine that does it)
```

### What is a pipeline?

A pipeline is **one execution of your delivery process for one specific commit**. It is created when something triggers it (a push, a merge request, a schedule, an API call). It contains jobs, and it has an overall status derived from them.

The definition lives in Git. The pipeline is a run of that definition. Same relationship as class and object, or recipe and meal.

### What is a job?

A job is **one unit of work executed by one runner, in one isolated workspace**. It has a name, a script, and its own log.

Critical property: **every job starts fresh.** Job B does not inherit files created by job A. Two jobs may run on completely different machines. If you need to pass something between jobs, you must explicitly say so (artifacts — Volume 2).

Beginners lose hours to this. Write it down:

> **Jobs do not share a filesystem by default.**

### What is a stage?

A stage is **a named group of jobs that run in parallel, with ordering between groups**.

```text
Pipeline
  ├── Stage: build
  │     ├── Job: compile-backend      ┐
  │     └── Job: compile-frontend     ┘ run at the same time
  │
  ├── Stage: test                       starts only after ALL build jobs pass
  │     ├── Job: unit-tests           ┐
  │     └── Job: lint                 ┘ run at the same time
  │
  └── Stage: deploy                     starts only after ALL test jobs pass
        └── Job: deploy-test
```

The default rule: **jobs in the same stage run in parallel; the next stage begins only when the previous stage has fully succeeded.**

This is the simple model, and you should build with it first. GitLab can break out of strict stage ordering with `needs:` (a directed graph instead of a queue) — that is Volume 2, once you have a reason to want it.

### The factory mapping

| Factory | GitLab |
|---|---|
| Production line | Pipeline |
| Section of the line | Stage |
| One machine step | Job |
| The worker/machine | Runner |

---

## 3. GitLab Runners — the part people skip

This is the most important section in Volume 1.

### What a runner is

A **GitLab Runner** is a separate program, installed on a separate machine, that connects to GitLab, asks "do you have work for me?", and executes jobs.

```text
GitLab server                       Runner machine
     │                                    │
     │  ◄──── "any jobs for me?" ─────────┤   (runner polls GitLab)
     │                                    │
     ├──── "yes, job #4821" ─────────────►│
     │                                    │
     │                                    ├─ clone repository
     │                                    ├─ run your script
     │                                    ├─ stream log back
     │                                    └─ upload results
     │  ◄──── "job passed" ───────────────┤
```

Three consequences that explain most beginner problems:

1. **GitLab does not run your code.** It schedules, stores, and displays. The runner does the work.
2. **Your job runs on a machine you may know nothing about.** Its OS, installed tools, network access, and disk are the runner's, not yours.
3. **The runner needs credentials to do anything outside itself** — push an image, deploy to a server, reach a database. Those come from CI/CD variables, and they make the runner a security boundary.

### Why runners exist as a separate thing

Because execution needs to be *somewhere*, and that somewhere has requirements GitLab cannot guess:

- Your build may need a specific JDK, .NET SDK, Node version, or GPU.
- Your deployment may need network access to a private server that the public internet cannot reach.
- Your compliance rules may forbid source code from leaving your data centre.

Separating the runner from the GitLab server lets you put execution wherever those requirements are satisfiable.

### Executors — *how* a runner runs your job

A runner is registered with an **executor**, which decides the environment each job gets. The ones that matter:

| Executor | Where your job runs | Isolation | Typical use |
|---|---|---|---|
| **Shell** | Directly on the runner machine's OS | **None** | Simple/legacy setups; quick internal tooling |
| **Docker** | In a fresh container per job | Strong | The default choice for most CI |
| **Kubernetes** | In a pod created per job | Strong | Scale, elastic capacity, many teams |
| SSH | On a remote machine over SSH | Weak | Rare, legacy |
| VirtualBox / Parallels | Full VM | Very strong | Windows/macOS builds, special cases |

**Shell executor** means your script runs as a normal user on that machine, with whatever is installed, and whatever the previous job left behind. It is fast and simple, and it is the reason for a whole category of bugs: a job passes because a colleague manually installed a tool on the runner last month, and fails the day that machine is replaced.

**Docker executor** means each job starts in a clean container from a stated image. Same input, same environment, every time. This is what makes CI reproducible, and it is why the `image:` keyword exists:

```yaml
test:
  image: node:22
  script:
    - node --version
    - npm ci
    - npm test
```

With the Docker executor, that job runs inside a fresh `node:22` container. Nothing from a previous job survives. That is a feature.

> Senior framing: **the executor is the answer to "what is installed?" and "what leaked in from last time?"** Reproducibility is mostly an executor decision.

### Tags — choosing which runner takes the job

A runner can be registered with tags like `docker`, `linux`, `windows`, `production-deploy`. A job with `tags:` will only be picked up by a runner carrying all of those tags.

```yaml
deploy-prod:
  tags:
    - production-deploy
  script:
    - ./deploy.sh
```

Two uses:

- **Capability routing** — this job needs Windows, or a GPU, or a runner inside the production network.
- **Security routing** — only a specific, locked-down runner is allowed to hold production credentials.

Untagged jobs go to runners that accept untagged work. A very common cause of a permanently stuck job is a tag typo: no runner matches, so nothing ever picks it up.

### Shared vs dedicated (project/group) runners

| | Shared runners | Dedicated (group/project) runners |
|---|---|---|
| Managed by | The GitLab instance / GitLab.com | Your team |
| Used by | Many projects | Only your project or group |
| Environment control | Low | Full |
| Network access to your internal systems | Usually none | As you configure |
| Suitable for production secrets | **No** | Yes, when hardened |

The production rule you should internalise now, and which Volume 5 expands:

> **A runner that holds production credentials must not execute untrusted code.** Any job on that runner can read its environment, its filesystem, and its network. If someone can open a merge request that runs a job there, they can potentially extract those credentials.

This is why mature setups separate a **build/test runner fleet** (broad access to code, no production credentials) from a small **deployment runner** (production credentials, tightly restricted, only runs protected pipelines).

---

## 4. `.gitlab-ci.yml` — starting small

The pipeline definition lives at the repository root in a file named `.gitlab-ci.yml`. GitLab reads it from the commit being tested — which means the pipeline that ran for an old commit is recoverable, because the definition is versioned with the code.

### The smallest useful pipeline

```yaml
test:
  script:
    - echo "Running tests"
```

That is a valid pipeline. One job called `test`, one command. No stages declared — GitLab puts it in a default stage.

### Adding structure

```yaml
stages:
  - build
  - test

compile:
  stage: build
  script:
    - echo "Compiling the application"

unit-tests:
  stage: test
  script:
    - echo "Running unit tests"
```

Read it as English: there are two stages in this order; `compile` belongs to build; `unit-tests` belongs to test, so it runs after compile succeeds.

### YAML rules you actually need

YAML is indentation-sensitive and unforgiving. Four rules cover nearly every syntax error:

1. **Spaces only. Never tabs.** A tab is a hard error.
2. **Indentation shows nesting.** Two spaces per level, consistently.
3. **`key: value` needs the space after the colon.** `stage:test` is wrong; `stage: test` is right.
4. **`- ` makes a list item.** `script:` takes a list of commands, so each command gets its own `- ` line.

```yaml
job-name:          # top level: the job name
  stage: test      # 2 spaces: a property of the job
  script:          # 2 spaces: another property
    - command one  # 4 spaces + dash: list items
    - command two
```

Anything at the top level that isn't a reserved keyword (`stages`, `variables`, `default`, `include`, `workflow`) is treated as a job name.

**Validate before you push.** GitLab has a linter at **Build → Pipeline editor → Validate** in your project. Use it. Pushing a broken YAML to find out it is broken wastes a cycle and clutters history.

### A first real pipeline for the project

Create a GitLab project, add your application source, and add this:

```yaml
stages:
  - build
  - test

variables:
  APP_NAME: "demo-app"

compile:
  stage: build
  image: node:22
  script:
    - echo "Building $APP_NAME"
    - npm ci
    - npm run build

unit-tests:
  stage: test
  image: node:22
  script:
    - npm ci
    - npm test
```

*(If your application is .NET, Python, or Java, swap the image and the two commands. The structure is identical — that is the point.)*

Note something uncomfortable: `npm ci` runs twice, once per job, because **jobs do not share a filesystem**. That is wasteful, and fixing it properly is exactly what caching and artifacts are for in Volume 2. Feel the problem first; the solution will then make sense instead of being memorised.

---

## 5. What happens when you push — step by step

```text
Developer pushes commit
        ↓
GitLab receives the commit
        ↓
GitLab reads .gitlab-ci.yml FROM THAT COMMIT
        ↓
Config is parsed and validated
        ↓
Pipeline is created; jobs are evaluated and created
        ↓
Jobs enter "pending" and wait for a matching runner
        ↓
A runner picks up a job
        ↓
Runner prepares the environment (pulls image / prepares shell)
        ↓
Runner clones or fetches the repository at that commit
        ↓
Runner restores cache and downloads artifacts from earlier stages
        ↓
Your script commands execute, one by one
        ↓
Logs stream back to GitLab live
        ↓
Artifacts and reports are uploaded
        ↓
Job passes or fails (based on exit codes)
        ↓
Next stage starts, or the pipeline stops
        ↓
Pipeline status: passed / failed / canceled
```

### Two details worth pausing on

**Exit codes decide everything.** A job fails when a command returns a non-zero exit code. It does not matter what the command printed. A script that logs `ERROR: build failed` but exits 0 produces a **green job**. Conversely, a harmless command returning 1 fails the job. Every `script:` line runs with failure-stopping behaviour, so the first failing command ends the job.

This is the mechanical reason behind "a green pipeline does not mean the software is healthy" — green only means *every command returned zero*.

**The config comes from the commit, not from the default branch.** If someone edits `.gitlab-ci.yml` on a branch, their branch's pipeline uses their version. This is powerful and is also a security consideration (Volume 5: a merge request can change the pipeline that runs).

### What you can observe

Open **Build → Pipelines**, click the pipeline, click a job:

| In the log | What it tells you |
|---|---|
| `Running with gitlab-runner 1x.y.z` | Which runner took the job, and its version |
| `on <runner-name> <tags>` | **Exactly which machine executed this** — check this first when a job behaves differently than expected |
| `Preparing the "docker" executor` / `"shell" executor` | The executor, and therefore what environment you got |
| `Using Docker image ... with digest sha256:...` | The precise image used — a digest is exact, a tag is not |
| `Getting source from Git repository` / `Fetching changes` | Clone vs reuse of an existing workspace |
| `$ npm ci` | Each of your script lines is echoed before it runs |
| `Uploading artifacts` | What was collected and kept |
| `Job succeeded` / `ERROR: Job failed: exit code 1` | Final verdict, with the failing exit code |

Reading these header lines is a habit that separates people who debug pipelines from people who re-run them hoping for a different result.

---

## 6. Troubleshooting: the investigation method

Do not start from "what is the fix?". Start from "which layer failed?".

```text
What do we know?
        ↓
What do we not know?
        ↓
Which layer could have failed?
        ↓
What evidence can we collect?
        ↓
Which log/command/output gives that evidence?
        ↓
What does that output actually say?
        ↓
What do we test next?
```

The layers, in the order a job touches them:

```text
Git → Trigger → Config → Runner → Environment → Dependencies → Build → Test → Artifact → Registry → Credentials → Deployment → Application → Infrastructure
```

Three scenarios you will hit in this volume.

### Scenario A — the job is stuck in `pending` forever

**Symptom:** pipeline created, job shows "This job is stuck because…" or simply never starts.

**Layer:** Runner.

**Possible causes:**
- No runner is available to the project at all.
- The job has `tags:` that no available runner has (very often a typo).
- All matching runners are busy or offline.
- Shared runners are disabled for the project, or the account has no CI minutes left.

**First thing to check:** **Settings → CI/CD → Runners.** Does the project see any runner? Is it green (online)?

**Evidence to collect:** the job's tag list, the tags of the available runners, the runner's online status and last contact time.

**Fix:** match the tags exactly, enable a runner for the project, or bring the runner back online.

**Prevention:** be deliberate about tags. If a job doesn't need a specific runner, don't tag it. Document which tags exist.

### Scenario B — `.gitlab-ci.yml` is invalid

**Symptom:** no pipeline at all, or a pipeline that immediately fails with a yaml error like `jobs:test config contains unknown keys`.

**Layer:** Pipeline configuration.

**Possible causes:** a tab character, wrong indentation depth, a misspelled keyword (`scripts:` instead of `script:`), a stage name used in a job but not declared in `stages:`.

**First thing to check:** the error message itself — GitLab names the job and the key. Then the Pipeline editor's **Validate** tab.

**Fix and prevention:** validate before pushing; keep indentation at a consistent two spaces; configure your editor to show whitespace.

### Scenario C — "it works on my laptop but fails in CI"

**Symptom:** `command not found`, a missing file, a different library version, a failing test that passes locally.

**Layer:** Environment / dependencies. Almost never the application code.

**The real cause is always one of these three differences:**

| Difference | Why it happens | How to confirm |
|---|---|---|
| **Different environment** | Your laptop has tools installed over years; the runner has only what the image provides | Add `node --version`, `which <tool>`, `printenv` temporarily to the script |
| **Different files** | The runner only has what is committed to Git. Your local `.env`, config file, or generated folder may be untracked or `.gitignore`d | `git status --ignored` locally; `ls -la` in the job |
| **Different dependencies** | You installed months ago and have older resolved versions; CI resolves fresh | Use lockfile-respecting installs (`npm ci`, not `npm install`); print the resolved versions |

**Fix:** pin the environment (`image:` with a specific version), commit what CI needs, and install from lockfiles.

**Prevention:** the underlying principle — **if the build depends on something that is not in the repository or not in the declared image, it is not reproducible.** That statement is worth more than any individual fix.

---

## 7. Production reality

Things that are true in real GitLab setups but invisible in tutorials:

- **Runner capacity is a shared, finite resource.** Ten teams pushing at 5pm queue behind each other. Pipeline duration in practice includes queue time, which your YAML cannot fix.
- **Shell-executor runners drift.** Manually installed tools, leftover files, disk filling up. Container-based executors avoid most of this.
- **Image tags move.** `node:22` today is not the same bytes as `node:22` next month. For reproducible builds, pin more precisely — a specific patch version, or a digest. (More in Volume 3.)
- **Pipeline configuration gets reviewed like code, or it doesn't get reviewed at all.** Teams that let anyone edit `.gitlab-ci.yml` unreviewed eventually find a job that skips tests.
- **`.gitlab-ci.yml` is part of the delivery system**, not a config file. It is reviewable, has history, can be rolled back, and provides an audit trail of how the software was built.

---

## Common mistakes

- Assuming jobs share files. They don't.
- Copying a large `.gitlab-ci.yml` from the internet before understanding stages and jobs.
- Tagging jobs unnecessarily, then wondering why they never run.
- Using `image:` with a shell-executor runner and expecting it to take effect (it does not — that runner has no containers).
- Writing scripts that swallow failures, so the job goes green while the work failed.
- Debugging application code when the log header already says the job ran on an unexpected runner.

---

## Things senior engineers notice

1. **The first three lines of a job log answer most questions.** Which runner, which executor, which image. Read them before reading the error.
2. **Isolation is not an optional nicety.** A shell runner shared across teams means one job can leave state that changes another team's result.
3. **A tag is an access-control decision, not just routing.** "Which runner may take this job" often means "which jobs may touch production credentials".
4. **Exit codes are your only real contract with GitLab.** Anything that hides a non-zero exit — a trailing `|| true`, a script that catches errors — silently converts a broken build into a passing one.
5. **Pipeline config being versioned with the code is an underrated property.** You can check out a six-month-old commit and know exactly how it was built. That is what makes reproducible rollback possible later.
6. **Queue time is part of feedback time.** Optimising job scripts while ignoring runner capacity often changes nothing the developer can feel.

---

## Interview questions

**Q: What is a GitLab Runner?**
A separate agent process, installed on its own machine or cluster, that connects to GitLab, picks up jobs, and executes them. GitLab schedules and stores; the runner executes. Runners are registered with an executor that determines the environment each job gets, and can carry tags used to route jobs.

**Q: What's the difference between a pipeline, a stage, and a job?**
A pipeline is one execution of the delivery process for a commit. A stage is a named group of jobs with ordering relative to other stages. A job is one unit of work run by one runner in one isolated workspace. Jobs in the same stage run in parallel; the next stage starts once the previous one succeeds.

**Q: What is an executor and why does it matter?**
It determines where and how a job runs — shell means directly on the runner's OS with whatever is installed there; Docker means a fresh container per job from a declared image; Kubernetes means a pod per job. It matters because it decides reproducibility and isolation: a shell executor inherits whatever the machine and the previous job left behind, a container executor does not.

**Q: A job is stuck in pending. How do you investigate?**
Check runner availability for the project first. Then compare the job's tags against the tags on the available runners — a tag with no matching runner means nothing will ever pick the job up. Then check whether runners are online and not saturated, and whether shared runners are enabled and within quota. The failure is in the runner layer, not the YAML.

**Q: Why does a job pass locally but fail in CI?**
Because the two environments differ in one of three ways: installed tooling, available files, or resolved dependency versions. The runner has only what the image provides and only what is committed to Git. The fix is to make the build depend on nothing outside the repository and the declared environment.

**Q: How do jobs pass data to each other?**
Not by the filesystem — each job gets a clean workspace, possibly on a different machine. Data must be passed explicitly through artifacts, which one job declares and a later job downloads. Cache is a separate mechanism for reusing dependencies and is not a reliable transfer method.

---

## Volume 1 checklist

- [ ] I can answer "who executes my job?" for my own project, by name
- [ ] I can write a two-stage pipeline from scratch without copying
- [ ] I know why jobs do not share files
- [ ] I can identify the runner, executor, and image from a job log header
- [ ] I can explain shell vs Docker executor and the reproducibility consequence
- [ ] I can diagnose a stuck job by comparing tags to available runners
- [ ] I know that exit codes, not log text, determine pass or fail

**Next:** Volume 2 — Building Real CI Pipelines. Artifacts vs cache (and why running `npm ci` twice was a signal), variables, rules, merge request pipelines, job dependencies, and pipeline design tradeoffs.

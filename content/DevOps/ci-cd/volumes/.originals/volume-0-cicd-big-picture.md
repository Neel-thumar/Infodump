# Volume 0 — CI/CD: The Big Picture

**Tool used throughout this guide:** GitLab CI/CD

---

## Purpose of this volume

| Goal | What it means here |
|---|---|
| Learning goal | Understand the software delivery problem that CI/CD exists to solve |
| Practical goal | Run one throwaway pipeline and watch it turn green |
| Production goal | Understand that delivery is a system, not a step at the end |
| Troubleshooting goal | Know the layers where delivery breaks, before learning to debug them |
| Interview goal | Explain CI, CD, and the delivery lifecycle in plain language |

This volume has almost no YAML. That is deliberate. If you learn `.gitlab-ci.yml` before you understand the problem, you will build pipelines that run but do not help.

---

## 1. The problem before CI/CD

Think about a team of six developers working on one application.

Each developer works on their own branch for two or three weeks. Everyone's code works — on their own laptop. Then comes integration day.

```text
Developer A branch  ──┐
Developer B branch  ──┤
Developer C branch  ──┼──►  merge everything  ──►  ???
Developer D branch  ──┤
Developer E branch  ──┤
Developer F branch  ──┘
```

What actually happens on integration day:

- Two people changed the same function in incompatible ways.
- One person upgraded a library; another person's code depends on the old behaviour.
- The build breaks and nobody knows which of the six changes caused it.
- Someone says the famous sentence: **"It works on my machine."**

This has a name in the industry: **integration hell**. The pain is not caused by any single change. It is caused by the *size of the batch* and the *delay* before anyone found out.

### Then comes release day

Once the code somehow merges, the release itself is manual:

```text
Senior developer opens a terminal
        ↓
Runs the build commands from memory (or from a Word document)
        ↓
Copies files to the server over SFTP
        ↓
Restarts the service
        ↓
Hopes
```

Problems with this:

- **Not repeatable.** A different person, a different day, a different result.
- **Not auditable.** Nobody knows exactly what is running in production, or who put it there.
- **Not reversible.** If the release is bad, "rollback" means rebuilding the old version from memory — if the old source can even be identified.
- **Not scalable.** This works for 5 developers and one release a month. It collapses at 50 developers and 10 releases a day.
- **Single point of knowledge.** One person knows the process. They go on leave. The company stops shipping.

> The core insight: **manual delivery does not fail because people are careless. It fails because humans cannot execute a 40-step process identically, every time, under time pressure.**

---

## 2. What CI/CD actually solves

CI/CD is the practice of turning that manual, undocumented, memory-based process into an **automated, versioned, repeatable workflow that runs the same way every time.**

Two separate problems, two separate answers:

| Problem | Answer |
|---|---|
| Changes integrate late, in large batches, and break in ways nobody can trace | **Continuous Integration (CI)** |
| Releasing is manual, slow, risky, and hard to reverse | **Continuous Delivery / Deployment (CD)** |

### Continuous Integration — the real definition

Most people say CI means "run tests on every push". That is the *mechanism*, not the *goal*.

**CI means: every developer integrates their work into the shared main branch frequently — at least daily — and every integration is automatically verified.**

Two halves, and both matter:

1. **Integrate frequently** (small batches, short-lived branches)
2. **Verify automatically** (build + test on every change)

If you run tests on every push but developers still sit on branches for three weeks, you have automation — you do not have continuous integration. You have automated integration hell.

Why small batches work:

```text
Large batch:  50 changes  →  build fails  →  which of the 50?  →  hours of bisecting

Small batch:   1 change   →  build fails  →  it's that change   →  fixed in minutes
```

The value of CI is **fast, trustworthy feedback that points at a specific change.**

### Continuous Delivery vs Continuous Deployment

These two are constantly confused, including in interviews. The difference is exactly one thing: **a human approval step.**

| | Continuous Delivery | Continuous Deployment |
|---|---|---|
| After tests pass, the build is… | ready to deploy at any moment | deployed automatically |
| Human approval before production | **Yes** — someone clicks the button | **No** — no button exists |
| Pipeline ends at | a deployable, approved-and-waiting artifact | production |
| Typical for | banks, government, regulated systems, anything with change windows | SaaS products, high-maturity teams, strong monitoring |

```text
CONTINUOUS DELIVERY
commit → build → test → staging → [HUMAN APPROVES] → production

CONTINUOUS DEPLOYMENT
commit → build → test → staging → production
```

Continuous Deployment is not "better". It is a choice that requires very strong automated testing, monitoring, and rollback. A team that deploys automatically without those things is not mature — it is exposed.

Both share the same non-negotiable requirement: **the main branch must always be in a deployable state.** That is what "continuous" is really protecting.

---

## 3. The complete delivery lifecycle

This is the central diagram of the entire guide. Every concept in every volume attaches somewhere on this line.

```text
Developer
    ↓
Git Repository
    ↓
Pipeline Trigger
    ↓
GitLab CI/CD
    ↓
Runner
    ↓
Checkout Source
    ↓
Build
    ↓
Test
    ↓
Security Checks
    ↓
Package / Container Image
    ↓
Artifact / Container Registry
    ↓
Deployment
    ↓
Environment
    ↓
Verification
    ↓
Monitoring
    ↓
Success / Rollback
```

Walk it once in plain words:

1. **Developer** writes code and pushes it.
2. **Git repository** receives the commit — this is the single source of truth.
3. **Pipeline trigger** — GitLab notices the commit and decides a pipeline should run.
4. **GitLab CI/CD** reads the pipeline definition and works out which jobs to create.
5. **Runner** — an actual machine or container picks up a job. *GitLab does not run your code; runners do.* Remember this.
6. **Checkout** — the runner gets a clean copy of the source.
7. **Build** — source code becomes something executable.
8. **Test** — automated checks decide whether this change is acceptable.
9. **Security checks** — dependencies, source, and images are scanned.
10. **Package** — the verified output is wrapped into a deployable unit (a container image, a jar, a zip).
11. **Registry** — that unit is stored somewhere permanent and versioned.
12. **Deployment** — the stored unit is delivered to a target.
13. **Environment** — the target itself: test, staging, production.
14. **Verification** — did the deployed application actually come up healthy?
15. **Monitoring** — is it still healthy ten minutes later?
16. **Success or rollback** — keep it, or return to the last known-good version.

A shorter version you should be able to recite from memory:

```text
Code → Commit → Pipeline → Runner → Build → Test → Artifact → Deploy → Verify → Release
```

### Two things people get wrong about this diagram

**It does not end at "deploy".** Verification and monitoring are part of delivery. A deployment job that finished successfully tells you the *deployment* worked, not that the *application* works. Those are different claims, and Volume 4 spends real time on the gap between them.

**Rollback is not an emergency improvisation.** It is a designed path in the diagram, tested in advance. If you have never actually run your rollback, you don't have one.

---

## 4. The analogy: a software factory

One analogy is used throughout this guide. Not a new one per chapter — one.

| Factory | CI/CD |
|---|---|
| Raw material | Source code in Git |
| Production line | The pipeline |
| Single machine step | A job |
| Section of the line | A stage |
| Worker / machine doing the step | A GitLab Runner |
| Finished, boxed product | An artifact / container image |
| Warehouse | Container registry / artifact storage |
| Shop where the product is installed | An environment |
| Delivery and installation | Deployment |
| Line stops, alarm sounds | Pipeline failure |
| Recalling a bad batch, shipping the previous one | Rollback |

The useful part of this analogy is what a factory refuses to do:

- A factory does not **rebuild the product differently for each shop.** It builds once and ships the same box everywhere. (This is "build once, promote many" — Volume 3.)
- A factory does not **ship a box that failed inspection.** (Quality gates.)
- A factory **knows which batch went to which shop.** (Versioning and traceability.)
- A factory can **stop the line instantly** when something is wrong. (Failing fast.)

Where the analogy stops: a factory's product is physical and its line is fixed. Software pipelines are themselves code — they change, they have bugs, and they need review. When the analogy and technical reality disagree, technical reality wins.

---

## 5. Why GitLab CI/CD for this guide

CI/CD is the discipline. GitLab CI/CD is one implementation of it. This guide sticks to one tool on purpose — switching between Jenkins, GitHub Actions and CircleCI teaches you syntax trivia instead of engineering.

Reasons GitLab works well as the teaching tool:

- **Repository, CI, registry, environments, and security scanning live in one product.** You can follow a commit all the way to a deployed environment without wiring five services together.
- **Pipeline configuration is a file in the repository** (`.gitlab-ci.yml`), reviewed like any other code.
- **The runner model is explicit.** You are forced to understand who executes your job, which is exactly the mental model that transfers to every other tool.
- It is widely used in enterprise and government environments, including self-hosted setups.

Where other tools appear in this guide, it is only for comparison, never for implementation.

### What transfers, and what doesn't

| Concept (transfers everywhere) | GitLab implementation (GitLab-specific) |
|---|---|
| Pipeline | Pipeline defined in `.gitlab-ci.yml` |
| Stage / job | `stages:` and job keys |
| Executor / agent / worker | GitLab Runner and its executors |
| Secrets management | CI/CD variables, protected and masked |
| Build output storage | `artifacts:`, GitLab Container Registry |
| Deployment target tracking | `environment:` |
| Conditional execution | `rules:` |
| Approval gate | `when: manual` on a protected environment |

Learn the left column. The right column is how you express it this week, in this tool.

---

## 6. The one thing you will build

Every volume improves **one continuous project**. Not thirty disconnected tutorials.

The project evolves like this:

```text
Volume 1  Repository + first real pipeline (one stage, one job)
Volume 2  Build stage, unit tests, test reports, real build artifact, MR pipelines
Volume 3  Dockerfile, image build, push to GitLab Container Registry, deploy to test env
Volume 4  Staging → approval → production, verification step, rollback actually executed
Volume 5  Security scanning, secrets hardening, deliberately broken pipelines diagnosed
Volume 6  The whole thing presented as one designed system
```

By the end you should be able to open the repository in an interview and walk someone from merge request to monitored production release, explaining every decision.

---

## 7. Optional: see a green pipeline once

You do not need to understand this yet. The point is to see that the machinery is real.

Create a project in GitLab, and add a file named `.gitlab-ci.yml` at the repository root:

```yaml
hello:
  script:
    - echo "The pipeline ran."
```

Commit it. Then open **Build → Pipelines** in the project sidebar.

What you should observe:

- A pipeline appears within a few seconds of the push.
- It contains one job named `hello`.
- Its status moves through `pending` → `running` → `passed`.
- Clicking the job shows a log: the runner cloning your repository, then your `echo` line, then `Job succeeded`.

Two questions to sit with until Volume 1 answers them:

1. **Who ran that script?** Not GitLab's web interface. Some machine, somewhere, picked up this job. Which one, and why?
2. **Where did it run it?** In what directory, on what operating system, with what tools installed?

If the job stays `pending` forever, no runner was available to take it. That is not a bug in your YAML — it is the runner concept introducing itself early. Volume 1 covers it properly.

---

## Common mistakes at this stage

- **Treating CI/CD as "the DevOps team's tool".** The pipeline is part of the application. Developers own it.
- **Believing a green pipeline means the software is good.** It means the checks you wrote passed. Nothing more.
- **Adding automation before agreeing on process.** Automating a broken release process gives you a faster broken release process.
- **Starting with a copied 200-line `.gitlab-ci.yml`.** You will be unable to debug it, because you never understood it.

---

## Things senior engineers notice

1. **CI's value comes from batch size, not from the tool.** Daily integration with a weak pipeline beats a beautiful pipeline on three-week branches.
2. **Feedback speed is a correctness feature.** A 40-minute pipeline gets ignored, worked around, and eventually disabled. Slow pipelines decay into unused pipelines.
3. **The delivery system is production infrastructure.** If the pipeline is down, you cannot ship a fix during an incident. Treat its availability accordingly.
4. **"It works on my machine" is a reproducibility bug, not a personality flaw.** The fix is pinned dependencies and defined build environments, not blame.
5. **Continuous Deployment is a consequence of test and monitoring maturity, not a goal to chase directly.** Removing the approval button from a team that cannot detect failures automatically just removes the last safety net.
6. **Most CI/CD failures happen outside application code** — credentials, runners, registries, network, environment drift. Beginners debug their code first. Seniors identify the layer first.

---

## Interview questions

**Q: What is CI/CD?**
The practice of automating the path from a code change to a verified, deployable, and releasable version of the software — so that integration happens frequently in small batches and releasing is repeatable rather than manual.

**Q: What problem does CI solve?**
Late, large-batch integration. When many developers merge weeks of work at once, failures are hard to attribute and expensive to fix. CI shrinks the batch and verifies every change automatically, so failures are small, immediate, and traceable to one change.

**Q: Continuous Delivery vs Continuous Deployment?**
Both keep the main branch always deployable. Delivery stops at an approved-and-ready artifact with a human deciding when it goes to production. Deployment removes that human step and releases automatically once checks pass. Deployment requires much stronger automated testing, monitoring, and rollback.

**Q: Does a passing pipeline mean the release is safe?**
No. It means every check that was written passed. Gaps in test coverage, missing verification after deployment, configuration that differs by environment, and runtime dependencies are all invisible to a green pipeline.

**Q: Why should CI/CD configuration live in the repository?**
Because it is reviewable, versioned, and reproducible. The pipeline that built a commit can be recovered from history, changes to it go through code review, and there is an audit trail of who changed the delivery process and when.

---

## Volume 0 checklist

Before moving on, you should be able to:

- [ ] Explain integration hell and why batch size causes it
- [ ] Define CI as *frequent integration + automatic verification*, not just "tests on push"
- [ ] State the one difference between Continuous Delivery and Continuous Deployment
- [ ] Draw the full lifecycle from commit to rollback from memory
- [ ] Say what a runner is responsible for, in one sentence
- [ ] Explain why "build once, promote many" is going to matter

**Next:** Volume 1 — CI/CD Fundamentals and GitLab CI/CD Architecture. Where the pipeline actually runs, and what happens second by second when you push a commit.

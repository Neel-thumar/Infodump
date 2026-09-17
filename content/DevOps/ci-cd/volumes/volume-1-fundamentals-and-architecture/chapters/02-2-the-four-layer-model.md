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


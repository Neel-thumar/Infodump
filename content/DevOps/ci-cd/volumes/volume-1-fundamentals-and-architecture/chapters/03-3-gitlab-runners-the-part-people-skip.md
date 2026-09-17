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


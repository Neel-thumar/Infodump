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


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


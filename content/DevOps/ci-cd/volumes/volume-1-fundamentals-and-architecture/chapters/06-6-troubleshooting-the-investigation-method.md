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


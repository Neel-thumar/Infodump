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


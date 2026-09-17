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


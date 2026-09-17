## Part 2 — Troubleshooting

### 8. The method

Beginners debug by pattern-matching to failures they've seen. That fails on anything new. The method below works on failures you've never encountered, which is the point.

```text
What do we know?                    facts from the log, not assumptions
        ↓
What do we NOT know?                name the gap explicitly
        ↓
Which layer could have failed?      narrow before you dig
        ↓
What evidence would distinguish?    what would prove/disprove each candidate
        ↓
Which command or log gives it?      go get exactly that
        ↓
What does the output actually say?  read it; don't skim for the word "error"
        ↓
What do we test next?               one change at a time
```

Two disciplines that separate good debuggers from frustrated ones:

**Change one thing at a time.** Three simultaneous changes that fix the problem teach you nothing and leave two unnecessary changes behind.

**Read the whole error.** The real cause is frequently three lines above the line that caught your eye, or in the first failure of a cascade rather than the last.

### 9. The failure-layer model

```text
Git               repository, access, LFS, submodules
 ↓
Trigger           was a pipeline even created? workflow rules?
 ↓
Configuration     YAML validity, rules evaluation, includes
 ↓
Runner            availability, tags, executor, capacity
 ↓
Environment       image contents, OS, tools, env vars
 ↓
Dependencies      registries, lockfiles, network, proxies
 ↓
Build             compilation, resources, disk
 ↓
Test              assertions, flakiness, test infrastructure
 ↓
Artifact          produced? uploaded? path? expiry?
 ↓
Registry          auth, permissions, quota, storage
 ↓
Credentials       present? protected? scoped? expired?
 ↓
Deployment        target reachable, permissions, manifests
 ↓
Application       startup, configuration, dependencies
 ↓
Infrastructure    network, DNS, certificates, capacity
```

**Locate the layer before investigating.** Most wasted debugging time is spent examining the wrong layer thoroughly. The job log's first ten lines usually identify the layer for free: which runner, which executor, which image, whether the clone succeeded.

### 10. Worked scenarios

#### A. Job stuck in pending

**Known:** pipeline created, job never starts. **Unknown:** whether any runner can take it. **Layer:** Runner.

Check runner availability for the project → compare job tags against runner tags (a typo means no match, ever) → check runners are online → check quota/shared-runner settings → check whether the job needs a protected-branch runner while running on an unprotected branch.

**Prevention:** don't tag jobs that don't need routing; document the tag vocabulary.

#### B. Tests pass locally, fail in CI

**Layer:** Environment or dependencies — rarely the code.

Three differences, always: tooling installed, files available, dependency versions resolved. Temporarily add `printenv | sort`, `which <tool>`, `ls -la`, and the resolved dependency versions to the job. Compare with local.

Also consider: CI is often slower, more parallel, and has different timezone/locale settings — all of which expose latent test assumptions.

**Prevention:** pinned images, lockfile installs, nothing required that isn't in the repository or the image.

#### C. Artifact missing downstream

Producing job passed? → `Uploading artifacts` in the log, or `no matching files`? → is the path relative to `CI_PROJECT_DIR`? → is the consumer in a later stage? → does the consumer use `needs:` (restricting which artifacts arrive)? → has `expire_in` elapsed?

**Prevention:** `ls -la` the artifact directory at the end of the producing job.

#### D. Authentication fails in CI only

Two dominant causes: the runner has none of your laptop's ambient credentials, and **the variable is protected while the branch is not** — so the variable silently doesn't exist and an empty value is sent.

Diagnostic signature: works on `main`, fails on feature branches → protection scoping, every time.

#### E. Pipeline takes 40 minutes

Measure first. Separate **queue time** from **execution time** — if jobs wait for runners, no YAML change helps. Then find the critical path (the longest chain, not the sum). Then: `needs: []` on independent jobs, fix repeated dependency installs, use `rules:` to skip irrelevant work, and only then parallelise.

**Also ask whether the pipeline should be doing all of it.** A full container build and deploy on a README change is waste that no optimisation fixes.

#### F. Flaky pipeline

Same commit, different results. Determine whether it's always the same test (ordering, timing, shared state, real network calls) or random jobs (infrastructure, a shared external resource, a runner with leftover state — check the log header for which runner).

**Never fix flakiness with `retry:`** on test failures. Quarantine, then fix or delete. A pipeline that people don't believe is worse than no pipeline, because it converts a safety system into noise.

#### G. Deploy succeeded, application down

Covered in Volume 4. In one line: the deploy job reports on the deploy command. Verify readiness, assert the live version matches the deployed commit, run smoke tests.

### 11. Observability of the pipeline itself

You cannot improve what you don't measure. Worth tracking:

| Metric | Why |
|---|---|
| Pipeline duration (p50 and p95) | p95 is what people actually feel |
| Queue time | Distinguishes capacity problems from configuration problems |
| Failure rate by job | Finds the flaky and the fragile |
| Success rate on the default branch | The health of your main line |
| Deployment frequency | Delivery throughput |
| Time to restore | Rollback capability, in practice |
| Runner utilisation | Capacity planning and cost |

The last two of those are DORA metrics, and they're the pair that best predicts whether a delivery system is actually working.

**The signal people ignore:** when developers start saying "just re-run it", your pipeline has stopped being trusted. Treat that sentence as an incident report.

---


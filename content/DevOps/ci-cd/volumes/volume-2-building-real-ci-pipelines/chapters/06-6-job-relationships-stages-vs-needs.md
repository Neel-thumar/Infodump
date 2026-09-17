## 6. Job relationships: stages vs `needs`

With stages alone, ordering is strict:

```text
build ─────────────► test ──────────► package
(all build jobs)     (all test jobs)
```

If `lint` takes 20 seconds but sits in a stage behind a 4-minute build it doesn't depend on, you are waiting for nothing.

`needs:` lets a job start as soon as its specific dependencies finish, turning the pipeline into a graph (a DAG):

```yaml
lint:
  stage: test
  needs: []                 # start immediately, depend on nothing
  script:
    - npm ci --prefer-offline
    - npm run lint

unit-tests:
  stage: test
  needs: ["install-and-build"]
  script:
    - npm test
```

`needs: []` is the useful special case: **run this job right away, ignoring stage order.** Linting, formatting checks, and YAML validation almost always qualify.

`needs:` also controls artifact downloads: a job with `needs:` downloads artifacts **only from the jobs it lists**. That is usually good (less data transferred), and occasionally surprising (an artifact you assumed was there isn't).

### Parallel jobs

For a slow test suite that can be split:

```yaml
unit-tests:
  stage: test
  parallel: 5
  script:
    - npm test -- --shard=$CI_NODE_INDEX/$CI_NODE_TOTAL
```

GitLab creates 5 copies of the job, setting `CI_NODE_INDEX` (1..5) and `CI_NODE_TOTAL` (5). Your test tool must support splitting; GitLab just provides the coordinates.

**The tradeoff, stated honestly:** 5x the runner capacity consumed, 5 sets of logs to read, and 5 chances for an infrastructure flake. Parallelism trades money and debuggability for wall-clock time. Worth it for a 20-minute suite. Pointless for a 40-second one.

---


## Interview questions

**Q: Artifacts vs cache?**
Artifacts are job outputs uploaded to GitLab, tied to a pipeline, automatically available to later jobs — used for correctness, to pass build results forward and to keep test reports. Cache is a performance optimisation for reusing dependency downloads across jobs and pipelines; it is keyed, may be absent, and the pipeline must work without it. If the pipeline breaks when it's missing, it's an artifact.

**Q: How do you handle secrets in GitLab CI?**
Store them as CI/CD variables in project or group settings, never in the repository. Mark deployment credentials as masked and, more importantly, protected, so they only exist in jobs on protected branches or tags. Masking prevents accidental printing; protection is what actually prevents an arbitrary branch pipeline from reading a production credential. Combine with protected branches and, later, protected environments.

**Q: What are `rules` and how do they differ from `only/except`?**
`rules:` decides whether a job is added to a pipeline, evaluated top to bottom with first match winning, and can combine conditions with `when`, `changes`, and `allow_failure`. `only/except` is the older, less expressive syntax that is still supported but not actively developed. New pipelines should use `rules:`, plus `workflow:rules` to control whether a pipeline is created at all.

**Q: What does `needs:` do?**
It creates a dependency graph instead of strict stage ordering, so a job starts as soon as the jobs it names have finished rather than waiting for its whole preceding stage. `needs: []` starts a job immediately. It also restricts artifact downloads to the listed jobs.

**Q: Your pipeline takes 40 minutes. How do you approach it?**
Measure first: separate queue time from execution time, because if jobs are waiting for runners the fix is capacity, not configuration. Then find the critical path and work only on it. Remove artificial waiting with `needs:`, eliminate repeated dependency installation with proper caching, skip work that isn't needed via `rules:`, and only then consider parallelism — which costs runner capacity and makes debugging harder.

**Q: A test passes locally and in most pipeline runs, but fails randomly. What do you do?**
Treat it as a defect, not noise. Identify whether it's always the same test (test-level issue: ordering, timing, shared state, real network calls) or random jobs (infrastructure or a shared external resource). Reproduce by re-running the same commit repeatedly. Quarantine it so it stops blocking others, then fix or remove it. Do not mask it with `retry:`, because that makes the pipeline's green status untrustworthy.

---


## Interview questions

**Q: How do you secure a CI/CD pipeline?**
Treat it as production infrastructure with broad access. Scope secrets to the narrowest project and environment, mark deployment credentials protected so they only exist on protected branches and protected environments, and prefer short-lived credentials — OIDC federation with cloud providers — over stored static keys. Separate runner fleets so that runners with production access never execute untrusted or contributed code, use ephemeral isolated executors, and avoid privileged containers. Review changes to the pipeline configuration like code, since that file determines what runs with those credentials. Add scanning for secrets, source, dependencies, and images, with a defined policy on what blocks a release.

**Q: How can a secret leak from a pipeline even if it's never committed?**
Through logs (debug output, tools echoing arguments, error messages containing headers), through artifacts or caches that capture a generated credentials file, through image layers if it was passed at build time, through unprotected variables readable by any branch pipeline, and through overly broad group-level scoping. Masking doesn't stop a script that transforms the value before printing it, which is why scoping rather than masking is the real control.

**Q: Why should deployment runners be separate from build runners?**
Because a runner executing a job effectively grants that job everything the runner can reach — its filesystem, environment, and network. Build and test runners must execute code from arbitrary branches and merge requests, which is untrusted. If those same runners hold production credentials, anyone who can open a merge request can potentially extract them. Separating the fleets, restricting the deployment runner by tag to protected branches and protected environments, keeps untrusted execution away from production access.

**Q: Walk me through debugging a pipeline failure you've never seen before.**
Start from the log's first lines to establish which runner, executor, and image ran the job, which usually identifies the layer. State what's known and what isn't, then list candidate layers — Git, config, runner, environment, dependencies, build, test, artifact, registry, credentials, deployment, application, infrastructure — and decide what evidence would distinguish between them. Collect exactly that evidence, read the full error rather than skimming, and change one thing at a time so the fix is attributable. If it reproduces intermittently, that itself is evidence pointing at shared state, timing, or infrastructure.

**Q: How would you reduce a 40-minute pipeline?**
Measure first and separate queue time from execution time, because waiting for runners is a capacity problem that no configuration change fixes. Then identify the critical path — the longest dependency chain — since work off it doesn't affect total duration. Remove artificial waiting with `needs:`, eliminate repeated dependency installation with proper caching, skip work that isn't relevant to the change with `rules:`, cancel superseded pipelines with `interruptible`, run cheap checks before expensive ones, and only then consider parallelism, which costs capacity and debuggability.

**Q: What changes about CI/CD when the organisation grows tenfold?**
It becomes a platform with internal customers rather than a per-project file. Pipeline configuration moves into versioned shared templates or components with a deprecation policy, runners become autoscaling fleets segmented by trust level, secrets move to central management with short-lived credentials and automated rotation, cost becomes a tracked and attributed budget line, and pipeline reliability itself needs monitoring, alerting, and ownership — because a failure in a shared template is now an outage for every team simultaneously.

---


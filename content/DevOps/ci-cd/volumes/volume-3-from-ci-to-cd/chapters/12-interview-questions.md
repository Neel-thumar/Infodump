## Interview questions

**Q: What is "build once, promote many" and why does it matter?**
The artifact is built exactly once, stored in a registry, and then the identical artifact is promoted through test, staging, and production, with only configuration differing per environment. It matters because rebuilding per environment produces different binaries — dependencies, base images, and build-time conditions change — so the thing you tested is not the thing you released, and your test results no longer apply to what users are running.

**Q: How should container images be tagged in CI?**
Tag with something immutable and traceable — the commit SHA, or a semantic version for releases — and deploy by that. Friendly tags like branch names or `latest` are mutable aliases, fine for convenience but unsafe for deployment, because you can no longer determine what is running, reproduce a bug, or roll back to a specific previous build. Digests are the strongest identity.

**Q: How does a GitLab job authenticate to the container registry?**
GitLab injects `CI_REGISTRY`, `CI_REGISTRY_USER`, and `CI_REGISTRY_PASSWORD` into the job, valid only for that job's lifetime, and the job logs in with them. Nothing is hardcoded and nothing long-lived is stored. For cross-project access, `CI_JOB_TOKEN` is used with permissions controlled in project settings.

**Q: Why is Docker-in-Docker a security concern, and what are the alternatives?**
DinD requires the job container to run privileged, which effectively grants host-level access — a serious problem on shared runners, where another tenant's job or the host itself could be reached. Mounting the host Docker socket is no better, since the job can then spawn privileged containers. Rootless alternatives — BuildKit in rootless mode, Buildah, or Kaniko — build images without a privileged daemon, and are the appropriate choice on shared infrastructure.

**Q: What does an environment give you in GitLab?**
A named deployment target with history: which commit and artifact is currently deployed, every previous deployment, a link to the running system, and a place to attach controls — environment-scoped variables for configuration, and protected environments to restrict who may deploy. It turns deployment from an event into a tracked, auditable state.

**Q: How do you implement an approval gate before production?**
Define a production deployment job with `when: manual` so the pipeline creates it but waits for a person, make it depend on the staging deployment with `needs:`, target a protected environment so only authorised users can run it, scope production credentials to protected variables on protected branches, and route it to a restricted runner via tags. The job deploys the same image reference that was validated in staging.

---


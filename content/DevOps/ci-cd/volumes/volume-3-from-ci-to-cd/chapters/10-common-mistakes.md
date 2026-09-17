## Common mistakes

- Rebuilding per environment and calling it a pipeline.
- Deploying `:latest`.
- Hardcoding registry credentials instead of using the job-scoped ones.
- Treating a successful deploy job as a healthy application.
- Building images with DinD on a shared runner without understanding what privileged mode grants.
- Shipping build tooling in the runtime image, and running it as root.
- Different `.env` handling per environment that quietly changes behaviour.
- No registry cleanup policy.

---


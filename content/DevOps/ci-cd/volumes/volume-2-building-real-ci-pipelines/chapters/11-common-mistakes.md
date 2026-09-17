## Common mistakes

- Using cache to pass build output between jobs.
- Caching `node_modules` directly instead of the package manager's cache directory (leads to corrupted, platform-mismatched installs).
- Forgetting `when: always` on test report artifacts, then having no report for failed builds.
- A blanket `retry:` that hides flaky tests.
- Secrets stored as unprotected variables.
- A single 300-line YAML file that nobody dares to change.
- Optimising a job that isn't on the critical path.

---


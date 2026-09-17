## Common mistakes

- Deploying without verification, then relying on users to report outages.
- A health endpoint that always returns 200.
- Choosing canary without per-version metrics.
- Irreversible schema migrations shipped alongside application changes.
- A rollback procedure documented but never executed.
- `expire_in` / registry cleanup that deletes the image you need to roll back to.
- Defaulting to roll-forward during an incident.
- Unbounded waits in verification jobs that hang the pipeline instead of failing it.

---


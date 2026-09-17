## Common mistakes

- Treating scanning as done once the jobs are added, without a triage owner or a blocking policy.
- A single runner fleet with production credentials that runs every merge request.
- Group-level variables inherited by projects that have no need for them.
- Debugging the application layer when the failure is in the environment layer.
- Fixing flakiness with retries.
- Optimising jobs that aren't on the critical path.
- No cancellation of superseded pipelines, so you pay for work nobody wants.
- Assuming a deleted log means an exposed secret is safe.

---


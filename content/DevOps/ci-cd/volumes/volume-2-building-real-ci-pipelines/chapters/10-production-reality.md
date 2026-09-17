## Production reality

- **Pipelines cost money** — runner minutes, storage, engineer waiting time. A pipeline that runs 200 times a day is an infrastructure line item.
- **Artifact storage grows relentlessly.** Set `expire_in` on everything. Keep release artifacts long, keep PR build artifacts for days.
- **"Pipelines must succeed" is the switch that makes CI real.** Without it, CI is a suggestion.
- **`allow_failure: true` is how good intentions die.** A job added as "informational" and never fixed is noise that trains people to ignore warnings.
- **Someone owns the pipeline.** Unowned pipelines accumulate skipped tests, disabled jobs, and mysterious `|| true`s.

---


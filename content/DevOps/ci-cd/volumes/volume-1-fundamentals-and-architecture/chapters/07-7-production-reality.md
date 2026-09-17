## 7. Production reality

Things that are true in real GitLab setups but invisible in tutorials:

- **Runner capacity is a shared, finite resource.** Ten teams pushing at 5pm queue behind each other. Pipeline duration in practice includes queue time, which your YAML cannot fix.
- **Shell-executor runners drift.** Manually installed tools, leftover files, disk filling up. Container-based executors avoid most of this.
- **Image tags move.** `node:22` today is not the same bytes as `node:22` next month. For reproducible builds, pin more precisely — a specific patch version, or a digest. (More in Volume 3.)
- **Pipeline configuration gets reviewed like code, or it doesn't get reviewed at all.** Teams that let anyone edit `.gitlab-ci.yml` unreviewed eventually find a job that skips tests.
- **`.gitlab-ci.yml` is part of the delivery system**, not a config file. It is reviewable, has history, can be rolled back, and provides an audit trail of how the software was built.

---


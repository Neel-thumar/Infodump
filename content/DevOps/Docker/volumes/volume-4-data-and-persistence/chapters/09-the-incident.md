## The incident

This volume's failure comes in two parts: the container-specific mistake, and a named public example of the deeper lesson it points at.

### Part one: the writable layer treated as storage

**A note on framing, as in Volume 3.** This is a pattern, not a single famous outage — it happens constantly, at small scale, mostly to teams too embarrassed or too small to write it up. The mechanism is exactly what you executed at the top of this volume, so I'm not going to invent a company name for it.

The shape is always the same. A service is containerized quickly, often by someone learning Docker. It writes something — uploaded files, a SQLite database, generated reports, session data — to a path inside the container. It works. It works in staging. It works in production for months, because **stopping and starting a container preserves the writable layer**, so nothing ever signals a problem.

Then one of these happens:

- A deploy runs `docker rm` before `docker run` (which is what nearly every simple deploy script does).
- Someone runs `docker-compose down` — which removes containers.
- A `docker system prune -a` frees disk on a full host.
- The container is recreated to change one flag or bump one image tag.
- An orchestrator reschedules it to another node, where the writable layer never existed at all.

And the data is gone, with no error, because deleting a container's writable layer is the documented, intended behaviour of the command that was run.

**What makes it especially cruel** is the delay between the mistake and the consequence. The bad decision — no volume — was made months earlier by someone who has since left. The person who runs `docker rm` did nothing wrong. There is no error message anywhere in the chain. And the classic aggravating factor: the *database* was properly configured with a volume, because databases are obviously stateful, while the uploads directory sitting next to it was not.

**The prevention is structural, not behavioural:**

- Audit every container for what it writes. `docker diff <container>` (Volume 3) lists every path modified since start — anything in there that matters needs a mount.
- Treat `docker run` without a `-v` on a stateful service as a review failure.
- In Compose, name every volume; never rely on anonymous ones.
- Know that `docker-compose down` removes containers but **keeps named volumes**, while **`docker-compose down -v` deletes them**. That single flag is the difference between a restart and a wipe. Volume 6 returns to it.

### Part two: GitLab, 31 January 2017

Now the deeper lesson, with a named incident and an unusually honest public postmortem.

This one is not a container story — GitLab's databases ran on VMs — and I'm including it anyway, because it is the best-documented demonstration of the thing that actually kills you, which is not the deletion but the recovery.

**What happened.** On 31 January 2017, GitLab.com was suffering database load from spam. An engineer working on replication setup ran a removal command **on the primary database server rather than the intended secondary**, deleting the PostgreSQL data directory. GitLab's own summary: they lost modifications made between **17:20 and 00:00 UTC**, affecting roughly **5,000 projects, 5,000 comments, and 700 new user accounts**. Git repositories and wikis were unavailable during the outage but were not affected by the data loss, and self-managed installations were unaffected.

**The part worth studying is the recovery.** GitLab had multiple backup and recovery mechanisms. In the moment, essentially all of them failed:

- **Failover to the secondary** — impossible; the secondary had been wiped as part of the replication work being attempted.
- **`pg_dump` to S3** — failing silently for some time, because the `pg_dump` binary in use was **PostgreSQL 9.2 while the database was 9.6**, so the dumps produced nothing useful. The failure notification emails were being rejected on delivery, so nobody knew.
- **Azure disk snapshots** — not enabled for the database servers.
- **What actually saved them** was an **LVM snapshot taken by chance about six hours earlier**, manually, to load production data into staging for the load-testing work that started the whole day. Not a backup system. A side effect.

Recovery ran for many hours, restoring from a slower machine in a different region.

> **Confidence: high.** Sourced from GitLab's own two public posts — the 1 February incident note and the 10 February postmortem — with details corroborated across independent writeups. The numbers above (the UTC window, ~5,000 projects, ~5,000 comments, ~700 accounts) are GitLab's own stated best estimates.

**Why this belongs in a volume about Docker volumes.** Every lesson transfers directly and the container context makes each one *more* likely, not less:

| GitLab's failure | The container-era version |
| --- | --- |
| Backups failed silently for months | Your `docker run ... tar czf` cron job exits non-zero into `/dev/null` |
| Version mismatch made dumps useless | You dump with `postgres:16` tooling and restore into `postgres:17`, or vice versa |
| Snapshots existed but weren't enabled | Named volumes exist but the service uses an anonymous one |
| Replica and primary were both destroyed | Backup tarball sits on the same host, in the same `docker system prune` blast radius |
| Recovery had never been rehearsed | Nobody has ever restored a volume into a fresh one and started a container from it |

The one-line version, and it is the most valuable sentence in this volume: **you do not have backups; you have restores that have or have not been tested.** Everything else is a file of unknown quality.

Which is exactly why the worked example above restored into a *different* volume and started a *real* container from it. Do that on a schedule. Put it in CI if you can. An untested backup and no backup differ only in how you feel before you find out.

---


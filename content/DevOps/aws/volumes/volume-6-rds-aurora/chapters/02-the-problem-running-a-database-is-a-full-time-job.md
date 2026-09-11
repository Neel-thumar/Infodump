## THE PROBLEM: Running a Database Is a Full-Time Job

Suppose you self-manage PostgreSQL on EC2. Here's the actual work.

**Ongoing operations.** OS patching. PostgreSQL minor version upgrades, which means testing and a maintenance window. Major version upgrades, which mean a migration project. Certificate rotation. Log rotation before logs fill the disk.

**Backups.** Not "run `pg_dump` on a cron." A real backup strategy means continuous WAL archiving so you can recover to a point in time, offsite copies, retention policy, and — the part everyone skips — **regular restore testing**, because a backup you haven't restored is a hypothesis.

**High availability.** Streaming replication to a standby. Something that detects primary failure without false positives. Automatic promotion. A way for applications to find the new primary. And protection against split-brain, where both nodes think they're primary and accept conflicting writes.

**Monitoring.** Replication lag, connection counts, cache hit ratios, checkpoint behaviour, autovacuum health, transaction ID wraparound — the last one being a failure mode that will take your database read-only with no warning if you're not watching.

**Scaling.** Adding storage without downtime. Vertical resize windows. Connection pooling before you exhaust `max_connections`.

Doing this well requires a person who knows PostgreSQL deeply. Doing it *well enough to sleep* requires more than one, because they take holidays.

**RDS launched in October 2009**, starting with MySQL, and its proposition was: AWS does that list, you do schema and queries.

---


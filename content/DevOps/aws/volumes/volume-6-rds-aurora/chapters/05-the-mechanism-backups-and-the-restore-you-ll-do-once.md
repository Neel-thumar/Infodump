## THE MECHANISM: Backups and the Restore You'll Do Once

### Automated backups

Enabled by setting a retention period of 1 to 35 days. What you get:

- A daily snapshot during your backup window
- Continuous capture of transaction logs
- **Point-in-time recovery to any second** within the retention window

Set retention to **0 and you disable automated backups entirely**, including PITR. This is the default in some creation paths. Check it.

### Manual snapshots

Taken on demand, and **they persist after the instance is deleted**. Automated backups do not — delete the instance and (unless you ask for a final snapshot) the automated backups go with it.

This matters more than it sounds. An instance deleted by accident or by a Terraform change takes its automated backups with it. Manual snapshots are the thing that survives.

### The part people discover during an emergency

**You cannot restore in place.**

A restore — whether from a snapshot or a point in time — creates a **new instance** with a new endpoint. It does not overwrite the existing one.

So the actual recovery procedure is:

1. Restore to a new instance (takes minutes to hours depending on size)
2. Wait for it to become available
3. Apply your parameter group, security groups, and other configuration — the restore does not bring all of it
4. Repoint your application at the new endpoint
5. Deal with anything that happened to the old database between the recovery point and now

Step 3 and step 4 are where unpracticed teams lose an hour, in the middle of an outage, at whatever time of night it is.

Also worth knowing: a restored instance loads its data from S3 lazily, so **initial performance is degraded** while blocks are fetched on first access. Your freshly restored database is slow exactly when you're putting load back on it.

### The general principle

**Restore time is your actual recovery objective, and you don't know it until you've measured it.**

Not snapshot frequency. Not retention. The wall-clock duration from "we need to recover" to "the application is serving correct data." For a large database that number can be hours. Volume 8 turns this into RTO and RPO properly; for now, go and measure it once.

---


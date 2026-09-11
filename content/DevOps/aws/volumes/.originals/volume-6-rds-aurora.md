---
id: rds-aurora
title: "Volume 6 — RDS and Aurora: Handing Someone Else Your Database"
order: 6
description: What you actually surrender to a managed database, how Multi-AZ failover differs mechanically from read replicas, and why Aurora rebuilt the storage layer around the redo log — plus the failovers that were configured and never drilled.
draft: false
---

# Mastering AWS: The Engineering, The History, The Incidents

## Volume 6 — RDS and Aurora: Handing Someone Else Your Database

---

## The Question This Volume Answers

Your database is the one component you genuinely cannot lose.

An EC2 instance dies — Volume 4 taught you to replace it. A load balancer misbehaves — you route around it. But the database holds the only copy of things that exist nowhere else: what customers ordered, who owes what, what happened. Lose an instance and you lose capacity. Lose the database and you lose the business.

**So why would you hand it to someone else?**

And the follow-up that matters more: when you do, **what exactly have you given up**, and what have you been given that you couldn't build yourself?

That second question has two very different answers, because RDS and Aurora are not the same kind of thing. RDS is *managed PostgreSQL*. Aurora is *a different database engine* that happens to speak PostgreSQL. Marketing lists them together. They are not the same decision.

Four things to take away:

1. **Managed means constrained**, and the constraints are specific and knowable.
2. **Multi-AZ and read replicas solve different problems.** They are conflated constantly, including by people who run both.
3. **Aurora is genuinely novel**, and the paper explaining why is one of the clearest pieces of systems writing in the field.
4. **A backup you have never restored is not a backup.** This volume's incident is about exactly that.

---

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

## THE MECHANISM: What Managed Actually Means

### What you give up

Be concrete, because these constraints bite at inconvenient moments.

**No OS access.** No SSH, ever. You cannot install an agent, read a system log directly, run `perf`, or inspect the filesystem. If your debugging instinct is "let me get on the box," that instinct is now unavailable.

**No superuser.** On RDS PostgreSQL you get `rds_superuser`, which is close but not the same. Some extensions are unavailable. Some operations requiring true superuser are impossible. The list of permitted extensions is AWS's, not yours.

**No arbitrary configuration.** Settings are managed through **parameter groups**, and not every parameter is exposed. Some are locked because changing them would break AWS's management layer.

**Version availability is AWS's decision.** A PostgreSQL point release may exist for weeks before RDS offers it. You cannot run a version AWS hasn't certified.

**Maintenance happens on AWS's schedule.** You choose a weekly window. Within it, AWS may reboot your instance to apply patches. You can defer some of this, not all of it indefinitely.

**Storage only grows.** You can increase allocated storage online. **You can never decrease it.** Over-provision by 2 TB and you pay for 2 TB for the life of that instance. Fixing it means creating a new instance and migrating.

### What you get

**Automated backups with point-in-time recovery.** A daily snapshot plus continuous transaction log capture — logs are written roughly every five minutes — letting you restore to any second within your retention window (0 to 35 days). This alone is worth a great deal, and building the equivalent yourself is genuinely hard.

**Multi-AZ with automatic failover.** Detection, promotion, and endpoint redirection, handled.

**Read replicas** with one API call, including across Regions.

**Automatic minor version patching**, if you enable it.

**Storage autoscaling**, growing the volume before you run out.

**Performance Insights** — a genuinely good query-level performance view, showing which queries consume database time and what they wait on. It's better than what most teams build for themselves.

**Encryption at rest** via KMS (Volume 2), with one important catch we'll come to.

### Parameter groups

Configuration lives in a parameter group attached to the instance. Two kinds of parameter:

- **Dynamic** — applies immediately on change
- **Static** — requires an instance reboot

Change a static parameter and the instance shows `pending-reboot`. Nothing has happened yet. It's common to change a setting, observe no effect, and conclude the setting doesn't work — when in fact it's queued.

The default parameter group **cannot be modified**. To change anything you create a custom group, which is the correct first move on any new instance.

### The encryption catch

**You must enable encryption when you create the instance.** You cannot encrypt an existing unencrypted RDS instance in place.

The workaround: snapshot it, copy the snapshot *with* encryption specified, restore from the encrypted copy, then cut over. That's a migration with downtime, on a production database, that exists only because of a checkbox nobody ticked on day one.

**Tick the box. Always. Even in dev.** It costs nothing and removes a future project from your life.

---

## THE MECHANISM: Multi-AZ Is Not a Read Replica

This is the most consequential confusion in this volume, so let's be precise.

### Multi-AZ — for availability

AWS maintains a **standby instance in a different Availability Zone**. Writes to the primary are replicated **synchronously** — a transaction doesn't commit until the standby has it.

Key properties:

- **The standby serves no traffic.** In classic Multi-AZ it isn't readable. You're paying for a second instance that sits idle. That's the price of durability, not a bug.
- **Failover is automatic** on primary failure, AZ failure, or during certain maintenance operations.
- **The mechanism is DNS.** Your endpoint is a CNAME. On failover, AWS repoints it at the standby. Typically 60 to 120 seconds.
- **No data loss** in normal operation, because replication was synchronous.
- **It costs roughly double**, because you're running two instances.

There's also a newer **Multi-AZ DB Cluster** deployment with two *readable* standbys and semi-synchronous replication, offering faster failover. It's available for a subset of engines and versions — check current support rather than assuming.

### Read replicas — for read capacity

A separate instance with **asynchronous** replication from the primary.

Key properties:

- **Readable**, with its own endpoint. That's the entire point.
- **Asynchronous**, so it lags. Usually milliseconds; under heavy write load or a long-running query on the replica, it can be seconds or worse.
- **No automatic failover.** If the primary dies, nothing happens to the replica.
- **Can be promoted manually** to a standalone primary — and promotion is **irreversible**. The replica becomes an independent database and cannot rejoin the original.
- **Can live in another Region**, which is a disaster recovery building block (Volume 8).
- **Up to a limit** of replicas per source, varying by engine.

### The table that settles it

| | Multi-AZ | Read replica |
|---|---|---|
| Purpose | Availability | Read scaling |
| Replication | Synchronous | Asynchronous |
| Readable | No (classic) | Yes |
| Automatic failover | Yes | No |
| Cross-Region | No | Yes |
| Data loss on failure | None | Possible (replication lag) |
| Cost | ~2× | +1× per replica |

### Why the confusion is dangerous

Two failure modes, both common:

**"We have read replicas, so we're highly available."** You are not. If the primary fails, nothing fails over. Someone must notice, decide, and promote — and promotion is irreversible, so they'll hesitate. Meanwhile you're down. Worse, the replica may be missing recent transactions, so promoting it *loses committed data*.

**"We have Multi-AZ, so we can offload reads to the standby."** You cannot. In classic Multi-AZ the standby accepts no connections. It exists solely to be promoted.

They are different products. Most serious deployments need both.

### And the failure mode nobody tests

Failover works. Your application still breaks.

Here's why. The endpoint is a DNS name with a **very low TTL** — a few seconds. On failover, AWS repoints it. Any client that respects the TTL reconnects to the new primary within seconds.

**Clients that cache DNS forever do not.**

The classic offender is the JVM. Historically, the default `networkaddress.cache.ttl` in some JVM configurations was `-1`, meaning *cache successful DNS lookups for the lifetime of the process*. A Java application that resolved the endpoint at startup would keep connecting to the old IP address indefinitely — to an instance that is now the demoted standby, or simply gone.

The database failed over correctly in under two minutes. The application stayed broken until someone restarted it.

Connection pools compound this. A pool holding sixty established connections to the old primary will keep handing them out, and only discovers they're dead when a query fails on each one, individually.

**What to check:**

- **JVM:** set `networkaddress.cache.ttl` to something small (30 or 60 seconds)
- **Connection pools:** enable validation queries and configure maximum connection lifetime so connections are recycled
- **Any client:** verify it re-resolves DNS on reconnect rather than caching the address
- **Test it.** `aws rds reboot-db-instance --force-failover` triggers a real failover on demand. Do this in staging, deliberately, and watch what your application does.

---

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

## Part Two: Aurora

## THE PROBLEM: Databases Were Built for Disks That Don't Exist Any More

RDS is PostgreSQL, managed. Same engine, same architecture, same assumptions.

And those assumptions come from the 1970s and 80s: a database running on one machine with directly attached disks, where the slow thing is the disk and the scarce thing is memory.

**In a cloud data center, neither of those is true any more.** Storage is on the network (Volume 4). Networks have finite bandwidth. And the traditional architecture pushes an astonishing volume of data across that network.

### The write amplification problem

Amazon's engineers documented this in a paper published at SIGMOD 2017 — *"Amazon Aurora: Design Considerations for High Throughput Cloud-Native Relational Databases"* by Verbitski and colleagues. It's readable, short by academic standards, and worth your time.

Their central observation: consider a single logical write to a mirrored MySQL setup on EBS. What actually crosses the network?

- **Redo log records** — the write-ahead log
- **Binary log** — for replication and point-in-time recovery
- **Modified data pages** — the actual table data
- **Double-write buffer** — MySQL's protection against torn pages
- **Metadata and FRM files**

Each of those is written to the primary's EBS volume (itself mirrored), replicated to the standby, and written to the standby's EBS volume (also mirrored).

The paper works through the arithmetic and arrives at a write amplification factor in the region of **seven and a half times**, with many of those writes being **sequential and synchronous** — each one waiting on the one before.

That means throughput is bounded by the *slowest* step in a chain of network round trips. Adding CPU doesn't help. Adding memory doesn't help. **The network is the bottleneck**, and the traditional architecture is pouring data into it.

---

## THE MECHANISM: The Log Is the Database

Aurora's answer is a sentence that sounds like a slogan until you see the consequences: **the log is the database.**

### What Aurora writes

The database instance sends **only redo log records** to the storage layer. Not data pages. Not a binary log. Not a double-write buffer.

The storage nodes — a purpose-built distributed fleet, not EBS — take those log records and **materialize data pages themselves**, in the background, continuously.

The database never writes a page across the network. It writes a description of a change, and storage applies it.

### The quorum

Aurora keeps **six copies of your data across three Availability Zones** — two per AZ.

- **Write quorum: 4 of 6.** A write is durable once four storage nodes acknowledge it.
- **Read quorum: 3 of 6.**

Why those numbers? They give a property AWS calls **AZ+1**:

- **Lose an entire AZ (2 copies) and one more node (1 copy)** — three copies remain, which still satisfies the read quorum. You keep serving reads.
- **Lose an entire AZ (2 copies)** — four remain, which still satisfies the write quorum. You keep serving writes.

So Aurora survives the complete loss of an Availability Zone plus an additional node failure without losing availability. That's a substantially stronger guarantee than synchronous replication to one standby.

### Small segments, fast repair

The storage volume is divided into **10 GB segments**, each replicated six ways. When a storage node fails, only its segments need repairing — and a 10 GB segment repairs quickly.

This is a general distributed systems principle worth stealing: **make the unit of repair small.** Repairing 10 GB takes seconds; repairing a 64 TB volume takes a very long time, during which you're running degraded. It's the same cellularization idea AWS applied to S3's index subsystem after February 2017 (Volume 5).

### What this gets you

**Replicas share the storage.** Up to 15 Aurora replicas read from the *same* storage volume. No data is copied to them. Adding a replica doesn't add write load to the primary — contrast with RDS read replicas, where each one is a full copy receiving a replication stream.

**Replica lag is tiny** — typically tens of milliseconds — because replicas aren't applying a replication stream; they're reading from shared storage and receiving log records to invalidate their caches.

**Failover is fast.** There's no data to copy or catch up on. A replica is already attached to the same storage. Promotion is typically well under a minute.

**Storage grows automatically**, in 10 GB increments, to a very large ceiling (currently 128 TiB — verify against current documentation). You never provision storage, and unlike RDS, you're not stuck with a size you over-bought.

**Crash recovery is nearly instant.** A traditional database replays its redo log at startup, which can take a long time after a crash on a busy system. Aurora's storage layer is *continuously* applying redo in the background, so there's little to replay.

**Backtrack** (Aurora MySQL) can rewind the entire cluster to a previous point in time **in place**, without restoring to a new instance. If you've just run a bad `UPDATE` without a `WHERE` clause, this is the difference between seconds and hours.

**Global Database** replicates to other Regions through the storage layer rather than through the database engine, with typical cross-Region lag around a second, and promotion of a secondary Region measured in well under a minute. This is a Volume 8 building block.

### The honest trade-offs

Aurora is not free improvement, and the sales pitch tends to omit these.

**It costs more.** Instance prices are higher than equivalent RDS. On the standard configuration you also pay **per I/O request**, which for I/O-heavy workloads can dominate the bill and is genuinely hard to predict in advance. AWS later introduced an **I/O-Optimized** configuration with higher instance rates and no per-I/O charge — better for heavy workloads, worse for light ones. You have to model your own usage.

**Minimum size is larger.** There's no true micro-sized Aurora provisioned instance, so small workloads cost more than on RDS.

**It is not actually PostgreSQL or MySQL.** It's wire-compatible and largely behaviour-compatible, but the storage engine is entirely different. Extensions that reach into storage internals may not work. Performance characteristics differ — sometimes better, occasionally worse. Version support lags upstream.

**Aurora Serverless** (v2 is the current generation) scales capacity in Aurora Capacity Units and is excellent for intermittent workloads, but has its own cost profile and a non-zero floor.

**When RDS is the right answer:** steady, modest workloads; strict need for actual upstream PostgreSQL behaviour; cost sensitivity at small scale.

**When Aurora is the right answer:** you need many read replicas; you need fast failover; you need cross-Region replication with low lag; your write throughput is bottlenecked; or you want storage you never have to think about.

---

## REAL INCIDENT: The Failovers Nobody Drilled

There's no single famous RDS outage to tell you about, and that's itself the lesson. The failures here are distributed across thousands of companies, each one private, each one the same shape.

### The documented version: April 2011

Go back to the EBS re-mirroring storm from Volume 4. RDS was a downstream victim, and AWS's post-event summary covered it specifically.

Single-AZ RDS instances in the affected Availability Zone were, unsurprisingly, badly affected — their storage was stuck. A large fraction became unavailable and stayed that way.

Multi-AZ instances were supposed to be the answer. Most of them did fail over as designed.

**But not all of them.** AWS reported that a subset of Multi-AZ deployments did not fail over automatically. The explanation involved a software bug in the failover logic that surfaced when a particular sequence of conditions occurred — conditions that were far more likely during a large correlated failure than during the single-instance failures that failover had been tested against.

Read that again, because it generalizes: **the failover mechanism was tested against the failure mode it was least likely to face, and behaved differently during the failure mode it existed for.** Individual instance failure is common and well-handled. Correlated AZ-wide failure is rare, hard to simulate, and exactly when you need failover most.

*Accuracy note: AWS's post-event summary discusses the Multi-AZ failover issue and gives figures for affected instances. I'm giving the shape of it rather than precise percentages, because I don't want to state numbers I'm not certain of. The original document is worth reading directly.*

### The undocumented version: every company

Far more common, and invisible because nobody publishes it:

**The failover worked and the application didn't reconnect.** The JVM DNS caching problem from earlier. The database was back in ninety seconds; the outage lasted forty minutes because someone had to work out that a rolling restart was the fix.

**The failover worked and the connection pool didn't notice.** Sixty pooled connections to a dead host, handed out one at a time, each failing individually. The application degrades instead of failing cleanly, which is worse for diagnosis.

**Backups existed and nobody could restore them.** Retention configured, snapshots visible in the console, and no one had ever executed a restore. When it mattered, the team learned in real time that a restore creates a new instance, that it doesn't carry all configuration, that the endpoint changes, and that a large database takes hours.

**The read replica was promoted and data was lost.** Async replication was three seconds behind at the moment of failure. Three seconds of committed transactions, gone, discovered days later during reconciliation.

### The adjacent example worth studying

One of the best-documented database incidents in the industry is **GitLab's, on January 31, 2017** — and I want to be clear that **this was not AWS**. GitLab was running their own PostgreSQL. I'm including it because they published an unusually honest account, in public, in real time, and it illustrates this volume's point better than anything from inside AWS.

During an incident response, an engineer ran a destructive command against the wrong host and removed a production database directory. The recovery revealed that they had roughly five separate backup and replication mechanisms, and **none of them were working as intended** — some had been silently failing, some produced unusable output, some had never been tested.

They recovered from a snapshot that happened to exist because of an unrelated staging process, losing several hours of data.

Their write-up is worth reading in full. The line that matters: having many backup mechanisms configured is not the same as having one that works, and the only way to know which you have is to restore.

---

## TRY THIS ON YOUR MACHINE

**Cost flags read carefully.** A `db.t4g.micro` single-AZ instance with 20 GB of storage is **free tier eligible for the first 12 months** of a new account; outside that it's roughly 0.016 USD/hour plus storage, so about 12–15 USD/month if left running. **Multi-AZ and Aurora are not free tier.** Exercise 5 is optional and flagged separately. Teardown at the end — do not skip it.

Creation takes 5–10 minutes. Start it, read something, come back.

### 1. Create an instance and find the walls

```bash
export AWS_DEFAULT_REGION=us-east-1

# Generate a password and keep it out of your shell history
DB_PASS=$(openssl rand -base64 24 | tr -d '/+=' | head -c 20)
echo "$DB_PASS" > ~/.volume6-dbpass
chmod 600 ~/.volume6-dbpass

aws rds create-db-instance \
  --db-instance-identifier volume6-lab \
  --db-instance-class db.t4g.micro \
  --engine postgres \
  --allocated-storage 20 \
  --storage-type gp3 \
  --master-username labadmin \
  --master-user-password "$DB_PASS" \
  --backup-retention-period 7 \
  --storage-encrypted \
  --no-publicly-accessible \
  --query "DBInstance.{Id:DBInstanceIdentifier,Status:DBInstanceStatus}"

aws rds wait db-instance-available --db-instance-identifier volume6-lab
echo "ready"
```

Now try the things you can't do:

```bash
aws ec2 describe-instances \
  --filters "Name=tag:Name,Values=volume6-lab" \
  --query "Reservations[].Instances[].InstanceId" --output text
```

**What to expect:** nothing. The database runs on an EC2 instance somewhere, and it is not in your account. You cannot see it, SSH to it, or attach anything to it.

**Why it's interesting:** this is the boundary of "managed" made concrete. Everything you learned in Volume 4 about instances applies to this database, and none of it is available to you. That's the trade. Note also that `--storage-encrypted` was set at creation — the one flag that cannot be added later without a migration.

### 2. Watch a static parameter refuse to apply

```bash
aws rds create-db-parameter-group \
  --db-parameter-group-name volume6-params \
  --db-parameter-group-family postgres16 \
  --description "volume 6 lab"

# max_connections is static - requires reboot
aws rds modify-db-parameter-group \
  --db-parameter-group-name volume6-params \
  --parameters "ParameterName=max_connections,ParameterValue=150,ApplyMethod=pending-reboot"

aws rds modify-db-instance --db-instance-identifier volume6-lab \
  --db-parameter-group-name volume6-params --apply-immediately

sleep 30
aws rds describe-db-instances --db-instance-identifier volume6-lab \
  --query "DBInstances[0].DBParameterGroups" --output json
```

**What to expect:** the parameter group is attached with status `pending-reboot`, not `in-sync`.

*(If your engine version isn't `postgres16`, run `aws rds describe-db-engine-versions --engine postgres --query "DBEngineVersions[].DBParameterGroupFamily" --output text | tr '\t' '\n' | sort -u` and substitute.)*

**Why it's interesting:** the setting is recorded and not applied. Nothing errors. Nothing warns you. This is the shape of the bug where someone changes a parameter, tests, sees no effect, and concludes the parameter doesn't work — when in fact it's queued behind a reboot they never performed.

### 3. Look at the endpoint that makes failover work

```bash
ENDPOINT=$(aws rds describe-db-instances --db-instance-identifier volume6-lab \
  --query "DBInstances[0].Endpoint.Address" --output text)
echo "Endpoint: $ENDPOINT"

dig +noall +answer $ENDPOINT
dig $ENDPOINT | grep -A2 "ANSWER SECTION"
```

**What to expect:** a CNAME chain ending at an A record, with a **very low TTL** — typically around 5 seconds.

**Why it's interesting:** that five-second TTL is the entire failover mechanism. AWS doesn't move an IP address; it repoints a name. Which means your failover time is *bounded below* by how fast your client re-resolves DNS — and a client that caches forever will never recover, no matter how well AWS does its job. Now go and check your application's DNS cache settings. That's the actual homework here.

### 4. Find your real recovery window

```bash
aws rds describe-db-instances --db-instance-identifier volume6-lab \
  --query "DBInstances[0].{Earliest:EarliestRestorableTime,Latest:LatestRestorableTime,Retention:BackupRetentionPeriod,Window:PreferredBackupWindow}" \
  --output table
```

**What to expect:** an earliest and latest restorable time, typically a few minutes apart on a new instance, widening to your full retention period over the coming days.

Now take a manual snapshot and note the difference in lifecycle:

```bash
aws rds create-db-snapshot \
  --db-instance-identifier volume6-lab \
  --db-snapshot-identifier volume6-manual-snap

aws rds wait db-snapshot-completed --db-snapshot-identifier volume6-manual-snap

aws rds describe-db-snapshots --db-instance-identifier volume6-lab \
  --query "DBSnapshots[].{Id:DBSnapshotIdentifier,Type:SnapshotType,Created:SnapshotCreateTime}" \
  --output table
```

**What to expect:** your manual snapshot with type `manual`, alongside automated ones with type `automated`.

**Why it's interesting:** delete this instance and the `automated` snapshots go with it. The `manual` one survives. That distinction is the difference between "we can recover from an accidental instance deletion" and "we cannot," and almost nobody knows which they have until they need it.

**The homework this exercise is really setting:** restore that snapshot to a new instance and **time it**. It costs a little (a second instance for however long it takes) and it will teach you your real RTO. Most people never do this until the day it matters.

### 5. Trigger a real failover — optional, costs money

**Cost flag: this converts the instance to Multi-AZ, roughly doubling its hourly cost, and it is not free tier. Expect a few cents for a short test. Convert back or delete immediately after.**

```bash
aws rds modify-db-instance --db-instance-identifier volume6-lab \
  --multi-az --apply-immediately
aws rds wait db-instance-available --db-instance-identifier volume6-lab

# Note the current AZ
aws rds describe-db-instances --db-instance-identifier volume6-lab \
  --query "DBInstances[0].{AZ:AvailabilityZone,Secondary:SecondaryAvailabilityZone}" --output table

date
aws rds reboot-db-instance --db-instance-identifier volume6-lab --force-failover
aws rds wait db-instance-available --db-instance-identifier volume6-lab
date

aws rds describe-db-instances --db-instance-identifier volume6-lab \
  --query "DBInstances[0].{AZ:AvailabilityZone,Secondary:SecondaryAvailabilityZone}" --output table

# Watch the DNS answer change
dig +noall +answer $ENDPOINT
```

**What to expect:** the primary and secondary AZs swap places. The endpoint name is unchanged; the address it resolves to is different. Time the whole thing.

**Why it's interesting:** this is the one command that turns "we have Multi-AZ" from a configuration claim into a tested fact. Run this in staging on a real application, with traffic flowing, and watch what your connection pool does. Whatever you learn will be more valuable than anything in this volume.

**Revert to single-AZ immediately if you're not deleting yet:**
```bash
aws rds modify-db-instance --db-instance-identifier volume6-lab \
  --no-multi-az --apply-immediately
```

### Teardown — run this

```bash
aws rds delete-db-instance --db-instance-identifier volume6-lab \
  --skip-final-snapshot --delete-automated-backups

aws rds wait db-instance-deleted --db-instance-identifier volume6-lab

aws rds delete-db-snapshot --db-snapshot-identifier volume6-manual-snap
aws rds delete-db-parameter-group --db-parameter-group-name volume6-params

rm -f ~/.volume6-dbpass

echo "Remaining RDS instances:"
aws rds describe-db-instances --query "DBInstances[].DBInstanceIdentifier" --output text
echo "Remaining snapshots:"
aws rds describe-db-snapshots --snapshot-type manual --query "DBSnapshots[].DBSnapshotIdentifier" --output text
```

Both should be empty. **Check the snapshot list especially** — manual snapshots survive instance deletion by design, which is exactly the useful behaviour from exercise 4 and exactly the thing that quietly bills you if you forget.

---

## What You Should Now Be Able To Say

- Five specific things you can't do on an RDS instance that you could on your own server
- Why storage that only grows is a decision you make once and live with
- Why Multi-AZ and read replicas are not substitutes for each other, in both directions
- Why a database can fail over correctly in 90 seconds and leave your application down for 40 minutes
- What actually happens when you restore, and why step 3 is where teams lose time
- Why traditional replication writes roughly 7× more data than it needs to
- What "the log is the database" buys, and why 4-of-6 is the write quorum
- Two specific reasons Aurora might cost you more than RDS

---

## Where We Go Next

**Volume 7 — Compute Without Instances: Lambda, ECR, ECS, EKS.**

You've now provisioned instances and databases. Next: the models that try to make provisioning disappear.

Lambda first — the event-driven execution model, Firecracker microVMs and why they were a genuine breakthrough for AWS's own economics, what actually causes cold starts and why some are a hundred times worse than others, concurrency limits and how they become an outage, and the VPC-attached ENI problem that made Lambda-in-a-VPC nearly unusable until AWS re-engineered it in 2019.

Then containers: image layers and registries, task definitions, Fargate versus EC2 capacity, and an honest accounting of which parts of "AWS containers" are AWS's own work (ECS, its scheduler) and which are CNCF projects AWS operates on your behalf (Kubernetes, via EKS). Marketing blurs this constantly; your architecture decisions shouldn't. Plus IRSA and Pod Identity, which take Volume 2's role machinery down to the pod level.

Two incidents: the **recursive Lambda trigger** — a function writing to the event source that invokes it, producing a five-figure bill overnight — and **Log4Shell** as a test of whether anyone actually knew what was inside their images.

---

*Volume 6 complete. Say **continue** when you're ready for Volume 7.*

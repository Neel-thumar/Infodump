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


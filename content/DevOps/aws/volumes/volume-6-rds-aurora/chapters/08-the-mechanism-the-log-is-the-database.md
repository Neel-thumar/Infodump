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


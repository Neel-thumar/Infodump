# Chapter 35 — The Three Pressures, and Why They Fight

## 35.1 What each pressure wants

Volume 5 has had three subjects. Stated as demands on the structure:

| Pressure | What it wants |
|---|---|
| **Concurrency** (Ch 30–31) | No ancestor latches during descent. Content moving in **one direction only**. No multi-page atomic operations. Ideally, no writes to shared memory on the read path. |
| **Durability** (Ch 32) | Every structural change described in a durable log **before** it can reach the data files. Whole-page images available to repair torn writes. |
| **Maintenance** (Ch 33) | Prompt reclamation of space that is no longer needed. |

Each is individually reasonable. **They are mutually incompatible**, and every real system is a
particular choice about which one to under-serve.

## 35.2 The conflicts, enumerated

**Conflict 1 — Concurrency forbids the repair Maintenance needs.** §31.6.1: merging and borrowing
move keys leftward, breaking invariant I1 and with it the Recovery Theorem. So a B-tree cannot
rebalance on delete. **Result: permanent index bloat (§33.1), reclaimable only by rebuilding the
index (§33.9) — which works precisely because it builds a new tree rather than modifying the old
one.**

**Conflict 2 — Concurrency forbids the prompt reuse Maintenance wants.** §31.4's latch-free descent
lets threads hold stale block numbers. §33.6: therefore a deleted page cannot be recycled until every
possible holder of a stale pointer is gone. **Result: a third category of page — not live, not free,
waiting.** And on a replica, two horizons must be reconciled, which surfaces as replication lag or
cancelled queries (§32.10).

**Conflict 3 — Durability's repair mechanism increases Maintenance's workload.** §32.7: full-page
writes cost up to 8 KB of log per modification, and the cost fails to amortize exactly when keys are
random — which is the same condition under which Volume 3 §20.3's data-file write amplification is
worst. **Two independent costs, one shared root cause, and they compound.**

**Conflict 4 — Durability imposes a global ordering that Concurrency dislikes.** The WAL rule
(§32.3) requires an ordering between log flushes and page writes, and log records must be assigned
monotonic positions — a global sequence. Group commit and lock-free log insertion mitigate it, but
the log's insertion point is a serialization point in a system that spent two chapters eliminating
serialization points.

**Conflict 5 — Maintenance trades Latency against Space, and cannot avoid choosing.** §33.7:
steady-state bloat is *r*·*T*. Clean online and the writer pays latency; clean offline and you pay
*r*·*T* in space plus periodic I/O spikes plus the operational risk of a load-bearing background
process.

**And one resolution.** §34.3: **immutability resolves Conflicts 1, 2 and much of Durability, all at
once.**

- Nothing moves at all, so I1 is trivially satisfied — Conflict 1 dissolves.
- Readers hold snapshots legitimately rather than accidentally, so there are no stale pointers to
  fear — Conflict 2 dissolves.
- There is never an inconsistent intermediate state, so no log is needed for structural integrity
  and torn pages cannot corrupt the tree (§32.11) — most of Durability dissolves.
- And snapshots and MVCC come free rather than as separate mechanisms.

**Its bill is paid entirely in Maintenance and write throughput** (§34.4): reclamation becomes the
central difficulty, space is retained while readers hold old versions, writers do not scale past
one, and physical layout fragments over time.

> **So the three pressures reduce to one trade after all: you may relax mutation, and pay in space
> and write concurrency; or you may permit mutation, and pay in coordination machinery and deferred
> cleanup.** Volume 3 §20.9's RUM conjecture said you may optimize two of Read, Update and Memory
> overhead. Chapter 35 is the same statement with the third axis renamed: **the coordination you
> avoid, you pay for in space.**

## 35.3 The operator's view

Volume 5's material is unusual in this book in that it turns directly into things you monitor and
things you set. A short practical distillation.

**Watch these, in this order of importance:**

| Signal | Why it is the leading indicator |
|---|---|
| **Age of the oldest snapshot / visibility horizon** | §33.7's pathology. When this grows, *nothing* can be reclaimed anywhere, and every other metric follows it. Watch this above all. |
| Time since the last successful cleanup per relation | whether the cleaner is keeping up (*T* in §33.7's *r*·*T*) |
| Average leaf density per index | the direct bloat measure (§33.9) |
| Deleted-but-not-yet-recyclable page count | how much §33.6 is holding hostage |
| WAL generated per unit of logical work | §32.7 — a sawtooth here is full-page writes; a high plateau means random-key locality problems |
| Checkpoint frequency and duration | §32.7's trade between WAL volume and recovery time |
| Replication lag / cancelled-query rate on replicas | §32.10 — two horizons being reconciled |

**Set these deliberately rather than by default:**

| Knob | Set it when | §|
|---|---|---|
| Index fill factor below 100% | randomly-keyed, heavily-updated indexes | §33.9 |
| **Table** fill factor below 100% | update-heavy tables (preserves heap-only-tuple eligibility) | §33.8 |
| **Drop indexes on hot columns** | frequently the largest single win, and the least often attempted | §33.8 |
| Longer checkpoint interval + larger log budget | write-heavy, with tolerance for longer recovery | §32.7 |
| WAL compression | almost always — index pages compress well | §32.7 |
| Time-ordered identifiers instead of random ones | the third independent argument for this in the book | §32.7 |
| More aggressive cleanup scheduling | when *r*·*T* bloat exceeds what you want to store | §33.7 |
| `full_page_writes = off` | **only** with storage guaranteeing atomic page writes | §32.7 |

---


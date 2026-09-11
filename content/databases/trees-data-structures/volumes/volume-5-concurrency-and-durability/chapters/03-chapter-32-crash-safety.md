# Chapter 32 — Crash Safety

## 32.1 Two problems, and conflating them is the standard error

Chapter 31 made a tree safe against concurrent *threads*. This chapter makes it safe against the
power going out. There are **two separate problems**, they need **two different mechanisms**, and
nearly every informal treatment blurs them into one.

> **Problem A — Multi-page atomicity.** A split modifies three pages (the left page, the new right
> page, the parent) and sometimes a fourth and fifth (the right sibling's back-link, the metapage on
> a root split). **No storage device writes three pages atomically.** A crash between them leaves
> the tree structurally broken.

> **Problem B — Torn pages.** A *single* 8 KB page write is **also not atomic**. Devices guarantee
> atomicity per **sector** — 512 bytes or 4 KB — so an 8 KB page is two or sixteen independent
> writes. A crash mid-write leaves some sectors new and some old.

**Write-ahead logging solves Problem A and does not solve Problem B.** That single sentence is the
reason full-page writes exist, and §32.6 proves it. Keep the two problems separate as you read.

## 32.2 What Problem A actually looks like

Walk §31.3's split and enumerate the crash points, assuming for the moment that pages are written
back in an arbitrary order with no log. The split modifies **L** (upper half removed, high key
tightened, right-link set), creates **Q**, and modifies the **parent**.

```
CASE 1 — Q reached disk; L did not.

    L still holds all its keys and has no right-link to Q.
    Q exists as a page holding a duplicate copy of the upper half.
      → If the parent ALSO landed, the tree now contains those keys TWICE
        by two different paths.  SILENT DUPLICATE RESULTS.
      → If the parent did not land, Q is merely an orphan.  A leaked page.

CASE 2 — L reached disk; Q did not.            ◄── THE WORST ONE

    L has had its upper half REMOVED and its right-link SET to Q's block.
    Q's block contains whatever was there before — stale bytes, or nothing.

      → A reader that hits L's high key and follows the right-link reads
        ARBITRARY BYTES AS A PAGE HEADER.  pd_lower, pd_upper, the item
        count: all garbage.  The backend either faults, loops, or returns
        nonsense.
      → And the keys that were moved to Q are simply GONE.
        SILENT DATA LOSS.

CASE 3 — L and Q reached disk; the parent did not.

    This is EXACTLY §31.3's step-7-to-step-8 window.
    Q is unreachable by descent but reachable by L's right-link, and the
    move-right rule finds it.
      → CORRECT FOR READERS.  Nothing is lost.  (§32.9 exploits this.)

CASE 4 — The parent reached disk; L and Q did not.

    The parent holds a downlink to a block that was never initialized.
      → DANGLING DOWNLINK.  A descent walks into garbage.

CASE 5 — Root split: the metapage landed; the new root page did not.

    btm_root points at an uninitialized block.
      → The index is unusable from the very first lookup.
```

The taxonomy is worth naming, because the failure severities differ by orders of magnitude:

| Failure | Severity |
|---|---|
| **Orphaned page** | a leak — wasted space, no wrong answers |
| **Incomplete split** (Case 3) | **benign** — the Recovery Theorem covers it |
| **Dangling downlink** | reads uninitialized memory as structure |
| **Duplicate keys** | silently wrong results |
| **Lost keys** | **silent data loss** |

Case 3 being benign is not luck. It is a *designed* property of §31.3's ordering, and §32.9 shows
that designing for it removed an entire class of recovery bugs.

## 32.3 Write-ahead logging: the mechanism

> **The WAL rule.** Before a modified page is allowed to reach durable storage, a log record
> **describing that modification** must already be durable.

Two things follow, and the second is as important as the first:

**Correctness.** After a crash, replay the log forward from the last checkpoint. Every change that
might have reached the data files is described in the log, so every page can be brought to a
consistent state.

**Performance — and this is why WAL is used even where durability could be achieved otherwise.** The
log is **sequential**. WAL converts a burst of scattered random page writes into one append-only
stream, which Volume 3 §20.8 priced at 3–4× on NVMe and ~330× on rotating media. The random writes
still happen eventually, but at **checkpoint** time, where they can be sorted, batched, and
overlapped. WAL is a latency-to-throughput converter as much as a durability mechanism.

```
  WITHOUT WAL: a committing transaction must flush every page it touched,
               to scattered locations, before it can report success.

                 commit ──► 5 random 8 KB writes, fsync'd  ≈ 5 × 50 µs serial

  WITH WAL:      a committing transaction flushes ONE contiguous log region.

                 commit ──► 1 sequential write + fsync     ≈ 1 × 50 µs
                            (and group commit amortizes even that
                             across concurrent transactions)
```

## 32.4 The enforcement point: why the LSN lives on the page

The WAL rule is a claim about *ordering between two subsystems* — the log writer and the buffer
manager's page evictor. Something has to enforce it, at the moment a page is about to be written.

The mechanism (Volume 3 §4.3 introduced the field without explaining it): **every page carries
`pd_lsn`, the log position of the last change made to it.** Then the buffer manager's page-write
path is:

```
    flush_page(P):
        XLogFlush(P->pd_lsn)        ← ensure the log is durable up to this point
        write(P)                     ← only now may the page go out
```

> **Why per-page, and not in a side table?** Because the check must be available **at the moment of
> eviction, for that specific page, with no additional lookup and no additional I/O.** A side table
> would need its own durability (chicken and egg), its own lookup on the hottest path in the buffer
> manager, and its own concurrency control. Putting the LSN in the page makes the page
> **self-describing**: it carries its own durability precondition. Nothing else needs to be
> consulted.

The same field does double duty during recovery: redo is made **idempotent** by comparing
`record.lsn` against `page.pd_lsn` and skipping records already reflected in the page. That
idempotence is what lets recovery be interrupted and restarted arbitrarily — which matters, because
crashes during recovery are not rare.

Hold onto that second use. §32.6 turns on it.

## 32.5 ARIES: how recovery actually runs

> **Confidence: high.** C. Mohan, Don Haderle, Bruce Lindsay, Hamid Pirahesh and Peter Schwarz,
> "ARIES: A transaction recovery method supporting fine-granularity locking and partial rollbacks
> using write-ahead logging", *ACM TODS* 17(1), 1992. Developed at IBM Almaden; the design
> essentially every WAL-based system uses.

Three phases:

```
  1. ANALYSIS   Scan forward from the last checkpoint.
                Reconstruct the dirty page table (which pages might be stale on disk)
                and the transaction table (which transactions were in flight).
                In-flight transactions are "losers" — they must be rolled back.
                Determine the earliest LSN redo must start from.

  2. REDO       Scan forward, reapplying EVERY logged update — including the updates
                of loser transactions.  Idempotent via the pd_lsn check (§32.4).
                                                                  ↑
                                                    "REPEATING HISTORY"

  3. UNDO       Scan backward, rolling back the losers, writing a
                COMPENSATION LOG RECORD (CLR) for each undone action so that
                the undo work is itself redoable and never performed twice.
```

**"Repeating history" is the counterintuitive part and it is the central idea.** Why redo the work
of transactions you are about to abort?

Because it restores the database to **exactly the physical state it was in at the instant of the
crash.** Undo can then operate against a known state. Without repeating history, undo would first
have to determine *which* of a loser's updates had actually reached disk and which had not — the
same unbounded problem WAL was invented to avoid. Repeating history makes redo's job purely
mechanical (apply everything, skip what's already applied) and undo's job purely logical (reverse
these operations, in this order).

**CLRs make undo crash-safe.** If the system crashes during recovery, the next recovery attempt sees
the CLRs, knows those undos are done, and does not repeat them. Recovery is therefore restartable —
which it must be.

### Physiological logging

> **Confidence: moderate-high on the term's attribution to Jim Gray.**

How much detail does a log record contain? Three options:

| Style | A record says | Size | Problem |
|---|---|---|---|
| **Physical** | "bytes 1234–1250 of block 42 become `<bytes>`" | large | huge for structural changes |
| **Logical** | "insert row (5,'foo') into table t" | tiny | **redo must reproduce identical physical decisions** |
| **Physiological** | "on block 42, insert this tuple at offset 7" | small | — |

**Physiological logging — "physical to a page, logical within a page" — is what everyone uses**, and
for B-trees the middle row's problem is acute. Volume 3 §17.7 and §18.3 described split-point
selection as a *heuristic* depending on the page's exact contents, on whether the page is rightmost,
and on how much suffix truncation each candidate boundary permits. Logging "split this page"
logically would require redo to **re-run that heuristic and reach a bit-identical answer** — across
versions, across platforms, across configuration changes.

So B-tree WAL records are more physical than heap records: a split record enumerates exactly which
entries go left and which go right, rather than asking redo to decide. **The price of a clever
heuristic on the write path is a more explicit log record.**

## 32.6 Full-page writes: why WAL cannot fix Problem B

Now Problem B, and the argument that this is not merely inefficient but *impossible* to fix with
deltas.

### What a torn page is

```
An 8 KB page being written; the device commits 4 KB sectors independently.
Power fails after the first sector.

   ┌──────────────── sector 0 (4 KB) ────────────────┬──── sector 1 (4 KB) ────┐
   │ NEW  pd_lsn, pd_lower, pd_upper, line pointers  │ OLD  tuple bodies       │
   └─────────────────────────────────────────────────┴─────────────────────────┘
     ↑ says "there are 368 items, data starts at 2104"   ↑ contains 367 items'
                                                           worth of bytes, at
                                                           the OLD offsets

   Line pointer 368 points at byte 2104, which contains STALE FREE SPACE.
   pd_lower and pd_upper describe a layout the page does not have.
```

**The page is not stale. It is unparseable.** It is a state that no correct execution ever produced —
a chimera of two versions, self-inconsistent.

### Why delta replay cannot repair it

Recall §32.4: a normal WAL record is a **delta** ("insert this tuple at offset 7 on block 42"), and
applying it requires two things:

1. The page must be **readable and parseable**, so the delta has something to attach to.
2. The page's **`pd_lsn` must be meaningful**, so redo can tell whether the change is already
   applied.

**A torn page has neither.** And the second failure is the lethal one:

> **The sharpest version of the argument.** `pd_lsn` lives in the **first 8 bytes of the page** — so
> it is in sector 0. A torn page can therefore have a **new `pd_lsn` and old contents**.
>
> Redo consults `pd_lsn` to decide whether a record has already been applied. Seeing a `pd_lsn`
> greater than or equal to the record's LSN, **redo skips the very record that would have fixed the
> page.**
>
> The page is permanently corrupt, and **recovery reports success.**

You cannot patch a page you cannot read, and you especially cannot patch a page that is lying to
you about how up to date it is.

### The fix: log the whole page

> **Full-page writes.** The **first** modification of any page after each checkpoint logs the
> **entire page image** rather than (or in addition to) a delta. On redo, that image is written
> **wholesale**, replacing whatever is there.

Replacement rather than patching. It does not need the page to be parseable, and it does not consult
the page's LSN — it overwrites it. Subsequent deltas in the same checkpoint interval then apply on
top of a known-good base.

```
  Checkpoint ─────────────────────────────────────────► next checkpoint
      │
      ├─ page 42 modified 1st time  → FULL 8 KB IMAGE logged
      ├─ page 42 modified 2nd time  → ~150-byte delta
      ├─ page 42 modified 3rd time  → ~150-byte delta
      │  ...
      └─ (after the next checkpoint, page 42's next touch pays the image again)
```

## 32.7 The cost, and why it makes random keys expensive twice over

Full-page writes are not cheap. A 20-byte index insert can generate an 8 KB log record.

**But it amortizes if pages are hot.** If a page is modified *k* times per checkpoint interval:

$$
\text{WAL bytes per modification} = \frac{8192 + 150(k-1)}{k}
$$

| *k* (modifications per page per checkpoint) | WAL bytes per modification |
|---|---|
| **1** | **8,192** |
| 10 | 954 |
| 100 | 232 |
| 1,000 | 158 |

And now recall Volume 3 §20.3, which found the same fork in the road for *data* writes:

| Insert pattern | Pages touched | *k* | WAL per insert |
|---|---|---|---|
| **Random keys**, index ≫ RAM | a different page every time | **≈ 1** | **≈ 8 KB** |
| **Sequential keys** | the same rightmost page, ~160 rows before it fills | **≈ 160** | **≈ 200 B** |

> **Random keys are expensive twice: once in the data files (Volume 3 §20.3's ~500× write
> amplification) and again in the log (a 40× penalty here).** The two effects have the same cause —
> no locality means no amortization — and they compound. This is now the third independent argument
> in this book for time-ordered identifiers over random UUIDs, and they are not the same argument
> restated; they are separate costs that happen to share a root cause.

### The tuning consequences

Everything above turns into three real knobs:

| Knob | Effect | Cost of pushing it |
|---|---|---|
| Longer checkpoint interval | fewer checkpoints → fewer full-page images → less WAL | **longer crash recovery** |
| `wal_compression` (pglz / lz4 / zstd) | compresses full-page images specifically | CPU; usually a clear win, since index pages are mostly similar keys and structured padding and compress well |
| `full_page_writes = off` | eliminates the cost entirely | **only safe on storage guaranteeing atomic 8 KB writes.** Getting this wrong produces silent, unrecoverable corruption — visible only after a crash, in one page, possibly months later. |

WAL volume characteristically **spikes immediately after each checkpoint** and decays until the next
one, as pages pay their image toll one by one. If you have ever seen a sawtooth in a WAL-generation
graph, that is what it is.

## 32.8 Hint bits: the elegant exception, and how checksums close it

An instructive edge case, because it shows the boundary of the whole scheme.

Chapter 33 will introduce **hint bits** — marks a scan leaves on an index page recording "this entry
is dead" (§33.3 layer 1). These are **not WAL-logged**. If a crash loses them, the only cost is a
redundant future check. Logging them would add WAL volume for information that is cheap to
recompute, so not logging them is correct.

**But turn on page checksums and the exception closes.** Any change to a page changes its required
checksum. So a torn page whose only change was a hint bit now **fails checksum validation and is
reported as corruption** — a false alarm caused by an optimization.

Therefore, with checksums enabled (or `wal_log_hints` set), hint-bit changes **do** trigger a
full-page write after all.

> **This is the cleanest illustration in the volume of how these mechanisms interact.** The cheap
> optimization was available *only as long as you were not also asking for a stronger integrity
> guarantee*. You get to choose which you want, and the system will not let you have both for free.
> Chapter 35 argues this shape is general.

## 32.9 Recovery must never modify the tree

Now the architectural payoff of §31.3's deliberate separation of steps 7 and 8, and it is a large
one.

Recall §32.2 Case 3: L and Q written, parent not. §31.5's Recovery Theorem says this state is
**correct for readers**. So recovery has a choice:

**Option 1 — recovery completes the split.** Replay the two-page record, then insert the missing
separator into the parent. This is what PostgreSQL did before version 9.4, and every part of it is a
problem:

- Recovery runs in a context where it **cannot allocate pages freely** (the free space map is not
  yet trustworthy).
- It **cannot take normal latches** (the buffer manager is in a special startup state).
- It **cannot fail** — there is no "abort recovery and try something else."
- And it is **impossible on a hot standby**, which is replaying continuously *while serving read
  queries*, so a structure-modifying replay action would race live readers.

**Option 2 — recovery leaves the incomplete split, and normal operation repairs it.** Mark the left
page with a flag (`BTP_INCOMPLETE_SPLIT`). Any later operation that descends through the parent and
notices the flag calls a routine to insert the missing downlink (`_bt_finish_split`). **The repair is
performed by whoever next passes by**, in full normal operating conditions, with normal latching,
and able to fail and retry.

PostgreSQL moved from Option 1 to Option 2 in version 9.4, and the resulting property is worth
stating as a design principle:

> **Recovery never modifies the tree's structure. It only replays page images and deltas.**
>
> Structural repair is deferred to normal runtime, driven by a flag on a page. This removed an
> entire class of recovery bugs and is what makes hot-standby replay of index changes tractable at
> all.

*(Confidence: high on the change and the version; moderate on the complete list of motivations.)*

Note the shape: this is **deferred repair**, and it is the same move as Volume 3 §18.9 (defer
merging), Volume 3 §20.6 (defer reconciliation to compaction), and Volume 4 §22.4 (lazy propagation).
Chapter 33 is about the family.

## 32.10 One real implementation, concretely

PostgreSQL's `nbtree` defines its own WAL record types. The list is worth seeing because it maps
one-to-one onto Chapter 31's operations:

| Record | Operation | Chapter reference |
|---|---|---|
| `XLOG_BTREE_INSERT_LEAF` | insert on a leaf page | Volume 3 §18.3 |
| `XLOG_BTREE_INSERT_UPPER` | insert a separator on an internal page | §31.3 step 8 |
| `XLOG_BTREE_INSERT_META` | insert plus a metapage update | §31.6.5 |
| `XLOG_BTREE_SPLIT_L` / `_R` | a page split; the suffix records which side the new item landed on | **§31.3 steps 1–6, as ONE record covering both pages** |
| `XLOG_BTREE_NEWROOT` | root split | §31.6.5 |
| `XLOG_BTREE_DEDUP` | a deduplication pass on a page | Volume 3 §20 territory |
| `XLOG_BTREE_VACUUM` | background cleanup removing items | §33.3 layer 4 |
| `XLOG_BTREE_DELETE` | targeted index tuple deletion | §33.3 layers 2–3 |
| `XLOG_BTREE_MARK_PAGE_HALFDEAD` | §31.7 stage 1 | §31.7 |
| `XLOG_BTREE_UNLINK_PAGE` / `_META` | §31.7 stage 2 | §31.7 |
| `XLOG_BTREE_REUSE_PAGE` | a recycled page is about to be reused | §33.6 |

Two of these deserve comment.

**The split is one record covering both pages.** L and Q are made consistent atomically with respect
to redo — which eliminates §32.2's Cases 1 and 2 outright. The **parent insertion is a separate
record**, which deliberately leaves Case 3 reachable, which §32.9 explained is the point.

**`XLOG_BTREE_REUSE_PAGE` exists for replicas, and it is a nice illustration of a distributed
subtlety.** On the primary, whether a deleted page may be recycled is checked against the *primary's*
oldest snapshot (§33.6). But a hot standby may be running **older** queries that the primary knows
nothing about, and recycling a page under one of them is hazard H5 from §30.3. So the record tells
the standby "I am about to reuse this page", and the standby must either **delay replay** or **cancel
the offending query**. That is the mechanism behind `max_standby_streaming_delay` and the
"canceling statement due to conflict with recovery" error that surprises people.

> The general lesson: **a visibility horizon is a local fact, and replication makes it a distributed
> one.** Any deferred-reclamation scheme (Chapter 33) that is replicated has to reconcile two
> horizons, and the reconciliation shows up either as replication lag or as cancelled queries.
> There is no third option.

## 32.11 The alternative: shadow paging and copy-on-write

Everything above assumes **in-place update plus a log**. There is a completely different answer, and
it is the one filesystems tend to pick.

> **Copy-on-write / shadow paging.** Never overwrite a page. To modify a leaf, write a **new** copy
> of it to a free block; then write a new copy of its parent pointing at the new leaf; and so on up
> to the root. Finally, **atomically flip a single pointer** to the new root.

Only the final flip needs to be atomic, and that is achievable: make it a single-sector write, and
double-buffer it so that a torn flip still leaves a valid previous version.

```
  BEFORE                              AFTER updating one leaf

     ROOT ──────┐                        OLD ROOT ────┐      NEW ROOT ───┐
                │                                     │                  │
        ┌───────┴───────┐                     ┌───────┴──┐        ┌──────┴───────┐
        A               B                     A          B        A*        B'
      /   \           /   \                 /   \      /  \      (shared)   /  \
     L1   L2         L3   L4               L1   L2   L3   L4              L3*  L4'
                                                                                  ↑ new copy

  * = SHARED between the two versions.  Only the path from the changed leaf
      to the root is copied — h pages.  Everything else is shared.

  Both roots remain valid → the old one IS A SNAPSHOT, for free.
```

**What this buys:**

- **No log at all** is needed for structural integrity. There is no window in which the tree is
  inconsistent, because the new version is never referenced until it is complete.
- **No torn pages in the tree** — a torn *new* page is simply never referenced, since the root flip
  never happened. Only the superblock needs torn-write protection, and it is small and
  double-buffered.
- **Recovery is instantaneous**: read the newer valid superblock. No log replay, no analysis phase,
  no redo, no undo. Startup time is constant regardless of how much was in flight.
- **Snapshots and MVCC are free.** Retaining an old root *is* a snapshot. One mechanism delivers
  crash safety, snapshots, and multi-version reads.

**What it costs:**

- **Write amplification**: modifying one leaf writes *h* pages, not one. Volume 3's four-level tree
  means four page writes per update.
- **Space retention**: old versions cannot be freed until no reader holds them — which is Chapter
  33's problem, arriving by a different route.
- **Free-space management becomes the hard part.** Every write needs a free block, and blocks are
  freed non-contiguously as versions expire. LMDB's free list and ZFS's space maps are substantial
  pieces of engineering.
- **Fragmentation.** Pages move on every write, so any sequential layout degrades over time — a
  well-known and genuinely difficult issue for CoW filesystems.
- **Usually a single writer**, because two concurrent CoW writers would both want to copy the shared
  path to the root and would conflict there.

**Real systems:** **LMDB** (Howard Chu) is the purest example — a memory-mapped CoW B+tree with two
alternating meta pages, a single writer, and lock-free readers; it has no WAL and needs no recovery
process. **ZFS** keeps a ring of uberblocks with transaction-group numbers and picks the highest
valid one. **Btrfs** uses superblocks with generation numbers. §34.7 returns to these, because CoW is
immutability, and Chapter 34 is about what immutability gives you generally.

### The comparison, and it is closer than you would guess

| | **WAL + in-place** | **Copy-on-write** |
|---|---|---|
| Page writes per leaf update | 1 | ***h*** (≈ 4) |
| Log writes per update | 1 record (~150 B), **or 8 KB on first touch after a checkpoint** | **none** |
| Effective writes, first touch | ~2 pages' worth (page + full-page image) | ~4 pages |
| Log required | **yes** | **no** |
| Recovery time | replay from checkpoint: seconds to minutes | **instant** |
| Torn-page repair | full-page writes | **not applicable** |
| Snapshots | separate mechanism | **free** |
| MVCC | separate mechanism | **free** |
| Concurrent writers | **many** | usually **one** |
| Fragmentation over time | low | **high** |
| Free-space management | moderate | **hard** |

Read the "effective writes" row. Because full-page writes make WAL's first touch of a page cost
roughly two pages' worth of I/O, the gap against CoW's four is a factor of two, not a factor of ten
— and CoW throws in snapshots, MVCC, and instant recovery.

> **That is why the two lineages split by domain rather than by merit.** Databases, which need many
> concurrent writers and low fragmentation, chose WAL. Filesystems, which want snapshots and instant
> mount after a crash and can tolerate a single writer per transaction group, chose copy-on-write.
> Neither is a compromise; each is the right answer to a different weighting.

---


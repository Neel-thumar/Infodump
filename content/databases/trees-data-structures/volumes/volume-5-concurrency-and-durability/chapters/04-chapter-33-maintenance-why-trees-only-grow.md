# Chapter 33 — Maintenance: Why Trees Only Grow

## 33.1 The asymmetry

Volume 3 §17.3 established a pleasing fact: the minimum-occupancy invariant is **self-maintaining
under insertion**, because a split's natural output is exactly two half-full pages. No extra work is
needed to preserve it.

It also flagged the other half: **I2 is not self-maintaining under deletion.** Removing a key can
drop a page below the minimum, with no natural repair. Volume 3 §18.7 gave the textbook repairs —
borrow and merge — and §31.6.1 has now proved that **both are forbidden**, because both move keys
leftward and would break the Recovery Theorem.

So the situation is:

```
  INSERT:  splits CREATE pages.        Self-maintaining.  Cheap.
  DELETE:  nothing DESTROYS pages,     Repairs forbidden. So: nothing happens.
           except total emptiness.
```

**A B-tree grows and does not shrink.** A page that loses 95% of its entries stays at 5% occupancy
indefinitely. This is **index bloat**, and it is not a bug, an oversight, or an unfinished feature.
It is the price of §31.4's latch-free descent, paid in space.

And it compounds with a second, independent problem.

## 33.2 The index does not know what is dead

This one is specific to multi-version concurrency control, and it is worth deriving carefully because
it is the reason cleanup is *asynchronous* rather than merely *deferred*.

Under MVCC, a `DELETE` does not remove a row. It marks the row version with the deleting
transaction's identifier. The version must remain visible to any transaction whose snapshot predates
the delete, and becomes removable only when **no snapshot anywhere in the system could still need
it**.

Now look at what an index entry contains:

```
    ┌─────────────────────────────────────────┐
    │  key   │  pointer to the row (page,slot)│
    └─────────────────────────────────────────┘
                    ↑
        THAT IS ALL.  No transaction id.  No visibility information
        of any kind.
```

Therefore, examining the index **in isolation**, you cannot determine whether any given entry is
dead. Answering "is this entry removable?" requires:

1. Fetching the heap page the pointer names, and
2. Comparing that row version against the **oldest snapshot in the entire cluster** — which depends
   on transactions this backend knows nothing about, some of which have not finished.

> **Consequence: synchronous, in-transaction index cleanup is structurally impossible.** The
> deleting transaction does not yet know whether the entry is removable, because that depends on
> other transactions that are still running. It is not that cleanup is *deferred for efficiency*; it
> is that the information required to do it does not exist yet.

### Why indexes carry no visibility information

This is a deliberate design choice, not an accident, and the alternative is worse:

| If indexes carried visibility info | Cost |
|---|---|
| Every entry grows by 8–16 bytes | fanout drops → Volume 3 §17.6's arithmetic → **taller trees** |
| Entries must be updated on **commit** and on **abort** | a transaction touching *k* rows with *m* indexes writes *k*·*m* index pages at commit |
| Entries must be updated as the **visibility horizon advances** | a background process rewriting index pages continuously |

The chosen alternative is to keep indexes ignorant and reconcile later. Everything in the rest of
this chapter is a consequence of that choice.

## 33.3 The five-layer architecture

Real systems do not have "a cleanup algorithm". They have a **stack of layers**, ordered from
nearly-free-and-narrow to expensive-and-thorough. Understanding *why* it is layered is more useful
than memorizing the layers, so here is the principle first:

> **The layers are ordered by cost and by coverage, and the two are inversely related.**
> Opportunistic layers cost almost nothing but only see what ordinary traffic happens to visit.
> Background layers see everything but must scan everything. **A production system runs all of them
> because their coverage is complementary** — the cheap layers handle the common case and the
> expensive one is the backstop that guarantees correctness.

### Layer 1 — Opportunistic hint marking (free)

When an index scan follows a pointer to a row and finds that row dead to all transactions, it marks
the *index* entry as dead on the way back.

**Cost: essentially zero.** The information was obtained anyway — the scan had to fetch and check the
row regardless. The mark is a flag on a line pointer.

**It is a hint, not a fact of record.** Not WAL-logged (§32.8), so it can be lost on a crash; losing
it costs one redundant future check. This is the cheapest possible cleanup and it is free precisely
because it is a byproduct.

**Coverage: only entries that a scan happens to visit.** An index nobody queries is never cleaned by
this layer at all.

### Layer 2 — Kill-before-split (the highest-leverage layer)

When an insertion finds the target leaf full, **before splitting**, it checks for entries marked
dead by layer 1. If there are any, it removes them and compacts the page, and the insertion proceeds
**without splitting**.

> **This is the single most valuable cleanup in the system**, and the reason is timing. It converts
> "the index permanently grows by one page" into "the index reuses space it already had" — at the
> exact moment when that matters, at no scheduling cost, with no background process involved, and
> without holding any latch it was not already holding.
>
> A workload that deletes and re-inserts within the same key range can run **indefinitely with a
> stable index size** on layers 1 and 2 alone.

### Layer 3 — Targeted deletion on overflow

Layers 1 and 2 only help if a *scan* visited the entries. Version churn from `UPDATE`s produces dead
index entries that no scan ever looks at — an index on a column that never changes still accumulates
one dead entry per update of the row.

So: when a leaf is about to overflow **and** the index's logical contents are not actually changing
(the same logical rows keep getting new versions), speculatively visit the relevant heap pages to
determine which entries are dead versions of rows that also have a live version, and delete those.

**The distinguishing feature is the trigger: page overflow, not a garbage threshold.** It is a
last-resort attempt to avoid a split, and it is willing to spend heap I/O to do it — because a split
is *permanent* and the I/O is not. That asymmetry is the justification.

*(In PostgreSQL this is "bottom-up index deletion", added in version 14. It depends on an earlier
change — treating the row pointer as an implicit final key column — which made locating a specific
entry among many duplicates O(log n) instead of O(run length).)*

### Layer 4 — Background bulk cleanup

A background process collects the set of dead row pointers, then scans each index and removes every
entry referencing one of them.

Two implementation details that are more interesting than they look:

**It scans in physical block order, not tree order.** It does not descend the tree at all. Since it
must visit every page anyway, a sequential sweep of the whole file beats a tree traversal with random
access — Volume 3 §15.4's sequential-versus-random argument, applied to maintenance.

**Which creates a race that Chapter 31 caused.** A concurrent split can move entries from a
not-yet-scanned page to a page the sweep has already passed, so the sweep would **miss** them — and
§33.4 shows a missed entry is a *correctness* bug. This is what PostgreSQL's `btpo_cycleid` guards
(§31.8): pages touched during the current cycle are stamped, so the sweep can detect the situation
and backtrack.

### Layer 5 — Page deletion, for completely empty pages only

§31.7's two-stage protocol: half-dead (downlink removed from the parent), then dead (sibling links
spliced around it), then — eventually — recycled (§33.6).

Note how much weaker this is than merging. **The page must be *entirely* empty.** A page holding one
entry out of a possible 400 is left alone forever. That is the §31.6.1 constraint showing up as an
operational limit.

## 33.4 The constraint that makes all of this mandatory

Everything above could be read as "cleanup is an optimization; skip it and you waste space." That
reading is wrong, and this section is why.

> **Row pointers are recycled.** When the background process frees a heap line pointer, that slot can
> later be reused for a **completely different row**.
>
> If an index entry pointing at that pointer still existed, an index scan would follow it, fetch a
> **real, live, visible row that has nothing to do with the indexed key**, and return it. Not an
> error. Not a null. A plausible-looking wrong row.

This is the worst failure mode in the entire book: **silent wrong answers, with no error, no
corruption detectable by any consistency check, and no way for the application to notice.**

It dictates the phase ordering of the background process, absolutely:

```
    PHASE 1:  scan the heap, collect the set of dead row pointers.
    PHASE 2:  clean EVERY index, removing all entries referencing those pointers.
              ↑ every index. Not some. Not the ones that look dirty.
    PHASE 3:  ONLY NOW free the heap line pointers for reuse.
```

> If you have ever wondered why a vacuum process cannot be reordered, partially skipped, or
> interrupted-and-resumed-from-the-middle-of-phase-2, this is the reason. **Phase 2 is a correctness
> barrier, not a housekeeping step.** And it is why an index that cannot be cleaned — because it is
> corrupt, or locked, or on unreachable storage — blocks reclamation of the whole table.

This also explains why the layered architecture of §33.3 has a **mandatory** bottom layer. Layers 1–3
are optimizations and may do nothing. Layer 4 must run, or the system eventually cannot reclaim
anything at all.

## 33.5 Free space maps, and why index ones are different

Reclaimed space has to be findable. The standard mechanism is a **free space map** — a compact
per-relation structure recording available space per block, so a would-be writer can find a
suitable page without scanning.

**For indexes it does something narrower, and the reason is instructive.**

In a heap, a new row can go on *any* page with room. Placement is free, so tracking *partial* free
space is useful: "block 5,000 has 3 KB available" is actionable.

In a B-tree, **a tuple's placement is determined entirely by its key.** So:

> Knowing that block 5,000 has 3 KB free is **worthless** if your key belongs on block 12,000.
> **Space in the wrong place is not space.**

Therefore an index's free space map tracks only **entirely free, recyclable pages** — it is
effectively a free list of whole blocks, consumed when the tree needs to allocate. And it follows
directly that **intra-page free space in an index can only ever be reclaimed by an insertion whose
key lands on that specific page**, which is exactly why §33.3's layer 2 is so valuable and why bloat
in a shifting key distribution is so persistent.

## 33.6 Deferred recycling: the bill for Chapter 31

Here is the most direct causal link in this volume, and §31.7 promised it.

Recall §31.4: a descending thread **releases the parent's latch before latching the child**, so it
holds a block number while holding no latch. That was the whole point.

Now suppose page X is deleted (§31.7 stages 1–2) and **immediately reallocated** as a new page
elsewhere in the tree:

```
    Reader holds a stale block number for X, obtained before the deletion.
    Meanwhile X is deleted and re-allocated as a leaf in a distant part
    of the keyspace, and filled with unrelated keys.

    The reader latches X and applies the move-right rule:
        the page is structurally VALID
        the high key is a real high key
        the right-link points somewhere real
        → the check passes or fails ARBITRARILY, on unrelated data.

    NOTHING DETECTS THIS.  §30.3 hazard H5.
```

So the page cannot be recycled immediately. The protocol is:

> Record, on the deleted page, the transaction identifier at the moment of deletion. The page becomes
> **recyclable** only when the system can prove that **no transaction that existed at that moment is
> still running** — i.e. the visibility horizon has advanced past it. Only then does it go to the
> free space map.

In the interim it is a fully allocated page occupying disk that nothing can use. **A third category:
not live, not free, waiting.**

> **The trade, stated plainly: §31.4 bought latch-free descent by allowing threads to hold stale
> pointers. §33.6 is the invoice — you cannot reuse a page until every possible holder of a stale
> pointer to it has gone away.** These are not two independent design decisions. They are one
> decision and its consequence.

And §32.10 already noted the distributed complication: on a replica, the relevant horizon is the
*replica's*, which may be older. Hence replication lag or cancelled queries; there is no third
option.

## 33.7 Online versus offline cleanup: the actual trade

The book has now used deferred cleanup five times (Volume 1 §1.4's tombstones, Volume 3 §18.9,
Volume 3 §20.6's compaction, Volume 4 §22.4's lazy propagation, §32.9's deferred split repair). It is
time to derive the trade properly rather than keep asserting it is a good idea.

Let cleanup work accumulate at rate *r* (bytes of reclaimable space produced per second) and be
performed in batches every *T* seconds.

**Steady-state bloat.** Space is consumed continuously and reclaimed periodically, so:

$$
\text{steady-state bloat} \approx r \times T
$$

**Bloat is directly proportional to the cleanup interval.** Double the interval, double the wasted
space. This is the whole of capacity planning for a deferred-cleanup system, in one line.

**Peak cleanup load.** Each run must process *r*·*T* worth of work in some duration *d*, so the
instantaneous I/O demand during a run is:

$$
\text{peak load} \approx \frac{r \times T}{d}
$$

**A longer interval means a bigger, spikier job** competing with foreground traffic.

**Total work.** Here the naive analysis is wrong in an interesting way. Deferring does not merely
move the same work later — it genuinely *reduces* it, for two reasons:

1. **Batching converts random I/O into sequential I/O** (§33.3 layer 4's physical-order sweep).
2. **Some work is never done at all**, because it was made unnecessary. Reclaim a page eagerly and
   the next insertion may split it again immediately; wait, and you may find the space was re-used
   in place. Volume 4 §22.4's lazy propagation is the pure form of this: work deferred into a
   subtree nobody ever visits is work never performed.

So:

| | **Online** (in the writer's path) | **Offline** (background) |
|---|---|---|
| Who pays the latency | **the writer** | nobody, directly |
| Latency profile | uniform, slightly higher | **low, with periodic spikes** |
| Total work done | higher — some is immediately undone | **lower** — batched and sometimes elided |
| I/O pattern | random | **sequential** |
| Space overhead | ~none | ***r* × *T*** |
| Latches required | multiple pages — **often forbidden (§31.6.1)** | one page at a time |
| Tuning burden | none | **substantial** — it becomes a discipline |
| If it falls behind | cannot | **unbounded bloat, then correctness limits (§33.4)** |

> **The summary: deferring cleanup lowers total work and smooths writer latency, and pays for both
> in space and in operational risk.** The space cost is *r*·*T* and is predictable. The operational
> risk is that the cleaner becomes load-bearing infrastructure whose failure mode is unbounded
> growth — and, because of §33.4, eventually a hard stop rather than a gradual degradation.

The most common production pathology follows directly: **anything that pins the visibility horizon
stops reclamation entirely.** A long-running transaction, an abandoned replication slot, an idle
session holding a snapshot — each makes *r* effectively positive and *T* effectively infinite, and
bloat grows without bound while the cleaner runs dutifully and reclaims nothing. **This is precisely
the classic garbage-collection pathology of a live reference preventing collection**, and §34.8
makes that identification exact.

## 33.8 The best cleanup is the write you never make: HOT

Everything above is about cleaning up index entries after the fact. There is a better idea: **do not
create them.**

The problem: under MVCC, an `UPDATE` creates a new row version at a new location. A new location
means every index on the table needs a new entry pointing to it. So updating one unindexed column on
a table with six indexes writes one heap tuple **and six index entries**, at six random locations in
six different files, each dirtying a page, each generating WAL, each paying §32.7's full-page toll —
for a change no index's contents depend on.

**The optimization.** Perform a **heap-only tuple** update when two conditions both hold:

1. **No indexed column changed.** Checked against every column of every index on the table, plus
   index expressions and partial-index predicates.
2. **The new version fits on the same heap page** as the old one.

If both hold, write the new version on the same page and chain it from the old row's line pointer.
**No index is touched at all.** Existing index entries still point at the original line pointer, and
a scan arriving there follows the chain within the page to find the version its snapshot should see.

```
  Heap page 42, after two such updates:

    line pointers:  [1]────┐    [2]───┐    [3]───┐
                           │          │          │
    versions:            v1 ──chain──► v2 ──────► v3  (current)

    The index still points at line pointer 1.  It has NEVER been updated.
```

**The failure modes are the interesting part**, and both are actionable:

- **Condition 1 is all-or-nothing across all indexes.** A single index on a frequently-updated column
  disables this optimization for *every* update that touches that column. **This is one of the
  highest-leverage schema decisions in a relational database and it is almost never considered:
  adding one index on a hot column can multiply the write cost of your entire update workload by the
  number of indexes on the table.**
- **Condition 2 fails when heap pages are full.** Which is what a table's fill factor is *for* —
  reserving space on each heap page specifically so future updates can stay local. The default is
  usually 100%, which is optimal for insert-mostly tables and actively harmful for update-heavy ones.

**And the second half of the win: page-local pruning.** Because no index points at intermediate
versions in the chain, dead versions can be removed by a **page-local** operation, triggered
opportunistically whenever the page is accessed. No index cleanup, no background process, no
cross-page coordination. A hot-spot row updated thousands of times per second can be maintained
entirely by pruning, and the indexes never learn anything happened.

> **Note the structure of this optimization: it works by arranging for the expensive cross-structure
> coordination not to be necessary.** That is a more powerful move than making the coordination
> cheaper, and it is worth looking for. Chapter 34 is the same move applied to concurrency.

## 33.9 Measuring and fixing bloat

Since bloat is designed-in rather than pathological, it has to be measured rather than prevented.

**What to measure:**

| Metric | What it tells you |
|---|---|
| **Average leaf page density** | the direct bloat measure. ~90% healthy, <50% badly bloated |
| Leaf fragmentation | how far leaf pages have drifted from physical key order — predicts range-scan cost |
| Deleted-but-not-recyclable page count | how much §33.6 is holding hostage |
| **Age of the oldest snapshot / horizon** | the leading indicator for §33.7's pathology; watch this above all |
| Time since the last successful background cleanup per relation | whether the cleaner is keeping up |

**What to do about it**, in increasing order of disruption:

- **Lower the index fill factor** for indexes on randomly-keyed, heavily-updated columns, so freshly
  built pages have headroom.
- **Lower the table fill factor** to preserve §33.8's condition 2.
- **Drop indexes on hot columns** — see §33.8's first failure mode. Frequently the largest single win
  and the least often attempted.
- **Rebuild the index.** Space is *reused* by the free space map but not *released* to the
  filesystem, because relation truncation requires the **trailing** blocks to be empty and in a
  B-tree the physically last block is arbitrary. So the file stays at its historical maximum size
  essentially forever, and a rebuild is the only thing that repacks pages to the target fill factor —
  because it is the only operation that moves keys leftward, which §31.6.1 forbade for everything
  else. Concurrent rebuild (building a fresh index and swapping it in without blocking writes) is
  the production form.

> **§31.6.1 forbade moving keys leftward. Rebuilding the index is how you move keys leftward
> anyway — by building a new tree instead of modifying the old one.** Which is, note, exactly
> Chapter 34's move.

## 33.10 The same problem in every lineage

Step back and the specific mechanisms above turn out to be one pattern with five costumes:

| Lineage | What is deferred | The debt it accumulates | The collector |
|---|---|---|---|
| **B-tree** (§33.1–33.6) | merging, page reclamation | index bloat | background vacuum + rebuild |
| **MVCC heap** (§33.2) | removing dead row versions | table bloat | background vacuum |
| **LSM-tree** (Volume 3 §20.6) | reconciling overlapping runs | **read** and **space** amplification | compaction |
| **Copy-on-write** (§32.11) | freeing superseded versions | space retention | free-list / space-map management |
| **Managed runtimes** | freeing unreachable objects | heap growth | garbage collection |
| **Git** (§34.7) | removing unreferenced objects | repository growth | `git gc` |

> **Every production data structure with a cheap write path defers reclamation, and the tuning knob
> is always the same one: how far behind you let the cleaner get.** The bloat equation *r*·*T* from
> §33.7 applies to all six rows. So does the pathology: a live reference — a long transaction, a held
> snapshot, an old reflog entry, a leaked object handle — pins the horizon and stops collection
> entirely.

And the three-way trade among read cost, write cost, and space is exactly Volume 3 §20.9's **RUM
conjecture**: optimize two of Read, Update and Memory overhead, and sacrifice the third. Deferred
cleanup is the standard way of *buying* Update at the expense of Memory, and compaction strategy is
the dial that sets the exchange rate.

---


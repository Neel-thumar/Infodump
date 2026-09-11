# Chapter 20 — The Design Space: B*, Bε, and the LSM Lineage

## 20.1 Two things a B+-tree is bad at

The B+-tree is the right answer to §15's problem, and it has held that position for fifty years.
It has exactly two structural weaknesses, and each has produced a family of variants.

**Weakness 1 — space.** §17.7 established ~69% average occupancy, 50% worst case. A B+-tree is
~1.44× larger than its data requires. §20.2 addresses this.

**Weakness 2 — write amplification.** Updating one row rewrites a whole page, and if keys are
random, every update rewrites a *different* page. §20.3 quantifies it and §20.5–20.9 are two
different families of answer.

## 20.2 B*-trees: buy the space back

Knuth's term. The idea: **before splitting a full node, try to redistribute keys into an adjacent
sibling that has room.** Only if both siblings are also full do you split — and then you perform a
**2-to-3 split**: two full nodes become three nodes at ~2/3 occupancy each.

The minimum occupancy invariant rises from 1/2 to **2/3**.

### The utilization formula, derived

There is a clean generalization. If your split turns *j* full nodes into *j*+1 nodes, the expected
steady-state utilization under random insertions is:

$$
U(j) = j \cdot \ln\!\left(\frac{j+1}{j}\right)
$$

| Split type | Minimum occupancy | Expected utilization |
|---|---|---|
| **1 → 2** (ordinary B-tree) | 50% | *U*(1) = ln 2 = **69.3%** |
| **2 → 3** (B\*-tree) | 66.7% | *U*(2) = 2 ln(3/2) = **81.1%** |
| 3 → 4 | 75% | *U*(3) = 3 ln(4/3) = **86.3%** |

> **Confidence: moderate.** I am reporting this formula from memory, but note that it correctly
> reproduces the independently well-established ln 2 result at *j* = 1, which is a meaningful
> self-consistency check. The direction and rough magnitude of the B\* improvement are not in
> doubt.

**So B\*-trees buy about 12 percentage points of utilization — a ~15% smaller index**, which means
~15% fewer pages to cache and to read.

### Why nobody uses them

The cost is not space or CPU. It is **concurrency**, and it is disqualifying.

A redistribution or 2-to-3 split must atomically modify **three pages plus their parent**. That
means holding locks on multiple siblings and their parent simultaneously, in an order that can
conflict with another operation doing the same thing from the opposite direction — deadlock-prone
in exactly the way §18.6 described.

And worse, structurally:

> **Redistribution moves keys *leftward*.** §19.6 flagged and §18.9 stated the invariant that
> high-concurrency B-tree algorithms depend on: **content only ever moves rightward**, so a reader
> holding a stale page pointer can always recover by walking right. Redistribution violates this
> directly. **B\*-trees and Lehman & Yao concurrency are mutually incompatible**, and every
> production system chose concurrency.

What real systems do instead is recover most of the same space with cheaper mechanisms: the
rightmost-split heuristic (§17.7), which is nearly free and worth ~2× on sequential keys, and
opportunistic reclamation of dead entries before splitting a page. Those get you most of the way
without touching more than one page at a time.

## 20.3 Write amplification, derived properly

Now the second weakness, and it is the one that spawned a rival lineage.

**Insert one 100-byte row with a random key into a clustered B+-tree** with 16 KB pages, in a
database with crash safety. Count the bytes that reach storage:

```
  Logical data written by the application ........................    100 bytes

  1. Read the target leaf page (not cached — random key, index > RAM)  16 KB read
  2. Modify it in memory
  3. Write a redo/WAL record describing the change ..............     ~150 bytes
  4. If this is the page's first modification since the last
     checkpoint, log a FULL PAGE IMAGE (needed to repair torn
     writes — §17.6 point 4, Volume 5) ...........................     16 KB
  5. Eventually the dirty page is written back ..................      16 KB
  6. The SSD's own internal amplification (NAND program/erase) ..      × 1.5–4

  Bytes to storage:  ~32 KB × (1.5 to 4)  =  48 KB – 128 KB
  ────────────────────────────────────────────────────────────────────────────
  WRITE AMPLIFICATION:                          roughly  500× to 1,300×
```

**And every one of those writes is to a random location**, because the key was random.

> **Confidence: the mechanism is exact; the multiplier depends heavily on configuration.** Full-page
> logging can be disabled on storage that guarantees atomic page writes; device amplification
> varies enormously with over-provisioning and workload. Treat 500–1,300× as "the bad case, and it
> is reachable in default configurations."

### The crucial condition: this is a *random key* problem

Now redo it with a **sequential** key. Every insert lands on the same rightmost leaf. That page
stays hot in the buffer pool, absorbs ~160 rows before it fills, and is written **once**:

```
  Sequential keys: 160 rows × 100 bytes = 16 KB of logical data
                   → one 16 KB page write + ~160 small WAL records
                   WRITE AMPLIFICATION ≈ 2×
```

**Random keys: ~500×. Sequential keys: ~2×.** A factor of 250, from nothing but key ordering.

That single comparison explains an enormous amount of practical database advice:

- Why time-ordered identifiers beat random UUIDs (§19.9).
- Why bulk-loading sorted data is dramatically faster than inserting it randomly.
- Why an index on a high-cardinality random column is the expensive index on your table.
- Why "just add an index" is a write-throughput decision, not only a read-latency one.

**And it defines the problem the rest of this chapter solves:** how do you get B+-tree-quality
reads without paying random-write costs on random-key inserts?

## 20.4 The diagnosis

Why does a B+-tree have this problem at all? Because of one property that is otherwise its greatest
strength.

> **A B+-tree performs updates *in place*.** Every key has exactly one home, determined by its
> value, and an update goes to that home. That is precisely what makes reads cheap — one descent,
> one page, done, no ambiguity about where a key might be.
>
> But "the location is determined by the key" means that if keys arrive in random order,
> **locations are visited in random order.** In-place update and random writes are the same
> property viewed from two sides. You cannot keep one and discard the other.

So there are only two ways out, and both lineages in the rest of this chapter take one of them:

**(a) Batch the writes** so that many logical updates share one physical page write. → Bε-trees.
**(b) Stop updating in place** — write new data somewhere sequential and reconcile later. → LSM-trees.

## 20.5 Bε-trees: batch the writes

> **Confidence: high on the concept and the bounds; moderate on citations and commercial dates.**

The theoretical foundation is Gerth Brodal and Rolf Fagerberg, "Lower bounds for external memory
dictionaries" (SODA 2003), which established the trade-off curve. The engineering came from
Michael Bender, Martin Farach-Colton, Bradley Kuszmaul and colleagues, commercialized by
**Tokutek** as the **Fractal Tree Index** in **TokuDB** (a MySQL storage engine), and explored in
the **BetrFS** research filesystem. Tokutek was acquired by Percona around 2015; TokuDB was
deprecated a few years later in favour of RocksDB-based storage.

**The idea.** Split each node's space in two. Give a fraction to **pivots** (child pointers, as
usual) and the rest to a **buffer of pending messages** — inserts, deletes and updates that logically
belong somewhere below but have not been pushed down yet.

```
A Bε-tree internal node:

  ┌──────────────────────┬────────────────────────────────────────────┐
  │  pivots: B^ε entries │  BUFFER: pending messages, ~B entries      │
  └──────────────────────┴────────────────────────────────────────────┘
     ↑ fanout is now B^ε      ↑ inserts land HERE, at the root, and
       instead of B             trickle down in BATCHES when full

  An insert:  append a message to the ROOT's buffer.  Done. O(1) pages.
  When a buffer fills: flush its messages to the appropriate children,
                       in one batch per child.
  A search:   descend as usual, but also check each node's buffer on
              the way down for pending messages about your key.
```

**The bounds.** With node capacity *B* items and pivot fraction *B*^ε:

| | B-tree | Bε-tree |
|---|---|---|
| Height | log_*B* *N* | (1/ε) log_*B* *N* |
| **Search** | O(log_*B* *N*) | O((1/ε) log_*B* *N*) |
| **Insert** | O(log_*B* *N*) | O((1/ε) log_*B* *N* / *B*^(1−ε)) |

At ε = 1/2: search is **2× worse**, insert is **√*B*× better**. For *B* = 500, √*B* ≈ 22.

**Why insert gets cheaper: batching.** A B-tree writes a page to store one item. A Bε-tree
accumulates ~*B* items in a buffer and moves them down together, so the page write is amortized
across many items. §20.4(a), realized.

### The unifying observation, which is the reason to care

Look at what ε does at its extremes:

| ε | Fanout | Buffer | What you get |
|---|---|---|---|
| **ε = 1** | *B* | none | **A B-tree.** All space to pivots. |
| ε = 1/2 | √*B* ≈ 22 | ~*B* | The Fractal Tree sweet spot |
| **ε → 0** | constant | ~*B* | **Something LSM-shaped** — a few very wide sorted runs, batched merges |

> **ε is a dial between a B-tree and an LSM-tree.** They are not two rival structures; they are two
> endpoints of one parameterized family, and the parameter is *how much of each node you spend on
> routing versus on buffering*. Once you see that, the whole design space in this chapter becomes
> one axis rather than a menagerie.
>
> *(This framing is the standard one in the literature; I am confident it is the right way to
> present it, less confident that any single paper states it exactly this way.)*

## 20.6 LSM-trees: stop updating in place

> **Confidence: high on the citations.**

The **Log-Structured Merge-tree** was described by Patrick O'Neil, Edward Cheng, Dieter Gawlick and
Elizabeth O'Neil in "The Log-Structured Merge-Tree (LSM-Tree)", *Acta Informatica* 33, 1996. Its
direct ancestor is Mendel Rosenblum and John Ousterhout's **log-structured filesystem** (SOSP 1991
/ *TOCS* 1992), which applied the same insight to file storage: on a device where sequential writes
are hundreds of times cheaper than random ones, **never write anything but a log.**

Google's **Bigtable** paper (2006) popularized the modern memtable+SSTable formulation, and
**LevelDB** (Sanjay Ghemawat and Jeff Dean, 2011) and its Facebook fork **RocksDB** (2012) made it
the default building block for a generation of storage engines.

### Deriving it from Volume 1

The LSM-tree is already implicit in something Volume 1 §1.4 said:

> *"A sorted array is not a data structure you can maintain; it is a data structure you can build
> once and then only read. … The way to make a sorted array work is to stop inserting into it."*

Take that literally. A sorted array has *perfect* read properties — binary searchable, perfectly
sequential to scan, 100% space utilization, zero pointer overhead — and one fatal flaw, Θ(*n*)
insertion. So:

1. **Never insert into a sorted array.** Build it once, seal it, treat it as immutable.
2. Accumulate new writes in a small **mutable, in-memory** structure — the **memtable** (typically
   a skip list or a balanced BST; Volume 2's material, finally load-bearing).
3. When the memtable fills, **write it out as a new immutable sorted array** — one big sequential
   write. This file is an **SSTable** (sorted string table).
4. You now have several sorted runs. A read must check them all, newest first.
5. Periodically **merge** runs together in the background — a sequential read of several sorted
   files and a sequential write of one — to keep their number bounded. This is **compaction**.

```
                      THE LSM STRUCTURE

  writes ──►  ┌──────────────────┐        every write: append to a WAL (sequential)
              │  MEMTABLE (RAM)  │        plus insert into the in-memory sorted structure
              │  mutable, sorted │
              └────────┬─────────┘
                       │ when full: flush as ONE SEQUENTIAL WRITE
                       ▼
  L0     ┌────────┐ ┌────────┐ ┌────────┐      immutable sorted runs,
         │ SSTable│ │ SSTable│ │ SSTable│      possibly overlapping key ranges
         └────────┘ └────────┘ └────────┘
                       │ compaction: merge-sort several runs into one
                       ▼
  L1     ┌──────────────────────────────┐     ~10× bigger, non-overlapping
         └──────────────────────────────┘
                       │
  L2     ┌────────────────────────────────────────────────┐   ~10× bigger again
         └────────────────────────────────────────────────┘
                       │
  …up to L5 or L6, each ~10× the size of the one above

  A READ must check: memtable → L0 runs → L1 → L2 → … until found.
  A DELETE writes a TOMBSTONE — a marker meaning "this key is gone" — which
  shadows older values until compaction physically removes both.
```

**Every write to storage is sequential.** The WAL is an append. The memtable flush is one big
sequential write. Compaction is sequential reads and sequential writes. **Nothing is ever updated
in place.**

Note that Volume 1 §1.4 also predicted the tombstone: *"there is a mitigation — tombstones, marking
a slot dead without moving anything — which converts deletion to Θ(1) at the cost of the array
growing monotonically."* That is exactly the LSM delete, and the "growing monotonically" cost is
exactly what compaction pays down.

## 20.7 The three amplifications, and the compaction dial

LSM-trees do not eliminate cost; they move it. There are three currencies and compaction strategy
decides how you pay.

**Write amplification** — bytes written to storage per byte of logical data. Every row is written
once on flush, then again each time compaction moves it down a level.

**Read amplification** — pages read per lookup. A read may have to check every level.

**Space amplification** — storage used per byte of live data. Superseded versions and tombstones
occupy space until compaction removes them.

### Leveled compaction (LevelDB, RocksDB default)

Each level *L*ᵢ holds non-overlapping SSTables, ~*T*× bigger than *L*ᵢ₋₁ (*T* ≈ 10). To push one
SSTable from *L*ᵢ to *L*ᵢ₊₁ you must merge it with the ~*T* SSTables it overlaps down there,
rewriting all of them. So each level costs ~*T* in write amplification, across ~*L* levels:

$$
\text{write amp} \approx T \times L \approx 10 \times 5 = 50
$$

> **Confidence: moderate.** Measured RocksDB leveled write amplification is commonly reported in the
> 10–30× range, i.e. lower than the crude model, because of tuning and because upper levels are
> small. The *shape* of the result — write amp proportional to *T*·*L* — is the standard analysis.

**Read amp:** one page per level, but see Bloom filters below. **Space amp:** low, ~1.1×, since
each level is non-overlapping and holds one version of each key.

### Tiered (size-tiered) compaction (Cassandra's classic default)

Accumulate several similar-sized runs at a level, then merge them all into one run at the next
level. Each row is written **once per level**, not *T* times:

$$
\text{write amp} \approx L \approx 5\text{–}10
$$

**But:** each level contains multiple *overlapping* runs, so a read may check several runs per
level (higher read amp), and multiple copies of a key coexist (space amp 2–10×, and it spikes
during a large compaction which needs room for both input and output).

### Bloom filters: the read-amplification fix

> **Confidence: high.** Burton H. Bloom, "Space/time trade-offs in hash coding with allowable
> errors", *CACM* 1970.

Each SSTable carries a small probabilistic set membership filter. Query it before reading the
table: it can say "definitely not present" (skip the table entirely, zero I/O) or "possibly
present" (read it). False positives are possible; false negatives are not.

At the standard 10 bits per key with ~7 hash functions, the false positive rate is **~0.8%.** So a
lookup that would have read *L* levels instead reads:

$$
1 + 0.008 \times (L - 1) \approx 1.03 \text{ pages}
$$

**Read amplification collapses from ~5 to ~1**, for 10 bits per key — 1.25 MB per million keys.
This single trick is what makes LSM-trees viable for point lookups, and it is why every production
LSM engine ships them.

The one thing Bloom filters cannot help with is **range scans**, which must merge across all levels
because you cannot filter a range by membership. This is LSM's genuine remaining weakness against a
B+-tree, whose leaf list makes range scans as sequential as it gets (§19.3).

## 20.8 Why sequential writes are worth so much — and why the answer changed

The whole LSM bet is that trading more bytes written for *sequential* placement is worth it. How
big is the sequential bonus?

| Device | Random 4 KB writes | Sequential writes | **Ratio** |
|---|---|---|---|
| 7200 RPM HDD | ~150 IOPS ≈ 0.6 MB/s | ~200 MB/s | **~330×** |
| SATA SSD | ~40k IOPS ≈ 160 MB/s | ~500 MB/s | **~3×** |
| NVMe SSD | ~300k IOPS ≈ 1.2 GB/s | ~5 GB/s | **~4×** |

Combine with §20.3 and §20.7:

| | Bytes written | Pattern | Effective cost on HDD | Effective cost on NVMe |
|---|---|---|---|---|
| B+-tree, random keys | ~500× | **random** | 500 × 330 = **165,000** | 500 × 4 = **2,000** |
| LSM, leveled | ~10–50× | sequential | 50 × 1 = **50** | 50 × 1 = **50** |
| B+-tree, sequential keys | ~2× | sequential | **2** | **2** |

> **Confidence: this is a deliberately crude model** — it ignores caching, queue depth, and the
> fact that both structures behave better in practice than the worst case. Do not quote the
> numbers. Do keep the three conclusions, which are robust:

**1. On rotating media, LSM's advantage for random-key writes was overwhelming** — three to four
orders of magnitude. That is why the LSM lineage exploded during the era when data outgrew RAM and
SSDs were not yet cheap.

**2. On NVMe the advantage narrows sharply**, because the sequential bonus fell from ~330× to ~4×.
B+-trees became competitive again for many workloads, which is why the "B-tree vs LSM" debate is
live rather than settled, and why systems like WiredTiger ship both.

**3. Sequential keys make a B+-tree nearly optimal on any device.** If you control your key
ordering, you can have B+-tree reads *and* LSM-grade write costs. §19.9's advice about time-ordered
identifiers is not a micro-optimization; it moves you between rows of that table.

## 20.9 The RUM conjecture: you get to pick two

> **Confidence: high on the paper.** Manos Athanassoulis, Michael Kester, Lukas Maas, Radu Stoica,
> Stratos Idreos, Anastasia Ailamaki and Mark Callaghan, "Designing Access Methods: The RUM
> Conjecture", EDBT 2016.

The conjecture states that when designing an access method you can optimize for at most two of:

- **R**ead overhead
- **U**pdate overhead
- **M**emory (space) overhead

Map this chapter onto it:

| Structure | Read | Update | Space | Sacrificed |
|---|---|---|---|---|
| **B+-tree** | **excellent** (1 page) | poor (§20.3) | **good** (1.44×) | **Update** |
| **B\*-tree** | excellent | worse still | **best** (1.23×) | **Update**, harder |
| **Bε-tree** (ε=1/2) | good (2×) | **excellent** | good | a little Read |
| **LSM, leveled** | good (Bloom) | **good** | **excellent** (1.1×) | some Read (ranges) |
| **LSM, tiered** | poor | **excellent** | poor (2–10×) | **Read and Space** |
| Hash index | **excellent** | good | poor; **no ranges at all** | **Space and ordering** |

Read that table as the answer to "which structure should I use?" It is: **whichever overhead you
can most afford to pay.** There is no dominant choice, and any claim that one structure is simply
better than another is a claim about a workload, stated carelessly.

## 20.10 Real systems, and the convergence

**LSM-based:** LevelDB, RocksDB (and its Go reimplementation Pebble, used by CockroachDB),
Cassandra, ScyllaDB, HBase, InfluxDB, MyRocks, TiKV.

**B+-tree-based:** InnoDB, PostgreSQL, Oracle, SQL Server, SQLite, LMDB, Berkeley DB, and most
filesystems (§19.8).

**Both, selectable:** WiredTiger (MongoDB).

And then the interesting part, which is that the two lineages have been quietly converging:

- **LSM-trees contain B-trees.** An SSTable is not scanned linearly — it has an internal block
  index, which is a static, immutable, perfectly-packed B-tree. §15.7's requirements do not stop
  applying just because the file is immutable; if anything they apply more cleanly, since an
  immutable tree can be built at 100% occupancy.
- **B-trees have adopted LSM ideas.** Bε-trees are exactly a B-tree with LSM-style buffering
  (§20.5). And the deferred-cleanup behaviour §18.9 described — don't merge, don't rebalance, let a
  background process reclaim later — is compaction by another name.
- **Both use a write-ahead log**, for the same reason, and Volume 5 covers it.
- **ε parameterizes the space between them** (§20.5), so they are not really separate families at
  all.

> The honest summary of fifty years: **there is one problem — the access-count cost model of §15 —
> and one family of answers, parameterized by how much you buffer before you place data in its
> final sorted home.** Place immediately: B-tree, cheap reads, expensive random writes. Buffer a
> little: Bε-tree. Buffer a lot and reconcile in the background: LSM-tree, cheap writes, more
> expensive reads. There is no third idea.

## 20.11 Choosing

| If your workload… | Use | Because |
|---|---|---|
| Reads dominate; ranges and ordered scans matter | **B+-tree** | One page per lookup; leaf list makes scans sequential (§19.3) |
| Writes dominate; keys are **random**; data ≫ RAM | **LSM (leveled)** | §20.3's amplification is the binding cost; sequential writes avoid it |
| Writes dominate; you can tolerate space and read overhead | **LSM (tiered)** | Lowest write amplification of anything here |
| Writes dominate but you need B-tree-ish reads | **Bε-tree** | 2× read cost for ~√B write improvement (§20.5) |
| Writes dominate and keys are **sequential** | **B+-tree** | §20.8 row 3 — you already have LSM-grade write costs |
| Point lookups only, no ranges, space is cheap | Hash index | Ordering is what a tree buys you; don't pay for it unused |
| Data on rotating media | **LSM**, strongly | The sequential bonus is ~330× (§20.8) |
| Data on NVMe, mixed workload | Either; measure | The bonus is only ~4×; the decision is genuinely close |
| Read-only or write-once data | **Immutable sorted runs** with a static index | 100% occupancy, no maintenance, nothing to balance |

---


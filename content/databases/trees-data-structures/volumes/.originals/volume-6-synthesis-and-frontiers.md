# Trees: A Complete Guide to the Data Structure, From First Principles to Production Systems

## Volume 6 — Synthesis, Real-World Map, and Open Frontiers

---

### What this volume is for

The previous five volumes introduced structures. This one introduces nothing.

Its claim is that there was only ever **one question**, asked at six different scales, and that if you
had understood the question properly you could have derived most of the book from it. Chapter 36
makes that argument by walking backwards through Volumes 1 to 5 and showing the same reasoning
operating each time under a different parameter value.

Chapter 37 then shows the argument still running: the CPU cache hierarchy recreates Volume 3's disk
problem at a smaller scale, a point this book has now made in passing five separate times without
developing it, and tree design has been adapting to it for twenty-five years.

Chapter 38 is a map — structure to problem to production system — assembled so that you can go from
"I have this problem" to "here is what people actually use." Chapter 39 is where the field is still
open. Chapter 40 is a cabinet of strange and beautiful things, offered as an invitation rather than a
syllabus.

And then the book ends, with the one-page version of its own argument.

Chapter numbering continues from Volume 5. Conventions from Volume 1 §3.4 hold to the last page.

---

# Chapter 36 — One Question, Five Volumes

## 36.1 The question

Every design decision in this book is an answer to two questions about the machine, not about the
data:

> **1. Where does the data live?** Register, L1, L2, L3, DRAM, another core's cache, SSD, spinning
> disk, another machine, another continent.
>
> **2. What is expensive there?**

And the two collapse into a single number. Define the **access-to-compute ratio** as the amount of
computation you could have performed in the time it takes to reach the next level down:

| Level | Access latency | Instructions retired in that time (≈3 GHz, ≈4 IPC) | **Ratio** |
|---|---|---|---|
| Register | ~0.3 ns | 1 | **1** |
| L1 cache | ~1 ns | ~12 | **~10** |
| L2 cache | ~4 ns | ~48 | ~50 |
| L3 cache | ~30 ns | ~360 | ~350 |
| **Another core's cache** | ~40–70 ns | ~600 | **~500** |
| DRAM | ~100 ns | ~1,200 | **~1,200** |
| Remote NUMA DRAM | ~150–200 ns | ~2,000 | ~2,000 |
| NVMe SSD | ~50 µs | ~600,000 | **~6 × 10⁵** |
| Spinning disk | ~8 ms | ~10⁸ | **~10⁸** |
| Same-datacentre network | ~200 µs | ~2.4 × 10⁶ | ~2 × 10⁶ |
| Cross-region network | ~100 ms | ~1.2 × 10⁹ | **~10⁹** |

*(Confidence: moderate on the specific figures, which vary by hardware generation; high on the
orders of magnitude and the ratios, which are what the argument uses.)*

**Nine orders of magnitude.** And the design rule that follows is embarrassingly simple:

> **When the ratio is near 1, minimize instructions.**
> **When the ratio is large, minimize accesses — and spend as much computation per access as you
> like, because relative to the access it is free.**

Every structure in this book is a way of arranging data to minimize the number of expensive
accesses, given a particular value of that ratio. The rest of this chapter is the demonstration.

## 36.2 Volume 1: the ratio is ~1,200, and pointers are the enemy

Volume 1 operated entirely at the DRAM boundary, and every result in it is a ratio argument
wearing different clothes.

**§1.2 named the cost unit.** "The correct objective function is not minimize comparisons but
minimize the number of distinct pages touched." That sentence is the design rule above, stated
before the parameter had been introduced.

**§1.5's central negative result is an access-count argument.** You cannot binary search a linked
list, because finding the midpoint costs *n*/2 pointer hops, giving *T*(*n*) = *n*/2 + *T*(*n*/2) =
Θ(*n*). Note what is Θ(*n*): not comparisons — *accesses*. The comparisons were always going to be
log *n*.

**§1.6's 80× measurement is the ratio, directly.** One million `int64` values traversed as an array
took ~1 ms; as a scattered linked list, ~80 ms. Same asymptotics, same element count. The difference
is entirely that the array's accesses are predictable and the list's are a **dependent chain** — and
a dependent chain pays the full ratio, once per element, with no possibility of overlap.

**§1.8's derivation of the tree is a space-for-accesses trade.** Binary search on a sorted array
recomputes its decision tree's edges from index arithmetic; storing them as pointers costs two words
per element and converts Θ(*n*) insertion into Θ(1). You spend space to reduce accesses on the write
path.

**§6.2's most interesting result is a ratio subtlety.** Binary search over a sorted array beats a
pointer-based binary tree of identical height by roughly 2× — because binary search's early probes
are *always the same addresses*, so the top ~10 levels occupy ~64 KB and stay resident, while a
pointer tree's nodes are at unpredictable addresses at every level. **The number of accesses was
identical; the number of *expensive* accesses was not.** That distinction — some accesses are at a
cheaper level than others — is what Chapter 37 is built on.

**§6.3's implicit array eliminates the pointer access entirely.** Children at 2*i*+1 and 2*i*+2:
arithmetic instead of a dereference. At ratio 1,200, replacing one dependent load with three
arithmetic instructions is a 400× improvement on that step. It is not a space optimization that
happens to be fast; it is a ratio optimization that happens to save space.

**And §6.6 explicitly deferred the rest of the book to a change in the parameter**: "change the
ratio to 10⁵ and everything changes."

## 36.3 Volume 2: the ratio is fixed, so the question is height and node size

Volume 2 held the level constant (everything in RAM, ratio ~1,200) and asked a single question:
*how do you keep the number of levels at log n regardless of input order?* Because at ratio 1,200,
**a level is a likely cache miss**, so height *is* cost.

Reread its results as ratio arguments:

**§7.1's three reasons binary is right in RAM** are all ratio reasons. Fanout does not reduce
comparisons (true, and irrelevant at high ratio — Volume 3); a binary node fits in a cache line
(a ratio argument); binary is the minimum arity for studying balance (pedagogy).

**§11.7's AVL-versus-red-black trade is a trade in access count.** Height 1.44 log₂ *n* against
2 log₂ *n*. In the worst case, an AVL lookup performs ~44% fewer dependent loads. That is the entire
reason to prefer AVL for read-heavy workloads, and it is why the trade even exists.

**§11.5's insight is a trade in *write*-side accesses**, measured in cache lines dirtied:

| | Cache lines written | Pointer topology changed? |
|---|---|---|
| Recolouring | **1** | no |
| Rotation | 2–3 | yes |

Red-black trees bound *rotations* at a constant and let *recolouring* propagate, because at ratio
1,200 a bit flip in one line is a fraction of the cost of relinking three nodes across three lines.
Volume 5 §31.10 then showed the same asymmetry produces the concurrency advantage — one mechanism,
two payoffs.

**§11.8's Linux `rb_node` is a node-size optimization.** The colour is packed into the low bits of
the parent pointer, so the node is exactly three words — 24 bytes, so two nodes fit in a 64-byte
cache line — and the tree is *intrusive*, eliminating one dereference from node to payload. Both
choices reduce accesses per operation. Neither is about space for its own sake.

**§12.6's splay tree failure is a ratio failure at a level Volume 2 could not yet name.** Volume 5
§30.4 supplied it: the inter-core level, ratio ~500, where a *read* costs a *write*. Splay trees
write on every read, and they write to the root, which is the hottest line in the structure.

**And §13's treap pays 4–8 bytes per node for its priority** — a node-size cost, which is to say an
accesses-per-cache-line cost.

> **Volume 2's entire design space, restated: minimize height and minimize node size, given that
> traversing one level costs a cache miss.** The four philosophies are four ways to bound height;
> the implementation details are all node-size optimizations.

## 36.4 Volume 3: the ratio jumps five orders of magnitude, and everything inverts

Volume 3 is the pure case, because it changed the parameter and derived the consequences from
scratch.

**§15.5 is the design rule stated as a theorem.** A fanout-500 tree performs *more* comparisons than
a binary tree (36 against 30) and 7.5× fewer accesses (4 against 30). At ratio 1,200 the choice is
close; at ratio 10⁵ it is not a choice.

**§15.4's breakeven size is the ratio expressed in bytes**: latency × bandwidth. 250 KB on NVMe,
1.6 MB on a spinning disk. *On NVMe, reading 250 KB costs about what reading one byte costs.* That
single figure derives "make the node as big as the access unit," which derives fanout, which derives
height.

**§15.4's dependent-chain caveat is the same caveat as §1.6's**, five orders of magnitude larger.
You cannot know which page to read at level 3 until level 2 has arrived, so **height is unavoidable
*serial* latency** and no amount of queue depth helps. Hold onto this — §37.7 shows it is the
assumption that GPUs break.

**§17.6's key-width result is a ratio result with a schema-design consequence.** Fanout is
`page_bytes / entry_bytes`, so a 200-byte text primary key instead of a `bigint` costs two extra
levels on a billion-row index — two extra serial round trips on every lookup, forever, plus the same
again in every secondary index that references it.

**§19's B+-tree is two ratio optimizations.** Separators-only makes internal fanout independent of
row size (fewer levels). Linked leaves convert a range scan from an interleaved dependent chain into
a **sequential stream** — which moves the scan from paying *latency* per page to paying *bandwidth*,
and §15.4 showed those differ by the breakeven factor.

**§20's LSM-tree exploits the sequential/random split *within* a level.** Volume 3 §20.8 priced it:
~330× on a spinning disk, ~4× on NVMe. And that table is the cleanest illustration in the book that
**the right structure depends on the parameter, not on merit** — the LSM advantage shrank by two
orders of magnitude when the storage layer changed, which is why the B-tree-versus-LSM question is
live rather than settled.

## 36.5 Volume 4: the lens still holds, but it is no longer the only lens

Volume 4 changed the *question* rather than the level, so this is where a single-lens reading has to
be careful. It holds in several chapters and genuinely does not in others, and saying so is more
useful than forcing it.

**Where the ratio lens explains the design:**

**§21.8 was blunt about tries.** A trie descent is one dependent cache miss *per symbol* — up to 20
for a 20-byte key, against a B-tree's 3–4 page reads. Which is exactly why ART, Judy and LC-tries
all invest so heavily in cramming more decision into each node: they are converting
symbol-at-a-time descent into several-symbols-at-a-time descent. **Volume 3's fanout lesson,
applied to a non-comparison structure.**

**§22.7's Fenwick tree wins partly on layout**, not only on space: a flat array with a bit-strided
access pattern, against a tree with pointer chasing.

**§24.2's heap is the purest layout argument in the book.** Weakening the invariant lets the
structure dictate its own shape; dictating "complete" unlocks the implicit array; the implicit array
eliminates pointers. And **§24.5's *d*-ary heap with *d* = 4 is chosen because four children occupy
half a cache line** and are therefore fetched together — one access instead of one per level.
Volume 3's fanout trade, third appearance.

**§25.4's R-tree versus §25.2's KD-tree is the RAM/disk split again.** Same problem, different level,
different fanout. And BKD-trees are explicitly "a KD-tree adapted for disk."

**§26.5's suffix array beating the suffix tree** is a space argument that is really an access
argument: 12–28 GB against 47 GB decides whether the index fits in memory at all, which decides
which row of §36.1's table you are paying from. And array scans beat pointer chasing at any size.

**§27's Merkle tree is the *network* instance.** The expensive access is a round trip, ratio ~10⁹,
and the design minimizes round trips: O(log *n*) hashes for an inclusion proof, and **O(1) — one
hash comparison — to prove two replicas are identical.** SPV clients storing 50 MB of headers
instead of the chain is the same optimization taken to its limit.

**Where the lens does not explain the design, and I should say so:**

| Volume 4 result | Why the ratio lens does not explain it |
|---|---|
| §25.2's curse of dimensionality | A **geometric** fact: in high dimensions a region carries almost no information about distance. No layout fixes it, and HNSW graphs beat trees for reasons unrelated to memory. |
| §27's security guarantee | Comes from **collision resistance**, not from layout. The tree only supplies the logarithmic proof size. |
| §28's decision trees | The correctness criterion is **statistical**. Overfitting is not a memory-hierarchy phenomenon. |
| Volume 2 §9.5's adversarial input | A **security** property. Randomized priorities defeat an attacker, not a cache. |

So there are **two lenses, and Volume 4 §29 already supplied the other one**:

> **Lens 1 (Volume 4 §29): what summary does each node store?** A key range, an aggregate, a maximum
> endpoint, a bounding box, a hash, a prediction. This determines **what question the structure can
> answer.**
>
> **Lens 2 (Volume 6 §36): at what level does an access live, and what does it cost?** This
> determines **how the structure must be shaped and laid out** to answer that question efficiently.

Every structure in this book is a point in that two-dimensional space, and the two axes are close to
independent — which is why you can take an interval tree's summary and put it on a B-tree, or take a
B-tree's fanout and put it on a persistent immutable map.

## 36.6 Volume 5: a level the earlier volumes could not see

Volume 5's contribution to §36.1's table is a row: **another core's cache, ratio ~500** — and it is
unlike every other row, because it is the one level where **reading costs a write**.

§30.4 established this and it is worth restating as the volume's central quantitative claim:
acquiring even a *shared* latch is an atomic read-modify-write on a shared line, so throughput on
any single latch caps at roughly one acquisition per coherence round trip — around 14 million per
second — **independent of core count, and degrading as cores are added.**

Reread Volume 5 as a sequence of attempts to reduce accesses at that level:

| Mechanism | Accesses at the inter-core level, per read |
|---|---|
| One global latch | 1, fully serialized |
| Lock coupling (§30.5) | **2 per level** — parent and child held together |
| Lehman & Yao (§31) | **1 per level** — one latch at a time, none on ancestors |
| Optimistic lock coupling (§31.9) | **0 writes** — version read, validate, retry |
| **Immutability (§34.3)** | **0 — nothing at all** |

**That is the whole arc of Volume 5, in one column.** Forty years of work reducing the count from
two-per-level to zero. And each step paid for the reduction somewhere else: L&Y gave up merging
(§31.6.1), OLC gave up read-path guarantees for retries, immutability gave up space and write
concurrency (§34.4).

**And Volume 5's other two chapters are ratio arguments too.**

§32.3 explained that WAL is used even where durability could be achieved otherwise, because it
**converts scattered random page writes into one sequential append** — the same latency-versus-
bandwidth exploitation as §20's LSM-tree, applied to durability rather than to indexing.

§32.11's copy-on-write-versus-WAL table is a straight accounting of accesses: WAL writes one page
plus a log record (about two pages' worth on first touch after a checkpoint, thanks to full-page
images); CoW writes *h* ≈ 4. **A factor of two, not ten** — which is why the two lineages split by
domain rather than by merit.

## 36.7 The whole book, indexed by level

| Level | Ratio | The expensive thing | Structures and techniques that answer it |
|---|---|---|---|
| Register / L1 | ~1–10 | **instruction count** | branchless search, SIMD node scan (V4 §21.6, V3 §18.2, §37.2) |
| L1–L3 | ~50–350 | **a dependent load that misses** | cache-line-sized nodes, implicit arrays (V1 §6.3), Eytzinger and van Emde Boas layouts (§37.3–37.4), *d*=4 heaps (V4 §24.5) |
| **Another core's cache** | **~500** | **a write to a shared line** | Lehman & Yao (V5 §31), optimistic lock coupling (V5 §31.9), RCU (V5 §34.9), immutability (V5 §34.3) |
| DRAM | ~1,200 | **a dependent load** | balanced binary trees (V2), high-fanout in-memory tries (ART), arena allocation (V1 §6.4) |
| NUMA-remote DRAM | ~2,000 | a cross-socket load | per-socket replication of hot upper levels (§37.7) |
| SSD / disk | 10⁵–10⁸ | **a page access, serial and dependent** | B+-trees (V3 §19), LSM-trees (V3 §20.6), Bε-trees (V3 §20.5), copy-on-write (V5 §32.11) |
| Network | 10⁶–10⁹ | **a round trip** | Merkle trees (V4 §27), replicated routing metadata (§39.1), batching |

> **The claim: given a row of that table, the shape of the answer is largely determined.** Make the
> node the size of the access unit. Minimize the number of levels. Make the top of the structure
> small enough to stay in the level above. Convert dependent chains into sequential streams where
> you can. Do not write to shared state on the read path.
>
> Five of those six rules were derived independently in five different volumes, for five different
> parameter values, and they are the same five rules.

## 36.8 The one place the pattern is most visible

If you want a single demonstration that the hierarchy poses one problem repeatedly, it is this:
**the same fanout trade appears at four levels, and each time it was discovered separately.**

| Where | The trade |
|---|---|
| **Volume 3 §17.8 / §18.2** | B-tree fanout reduces page reads and increases within-node search cost. Optimum: node = page. |
| **Volume 4 §21.6** | ART's node types: wider nodes mean fewer symbol-hops, more within-node work. Optimum: adaptive, with SIMD at 16. |
| **Volume 4 §24.5** | *d*-ary heaps: higher *d* means fewer levels, more comparisons per sift-down. Optimum: *d* = 4, because four children share a cache line. |
| **Volume 5 §34.2** | Immutable path copying: wider nodes mean fewer nodes copied per update. Optimum: 32-way HAMTs. |
| **§37.2 below** | In-memory B-trees: node = **cache line**. Optimum: 8–16 keys. |

Five instances. Same shape. Different level, different constant, and in each case the constant is
`access_unit_size / entry_size`.

That is the book's thesis, and it is why Chapter 37 exists: the pattern is not finished, because the
hierarchy keeps adding levels.

---

# Chapter 37 — The Hierarchy Recreates Itself

## 37.1 The same problem, one thousand times smaller

This book has now noted in passing, five separate times, that the cache hierarchy poses Volume 3's
problem in miniature — Volume 1 §6.2, Volume 3 §18.2, Volume 4 §21.6, Volume 4 §24.5, Volume 5
§30.4. Each time it deferred here. Here is the parallel, drawn properly:

| | **Disk versus RAM** (Volume 3) | **RAM versus cache** (this chapter) |
|---|---|---|
| Transfer unit *B* | 8 KB page | **64-byte cache line** |
| Fast-memory size *M* | buffer pool (GB) | L1 32–128 KB, L2 0.5–2 MB, L3 8–256 MB |
| Cost of a miss | 50 µs – 8 ms | ~100 ns |
| Ratio to compute (§36.1) | 10⁵ – 10⁸ | ~1,200 |
| A node should be | **one page** | **one cache line** |
| Resulting fanout | ~500 | **8–16** |
| Do you control placement and eviction? | **Yes** — you choose the page size, you run the buffer pool, you decide the replacement policy | **No.** Hardware decides everything. |

**That last row is the entire difficulty**, and it is why the cache version of the problem is harder
than the disk version rather than easier.

With a disk-based B-tree you have levers: page size, buffer pool size, replacement policy,
prefetching, pinning. With the cache you have exactly one lever — **layout** — and then you hope the
hardware's fixed policies do the right thing with it. You cannot pin the root of your tree in L2.
You cannot tell the L3 not to evict your upper levels during a scan. You can only arrange bytes so
that the policies you cannot control happen to behave well.

Two approaches follow. **Cache-aware** structures assume you know *B* and *M* and tune for them.
**Cache-oblivious** structures refuse to assume, and prove they are near-optimal for every *B* and
*M* simultaneously. §37.6 assesses which won.

## 37.2 Cache-aware: make the node a cache line

The direct translation of Volume 3's Requirement 1 (§15.7): **one node = one transfer unit.** A
64-byte cache line holding 8-byte keys and 8-byte pointers:

```
  STANDARD B+-tree node in 64 bytes:
      k keys + (k+1) child pointers  =  8k + 8(k+1)  =  16k + 8  ≤  64
      →  k = 3,  fanout 4
```

Fanout 4 is disappointing — half the line is spent on pointers. Which motivates the first real idea
in this area.

### CSS-trees and CSB+-trees: get rid of the pointers

> **Confidence: moderate-high.** Jun Rao and Kenneth Ross, "Cache Conscious Indexing for
> Decision-Support in Main Memory", VLDB 1999 (CSS-trees), and "Making B+-trees cache conscious in
> main memory", SIGMOD 2000 (CSB+-trees).

**CSS-tree** (Cache-Sensitive Search tree): for **static** data, use no pointers at all. Lay the
multi-way tree out implicitly in an array — Volume 1 §6.3's technique, at multi-way arity — and
compute child positions arithmetically. Every byte of every line is keys. This is the best possible
layout for read-only data and it is what you should reach for whenever the index is rebuilt rather
than updated.

**CSB+-tree** (Cache-Sensitive B+-tree): for **dynamic** data, you cannot go fully implicit. The
idea is to store **all children of a node contiguously as a "node group"**, so a node needs only
**one** pointer — to the start of the group — and finds child *i* by offset:

```
  CSB+-tree node in 64 bytes:
      k keys + 1 group pointer  =  8k + 8  ≤  64
      →  k = 7,  fanout 8

  FANOUT DOUBLES, from 4 to 8, in the same 64 bytes.
```

Which halves the height: log₈(10⁶) = 6.7 against log₄(10⁶) = 10. **Three or four fewer cache misses
per lookup**, from a purely representational change.

The cost is on the write path: inserting into a node group requires the group to stay contiguous, so
a split may mean reallocating and copying the whole group. Classic trade — read accesses bought with
write work.

### FAST: block for three units at once

> **Confidence: moderate-high.** Changkyu Kim and colleagues at Intel, "FAST: fast architecture
> sensitive tree search on modern CPUs and GPUs", SIGMOD 2010.

The observation that there is not *one* transfer unit but three, and a tree can be blocked for all
of them simultaneously:

```
   ┌──────────────────────────────────────────────────────────┐
   │  PAGE-level blocking  (2 MB huge page — for the TLB)     │
   │   ┌──────────────────────────────────────────────────┐   │
   │   │  CACHE-LINE blocking (64 B — for L1/L2/L3)       │   │
   │   │   ┌──────────────────────────────────────────┐   │   │
   │   │   │  SIMD blocking (16–64 B — one register)  │   │   │
   │   │   └──────────────────────────────────────────┘   │   │
   │   └──────────────────────────────────────────────────┘   │
   └──────────────────────────────────────────────────────────┘

   A subtree of the right size fits each unit, recursively.
```

Note that the innermost level is **SIMD**: a small subtree fits one vector register, so several
levels of comparison become a handful of instructions with no branches at all. This is the same idea
as ART's Node16 (Volume 4 §21.6), generalized into a layout discipline.

FAST also targeted GPUs and found **different optimal blockings** there, which §37.7 explains.

### Others worth knowing

**ART** (Volume 4 §21.6) is a cache-aware radix tree: four node layouts by child count, SIMD
comparison at 16 children, path compression to avoid useless levels.

**Masstree** (Mao, Kohler, Morris, EuroSys 2012) is a **trie of B+-trees** — each trie level consumes
8 bytes of key and is itself a B+-tree over those 8 bytes — combining Volume 4 §21's key-consuming
descent with Volume 3 §19's fanout, plus optimistic concurrency (Volume 5 §31.9). Its paper's title,
"Cache craftiness for fast multicore key-value storage", is a fair summary of this whole chapter.
*(Confidence: moderate-high.)*

## 37.3 Array layouts for binary search: a worked comparison

The cleanest demonstration in this chapter, because it holds the algorithm constant and changes only
the layout. **Same comparisons, same asymptotics, three arrangements, three very different speeds.**

Setting: one million `int64` values, 8 MB, searched repeatedly with random keys.

### Layout A — sorted order, textbook binary search

```
  a[] = [ smallest ................................................ largest ]
                                    ↑ first probe always here (index 500,000)
```

- Probe 1 is always index 500,000. Probe 2 is one of 2 addresses. Probe *k* is one of 2^(*k*−1).
- After 10 probes, only **1,023 distinct addresses** have ever been touched across all queries —
  each on its own line (they are ≥ 8 KB apart), so ~1,023 lines ≈ **64 KB**, which is **L2-resident
  after warm-up**.
- Probes 11–20 spread across the whole 8 MB. **~10 DRAM misses.**
- Plus: every comparison branch is essentially **unpredictable** (50/50), so ~10 mispredictions at
  ~15 cycles each.

```
  10 × ~4 ns (L2)  +  10 × ~100 ns (DRAM)  +  ~10 × 5 ns (mispredicts)
  ≈  40  +  1000  +  50   ≈   1,090 ns
```

*(This is Volume 3 §15.5's ~830 ns estimate, recomputed with slightly more pessimistic constants.)*

### Layout B — Eytzinger (breadth-first) order

Store the *search tree* in BFS order in the array — Volume 1 §6.3's implicit layout, applied to the
tree of probes rather than to the sorted sequence. 1-indexed, children of *i* at 2*i* and 2*i*+1:

```
  index:   1     2   3      4  5  6  7        8 ...
  holds:  root  L   R    LL LR RL RR      (level 4) ...

  Search:   i = 1;  while (i <= n)  i = 2*i + (x > a[i]);
                                        ↑ BRANCHLESS: the comparison result
                                          is arithmetic, not a jump
```

Three separate wins, and they compound:

1. **The top levels are contiguous and always resident.** Levels 1–13 are indices 1…8,191 =
   **64 KB**, laid out consecutively rather than scattered — so they occupy 1,024 *adjacent* lines
   and stay in L2.
2. **Branchless.** `i = 2*i + (x > a[i])` has no unpredictable jump. The mispredictions vanish.
3. **And because it is branchless, you can prefetch speculatively.** From node *i*, the four
   grandchildren are at 4*i*, 4*i*+1, 4*i*+2, 4*i*+3 — **four consecutive 8-byte slots, 32 bytes,
   within one or two cache lines.** So `prefetch(4*i)` covers *all four* grandchildren without
   knowing which way you will branch. Issue it before comparing, and by the time you arrive two
   levels later, the line is there.

That third point is the one that matters, because it attacks the dependent chain itself:

```
   WITHOUT prefetching:  miss → wait → compare → miss → wait → compare → ...
                         7 serial misses ≈ 700 ns

   WITH prefetch-2-levels-ahead:  the fetch for level k+2 overlaps the work
                         at levels k and k+1 → the chain becomes PIPELINED
                         effective stall ≈ 2–3 misses' worth ≈ 250 ns
```

```
  13 × ~4 ns (L2)  +  ~3 × 100 ns (pipelined DRAM)  +  0 mispredicts
  ≈  52  +  300   ≈   350 ns              ← roughly 3× faster than Layout A
```

### Layout C — B-tree layout

Multi-way nodes of 8 keys (one cache line), laid out breadth-first. log₉(10⁶) ≈ 6.3, so **7 levels**
— seven line fetches, each fully used, with within-node search done branchlessly or with SIMD.

```
  ~2 resident levels + ~5 DRAM misses, each one FULL line   ≈  550 ns
  (and less with software prefetching of the next node)
```

### The comparison

| Layout | Levels traversed | Effective DRAM misses | Branch mispredicts | Approx. time |
|---|---|---|---|---|
| **A — sorted, textbook** | 20 | ~10 serial | ~10 | **~1,100 ns** |
| **B — Eytzinger, branchless + prefetch** | 20 | ~3 (pipelined) | 0 | **~350 ns** |
| **C — B-tree layout, cache-line nodes** | 7 | ~5 (full lines) | 0 | **~550 ns** |

> **Identical comparison count. Identical asymptotics. A 3× spread.**
>
> **Confidence: moderate on my specific numbers; high on the ordering and rough magnitudes.** The
> definitive experimental study is Paul-Virak Khuong and Pat Morin, "Array Layouts for
> Comparison-Based Searching" (*Journal of Experimental Algorithmics*, 2017), which tested sorted,
> Eytzinger, B-tree and van Emde Boas layouts across a range of sizes. Their headline finding —
> which is more useful than any of my arithmetic — is that **the B-tree layout is generally fastest,
> Eytzinger is competitive and far simpler, and the van Emde Boas layout is not worth its
> complexity in practice.** §37.6 takes that finding seriously.

## 37.4 Cache-oblivious: the van Emde Boas layout

§37.2 and §37.3 both assumed you know *B*. But look at §37.1's table again: there are **three
caches** with different *B* and very different *M*, plus the TLB with *B* = 4 KB or 2 MB, plus the
SSD with *B* = 4 KB. A structure tuned for L1 is wrong for L3; one tuned for L3 wastes L1.

The **cache-oblivious model** (Matteo Frigo, Charles Leiserson, Harald Prokop and Sridhar
Ramachandran, FOCS 1999) proposes something that sounds impossible: design the structure with **no
knowledge of *B* or *M***, and prove it is within a constant factor of optimal **for every *B* and
*M* simultaneously.** *(Confidence: high on the paper.)*

For a static search tree, the answer is the **van Emde Boas layout**, also called the recursive
layout:

> Split the tree at **half its height**. Lay out the top half — a subtree of about √*n* nodes —
> recursively and contiguously. Then lay out each of the ~√*n* bottom subtrees, each of ~√*n* nodes,
> recursively and contiguously, one after another.

```
  A tree of height h, laid out in memory:

  ┌──────────────┬──────────┬──────────┬──────────┬─────┬──────────┐
  │  TOP subtree │ bottom₁  │ bottom₂  │ bottom₃  │ ... │ bottom_√n│
  │  height h/2  │ height   │          │          │     │          │
  │  (recursive) │   h/2    │          │          │     │          │
  └──────────────┴──────────┴──────────┴──────────┴─────┴──────────┘
        ↑ and each of these is laid out by the SAME rule, recursively
```

### Why it is optimal for every *B* at once

**Pick any block size *B*.** Because the recursion halves the height at each step, subtree sizes go
*n*, √*n*, *n*^(1/4), … — so **there is some level of the recursion at which subtrees have between
√*B* and *B* nodes.** Call these the *B*-subtrees.

Now count:

- Each *B*-subtree occupies at most *B* nodes' worth of **contiguous** memory, so it spans **at most
  2 blocks**.
- A *B*-subtree has height at least ½ log₂ *B*.
- A root-to-leaf path has length log₂ *n*, so it crosses at most

$$
\frac{\log_2 n}{\tfrac12 \log_2 B} = 2\log_B n \quad \text{$B$-subtrees}
$$

- Total block transfers: ≤ 2 × 2 log_*B* *n* = **O(log_*B* *n*)**. ∎

> **That is the same bound a B-tree achieves with the *optimal* node size — obtained without knowing
> what the optimal node size is.** Within a constant factor of about 4, for every *B*, at every level
> of the hierarchy, at the same time.

It is a genuinely beautiful result, and it is worth pausing on what it means: **the recursive
structure makes the layout self-similar, so whatever granularity the hardware happens to use, some
level of the recursion matches it.**

> **A naming warning.** The van Emde Boas *layout* (this section) and the van Emde Boas *tree*
> (§40.1) are different things, both named after Peter van Emde Boas, and both involve recursive
> √-decomposition. They are easy to confuse and the literature does not always disambiguate.

## 37.5 The dynamic version

A static layout is only half an answer. Making a cache-oblivious search tree *updatable* is harder,
and the solution is instructive.

> **Confidence: moderate-high.** Michael Bender, Erik Demaine and Martin Farach-Colton,
> "Cache-oblivious B-trees", FOCS 2000. O(log_*B* *n*) searches and amortized updates, with no
> knowledge of *B*.

The construction has two parts:

**A packed memory array.** Keep the elements in sorted order in an array **with deliberate gaps**.
Insertion shifts elements locally into a nearby gap; when a region gets too dense, redistribute it.
Amortized O(log² *n*) element moves per insertion — but crucially, all the moves are **sequential**,
so they cost O(log² *n* / *B*) *block transfers*. And scans remain sequential, which is what a
sorted array was always good at (Volume 1 §1.4).

**A van Emde Boas-laid-out static index over it**, rebuilt lazily as the array's structure changes.

> Note the author list. **Bender and Farach-Colton** are the same people as the Bε-tree / Fractal
> Tree of Volume 3 §20.5 — and Bender & Farach-Colton also appear in §40.8 with the O(*n*)/O(1)
> range-minimum-query result. Like Edward McCreight in Volumes 3 and 4 and Ferragina in Volume 4
> §26.6 and §39.4, a small number of people account for a disproportionate share of this book.

And note what the packed memory array *is*: a sorted array that you insert into by **leaving room**,
which is Volume 3 §17.7's fill factor, and by **deferring the reorganization**, which is Volume 5
§33.7's *r*·*T* trade. Two ideas from earlier volumes, recombined.

## 37.6 The honest assessment

Cache-oblivious structures are theoretically lovely and **modestly used in practice**. It is worth
being clear about why, because the reason is interesting rather than dismissive.

**Argument for cache-obliviousness:** you cannot tune for four levels at once, and you cannot tune
at all if you are shipping a library to unknown hardware.

**Arguments against, and they have mostly won:**

1. **The constant factors are worse.** A factor of ~4 against a tuned structure's ~1, and in
   practice the recursive layout's index arithmetic is more expensive than a B-tree's.
2. **Khuong & Morin measured it** (§37.3) and found the van Emde Boas layout **not worth its
   complexity** relative to a plain B-tree layout.
3. **And the decisive one: *B* = 64 bytes has been stable for roughly two decades.** Essentially
   every x86-64 and ARM64 processor uses a 64-byte cache line. Page sizes are 4 KB with 2 MB huge
   pages. Storage blocks are 4 KB.

> **Cache-obliviousness solves a parameter-uncertainty problem that turned out not to be very
> uncertain.** The theory was developed against the possibility that transfer units would vary
> unpredictably across machines and generations; in the event, the industry converged on a small set
> of values and stayed there. **A cache-aware structure with *B* = 64 hard-coded is portable in
> practice**, which is an empirical fact about the hardware market rather than a fact about
> algorithms.

**What is actually used**, then: cache-line-sized nodes with *B* = 64 assumed, SIMD or branchless
search within the node, and software prefetching to pipeline the dependent chain. That is FAST, ART,
Masstree, and every serious in-memory index of the last fifteen years.

**Where cache-obliviousness still genuinely pays:** when the structure must span *many* levels at
once with very different *B* — RAM plus SSD plus network — and when you truly cannot measure the
deployment target. Those cases exist; they are not the common case.

## 37.7 Beyond the cache: four more levels

§36.1's table is not finished, and each new row demands a re-tuning.

### The TLB is a level

A virtual-to-physical translation miss costs a **page-table walk** — up to four levels of page
table, each potentially its own cache miss, so 100–500 ns. A large in-memory tree spread over
thousands of 4 KB pages generates TLB misses on nearly every level of descent, and the TLB has only
a few hundred entries.

**The response is a locality argument again**: use **huge pages** (2 MB), which reduce the number of
TLB entries needed to cover a given amount of memory by 512×. Enabling huge pages for a large
in-memory index is commonly worth 10–30% throughput, for no change to the structure at all.
*(Confidence: moderate.)*

Note that FAST's outermost blocking level (§37.2) is exactly this.

### NUMA is a level

On a multi-socket machine, DRAM attached to another socket costs ~1.5–2× local DRAM. A tree spanning
sockets has a hidden level nobody declared.

The best response is a direct application of one of this book's own observations. Volume 3 §15.5
established that **the top of a search tree is tiny** — for a billion-key B+-tree, the root plus
level 2 is under 300 KB. So:

> **Replicate the hot upper levels on every socket.** 300 KB per socket is nothing, and it eliminates
> remote accesses for the majority of hops in every descent. The leaf level, which is where the bytes
> are, stays partitioned.

The alternative — partition the whole tree by socket, so each owns a key range — works but makes
cross-range queries remote and reintroduces skew problems (§39.1).

### GPUs break the argument, and this is the most important item in the chapter

Volume 3 §15.4 made a claim this book has leaned on repeatedly:

> *"A tree descent is a dependent chain, and no amount of parallelism helps a dependent chain — you
> pay the full latency, serially, once per level."*

**That claim assumes one query at a time.** A GPU running 10,000 *independent* lookups can interleave
them: while query 1 waits for its level-2 fetch, queries 2 through 10,000 issue theirs. The memory
system saturates, and the workload becomes **bandwidth-limited rather than latency-limited.**

The consequences invert several of this book's conclusions:

| | **Latency-bound** (one query, CPU) | **Bandwidth-bound** (many queries, GPU) |
|---|---|---|
| Objective | **minimize accesses** | **minimize bytes transferred** |
| Height costs | one full latency per level, serially | almost nothing — it pipelines |
| Prefer | **wide nodes, shallow tree** | **narrow nodes, deeper tree** — you fetch only what you use |
| Wasted bytes in a node | free (§15.4's breakeven) | **directly costly** |

> **So "minimize accesses" is the right objective when accesses are serial and dependent. When you
> have enough independent work to saturate the memory system, the objective becomes "minimize bytes
> transferred" — and the two objectives sometimes recommend opposite designs.**

This is why FAST (§37.2) found different optimal blockings for CPUs and GPUs, and it is the deeper
reason **hardware BVH traversal units exist** (Volume 4 §25.5): ray tracing is embarrassingly
parallel over rays, so thousands of independent descents are in flight and the dependent-chain
problem simply does not arise. Silicon dedicated to tree traversal is only sensible in a regime
where traversal is not latency-bound.

### Persistent memory and CXL: levels that arrived and may arrive

**Persistent memory** — Intel's Optane DC modules — offered a level at ~300 ns that was
byte-addressable *and* durable. That combination is strange, and it made Volume 5 §32's torn-page
problem into a **torn-cache-line** problem: the persistence granularity is 8 bytes with explicit
flushes, not 8 KB with full-page images, so crash-consistent tree algorithms had to be redesigned
around 8-byte atomic stores and carefully ordered cache-line writebacks. FAST&FAIR (Hwang et al.,
FAST 2018), NV-Tree and BzTree came out of this. Optane was discontinued around 2022, so the line is
largely historical — but the *techniques* transfer. *(Confidence: moderate-high on the discontinuation
and the papers.)*

**CXL** (Compute Express Link) attaches memory over a fabric at roughly 250 ns to 1 µs —
byte-addressable but an order of magnitude slower than local DRAM. If it becomes common it is a new
row in §36.1's table, sitting between DRAM and SSD, and the design rule says: **larger nodes, more
aggressive prefetching, and possibly a return to page-oriented thinking for a level that is
technically byte-addressable.** Genuinely live and genuinely unsettled. *(Confidence: moderate.)*

> **The pattern of the chapter, and of the book:** the hierarchy keeps adding levels, and each new
> level poses the same question with a new constant. **The answer has been the same every time —
> make the node the size of the transfer unit, minimize levels, keep the top small enough to live in
> the level above, and turn dependent chains into streams where you can.** What changes is only the
> arithmetic, and — as the GPU case shows — occasionally whether "minimize accesses" was the right
> objective in the first place.

---

# Chapter 38 — The Map: Where Trees Actually Run

## 38.1 How to use this chapter

This is a reference, organized by **domain** rather than by structure, because that is how you will
actually reach for it: you have a problem in a particular kind of system, and you want to know what
people who have solved it already used. §38.13 inverts the index for when you want to go the other
way.

Two standing caveats. **First**, internals change — several entries here describe migrations that
happened during the writing of this book. **Second**, my confidence varies a lot by entry, so it is
flagged per section rather than per line, and where I am unsure I say so rather than smoothing it
over.

## 38.2 Operating system kernels

> **Confidence: high on the Linux data structures and APIs; moderate on which subsystem currently
> uses which, since this changes across releases.**

| Use | Structure | Chapter |
|---|---|---|
| **Process scheduler** — CFS, then EEVDF from Linux 6.6 | **red-black tree** keyed on virtual runtime, with the leftmost node **cached** so "pick next task" is O(1); EEVDF **augments** it with per-subtree minimum virtual runtime | V2 §11.8, V4 §23.2 |
| **Virtual memory areas** (`vm_area_struct`) | was a **red-black tree** (`mm_rb`); replaced by the **maple tree** — an RCU-safe, range-based **B-tree** — in Linux 6.1 | V3 §19.8, V5 §34.9 |
| **Reverse mapping** (`i_mmap`, `anon_vma`) | **interval trees** built on the red-black tree via the augmentation framework; the field is literally called `rb_subtree_last` and it *is* `max_hi` | V4 §23.6 |
| **Page cache / `XArray`** | **radix tree** (the `XArray` API replaced the older `radix_tree` interface; the structure underneath is still a radix tree) | V4 §21 |
| **ID allocation** (`IDR`) | radix tree over integer IDs | V4 §21 |
| **IPv4 forwarding table** | **LC-trie** (level-compressed trie) in `fib_trie.c` — longest-prefix match | V4 §21.5, §21.7 |
| `epoll` registered descriptors | red-black tree | V2 §11 |
| I/O schedulers (deadline, BFQ) | red-black trees | V2 §11 |
| High-resolution timers (`hrtimer`, `timerqueue`) | red-black tree, leftmost cached | V2 §11.8 |
| cgroups, futex hash buckets, memory control | red-black trees | V2 §11 |

**The Linux `rb_node` is worth studying as an artifact in its own right** (V2 §11.8): three words,
the colour packed into the low bits of the parent pointer, intrusive so there is no allocation and no
extra dereference, and a completely type-agnostic rebalancing routine that knows nothing about your
keys. It is the same decoupling `std::map` reaches from the opposite direction (§38.4).

**Windows.** The NT memory manager's Virtual Address Descriptors were historically indexed with
**splay trees** and later moved to **AVL trees**, with concurrency the stated motivation — lookups on
a splay tree require exclusive locking (V2 §12.6, V5 §31.10). *(Confidence: moderate; from
*Windows Internals* rather than source.)*

## 38.3 Filesystems

> **Confidence: high on XFS, Btrfs and ext4 in outline; moderate on NTFS, APFS, ReFS and HFS+
> internals, which are less openly documented.**

| Filesystem | Structures |
|---|---|
| **XFS** | **B+-trees for everything.** Free space indexed **twice** — once by block offset and once by extent size, two trees over the same data serving two different queries. Plus inode allocation, extent maps, directories, reverse mapping (`rmapbt`), and reflink refcounts. The most thoroughly B-tree-based filesystem in wide use. |
| **Btrfs** | **Copy-on-write B-trees for everything** — the name is literally "B-tree filesystem." Snapshots are free (V5 §32.11, §34.6). |
| **ext4** | **Extent trees** for file block mapping; **HTree** for directory indexing — a hash-keyed, depth-limited structure that is B-tree-*like* rather than a B+-tree, and calling it one is a stretch. |
| **ZFS** | **A notable non-B-tree.** The block map is an **indirect block tree** (radix-like, fixed fanout by block pointer count); directories use hash-based ZAP structures. But **every block pointer stores the checksum of the block it points to**, making the entire filesystem a **Merkle tree** rooted at the uberblock — which is what enables self-healing. B-trees have since appeared for some in-memory range structures. (V4 §27.6) |
| **NTFS** | Directory indexes as **B+-trees** (`$INDEX_ROOT` / `$INDEX_ALLOCATION`). The MFT itself is a flat file with extent-mapped attributes. |
| **APFS** | **B-trees** for object maps and filesystem records; copy-on-write. |
| **ReFS** | B+-trees ("Minstore"). |
| **HFS+** | B\*-trees for the catalog, in Apple's terminology — one of the few production uses of the B\* variant Volume 3 §20.2 declared dead. |
| **F2FS** | Log-structured, with a flat node address table. |
| **FAT** | **No tree at all** — a **linked list of clusters** per file. |

> **FAT deserves its row.** Its cluster chain is precisely Volume 1 §1.5's linked list, with precisely
> Volume 1 §1.5's defect: **no random access.** Seeking to byte 100 MB of a FAT file means walking the
> chain from the start, one cluster at a time, in a dependent chain (V1 §1.6). Every other
> filesystem in the table replaced that walk with a tree, and the reason is Volume 1, Chapter 1.

## 38.4 Relational databases

> **Confidence: high.**

| System | Index structures |
|---|---|
| **PostgreSQL** | **`nbtree`** — a B+-tree implementing the Lehman & Yao B-link algorithm (V5 §31.8). Plus **GiST** (a *framework* for search trees; with spatial types it becomes an **R-tree**), **GIN** (inverted index, with a B-tree over the keys), **SP-GiST** (space-partitioned: **quadtrees, kd-trees and radix trees**, selectable), **BRIN** (block-range summaries — not a tree), and hash. |
| **MySQL / InnoDB** | **Clustered B+-tree**: the table *is* the primary-key index, 16 KB pages; secondary indexes store primary keys, so a secondary lookup costs two descents (V3 §19.9). |
| **Oracle** | B+-tree indexes; bitmap indexes; **index-organized tables** (clustered); R-trees in Oracle Spatial. |
| **SQL Server** | B+-tree, 8 KB pages, clustered index optional per table; columnstore for analytics; and the **in-memory engine uses a Bw-tree** (V5 §34.10). |
| **SQLite** | **Both variants in one system**: "table b-trees" store data only in leaves (a B+-tree); "index b-trees" store keys in all nodes (a plain B-tree). |
| **LMDB** | **Copy-on-write B+-tree**, memory-mapped, single writer, lock-free readers, **no write-ahead log at all** (V5 §32.11, §34.6). |
| **Berkeley DB** | B+-tree. |
| **DuckDB, HyPer** | **ART** for indexes (V4 §21.6); columnar storage otherwise. |

> **PostgreSQL's SP-GiST is worth singling out.** It is a framework for space-partitioned trees, and
> its shipped operator classes include quadtrees, kd-trees and radix trees. **Volume 4's Chapters 21
> and 25 are literally options in a `CREATE INDEX` statement.**

And on the other side of the same decoupling as the kernel's `rb_node`: **libstdc++'s `_Rb_tree`
keeps its rebalancing code untemplated**, operating only on a base node type, so it lives in the
compiled library and one copy serves every `std::map` in your program (V2 §11.8). Two designs, one
from a kernel and one from a template library, arriving at "the structural algorithm should know
nothing about the data."

## 38.5 LSM-trees, key-value stores and NoSQL

> **Confidence: high on the engines; moderate on current default compaction strategies, which are
> tunable and change.**

| System | Structures |
|---|---|
| **LevelDB / RocksDB / Pebble** | **LSM-tree**, leveled compaction, **Bloom filters** per SSTable, **skip-list memtable**, and each SSTable carries a **static B-tree block index** (V3 §20.6–20.7) |
| **Cassandra / ScyllaDB** | LSM (size-tiered or leveled), plus **Merkle trees for anti-entropy replica repair** (V4 §27.6) |
| **HBase** | LSM over HDFS |
| **MongoDB / WiredTiger** | **B+-tree or LSM, selectable per collection** — the clearest illustration that the choice is workload-dependent (V3 §20.11) |
| **etcd / bbolt** | **B+-tree**, copy-on-write, in the LMDB design lineage |
| **TiKV, CockroachDB** | RocksDB / Pebble → LSM, with range-partitioned distribution on top (§39.1) |
| **InfluxDB** | TSM — a time-structured merge tree |
| **Redis** | **Skip lists** for sorted sets (V2 §13.7, V5 §31.10); hash tables for everything else |

> **Two things worth noticing across this table.** **Every LSM-tree contains B-trees** — an SSTable's
> block index is a static, immutable, perfectly-packed B-tree, because Volume 3 §15.7's requirements
> do not stop applying just because the file is read-only. **And every LSM-tree contains a heap** —
> compaction merges *k* sorted runs with a *k*-way merge driven by a min-heap of size *k* (V4 §24.6).
> The lineages are not separate; they are composed.

## 38.6 Networking and naming

> **Confidence: high on the concepts; moderate on specific implementations.**

| Use | Structure | Notes |
|---|---|---|
| **IP forwarding — longest prefix match** | **tries**: LC-trie (Linux), Patricia/radix (BSD) | The query no ordered index can express (V4 §21.1) |
| **In hardware routers** | **TCAM** — not a tree | Compares all entries **in parallel**, one cycle. A *replacement* for the trie, at a cost in power, density and price per bit. §39.3. |
| **BGP prefix storage** | Patricia tries | |
| **Firewall / ACL matching** | interval trees, decision diagrams, or TCAM | V4 §23.6 |
| **DNS** | **the namespace is a tree**; resolution is a root-to-node descent with delegation at each level | See below |
| **Dynamic connectivity, max-flow** | **link-cut trees** — built out of splay trees | V2 §12.7, §40.5 |

**DNS deserves care, because it is easy to get wrong.** The DNS *namespace* is a tree — root, TLD,
domain, subdomain — and resolution walks it downward, with each level delegating authority for the
level below. But that tree is a **naming and delegation hierarchy**, not an index: it exists so that
names are only **locally** unique and are disambiguated by path, which is exactly Volume 1 §2.5's
observation that hierarchy solves a *social* scaling problem before it solves an algorithmic one.
The actual *implementations* — an authoritative server's zone, a resolver's cache — use hash tables
or red-black trees internally.

The same distinction applies to filesystem paths, Java package names, and URL paths: **the tree is
in the naming, and the lookup structure underneath it is a separate choice.**

## 38.7 Compilers and language runtimes

> **Confidence: high on the concepts; moderate on specific compiler internals.**

| Use | Structure | Chapter |
|---|---|---|
| **Abstract syntax trees** | *the* tree — the output of parsing is a tree, and Volume 1 §2.3's LISP `cons` cells are its direct ancestor | V1 §2.3 |
| **Node storage for ASTs and IR** | **arena allocation with integer indices instead of pointers** — LLVM's bump allocators, Rust's arena-allocated ASTs | V1 §6.4 |
| **Dominator trees** | the dominator tree of a control-flow graph, computed by Lengauer–Tarjan; the backbone of SSA construction | *(not covered in this book — see §"gaps")* |
| **Dataflow analysis ordering** | **reverse post-order** on the CFG — i.e. a topological sort | V1 §4.7 |
| **Register allocation** | **interval trees** over live ranges, for linear-scan allocation | V4 §23.6 |
| **Code emission from an AST** | **post-order traversal** — operands before the operation that consumes them | V1 §4.2 |
| **String interning, keyword recognition** | tries | V4 §21.7 |
| **Miscellaneous compiler tables** | GCC ships `splay-tree.c` in `libiberty` | V2 §12.7 |
| **Immutable ASTs** in functional compilers | persistent trees with structural sharing | V5 §34 |
| **Persistent language collections** | **HAMTs** — Clojure, Scala, Immutable.js, Haskell's `unordered-containers` | V5 §34.5 |

## 38.8 Version control and content addressing

> **Confidence: high on git; moderate on the others' internals.**

| System | Structure |
|---|---|
| **Git** | A **Merkle DAG** with **structural sharing** — blobs, trees and commits, each identified by the hash of its contents including its children's hashes. A commit hash is a **root pointer into an immutable persistent data structure**, and `git gc` is a **tracing garbage collector with a grace period** (V4 §27.6, V5 §34.7) |
| **IPFS** | Merkle DAG; content identifiers are hashes; deduplication and verification are free consequences |
| **Certificate Transparency** | **append-only Merkle tree** with both inclusion *and* **consistency** proofs (RFC 6962) — the consistency proof is what makes append-only checkable by anyone (V4 §27.6) |
| **Blockchains** | Merkle root in each block header, enabling light clients to verify a transaction with a log-sized proof. **Ethereum** uses a **Merkle Patricia Trie** — Volume 4 Chapters 21 and 27 composed |
| **BitTorrent v2** | per-file Merkle trees (v1 used a flat list of piece hashes) |
| **OCI / Docker images** | content-addressed layers in a chain |
| **Nix / Guix** | content-addressed store paths |
| **Mercurial** | revlog — a delta chain with an index, rather than a Merkle tree |

## 38.9 Browsers and documents

> **Confidence: moderate — browser internals are large and change quickly.**

The **DOM** is the canonical example in computing of a tree as a **data model** rather than as an
index. Volume 1 §2.5 warned that trees are excellent for organizing *access* and frequently poor for
*modelling*, using IBM's hierarchical database model as the cautionary tale. The DOM is the case where
the warning does not apply, because a document genuinely **is** nested.

| Use | Structure / mechanism | Chapter |
|---|---|---|
| Document structure | the DOM tree | V1 §3 |
| Derived trees | render tree, layout tree, layer tree, accessibility tree — each a transformation of the DOM | V1 §4 |
| **Incremental layout** | **dirty-bit propagation upward**, then recomputation downward — post-order aggregation followed by pre-order application | V1 §4.2, §4.3 |
| Serialization of nested markup | opening tags are **pre-order** visits, closing tags are **post-order** visits of the same node — the Euler tour, made textual | V1 §4.1, §4.3 |
| CSS selector matching | tree queries, accelerated by per-tag/class/id indexes to avoid full traversal | — |
| JSON / XML parsing | produces a tree; indentation depth *is* node depth | V1 §4.3 |

## 38.10 Search, text and bioinformatics

> **Confidence: high on the bioinformatics tools and on Lucene's FST term dictionary; moderate
> elsewhere.**

| Use | Structure | Chapter |
|---|---|---|
| **Full-text search over documents** | **inverted index** — *not* a suffix structure. But Lucene's **term dictionary is an FST** (finite state transducer), which is a **minimized trie** — Volume 4 §21.7's DAWG, in production | V4 §21.7, §26.7 |
| **Numeric and geo fields in Lucene / Elasticsearch** | **BKD-trees**, having migrated away from geohash prefix trees | V4 §25.4 |
| **Autocomplete** | tries, FSTs, or n-gram indexes with a frequency **augmentation** to prune to top-*k* | V4 §21.7 |
| **Spell correction** | trie plus a Levenshtein automaton, so the edit-distance DP is **shared across all words with a common prefix** | V4 §21.7 |
| **Short-read alignment** | **FM-index** — `bwa`, `bowtie`, `bowtie2`, `HISAT2`. Smaller than the reference and replaces it | V4 §26.6 |
| **Whole-genome alignment** | actual **suffix trees** — `MUMmer` finds maximal unique matches | V4 §26.7 |
| **Genomic interval intersection** | interval trees, NCLists, AILists — `bedtools` | V4 §23.6 |
| **Compression** | **BWT** (bzip2); suffix structures for optimal LZ77 match-finding; **Huffman trees** | V4 §26.6, V1 §2.3 |
| **Vector / embedding search** | **HNSW graphs** and quantization — **not trees** (§38.14) | V4 §25.5 |

## 38.11 Games, graphics and simulation

> **Confidence: high on BVH and hardware ray tracing; moderate on engine specifics.**

| Use | Structure | Chapter |
|---|---|---|
| **Ray tracing** | **BVH** — effectively an R-tree specialized for ray queries, built with a surface-area heuristic. **Modern GPUs contain dedicated silicon to traverse it** | V4 §25.5, §37.7 |
| Level of detail, frustum culling, voxels | **octrees** | V4 §25.3 |
| 2-D collision, terrain, tile worlds | **quadtrees** | V4 §25.3 |
| *n*-body simulation | **octree with a centre-of-mass augmentation** — Barnes–Hut, O(*n* log *n*) instead of O(*n*²), using augmentation for **approximation** rather than exact pruning | V4 §25.3, §29.2 |
| Point clouds, photon mapping | KD-trees | V4 §25.2 |
| **Scene graphs** | a tree of transforms; composing world transforms is a **pre-order traversal** | V1 §4.3 |
| **Behaviour trees** for AI | a tree used as a **program** rather than as data | — |
| Broad-phase collision (alternatives) | sweep-and-prune, spatial hashing — **not trees** | §38.14 |

## 38.12 Machine learning

> **Confidence: high on the ensemble libraries and MCTS; moderate on inference-optimization
> specifics.**

| Use | Structure | Chapter |
|---|---|---|
| **Tabular prediction** | **gradient-boosted decision tree ensembles** — XGBoost, LightGBM, CatBoost; random forests | V4 §28 |
| **Inference-time layout** | a served ensemble is a data structure traversed millions of times per second; compiled and cache-optimized traversal (QuickScorer, Treelite) | V4 §28.8, §37 |
| **Learning to rank** | **LambdaMART** — gradient-boosted trees, long a mainstay of web search ranking | V4 §28.8 |
| **Monte Carlo Tree Search** | a tree **built by search**, with UCB-style selection — AlphaGo, AlphaZero | — |
| **Hierarchical softmax** | a **Huffman tree over the vocabulary**, making a softmax over *V* classes O(log *V*) — used in word2vec. Volume 1 §2.3's 1952 construction, in a neural network | V1 §2.3 |
| Exact *k*-NN in low dimensions | KD-trees, ball trees (`scikit-learn`) | V4 §25.2 |
| Hierarchical clustering | dendrograms | — |
| **Constrained LLM decoding** | a **trie** over permitted continuations, used to mask the sampling distribution | V4 §21 |

## 38.13 The master table

Inverting the index: structure to problem to production systems.

| Structure | The problem it solves | Where it runs | Ch |
|---|---|---|---|
| **Red-black tree** | ordered in-memory map with cheap updates *and* worst-case bounds | Linux scheduler, timers, epoll, I/O schedulers; `std::map`, `std::set`; Java `TreeMap`, and `HashMap`'s collision buckets | V2 §11 |
| **AVL tree** | ordered in-memory map, read-dominated | Windows NT VADs; some in-memory DB indexes | V2 §10 |
| **Splay tree** | skewed access patterns, zero metadata | GCC `libiberty`; **link-cut trees** | V2 §12 |
| **Treap / skip list** | randomized balance; `split`/`join`; **easy concurrency** | Redis sorted sets; LevelDB memtable; `ConcurrentSkipListMap`; ropes | V2 §13 |
| **B+-tree** | ordered index larger than memory, with range scans | PostgreSQL, InnoDB, Oracle, SQL Server, SQLite, LMDB; XFS, Btrfs, NTFS, APFS; etcd; Linux maple tree | V3 §19 |
| **LSM-tree** | write-heavy, random keys, data ≫ memory | RocksDB, LevelDB, Cassandra, HBase, ScyllaDB, InfluxDB, MyRocks | V3 §20.6 |
| **Bε- / fractal tree** | write-heavy but needing B-tree-like reads | TokuDB (historical), BetrFS | V3 §20.5 |
| **Trie / radix tree** | prefix queries; **longest prefix match**; fuzzy match | Linux FIB, BSD routing, BGP; Linux page cache and IDR; Ethereum state; ART in DuckDB/HyPer; Judy | V4 §21 |
| **FST / DAWG** | minimal-space dictionary with prefix search | Lucene term dictionary; spell checkers; word-game engines | V4 §21.7 |
| **Segment tree** | range aggregate over any **monoid**, with updates | competitive programming; time-series rollups; range-query engines | V4 §22 |
| **Fenwick tree** | prefix aggregate with point updates, minimal space | adaptive arithmetic coding (its original purpose); rank/order-statistics | V4 §22.6 |
| **Interval tree** | which stored ranges overlap this range | Linux reverse mapping and MMU notifiers; `bedtools`; register allocators; calendars | V4 §23 |
| **Heap** | repeated extraction of the extreme | Dijkstra/A\*/Prim; Huffman; heapsort as introsort's fallback; top-*k* streams; **LSM compaction's *k*-way merge**; event simulation | V4 §24 |
| **KD-tree / ball tree** | low-dimensional nearest neighbour | `scikit-learn`; point clouds; photon mapping | V4 §25.2 |
| **Quadtree / octree** | 2-D and 3-D spatial partitioning; hierarchical approximation | game engines; LOD and culling; Barnes–Hut; geohash/Morton codes are quadtree paths | V4 §25.3 |
| **R-tree / R\*-tree** | indexing **extended objects** on disk | PostGIS (via GiST), Oracle Spatial, SQLite R\*Tree, MySQL spatial | V4 §25.4 |
| **BVH** | ray–object intersection | every ray tracer; **hardware traversal units in GPUs** | V4 §25.5 |
| **BKD-tree** | multidimensional **points** on disk | Lucene / Elasticsearch numeric and geo fields | V4 §25.4 |
| **Suffix tree** | arbitrary-substring queries, maximal repeats | `MUMmer`; LZ77 match finding | V4 §26 |
| **Suffix array + LCP** | the same, in a quarter of the space | text indexing, compression | V4 §26.5 |
| **FM-index** | substring search in **less space than the text** | `bwa`, `bowtie`, `HISAT2` | V4 §26.6 |
| **Merkle tree / DAG** | verify one item against one trusted hash | git, IPFS, Certificate Transparency, Bitcoin, Ethereum, ZFS, Btrfs, dm-verity, Cassandra repair, BitTorrent v2, XMSS/SPHINCS+ | V4 §27 |
| **Decision tree ensemble** | prediction from tabular features | XGBoost, LightGBM, CatBoost; LambdaMART; credit, fraud, CTR, insurance | V4 §28 |
| **HAMT** | persistent immutable map | Clojure, Scala, Immutable.js, Haskell | V5 §34.5 |
| **CoW B-tree** | crash safety, snapshots and MVCC from **one** mechanism | LMDB, Btrfs, ZFS, APFS, bbolt | V5 §32.11 |
| **Bw-tree** | latch-free in-memory index | SQL Server in-memory engine | V5 §34.10 |
| **B-link tree** | high-concurrency B+-tree | PostgreSQL `nbtree` and most serious B-tree implementations | V5 §31 |
| **Eytzinger / vEB layout** | cache-efficient static search | high-performance search libraries; the layout question of §37.3 | §37 |

## 38.14 The non-trees: where a tree is the wrong answer

A map is more useful with its edges marked. **Trees lose in these cases**, and knowing where is
part of knowing the subject.

| Problem | The winning structure | Why the tree loses |
|---|---|---|
| **Point lookup with no ordering needed** | **hash table** | O(1) beats O(log *n*), and you were paying for an ordering you never used (V3 §20.11) |
| **High-dimensional approximate nearest neighbour** | **HNSW graphs**, IVF/PQ quantization (FAISS) | The curse of dimensionality: a region carries almost no information about distance, and partitioning assumes it does (V4 §25.5) |
| **Longest prefix match at line rate** | **TCAM** in hardware | Compares all entries in parallel in one cycle. A trie's log-depth descent cannot compete with true parallelism (§39.3) |
| **Word-based full-text search over documents** | **inverted index** | Far more compact, and it directly supports ranking and boolean queries. Suffix structures win only for *arbitrary substrings* in text with no word boundaries (V4 §26.7) |
| **Approximate set membership** | **Bloom filter** | Answers "definitely not present" in constant time and a few bits per key — and is used *alongside* trees, not instead (V3 §20.7) |
| **Distributed partitioning without range queries** | **consistent hashing** | No metadata tree to keep consistent, no hot-range problem — at the cost of losing range scans entirely (§39.1) |
| **Broad-phase collision in a uniform-density scene** | **spatial hashing**, sweep-and-prune | Constant-time bucketing beats hierarchical descent when density is uniform and the query radius is fixed |
| **Whole-array aggregates with no updates** | a **precomputed prefix-sum array** | Volume 4 §22.1's O(1) query — the tree exists only to make *updates* possible |
| **Smooth, linear relationships in prediction** | linear/parametric models | Axis-aligned piecewise-constant functions approximate a line with a staircase, and cannot extrapolate at all (V4 §28.8) |
| **Sequential file access** | a plain **array or extent list** | No index needed. FAT's mistake was not "no tree" but "a linked list" (§38.3) |

> **The pattern in that table: a tree is the right answer when you need an *ordering* or a
> *hierarchy* and the data is too large or too dynamic for a flat structure.** Drop the ordering
> requirement and a hash table wins. Drop the dynamism and a sorted array wins. Add enough dimensions
> and the hierarchy stops being informative. Add enough hardware parallelism and the descent stops
> being the cheapest way to search. **The tree's domain is real, and it is not everything.**

---

# Chapter 39 — Open Frontiers

## 39.1 Distributed trees at massive scale

> **Confidence: moderate on specifics; the architectures are documented but details change.**

Add a row to §36.1's table — the network, ratio 10⁶ to 10⁹ — and ask what a tree spanning a thousand
machines looks like.

**The naive answer fails immediately.** A tree whose root lives on one machine makes that machine
handle every operation, at network latency. Volume 5 §30.4's cache-coherence problem, six orders of
magnitude larger.

**What is actually built is a two-level architecture**, and its shape is a direct application of
something this book derived in Volume 3:

```
   ┌─────────────────────────────────────────────────────────────┐
   │  ROUTING LAYER: key range → server                          │
   │  Small (thousands of entries), and REPLICATED TO EVERY       │
   │  CLIENT, cached aggressively, refreshed on miss.             │
   └──────────┬──────────────┬──────────────┬────────────────────┘
              ▼              ▼              ▼
       ┌────────────┐ ┌────────────┐ ┌────────────┐
       │  server A  │ │  server B  │ │  server C  │
       │ local B+-  │ │ local LSM  │ │ local ...  │   ← deep, local, fast
       │ tree/LSM   │ │            │ │            │
       └────────────┘ └────────────┘ └────────────┘
```

> **Volume 3 §15.5 observed that the top of a search tree is tiny and therefore stays cached. This is
> that observation taken to its logical extreme: the top of the tree is small enough to replicate to
> every client on Earth, so descending it costs zero network round trips.** The routing layer is a
> tree whose upper levels are cached *everywhere*, and only the leaf hop crosses the network.

**Real instances:** Bigtable and HBase (`META` tables locating tablets), Spanner (Paxos groups per
split), CockroachDB and TiKV (ranges with Raft consensus groups), and essentially every
range-partitioned store.

**And range splitting is Volume 3's page split, at network scale — with Volume 5's problem
attached.** When a range grows too large it splits, which requires atomically updating the routing
metadata *and* both new ranges. That is Volume 5 §32.2's multi-page atomicity, across machines,
which means it requires **consensus** — Raft or Paxos — rather than a WAL record. A page split costs
microseconds; a range split costs a consensus round.

**The alternative is to abandon the tree.** Consistent hashing (Dynamo, Cassandra) partitions by hash
with no metadata tree to keep consistent and no hot-range problem — at the cost of **losing range
queries entirely**, which is Volume 3 §20.11's "hash index" row, at distributed scale.

**What is genuinely open:**

- **Distributed range queries with strong consistency and low latency.** A range scan spanning *k*
  servers needs *k* round trips, or speculative parallel fetches, or a consistent snapshot across all
  of them. Doing this well is unsolved.
- **Hot *keys*, as opposed to hot ranges.** A range can be split; a single hot key cannot. The
  answers — caching, replication with read-your-writes complications, request coalescing — are all
  workarounds rather than solutions.
- **Geo-distribution where replica latencies differ by 100×.** §36.1's table assumes one latency per
  level; a globally distributed tree has a *distribution* of latencies per level, and the optimal
  shape depends on where the query originated.
- **Disaggregated memory.** If CXL-attached memory pools become common (§37.7), "RAM" becomes a
  network hop at ~1 µs, and the question of what a tree looks like when its levels live at
  *different* latencies becomes urgent rather than academic.

## 39.2 Verified tree algorithms

> **Confidence: moderate-high on the named projects; moderate on the state of the art.**

**The motivation comes straight out of Volume 5.** Its two worst failure modes are:

- §30.1's interleaving: a reader reports that a present key does not exist — silently, only under
  load, only sometimes.
- §33.4's row-pointer reuse: an index scan returns a **real, live, plausible, wrong row**.

**Testing does not find these reliably.** Both require a specific interleaving or a specific
crash point, and neither produces an error, an exception, or a detectable inconsistency. They produce
*wrong answers that look right*. That is precisely the class of bug formal methods exist for.

**What exists:**

| Project | What it verified |
|---|---|
| **seL4** | A fully verified microkernel, including its internal data structures |
| **CompCert** | A verified C compiler |
| **FSCQ** (Chen et al., SOSP 2015) | A **crash-safe filesystem**, proved correct using *Crash Hoare Logic* — an extension of separation logic that reasons about states reachable after a crash |
| **Iris** and concurrent separation logic | The framework where verification of *lock-free* structures is happening — which is exactly Volume 5's hard case |
| **Amazon's use of TLA+** (Newcombe et al., *CACM* 2015) | Model checking rather than proof, applied to S3 and DynamoDB — and it found exactly the §30.1-shaped interleaving bugs that testing had missed |

**Why it is hard**, specifically for the structures in this book:

1. **Volume 5 §31.5's invariants are statements about *histories*, not states.** "Content only ever
   moves rightward" is not a predicate you can evaluate on a snapshot; it is a constraint on the
   sequence of all past operations. Reasoning about that requires temporal logic or history-based
   specification, both of which are much harder than state invariants.
2. **Crashes and concurrency compose badly.** Verifying a concurrent structure is hard. Verifying a
   crash-safe one is hard. Verifying a structure that is concurrent *and* crash-safe multiplies the
   state space, and Volume 5's Chapters 31 and 32 are jointly exactly that case.
3. **Verified implementations tend to be simpler or slower** — often substantially — than the
   production ones they model. Volume 5 §34.10's honest note about the Bw-tree applies here too: the
   gap between "provably correct" and "competitively fast" is the frontier.

**The pragmatic middle ground is worth knowing about**, because it is deployed today: **runtime
invariant checking.** PostgreSQL's `amcheck` extension verifies a live B-tree's structural
invariants — key ordering, parent/child consistency, sibling links, the Volume 5 §31.5 relations —
on demand. It is not a proof, but it converts "silent wrong answer" into "loud error," which is
most of the practical value.

## 39.3 Hardware acceleration

Some of this is already shipping, which makes it the least speculative section in the chapter.

**Already real:**

| Hardware | What it does |
|---|---|
| **GPU ray-tracing units** (NVIDIA RT cores from Turing, 2018; AMD Ray Accelerators) | **Silicon dedicated to traversing a BVH.** Volume 4 §25.5 and §37.7 — feasible only because ray tracing has thousands of *independent* descents in flight, so the dependent-chain problem does not apply. |
| **TCAM** in routers | Ternary content-addressable memory performs **longest-prefix match in one cycle** by comparing all entries in parallel. This is not an accelerator for a trie; it is a **replacement** for one. Costs: power, density, price per bit. |
| **SIMD instructions** | Already standard for within-node search: AVX-512 compares 8–16 keys in one instruction (V4 §21.6's ART Node16, §37.2's FAST). |

> **The TCAM is the most interesting entry, because it is the clean case of hardware defeating an
> algorithm.** A trie's log-depth descent is the best you can do with sequential comparisons. Give up
> sequential comparison — compare everything at once, in parallel, in silicon — and the tree
> disappears entirely. §38.14's table has it as a row for this reason.

**Research and early stage:**

- **In-storage / near-data processing.** Computational SSDs that can traverse an index internally and
  return only the answer, rather than shipping pages to the host. This directly attacks §36.1's
  worst ratio, and if it works it changes B+-tree design (why minimize page reads if the pages never
  cross the bus?).
- **Smart NICs and DPUs** performing lookups in the network path.
- **FPGA index accelerators**, including in-network aggregation.

**And the frontier observation, which I find the most striking thing in this chapter:**

> §36.1's table has grown twice during this book's own timeframe — the inter-core level became
> dominant as core counts rose, and persistent memory appeared and then largely vanished. CXL may add
> another. **Hardware is adding levels to the hierarchy faster than software is adapting to them**,
> and every new level re-poses the same question with a new constant. The design rules of §36.7 have
> held for fifty years; the arithmetic changes every few.

## 39.4 Learned indexes: the challenge to the premise

> **Confidence: high on the papers; moderate on the current assessment, which is contested and
> moving.**

The most direct attack on this book's premise, and it deserves to be taken seriously rather than
mentioned politely.

**The reframe** (Kraska, Beutel, Chi, Dean, Polyzotis, "The Case for Learned Index Structures",
SIGMOD 2018):

> A B-tree is a **function** that maps a key to a position. It is a *piecewise-constant step
> function*, implemented as a tree of comparisons, and it makes **no assumptions whatsoever** about
> the distribution of the keys.
>
> But real key distributions are rarely adversarial. If keys are roughly uniform, or roughly
> log-normal, or monotonically increasing timestamps, then **position ≈ f(key)** for some smooth,
> cheap function *f*. So: learn *f*.

If *f* can be represented in a few hundred bytes and evaluated in a few nanoseconds, it replaces a
multi-level tree with a couple of arithmetic operations, and the "index" becomes small enough to sit
entirely in L1.

**The line of work:**

| Work | Contribution |
|---|---|
| **RMI** (Kraska et al., 2018) | *Recursive model index* — a hierarchy of simple models (often linear regressions), each narrowing the position estimate, with a final local search to correct the residual |
| **ALEX** (Ding et al., SIGMOD 2020) | An **updatable** learned index — the original was effectively read-only |
| **PGM-index** (Ferragina & Vinciguerra, VLDB 2020) | Piecewise-linear ε-approximation with **provable** worst-case bounds and optimal space for a given error tolerance |

> **Ferragina, for the second time in this book** — the FM-index of Volume 4 §26.6 is his too. Add him
> to the list with McCreight (Volumes 3, 4) and Bender & Farach-Colton (Volume 3, §37.5, §40.8).

**The honest assessment:**

**For:** on read-mostly data with a smooth key distribution, learned indexes can be dramatically
smaller and faster than a B-tree, and the PGM-index line gives real worst-case guarantees rather
than only empirical results.

**Against:** updates are hard (the model goes stale, and retraining is expensive); adversarial or
highly irregular distributions defeat the premise; the early papers' baselines were criticized for
comparing against unoptimized B-trees rather than against §37.2-grade cache-aware ones; and the
guarantee a B-tree offers — **O(log_B n), for every input, forever, with no assumptions** — is worth
a great deal operationally, which is Volume 2 §14.3's point about worst-case versus average-case
bounds arriving in a new context.

**Why it belongs in this chapter regardless:** it is the sharpest available challenge to the whole
book. If a tree is fundamentally *just a way of mapping keys to positions*, then it is one
implementation of a function, and there may be better ones. Volume 4 §29 said a tree is a machine for
hierarchical summarization; the learned-index line says the summarization can sometimes be replaced
by regression. That is a real idea and it is not obviously wrong.

## 39.5 Still-open classics

Two questions that have been open for a long time and are worth knowing are still open.

**Dynamic optimality.** Volume 2 §12.5's conjecture: are splay trees within a **constant factor** of
the offline optimal binary search tree? Sleator and Tarjan asked in 1985. Forty years later the best
known bound is **O(log log *n*)-competitive** (tango trees, §40.4, and successors: multi-splay
trees, chain-splay, the greedy-BST line). **Nobody has proved constant-competitiveness and nobody has
disproved it.** It is arguably the most famous open problem in data structures, and it is about the
oldest structure in this book.

**Succinct trees, and whether the theory is used.** The information-theoretic minimum to store one of
the Catalan(*n*) shapes on *n* nodes is

$$
\log_2 C_n \approx 2n - O(\log n) \text{ bits}
$$

— roughly **2 bits per node**, against a pointer-based node's 256. And it is achievable: LOUDS
(Jacobson, 1989) and balanced-parentheses representations (Munro & Raman) store a tree in
2*n* + o(*n*) bits **with O(1) navigation** — parent, child, subtree size — using rank/select
structures over bitvectors. *(Confidence: moderate-high.)*

This is a **solved** problem that is **underused**. It appears in genomic indexes, succinct tries
(`marisa-trie`), and libraries like SDSL, and almost nowhere else. The open question is not
theoretical but sociological: why does a 128× space saving with O(1) operations not get adopted more
widely? Plausible answers: the constants on rank/select are real, the implementations are hard, and
most trees are not the memory bottleneck. But it remains a striking gap between what is known and
what is used.

---

# Chapter 40 — A Cabinet of Curiosities

Nine structures that this book had no room for, offered briefly, because they are beautiful and
because knowing they exist is worth more than knowing them well. This is an invitation, not a
syllabus.

## 40.1 van Emde Boas trees — beating log *n* for integers

> **Confidence: moderate-high.** Peter van Emde Boas, mid-1970s.

**The question:** predecessor and successor queries on integers drawn from a universe of size *u*. A
balanced BST gives O(log *n*). Can you do better?

**Yes: O(log log *u*).** For *u* = 2³², that is log₂ 32 = **five steps to find the predecessor among
four billion possible keys.**

**The trick is recursive √-decomposition.** A vEB structure over universe *u* contains √*u*
**clusters**, each a vEB over universe √*u*, plus a **summary** vEB over √*u* recording which
clusters are non-empty:

```
    vEB(u)  =  √u clusters, each vEB(√u)
               + 1 summary vEB(√u), marking which clusters are non-empty
               + cached min and max

    A predecessor query recurses into EITHER the summary OR one cluster —
    never both.  So:

        T(u) = T(√u) + O(1)

    Substituting u = 2^m:   S(m) = S(m/2) + O(1) = O(log m) = O(log log u)   ∎
```

**The catch: O(*u*) space** in the naive version — 4 billion slots for *u* = 2³², whether you store
five keys or five billion. Fixed by **y-fast tries** (Willard, 1983), which bucket the *n* present
elements into ~*n*/log *u* groups and put an *x*-fast trie over the group representatives:
**O(*n*) space, O(log log *u*) query.**

And note *why* it beats the comparison bound: it does not compare keys, it **indexes on their bits** —
Volume 4 §29.3's third lesson, for the third time. The line of work continues in §40.6.

## 40.2 Finger trees — one structure, any monoid

> **Confidence: high.** Ralf Hinze and Ross Paterson, "Finger trees: a simple general-purpose data
> structure", *Journal of Functional Programming*, 2006.

**The question:** a purely functional sequence with O(1) amortized access at *both* ends, O(log *n*)
concatenation and splitting, and O(log min(*i*, *n*−*i*)) indexing.

**The structure is a 2-3 tree turned inside out.** The spine runs down the middle, with small groups
("digits") of one to four elements hanging off each side, so **the two ends are at depth 1 and the
middle is at depth O(log *n*)**:

```
        digit                                              digit
      ┌───────┐                                        ┌───────┐
      │ a b   │──────────── spine ────────────────────│  y z  │
      └───────┘   │            │            │          └───────┘
                  ▼            ▼            ▼
               (deeper: a finger tree of 2-3 NODES of elements,
                so the element type grows as you descend)
```

**And here is why it belongs in this chapter.** A finger tree is **generic over a monoid
annotation** — each node caches the monoid product of its subtree. Which means:

| Annotate with | You get |
|---|---|
| **size** | a random-access sequence (Haskell's `Data.Sequence`) |
| **maximum priority** | a priority queue |
| **(size, priority)** | a priority search queue |
| **min and max** | an interval map |
| any monoid | whatever that monoid measures |

> **That is Volume 4 §29's recipe — "store a composable summary of the subtree at each node" — turned
> into a *type parameter*.** Volume 4 argued that segment trees, interval trees, Merkle trees and
> R-trees are one idea with different summaries. A finger tree is that argument made executable: one
> implementation, and you supply the monoid.

## 40.3 Zippers — and a genuinely surprising piece of mathematics

> **Confidence: high on Huet; moderate-high on the derivative result.** Gérard Huet, "The Zipper",
> *JFP*, 1997.

**The question:** in an *immutable* tree (Volume 5 §34), how do you navigate to a point and edit
there efficiently, without walking from the root each time?

**The zipper.** Represent "a position in a tree" as a pair: **the subtree at the focus**, and **the
context** — everything else, turned inside out, as a path from the hole back to the root with the
sibling subtrees attached.

```
     TREE with a focus                ZIPPER = (focus, context)

            a                          focus  =  the subtree at d
          /   \                        context = [ went-left from b, sibling e
         b     c                                   went-left from a, sibling c ]
        / \                            
       d   e        ← focus at d       Move up/down/left/right: O(1)
      / \                              Edit at the focus:       O(1)
     f   g                             Rebuild the whole tree:  O(depth)
```

Used in functional editors, XML and tree manipulation (`clojure.zip`), cursor implementations, and
as the conceptual ancestor of lens libraries. Note that a zipper is what a **parent pointer** gives a
mutable tree for free — which is exactly why immutable structures need it explicitly (Volume 5 §34
forbids parent pointers, since they would make structural sharing impossible).

**And now the beautiful part.** Conor McBride observed that **the type of one-hole contexts for a
data type is its formal derivative.**

Check it on the simplest case. A list of *x*'s satisfies *L*(*x*) = 1 + *x*·*L*(*x*), so
*L* = 1/(1 − *x*). Differentiate:

$$
L'(x) = \frac{1}{(1-x)^2} = L(x)^2
$$

**And a one-hole context in a list is exactly a *pair* of lists** — the part before the hole and the
part after. *L*′ = *L*². It works.

Do the same for a binary tree and the derivative computes the zipper's context type: a *list* of
steps, each recording a direction, the node's value, and the sibling subtree — which is precisely
what the diagram above shows.

> **Differentiation, in the calculus sense, applied to data types, produces cursors.** It is one of
> the more startling correspondences in computer science, and it is the sort of thing that makes the
> subject worth staying in.

## 40.4 Tango trees — the frontier of the oldest question

> **Confidence: moderate-high.** Erik Demaine, Dion Harmon, John Iacono and Mihai Pătraşcu,
> "Dynamic optimality — almost", FOCS 2004.

**The question is Volume 2 §12.5's**, still open: is any online BST algorithm within a constant
factor of the offline optimum? Tango trees give the first non-trivial bound:
**O(log log *n*)-competitive.**

**The mechanism, and it is clever:**

```
  1. Fix a static balanced REFERENCE TREE over the keys.  Depth log n.

  2. Decompose it into PREFERRED PATHS: each node's preferred child is the one
     whose subtree was accessed more recently.  A preferred path is a
     root-to-leaf-ish chain of at most log n nodes.

  3. Store each preferred path as an AUXILIARY balanced BST.
     A path has ≤ log n nodes, so its auxiliary tree has depth O(log log n).

  4. An access traverses k preferred paths, each at cost O(log log n).

  5. And k is bounded by WILBER'S INTERLEAVE LOWER BOUND — which is itself
     a lower bound on ANY BST algorithm's cost.

     Therefore:  cost = O(k · log log n) = O(OPT · log log n)   ∎
```

The move in step 5 is the elegant one: rather than proving your algorithm fast, prove that the *only*
thing it does a lot of is something **every** algorithm must do a lot of.

> Note that **preferred-path decomposition appears in two entries of this cabinet** — here, and in
> §40.5's link-cut trees from 1983. Twenty-one years apart, for completely different purposes, from
> overlapping groups of people.

## 40.5 Link-cut trees — why splay trees mattered

> **Confidence: high.** Daniel Sleator and Robert Tarjan, "A data structure for dynamic trees",
> *JCSS*, 1983.

**The question:** maintain a **forest** under `link(u,v)` and `cut(v)`, and answer path queries
(`findroot`, aggregate along the path to the root) — all in O(log *n*) amortized.

**The mechanism:** decompose each tree into preferred paths (as in §40.4) and store each path as a
**splay tree**. Splaying's amortized guarantee (Volume 2 §12.4) is exactly what makes the whole
structure O(log *n*) amortized.

**And this is the answer to a question Volume 2 raised and left hanging.** Volume 2 §12.7 noted splay
trees are "theoretically gorgeous, practically niche" and mentioned link-cut trees in passing. This
is the payoff: **splay trees' most important application is not as a map, but as a component of a
more powerful structure.** Link-cut trees appear inside maximum-flow algorithms, dynamic
connectivity, and dynamic minimum spanning trees — problems no simple structure solves.

## 40.6 Fusion trees — cheating with arithmetic

> **Confidence: moderate-high.** Michael Fredman and Dan Willard, "Surpassing the information
> theoretic bound with fusion trees", *JCSS*, 1993.

**O(log *n* / log log *w*) predecessor search**, where *w* is the machine word size — beating the
comparison bound, for a third time in this cabinet, by a third distinct mechanism.

**The trick is word-level parallelism.** Pack "sketches" of *B* keys — a few distinguishing bits from
each — into a **single machine word**, then compare the query against all *B* of them **with a
handful of arithmetic operations**, exploiting the fact that a 64-bit ALU operation is 64 parallel
bit operations you already paid for.

> This is §39.3's TCAM idea, executed in software on hardware you already own. It is also a reminder
> that "one instruction" is not one operation: a word is a vector, and a machine word's worth of
> parallelism is free if you can arrange your data to use it. The same insight, at 512 bits, is
> §37.2's SIMD node search.

## 40.7 Scapegoat trees — the philosophy Volume 2 missed

> **Confidence: moderate-high.** Igal Galperin and Ronald Rivest, "Scapegoat trees", SODA 1993.

Volume 2 §14.2 confidently named **four** philosophies of balance — enforce strictly (AVL), enforce
loosely (red-black), repair on access (splay), randomize (treap) — plus a fifth axis, change the
fanout (B-trees). It missed one, and it is a genuinely distinct one:

> **Rebuild, don't repair.**

A scapegoat tree stores **no per-node metadata at all** — no colour, no balance factor, no height, no
priority. Just the tree, plus two integers for the whole structure. On insertion, if the new node's
depth exceeds a threshold, walk back up to find the highest ancestor that is insufficiently
weight-balanced — the **scapegoat** — and **completely rebuild that entire subtree**, perfectly
balanced, from scratch.

- **Amortized O(log *n*)** per insertion.
- **Worst case O(*n*)** for a single insertion — the rebuild.
- **Least metadata of any balanced tree**, tying splay trees (Volume 2 §12.1).

> **And it is Volume 5 §33.9's remedy at subtree granularity.** Volume 5 §31.6.1 proved that no
> concurrent B-tree may move keys leftward, and §33.9 concluded that **rebuilding the index is how
> you move keys leftward anyway — by building a new tree instead of modifying the old one.** A
> scapegoat tree does that continuously, at whatever granularity the imbalance demands. The same
> move appears in §37.5's packed memory array (redistribute a region when it gets too dense) and in
> LSM compaction (Volume 3 §20.7). **"Discard and rebuild the offending region" is a real balance
> philosophy and this book under-sold it.**

## 40.8 Cartesian trees and range-minimum queries — a loop closes

> **Confidence: moderate-high.** Jean Vuillemin, 1980, for Cartesian trees; Michael Bender and
> Martin Farach-Colton, "The LCA problem revisited", LATIN 2000, for the O(*n*)/O(1) result.

**The Cartesian tree** of an array: the root is the array's minimum; the left and right subtrees are
the Cartesian trees of the subarrays either side. So it is **heap-ordered on value and BST-ordered on
index** — which is to say it is **a treap with the array index as key and the array value as
priority**.

Volume 2 §13.1 noted that the treap's structure was Vuillemin's Cartesian tree and that the
*randomized* use came a decade later. Here is what else it is for:

```
  RMQ(i, j) — the minimum of a[i..j] —
      is the LOWEST COMMON ANCESTOR of nodes i and j in the Cartesian tree.

  And LCA reduces back to RMQ, on the DEPTH ARRAY of the tree's Euler tour
      (Volume 1 §4.1's Euler tour, doing structural work at last).

  That RMQ instance is special: consecutive depths differ by exactly ±1.
  Bender & Farach-Colton exploit that to get
      O(n) preprocessing, O(1) query.
```

**RMQ and LCA are the same problem in two costumes, and each reduces to the other.** That is a
pleasing fact in its own right, and Volume 1 §4.1's Euler tour — introduced purely to explain why
pre-, in- and post-order are the same walk — turns out to be the bridge.

> **Bender & Farach-Colton for the third time**: Bε-trees (Volume 3 §20.5), cache-oblivious B-trees
> (§37.5), and this.

## 40.9 Wavelet trees — trees over the alphabet

> **Confidence: moderate.** Roberto Grossi, Ankur Gupta and Jeffrey Scott Vitter, "High-order
> entropy-compressed text indexes", SODA 2003.

Every tree in this book has been a tree over **positions** or over **keys**. A wavelet tree is a
balanced binary tree over the **alphabet**.

The root holds a bitvector, one bit per character of the sequence, saying whether that character
belongs to the first or second half of the alphabet. The left child holds the subsequence of
first-half characters, recursively. Depth log σ.

It supports `rank` (how many *c*'s in the first *i* positions), `select` (where is the *k*-th *c*),
and `access` in **O(log σ)** time, in *n* log σ + o(*n* log σ) bits — near the information-theoretic
minimum.

Where it matters: **inside FM-indexes over large alphabets** (Volume 4 §26.6), and throughout
compressed and succinct data structure libraries. It is the structure that makes Volume 4's
"the modern answer is not a tree" note only half true — the FM-index is not a tree, but there is
a tree inside it.

---

# Volume 6 Retrospective

**1. There was one question, asked at six scales (§36).** Where does the data live, and what is
expensive there? The derived quantity is the **access-to-compute ratio**, and it spans nine orders of
magnitude from a register to a cross-region round trip. When the ratio is near 1, minimize
instructions; when it is large, minimize accesses and spend computation freely.

**2. And the same five rules fall out at every level (§36.7).** Make the node the size of the
transfer unit. Minimize the number of levels. Keep the top of the structure small enough to live in
the level above. Turn dependent chains into sequential streams where you can. Do not write to shared
state on the read path. **Five volumes derived those independently, for five different parameter
values.**

**3. The same fanout trade appears five times (§36.8)**, each time discovered separately, each time
with the constant `access_unit_size / entry_size`: B-tree pages, ART node types, *d*-ary heaps,
immutable path copying, and cache-line-sized in-memory nodes.

**4. But there are two lenses, not one (§36.5).** Volume 4 §29's — *what summary does each node
store?* — determines **what question the structure can answer**. Volume 6 §36's — *at what level
does an access live?* — determines **how it must be shaped**. The axes are nearly independent, which
is why you can put an interval tree's summary on a B-tree, or a B-tree's fanout on a persistent
immutable map. And neither lens explains the curse of dimensionality, cryptographic guarantees, or
statistical correctness — those come from elsewhere.

**5. The cache hierarchy recreates the disk problem, and layout alone is worth 3× (§37.3).** Same
comparisons, same asymptotics, three arrangements of one million integers: textbook binary search
~1,100 ns, Eytzinger with branchless descent and speculative prefetching ~350 ns, cache-line B-tree
layout ~550 ns. **The measured winner is the B-tree layout**, and Eytzinger's real advantage comes
not from locality alone but from being *branchless*, which is what allows prefetching two levels
ahead regardless of the comparison outcome.

**6. Cache-obliviousness is beautiful and mostly unnecessary (§37.4, §37.6).** The van Emde Boas
layout achieves O(log_*B* *n*) transfers **for every *B* simultaneously**, without knowing *B* —
because recursive √-decomposition makes the layout self-similar, so some level of the recursion
matches whatever granularity the hardware uses. And it is little used, because *B* = 64 bytes has been
stable for two decades. **It solved a parameter-uncertainty problem that turned out not to be very
uncertain** — which is an empirical fact about the hardware market, not a fact about algorithms.

**7. GPUs break the book's central assumption, and it is worth knowing exactly how (§37.7).** Volume
3 §15.4 argued that height is unavoidable serial latency because a descent is a dependent chain. That
holds **for one query at a time**. With thousands of independent descents in flight the memory system
saturates and the objective flips from *minimize accesses* to *minimize bytes transferred* — which
recommends **narrower** nodes and a **deeper** tree, the opposite of Volume 3's conclusion. It is
also why dedicating silicon to tree traversal makes sense only for embarrassingly parallel workloads
like ray tracing.

**8. The map has edges (§38.14).** A tree is the right answer when you need an ordering or a
hierarchy over data too large or too dynamic for a flat structure. Drop the ordering and a hash table
wins; drop the dynamism and a sorted array wins; add dimensions and the hierarchy stops being
informative; add hardware parallelism and a TCAM beats the descent outright. **The domain is real and
it is not everything.**

**9. The frontier is where silent wrong answers live (§39.2).** Volume 5's two worst failure modes
produce results that look right, which is exactly the class of bug testing cannot find and formal
methods exist for. And Volume 5 §31.5's invariants are statements about *histories*, not states,
which is why verifying them is hard.

**10. And the sharpest challenge to the whole book is that a tree might just be a function
(§39.4).** If a B-tree is a piecewise-constant map from key to position that assumes nothing about
the key distribution, and real distributions are not adversarial, then a learned model may be
smaller and faster. That is a real idea. What a B-tree offers in exchange is O(log_*B* *n*) **for
every input, forever, with no assumptions** — which Volume 2 §14.3 already argued is worth a great
deal.

---

# The Book, In One Page

Six volumes, one argument.

**1. Flat structures face a genuine impossibility, not an engineering shortfall.** In a flat
structure an element's *position is its identity in the ordering*. That encoding is free and gives
O(1) random access — and it means changing the ordering means physically moving data. Arrays get
O(log *n*) search and pay O(*n*) to modify. Linked lists modify in O(1) and lose random access, which
provably destroys binary search. **Each discards precisely what the other needs.**

**2. A tree is binary search's decision structure, extracted from the algorithm and made into
data.** Draw every probe binary search could make on a sorted array and you have drawn a balanced
BST. In the array those edges are recomputed from index arithmetic, which is why insertion costs
O(*n*); store them as pointers and you keep the halving while making structural change local. **The
price is two pointers per element, and that trade is the seed of everything else.**

**3. Shape, not size, determines cost — and the most ordinary input produces the worst shape.** A
tree of *n* nodes has height anywhere from log₂ *n* to *n* − 1, and nothing in the definition
constrains which. Sorted input drives the insertion point to maximum depth every time, producing a
linked list with extra pointers. **Sorted input is what data usually looks like.**

**4. There are five ways to guarantee good shape, and they differ in how much slack they tolerate.**
Enforce strictly (AVL, tightest tree, most rebalancing). Enforce loosely (red-black, taller tree,
bounded structural change). Repair opportunistically on access (splay, adaptive, every read a write).
Randomize so the bad case cannot be aimed at (treaps). Rebuild the offending region (scapegoat).
**Slack is the design variable, and it sets the cost of repair.**

**5. Change the device and the cost unit changes — from comparisons to accesses.** Below RAM the
transfer unit is a block you cannot subdivide, and the marginal bytes of a transfer are nearly free.
So the objective becomes *minimize trips*, node becomes block, fanout becomes
`block_size / entry_size`, and height collapses from 30 levels to 4 for a billion keys.

**6. And at high fanout, balance becomes easy rather than hard.** No rotations, no colour bits, no
priorities, no potential functions. The minimum-occupancy invariant is **self-maintaining under
insertion**, because a split's natural output is exactly two half-full pages, and the tree grows at
the root so uniform leaf depth is structurally unbreakable. **Volume 2's entire apparatus was
necessary only because a binary node has no slack.**

**7. Change the question and the tree becomes a machine for hierarchical summarization.** Store at
each node a summary of its subtree — composable in O(1) from the children, and sufficient to answer
the query or discard the subtree unopened. A key range, an aggregate, a maximum endpoint, a bounding
box, a hash, a prediction. **Search trees were the special case where the summary is "the range of
keys below me."**

**8. Put it in production and every structural choice is constrained by what a stale reader can
recover from.** A right-link and a high key buy latch-free descent, because *a stale downlink always
points at or to the left of the correct page, never to the right*. That one theorem then forbids
merging, kills B\*-trees, makes backward scans asymmetric, and requires deferred page reclamation.
**Four engineering mysteries, one invariant.**

**9. And by what a crash can leave half-written.** Multi-page atomicity is solved by logging; torn
pages are not, because a torn page can carry a new log position with old contents, so redo skips the
record that would have repaired it and reports success. **Hence whole-page images.** Or: never
overwrite anything, and get crash safety, snapshots and multi-version reads from one mechanism.

**10. Nothing shrinks, so everything defers, and the debt is *r* × *T*.** Splits create pages;
concurrency forbids the repair that would reclaim them. So cleanup is layered, asynchronous, and
load-bearing — and it is a garbage collector, with the oldest garbage-collection pathology: a live
reference prevents collection.

**11. It was one question all along.** Where does the data live, and what is expensive there? Nine
orders of magnitude of answer, five design rules, one pattern that has held for fifty years while
the arithmetic changed every few.

---

# Six Things Worth Keeping

If the book compresses to anything, it compresses to these.

**1. Identify the cost unit before optimizing anything.** It is whatever the next level down charges
for, and it varies by nine orders of magnitude. Almost every wrong optimization in this subject comes
from optimizing the previous level's cost unit — counting comparisons when you are paying for page
reads, counting page reads when you are paying for round trips, counting anything at all when you
are paying for cache-line coherence.

**2. Slack is the design variable.** Every structure that maintains itself under continuous
modification has a parameter controlling how far from ideal it tolerates being: AVL's ±1, red-black's
black-height, a B-tree's fill factor, a hash table's load factor, an LSM's level ratio, a cleanup
interval. **Find the slack parameter and you have found where the trade-off is encoded.**

**3. An invariant is information, and information you can derive is information you need not
store.** A B+-tree separator only needs to *separate*, so truncate it. A Fenwick tree's operation is
invertible, so discard half the segment tree. A suffix array's leaf order encodes the tree's
structure, so throw the tree away — and then compress the array until it is smaller than the text.
Every step in that progression discarded something re-derivable.

**4. Ask whether a repair can propagate, not merely what it costs.** Red-black trees beat AVL trees
on writes because *the case that can repeat performs no rotations, and the cases that rotate cannot
repeat*. Separating "does work" from "triggers more work" is a general analytical move and it is
usually more informative than counting.

**5. Guarantees come in four flavours and they are not interchangeable.** Worst-case (every
operation, always). Amortized (the sequence is fast; any single operation may not be). Expected (fast
over *our* coin flips; nothing certain about one run). Average-case (fast **if** the input is
distributed as assumed). **The last is an assumption, not a guarantee** — and the input distribution
is sometimes chosen by someone who wants you to fail.

**6. The cheapest way to do work is to promise to do it later — then measure the debt.** Tombstones,
deferred merging, lazy propagation, compaction, garbage collection, deferred split repair. All the
same move, and all with the same bill: steady-state waste proportional to *r* × *T*, plus the
operational risk that the cleaner has become load-bearing infrastructure whose failure mode is
unbounded growth.

---

# What This Book Did Not Cover

Honest gaps, so you know the shape of what is missing.

| Not covered | Where to look instead |
|---|---|
| **Graph algorithms proper** — minimum spanning trees, shortest paths beyond the priority queue, network flow | CLRS; Volume 4 §24.6 only used the heap *inside* them |
| **Dominator trees** and other compiler-specific trees | any modern compiler text; §38.7 lists them without developing them |
| **Distributed consensus** — Raft, Paxos, and how a range split actually commits | only sketched in §39.1, and it deserves a book |
| **Concurrent hash tables** — the main non-tree competitor for everything in Volume 5 | Herlihy & Shavit |
| **Succinct and compressed structures in depth** | §39.5 and §40.9 sketch them; Navarro's *Compact Data Structures* |
| **Full proofs** — splay's access-lemma algebra, Ukkonen's construction, ARIES's correctness | the original papers, cited throughout |
| **Query optimization and cost models** — how a planner *decides* to use an index | any database internals text |
| **Formal verification technique itself** | §39.2 names the projects but teaches none of the method |
| **Weight-balanced (BB[α]), AA, WAVL and 2-3 trees proper** | Volume 2 named some in passing; the design space is larger than four philosophies, as §40.7 admits |
| **Trees in type theory and proof theory** — derivation trees, proof trees, tableaux | a different subject that happens to share the word |

---

# Where To Go Next

Not a bibliography — a short list of things that would each repay the time.

**For the history.** **Knuth, *The Art of Computer Programming*, Volume 1 §2.3 and Volume 3
§6.2.** Most of this book's historical claims trace to Knuth's notes, and his citations are the
primary record for the 1950s and 60s. Also **Comer, "The Ubiquitous B-Tree"** (*ACM Computing
Surveys*, 1979) — a survey written seven years after the B-tree paper whose title was already true.

**For Volumes 2 and 4's algorithms.** **CLRS** for the standard treatment, and **Sedgewick &
Wayne, *Algorithms*** for red-black trees in particular, since Sedgewick co-invented them.

**For Volumes 3 and 5 — and this is the strongest recommendation in the list.** **Goetz Graefe,
"Modern B-Tree Techniques"** (2011) and **"A survey of B-tree locking techniques"** (*ACM TODS*,
2010). These are the definitive engineering references for everything in Volumes 3 and 5, and the
latch/lock distinction of Volume 5 §30.2 is his framing. Also: **the PostgreSQL `nbtree` README**,
which is a genuine design document rather than API docs, is unusually candid about trade-offs, and is
free.

**For a modern practical treatment.** **Alex Petrov, *Database Internals*** (2019) covers Volumes 3
and 5 with current engineering detail.

**For Volume 5 §34.** **Chris Okasaki, *Purely Functional Data Structures*** (1998) — the standard
text on persistent structures, and where amortization-under-immutability is worked out properly.

**For Volume 5 §30–31.** **Herlihy & Shavit, *The Art of Multiprocessor Programming*** — the right
book for latches, memory models, and lock-free reasoning.

**For Chapter 37.** The cache-oblivious papers of **Frigo, Leiserson, Prokop & Ramachandran**
(1999) and **Bender, Demaine & Farach-Colton** (2000), plus **Khuong & Morin, "Array Layouts for
Comparison-Based Searching"** (2017) for the measurements.

**For §39.5 and §40.9.** **Gonzalo Navarro, *Compact Data Structures*** (2016).

---

# A Closing Note

Two papers, twelve years apart, contain most of this book.

In 1962, Adelson-Velsky and Landis observed that a binary search tree could be made to keep itself
balanced with a bounded amount of local work, and thereby turned a structure that was fast *on
average over inputs* into one that was fast *always*. In 1972, Bayer and McCreight observed that if
you make the node the size of the thing the disk hands you, the balance problem gets easier and the
tree gets a thousand times shorter — and that maintaining such a structure under continuous
modification, without ever taking it offline, was the actual problem worth solving.

Everything in these six volumes is an elaboration, a specialization, or a consequence of those two
observations, applied at a level of the memory hierarchy that did not exist when they were made.

And that, I think, is the reason the subject stays interesting rather than becoming settled. The
observations were about the relationship between a data structure and the machine underneath it — and
the machine keeps changing. Each new level in §36.1's table re-poses the same question with a new
constant, and each time the answer has the same shape and different arithmetic. The inter-core level
became dominant when core counts rose. Persistent memory appeared, prompted a genuinely new class of
crash-consistency algorithms, and then largely vanished. GPUs turned out to invert the central
assumption of Volume 3 for anyone with enough parallel work. CXL may add another row. Learned
indexes suggest the whole framing might be one implementation of something more general.

So the honest closing claim is not that this is a complete account of trees. It is that **the
question is stable even though the answers are not**, and that if you can look at a structure and
immediately ask *where does this data live, what is expensive there, and what summary does each node
need to carry* — you can derive most of what you need, including for the levels that have not been
invented yet.

That is a better thing to leave you with than a list of structures.

---

# The book is complete

**Six volumes, forty chapters.**

| Volume | Title | File |
|---|---|---|
| 1 | Foundations | `volume-1-foundations.md` |
| 2 | The Binary Tree Family | `volume-2-binary-tree-family.md` |
| 3 | Crossing the Memory Wall: B-Trees and Disk Structures | `volume-3-btrees-and-disk.md` |
| 4 | Specialized Trees, Each Solving a Problem Plain Trees Can't | `volume-4-specialized-trees.md` |
| 5 | Concurrency, Crash Safety, and Production Engineering | `volume-5-concurrency-and-durability.md` |
| 6 | Synthesis, Real-World Map, and Open Frontiers | `volume-6-synthesis-and-frontiers.md` |

Thank you for the commission. It was a genuine pleasure to write.

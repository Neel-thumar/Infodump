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


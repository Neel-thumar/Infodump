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


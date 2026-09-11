# Chapter 17 — B-Tree Mechanics

## 17.1 The terminology minefield, cleared

Volume 1 §3.4 flagged this and promised to untangle it here. There are two incompatible
conventions in wide use, they differ by a factor of two, and formulas written in one are wrong in
the other.

**Knuth's convention — "order *m*".** A B-tree of order *m* has **at most *m* children** per node,
hence at most *m* − 1 keys. Every non-root internal node has at least ⌈*m*/2⌉ children.

**CLRS's convention — "minimum degree *t*".** Every node has between *t* − 1 and 2*t* − 1 keys, and
between *t* and 2*t* children. The root may have as few as 1 key.

They describe the same structure with *m* = 2*t*. The trap: "a B-tree of order 5" means 5 children
under Knuth and would be an odd thing to say under CLRS; "a B-tree of degree 5" means 10 children.

There is a third usage in the wild — some authors and a great deal of code use "order" to mean the
maximum number of **keys** rather than children — and a fourth in database documentation, where
"order" sometimes just means "fanout, approximately."

> **Practical rule, and it is the same one Volume 1 §3.4 gave for tree height:** when you read a
> formula containing "order", test it against a tiny concrete case. If the formula gives a sensible
> answer for a node holding two keys, you have matched conventions. If it is off by a factor of
> two, you have not.

**This volume uses Knuth's order *m*** — *m* children, *m* − 1 keys — because it is the convention
in the original paper and in most database literature. And in practice I will mostly avoid the
word entirely in favour of **fanout**, meaning the actual number of children a node has, because
that is the quantity §15 showed us to care about.

## 17.2 The invariants

> **B-tree of order *m*.** For every node:
>
> **I1 — Capacity.** A node holds at most *m* − 1 keys and at most *m* children.
>
> **I2 — Minimum occupancy.** Every node except the root holds at least ⌈*m*/2⌉ − 1 keys, and every
> non-leaf non-root node has at least ⌈*m*/2⌉ children.
>
> **I3 — Root exception.** The root holds at least 1 key (if the tree is non-empty), and has at
> least 2 children if it is not a leaf.
>
> **I4 — Uniform leaf depth.** Every leaf is at exactly the same depth.
>
> **I5 — Separation.** A node with *k* keys *k*₁ < *k*₂ < … < *k*ₖ has exactly *k* + 1 children
> *c*₀ … *c*ₖ, and every key in subtree *c*ᵢ lies strictly between *k*ᵢ and *k*ᵢ₊₁ (with *k*₀ = −∞
> and *k*ₖ₊₁ = +∞).

For order *m* = 5, which I will use for all worked examples because it is the smallest order with
legible diagrams and an unambiguous split rule (§18.3):

| | Value |
|---|---|
| Max keys per node | 4 |
| Max children | 5 |
| Min keys, non-root | **2** |
| Min children, non-root internal | **3** |
| Min keys, root | 1 |

Here is a valid order-5 B-tree, which will be the running example:

```
                          ┌────┐
                          │ 90 │
                          └─┬──┘
              ┌─────────────┴─────────────┐
        ┌──────────┐                 ┌───────────┐
        │  30, 60  │                 │ 120, 150  │
        └────┬─────┘                 └─────┬─────┘
     ┌───────┼───────┐            ┌────────┼────────┐
┌────────┐┌───────┐┌───────┐ ┌──────────┐┌──────────┐┌──────────┐
│ 10, 20 ││ 40,50││ 70,80 │ │ 100, 110 ││ 130, 140 ││ 160, 170 │
└────────┘└───────┘└───────┘ └──────────┘└──────────┘└──────────┘

Check I5 on the left internal node [30, 60]:
   c₀ = [10,20]  — all keys < 30            ✔
   c₁ = [40,50]  — all keys between 30 and 60 ✔
   c₂ = [70,80]  — all keys > 60            ✔
Check I2: every non-root node has exactly 2 keys = the minimum  ✔
Check I4: all six leaves at depth 2         ✔
Check I3: root has 1 key, 2 children        ✔
```

**Note what is absent from that list.** There is no colour, no balance factor, no priority, no
height field, no rotation. Volume 2's entire apparatus is gone, and §16.6 explained why: with
hundreds of slots per node there is enough slack that the invariants maintain themselves.

## 17.3 Why "half full", and why it is self-maintaining

Two questions about I2. Why does a minimum exist at all, and why is the minimum *half*?

**Why a minimum exists.** Without one, nodes could hold a single key each, the fanout would collapse
to 2, and §17.5's height bound would evaporate. The minimum is what converts "the tree has high
fanout" from a hope into a guarantee. It is also what bounds the *storage*: a tree with no
occupancy floor could occupy arbitrarily many pages for a given key count, and §15.6 showed page
count is the currency.

**Why half, specifically, and this is the good part.** Because half is exactly what a split
produces. A full node has *m* − 1 keys; adding one gives *m*; sending one key up leaves *m* − 1 keys
to divide between two nodes, so each gets about (*m* − 1)/2 ≈ half of capacity.

> **The minimum-occupancy invariant is self-maintaining under insertion.** The only operation that
> creates new nodes is the split, and the split's natural output is precisely two nodes at the
> minimum. You never do extra work to preserve I2 — you get it for free from the mechanism that
> handles overflow.

That is why B-tree insertion has no case analysis. Compare Volume 2 §10.4's four AVL rotation cases
or §11.5's four red-black insertion cases, both of which exist because a binary node has no room
to absorb anything and every repair therefore has to move structure around.

Under **deletion**, I2 is *not* self-maintaining — removing a key can drop a node below the
minimum with no natural repair — and that asymmetry is exactly why §18.7 is the hard part of the
chapter. This mirrors Volume 2 precisely: AVL insertion needed one rotation and AVL deletion needed
Θ(log *n*). Insertion adds slack; deletion consumes it.

## 17.4 Why all leaves stay at the same depth

I4 looks like the hardest invariant to maintain and is in fact the easiest, for one structural
reason that is worth stating carefully because it is the heart of the design.

**A binary search tree grows at the leaves.** Insert a key, attach a new node below an existing
one, and *that one path* gets longer. Different paths grow at different rates, so the tree skews —
Volume 2 Chapter 9 in one sentence.

**A B-tree grows at the root.** When a leaf overflows it splits into two leaves *at the same
depth*, and one key moves up into the parent. The leaf level got **wider**, not deeper. If the
parent overflows it splits and pushes up again, cascading toward the root. Only when the **root**
itself overflows does a new root get created above it — and that adds one level to **every path
simultaneously.**

```
                      HOW A B-TREE GROWS

  before the root splits            after the root splits

        [ full root ]                      [ new root ]
        /  |  |  |  \                       /        \
       ▪   ▪  ▪  ▪   ▪              [left half]    [right half]
                                     / | | \        / | | \
                                    ▪  ▪ ▪  ▪      ▪  ▪ ▪  ▪

   every leaf at depth 1               every leaf at depth 2
                                       ALL paths grew together
```

The consequence:

> **I4 cannot be violated, because there is no operation that lengthens one root-to-leaf path
> without lengthening all of them.** Balance is not maintained by rebalancing; it is
> **structurally impossible to break.**

This is the same argument Volume 1 §2.3 made about B-trees in general and it is worth restating
because it explains the absence of rotations. A B-tree does not have a balancing algorithm. It has
a splitting algorithm, and balance is a side effect.

Mirror image: the only operation that *decreases* height is the root losing its last key when its
two children merge (§18.7). Growth and shrinkage both happen exclusively at the top.

## 17.5 The height formula, both directions

### Maximum keys for a given height

Every node full: *m* − 1 keys, *m* children. Leaves at depth *h*, root at depth 0.

- Nodes at depth *d*: at most *m*^*d*
- Total nodes: at most (m^(h+1) − 1)/(m − 1)
- Total keys: at most (m − 1) × that = **m^(h+1) − 1**

$$
n_{\max} = m^{h+1} - 1
$$

### Minimum keys for a given height — this gives the height bound

Be as sparse as I2 and I3 allow. Let *t* = ⌈*m*/2⌉ be the minimum children of a non-root internal
node.

- Root: 1 key, 2 children
- Depth *d* ≥ 1: at least 2*t*^(*d*−1) nodes, each with *t* − 1 keys

$$
n \ge 1 + (t-1)\sum_{d=1}^{h} 2t^{d-1} = 1 + 2(t-1)\cdot\frac{t^h - 1}{t - 1} = \mathbf{2t^h - 1}
$$

Inverting:

$$
\boxed{\;h \le \log_t\!\left(\frac{n+1}{2}\right), \qquad t = \left\lceil \frac{m}{2} \right\rceil \;}
$$

**Sanity check** at *m* = 5 (*t* = 3), *h* = 2: *n* ≥ 2·3² − 1 = 17. Count it directly on the
sparsest possible order-5 tree of height 2: root 1 key / 2 children; depth 1 has 2 nodes × 2 keys
= 4 keys and 3 children each = 6 nodes; depth 2 has 6 nodes × 2 keys = 12 keys.
1 + 4 + 12 = **17** ✔.

### What the bracket looks like at scale

For *m* = 500 (*t* = 250):

| Levels (*h*+1) | Minimum keys (2*t*^*h* − 1) | Maximum keys (*m*^(*h*+1) − 1) |
|---|---|---|
| 1 | 1 | 499 |
| 2 | 499 | 249,999 |
| 3 | 124,999 | 1.25 × 10⁸ |
| **4** | **3.1 × 10⁷** | **6.25 × 10¹⁰** |
| 5 | 7.8 × 10⁹ | 3.1 × 10¹³ |

A four-level order-500 B-tree holds somewhere between 31 million and 62 billion keys — a factor of
2,000 of uncertainty, which is the price of I2's generous slack. §17.7 shows real trees sit near
the top-middle of that range.

For *n* = 10⁹: *h* ≤ log₂₅₀(5 × 10⁸) = 20.03 / 5.52 = 3.63, so **h ≤ 3 — four levels, worst
case, guaranteed.** That confirms §15.7's estimate with a proper bound rather than an
approximation.

### The comparison that motivates everything

| *n* | Binary tree height | Order-500 B-tree height (max) |
|---|---|---|
| 10³ | 10 | 1 |
| 10⁶ | 20 | 2 |
| **10⁹** | **30** | **3** |
| 10¹² | 40 | 4 |

**A thousand-fold increase in data costs a B-tree one extra level.** And §15.5 priced each level at
one full device latency in a dependent chain that cannot be parallelized. That is the entire
argument of this volume, now with a proven bound behind it.

## 17.6 The fanout arithmetic, with real numbers

Fanout is not configured. It is `usable_page_bytes / entry_bytes`, and that has a direct,
frequently-underappreciated practical consequence.

Take an 8 KB page with ~40 bytes of header and bookkeeping: **~8,150 usable bytes.** An internal
node's entry is a key plus a child pointer (4–8 bytes).

| Key type | Key bytes | Entry bytes | **Fanout** | Levels for *n* = 10⁹ |
|---|---|---|---|---|
| `int32` | 4 | 16 (aligned) | **509** | **4** |
| `int64` / `bigint` | 8 | 16 | **509** | **4** |
| UUID | 16 | 24 | 339 | 4 |
| 32-byte hash | 32 | 40 | 203 | 4 |
| 64-byte text | 64 | 72 | 113 | **5** |
| 200-byte text | 200 | 208 | 39 | **6** |

> **Read the last two rows as an engineering instruction.** Choosing a 200-byte text column as your
> primary key instead of a `bigint` costs you **two extra levels** on a billion-row index. §15.5
> priced a level at one full device latency in a serial chain. So that schema decision costs two
> extra round trips on *every single lookup*, forever — and it costs the same again on every
> secondary index that has to reference the primary key (§19.9).
>
> Note also that `int32` and `int64` give **identical** fanout, because alignment padding absorbs
> the difference. Narrowing a key from 8 bytes to 4 buys you nothing here. This surprises people
> who assume smaller is always better; the granularity that matters is the aligned entry, not the
> key.

### Why 8 KB? Or 16 KB? Or 4 KB?

Larger pages give higher fanout and shorter trees:

| Page size | Usable | Fanout (16 B entries) | Levels for *n* = 10⁹ |
|---|---|---|---|
| 4 KB | ~4,050 | 253 | 4 |
| **8 KB** | ~8,150 | 509 | 4 |
| **16 KB** | ~16,340 | 1,021 | **3** |
| 32 KB | ~32,720 | 2,045 | 3 |

16 KB gets you to three levels for a billion keys, which is exactly why **InnoDB's default page
size is 16 KB** while PostgreSQL's is 8 KB. Neither is wrong; they weight the counter-pressures
differently, and there are five of them:

**1. Write amplification.** Modifying one 16-byte entry requires writing the whole page. On a 32 KB
page that is 32 KB of I/O for 16 bytes of change — and if the system logs full page images for
crash safety, the log entry is 32 KB too. This is the dominant argument against large pages and
§20.3 quantifies it.

**2. Lock and latch granularity.** A page is typically the unit of concurrency control. A 32 KB
leaf holds four times as many keys as an 8 KB leaf, so four times as many concurrent writers
contend for the same lock. Volume 5 develops this.

**3. Buffer cache granularity.** The cache holds a fixed number of fixed-size slots. If a query
needs one row and you must cache 32 KB to hold it, you evict more useful data. Fine-grained
caching wants small pages.

**4. Torn writes.** Devices guarantee atomicity at sector granularity — 512 B or 4 KB. Any page
larger than that can be half-written by a crash, producing a page that is not merely stale but
*unparseable*. Larger pages make this worse and make the repair mechanism (full-page logging) more
expensive. Volume 5, again.

**5. Read amplification for point queries.** Reading 32 KB to extract one 100-byte row wastes
bandwidth, which matters at high queue depth where §15.4's latency argument no longer dominates.

8 KB and 16 KB are where these five curves are simultaneously tolerable. The values have been
stable for decades, which is usually a sign that the optimum is broad and flat rather than that
nobody has looked.

### The maximum item size, and why it is about progress rather than space

Real implementations refuse to index a value larger than roughly **one third of a page**. The reason
is not space efficiency — it is a **termination guarantee**.

A page must be able to hold at least **three** items: two data items plus one separator (or, in a
B+-tree, a high key). If only one data item fits, then splitting a full page produces a page that
is *still* full, the insertion cannot make progress, and you get an infinite loop or a corrupt
tree. The 1/3 rule is what makes "split makes progress" provable.

The practical consequence: you cannot build a B-tree index directly on large values. The standard
answers are to index a hash or prefix of the value, or to use a structure designed for it (Volume 4
covers tries for exactly this case).

## 17.7 Space utilization: the 69% rule

I2 guarantees ≥50% occupancy. What do real trees actually achieve?

> **Confidence: high on the result, moderate on the exact citation.** For random insertions with
> median splits, the expected steady-state page occupancy converges to **ln 2 ≈ 69.3%.** The
> classic analysis is usually attributed to A. C. Yao, "On random 2-3 trees" (*Acta Informatica*,
> 1978), and the result generalizes to any order.

The intuition: after a split, both halves sit at ~50%. Insertions then fill them toward 100%, at
which point they split again and return to 50%. Occupancy is roughly uniformly distributed over
[50%, 100%], and the expected value works out to ln 2 rather than the naive 75% because pages
spend more time near the bottom of the range (a nearly-empty page needs many insertions to fill,
while a nearly-full one splits immediately).

**So a B-tree is intrinsically ~1/0.693 = 1.44× larger than its data strictly requires.** That 44%
is not waste — it is the headroom that makes an insertion a local page modification instead of a
global reorganization. It is the direct purchase price of everything ISAM could not do (§16.2).
§20.2 shows what it costs to buy the space back.

### The sequential-insertion trap

The 69% figure assumes **random** insertion order. Sequential insertion — the autoincrement primary
key, the timestamp, the sorted bulk load; Volume 2 §9.3's whole list — behaves completely
differently, and much worse if you are not careful:

```
Sequential keys with a naive median split:

  page P fills up          →  splits 50/50  →  all further keys go RIGHT
  [.....100% full.....]       [50%][50%]        ↑
                                                 the LEFT page's key range is
                                                 permanently in the past.
                                                 It will NEVER receive another
                                                 insertion. It sits at 50% forever.

  Repeat for every page  ⟹  THE ENTIRE INDEX IS PERMANENTLY 50% FULL
```

The index is twice the size it needs to be, and half your buffer cache is holding empty space.

The fix, used by every serious implementation, is to detect that the splitting page is the
**rightmost page at its level** — the signature of sequential insertion — and split lopsidedly,
leaving the left page at 90–100% and putting only the new key on the right. This single heuristic
nearly halves index size for the most common key pattern in existence.

> Volume 2 §14.3 said slack is the design variable. Here it is again: the *split point* is a slack
> parameter, and choosing it based on a cheap observation about position (am I rightmost?) recovers
> almost 2× in space. Note that this is the first appearance in this book of a structure adapting
> to its access pattern *without* the splay tree's cost of mutating on reads (Volume 2 §12.6). It
> is possible to be adaptive cheaply if you pick the right signal.

## 17.8 What fanout does not buy you

Closing the loop on Volume 2 §7.1 honestly, because it is easy to over-learn this volume's lesson.

**Comparisons are unchanged.** Searching a fanout-*f* tree of height *h* requires *h* × log₂(*f*)
comparisons if you binary-search within each node — which is log₂(*n*) total, exactly the same as a
binary tree. Volume 2 §7.1 was right and remains right. A B-tree does **not** reduce CPU work.
In-memory, against a well-laid-out binary tree, a B-tree's advantage comes entirely from cache
behaviour, not from comparison count.

**Within-node search recreates the problem one level down.** An 8 KB page spans 128 cache lines.
Binary-searching within it jumps around that region unpredictably, incurring ~7–9 cache misses —
the same pointer-chasing pathology from Volume 1 §6.2, at a smaller scale. Real implementations
therefore often binary-search down to a small range and then scan linearly, or use SIMD to compare
several keys at once. Volume 6 is about taking this seriously and designing the *within-page*
layout for the cache hierarchy explicitly.

**Fanout costs write amplification.** A large node means a large minimum write. §20.3 quantifies
this, and it is the reason an entire competing lineage of structures exists.

---


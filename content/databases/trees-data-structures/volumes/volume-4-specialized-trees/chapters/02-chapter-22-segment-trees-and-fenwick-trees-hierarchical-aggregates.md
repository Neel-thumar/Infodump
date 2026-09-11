# Chapter 22 — Segment Trees and Fenwick Trees: Hierarchical Aggregates

## 22.1 The problem, and a familiar impossibility

You have an array of *n* numbers. Two operations, interleaved arbitrarily:

- `update(i, v)` — set `a[i] = v`
- `query(l, r)` — return the sum of `a[l..r]`

Try the obvious structures:

| | `update` | `query(l,r)` |
|---|---|---|
| **Plain array** | **O(1)** | O(*n*) — scan the range |
| **Prefix-sum array** *P*[*i*] = *a*[0]+…+*a*[*i*] | O(*n*) — rebuild every *P*[*j*], *j* ≥ *i* | **O(1)** — *P*[*r*] − *P*[*l*−1] |

**One operation is O(1) and the other is O(*n*), and you cannot have both.** If that shape feels
familiar, it should — it is Volume 1 §1.7, arriving for the second time:

> *"The array has random access but pays Θ(n) to rearrange. The linked list rearranges in Θ(1) but
> has no random access. Each structure gives up exactly what the other needs."*

And the *reason* is the same reason Volume 1 §1.7 gave: **the prefix-sum array encodes global
information at every position.** *P*[500,000] depends on *a*[0]. So a change to one element
invalidates a linear amount of stored information, and there is no way to express that repair
locally.

Volume 1 §1.8's escape applies verbatim: **stop storing per-element values or global aggregates,
and store aggregates for a *hierarchy of ranges* instead.** Then a point update invalidates only the
O(log *n*) ranges that contain that point, and a range query is assembled from O(log *n*)
precomputed pieces.

## 22.2 The segment tree

> **Segment tree invariant.** The root covers [0, *n*−1]. Every internal node covering [lo, hi]
> splits it at mid = ⌊(lo+hi)/2⌋ into children covering [lo, mid] and [mid+1, hi]. Each node stores
> the **aggregate of its own range**.

The shape is fixed by *n* alone — the data does not influence it at all, so there is nothing to
balance and no insertion order to worry about. It is a complete-ish binary tree of height
⌈log₂ *n*⌉.

### Worked example

*a* = [2, 5, 1, 4, 9, 3], *n* = 6, aggregate = sum.

```
                        ┌───────────────┐
                        │ [0,5]  sum 24 │
                        └───────┬───────┘
              ┌─────────────────┴─────────────────┐
      ┌───────────────┐                   ┌───────────────┐
      │ [0,2]  sum  8 │                   │ [3,5]  sum 16 │
      └───────┬───────┘                   └───────┬───────┘
        ┌─────┴──────┐                      ┌─────┴──────┐
 ┌─────────────┐ ┌──────────┐       ┌─────────────┐ ┌──────────┐
 │ [0,1] sum 7 │ │[2,2]  1  │       │ [3,4] sum13 │ │[5,5]  3  │
 └──────┬──────┘ └──────────┘       └──────┬──────┘ └──────────┘
    ┌───┴────┐                          ┌──┴─────┐
┌────────┐┌────────┐              ┌────────┐┌────────┐
│[0,0] 2 ││[1,1] 5 │              │[3,3] 4 ││[4,4] 9 │
└────────┘└────────┘              └────────┘└────────┘

Verify bottom-up:  2+5 = 7 ✔   7+1 = 8 ✔   4+9 = 13 ✔   13+3 = 16 ✔   8+16 = 24 ✔
Direct sum: 2+5+1+4+9+3 = 24 ✔
```

### Query: sum over [1, 4]

Expected answer: 5 + 1 + 4 + 9 = **19**.

```
query([1,4]) at [0,5]:          partial overlap → recurse both children

  ├─ [0,2]:                     partial (want 1..2) → recurse
  │   ├─ [0,1]:                 partial (want 1..1) → recurse
  │   │   ├─ [0,0]:             NO overlap        → 0
  │   │   └─ [1,1]:             FULLY inside      → 5      ◄── stop here
  │   └─ [2,2]:                 FULLY inside      → 1      ◄── stop here
  │                             subtotal = 6
  └─ [3,5]:                     partial (want 3..4) → recurse
      ├─ [3,4]:                 FULLY inside      → 13     ◄── stop here
      └─ [5,5]:                 NO overlap        → 0
                                subtotal = 13

TOTAL = 6 + 13 = 19 ✔

Nodes that actually contributed: [1,1], [2,2], [3,4].  Three of them.
Note [3,4] answered for TWO elements in one read — that is the whole point.
```

**Why it is O(log *n*).** At each level of the tree, at most **two** nodes are partially
overlapping — the one containing *l* and the one containing *r*. Every other node at that level is
entirely inside the query (so we stop and read its aggregate) or entirely outside (so we return
immediately). So the recursion branches at most twice per level, giving at most 2·⌈log₂ *n*⌉ nodes
visited. ∎

### Update: `a[4] = 9 → 100`

```
Touch exactly the leaf-to-root path:

  [4,4]:   9  → 100
  [3,4]:  13  → 104      (4 + 100)
  [3,5]:  16  → 107      (104 + 3)
  [0,5]:  24  → 115      (8 + 107)

Four nodes. O(log n). Nothing else in the tree changed.
```

Compare the prefix-sum array, which would have had to rewrite *P*[4] and *P*[5] — and for *i* = 0
would rewrite all *n* of them. **The hierarchy localized the damage.**

## 22.3 The generalization that makes segment trees important

Nothing in §22.2 used the fact that the operation was addition. Look at what was actually required:

> **The aggregate must be associative:** (*x* ⊕ *y*) ⊕ *z* = *x* ⊕ (*y* ⊕ *z*), so that combining
> child aggregates gives the parent's aggregate regardless of grouping. Plus an identity element for
> the empty range. That is a **monoid** — and nothing more.

So a segment tree answers range queries for *any* monoid:

| Aggregate | Monoid? | Notes |
|---|---|---|
| sum, product | ✔ | identity 0, 1 |
| **min, max** | ✔ | identity +∞, −∞ |
| gcd, lcm | ✔ | |
| bitwise AND / OR / XOR | ✔ | |
| matrix product | ✔ | non-commutative — order matters, and that's fine |
| "count of elements equal to *k*" | ✔ | |
| "max subarray sum in this range" | ✔ | store (total, best prefix, best suffix, best) per node |
| **average** | ✘ | not associative — but store (sum, count) and divide at the end |
| **median** | ✘ | genuinely not decomposable |

That table is the payoff. **A segment tree is not a sum structure; it is a machine for answering
range queries over any associative summary.** The last non-trivial row — max subarray sum — is worth
noticing: by enlarging the summary from one number to four, a problem that looks non-decomposable
becomes decomposable. Choosing the right summary is the creative act.

## 22.4 Lazy propagation: range updates

So far updates were point updates. What about `add v to every element in [l, r]`?

Naively that is O(*r* − *l*) point updates. But observe: a range update also decomposes into
O(log *n*) canonical nodes, exactly as a query does. So mark those nodes with a **pending
operation** and do not touch anything below them:

```
Node [3,5] receives "add 10 to all of [3,5]":

  ┌──────────────────────────────┐
  │ [3,5]  sum 16 → 46           │      sum updated immediately:
  │        lazy: +10             │      16 + 10 × 3 elements = 46
  └──────────────────────────────┘
     children [3,4] and [5,5] are NOT touched.
     The "+10" is owed to them, and will be PUSHED DOWN
     only if a later query or update needs to look inside.
```

Every descent through a node first **pushes down** any pending operation to its children, then
proceeds. So the work is deferred until it is actually needed, and if nobody ever looks inside that
subtree, the work is never done at all. Range update and range query both become O(log *n*).

> **This is the third time this book has used the same idea.** Volume 1 §1.4 noted that tombstones
> convert Θ(*n*) deletion into Θ(1) by deferring the cleanup. Volume 3 §18.9 explained that real
> B-trees skip rebalancing on delete and let a background process reclaim later. Volume 3 §20.6
> built an entire storage engine (the LSM-tree) on buffering writes and reconciling in the
> background. **Lazy propagation is the same move at the smallest scale: the cheapest way to do
> work is to promise to do it later, and then only if someone asks.**

## 22.5 A word on the implicit array representation

Segment trees are almost always stored in a flat array using Volume 1 §6.3's implicit layout —
children of *i* at 2*i*+1 and 2*i*+2. The shape is data-independent, so there is no risk of Volume
1 §6.3's catastrophic failure mode.

But there is a milder version of it. For *n* not a power of two, the tree is not perfectly complete,
and the implicit layout leaves gaps. The standard defensive answer is to allocate **4*n*** slots
rather than the 2*n*−1 nodes the tree actually has. That is Volume 1 §6.3's "array size is
determined by height, not node count" showing up as a 2× constant factor rather than as an 8.6 GB
disaster — a good illustration that the failure mode is not binary but graded.

An iterative bottom-up formulation exists that uses exactly 2*n* slots and has better constants,
and it is what performance-sensitive code uses.

## 22.6 Fenwick trees: the same problem, half the space

> **Confidence: high on Fenwick; moderate on the earlier attribution.** Peter M. Fenwick, "A new
> data structure for cumulative frequency tables", *Software: Practice and Experience*, 1994. Boris
> Ryabko is generally credited with describing the same structure in 1989. Also called the **binary
> indexed tree (BIT)**.

### The derivation

A segment tree stores 2*n* aggregates and supports arbitrary range queries over any monoid. Now
weaken the requirement in two ways:

1. **Only prefix queries.** We will compute `prefix(i)` = *a*[1] ⊕ … ⊕ *a*[*i*].
2. **The operation is invertible** — it forms a **group**, not just a monoid. Then any range query
   is `prefix(r) ⊖ prefix(l−1)`.

Given those two concessions, how much of the segment tree do we actually need? Look at the segment
tree and ask which nodes ever appear in a *prefix* query decomposition. The answer is: only the
nodes that are **left children** — a prefix query never needs a node whose range starts in the
middle of the array and extends right past the query. Half the tree is dead weight.

The Fenwick tree keeps exactly the useful half, in exactly *n* cells, using a beautiful indexing
trick:

> **Fenwick invariant.** `tree[i]` stores the aggregate of *a*[*i* − lsb(*i*) + 1 … *i*], where
> lsb(*i*) is the value of the lowest set bit of *i*. (1-indexed.)

### Worked example

*a*[1..6] = [2, 5, 1, 4, 9, 3].

```
  i  binary  lsb(i)   tree[i] covers      tree[i] value
  ─────────────────────────────────────────────────────────
  1   001      1      a[1..1]             2
  2   010      2      a[1..2]             2+5      = 7
  3   011      1      a[3..3]             1
  4   100      4      a[1..4]             2+5+1+4  = 12
  5   101      1      a[5..5]             9
  6   110      2      a[5..6]             9+3      = 12

  tree = [ -, 2, 7, 1, 12, 9, 12 ]        (index 0 unused)
```

Picture the coverage as a staircase — this is where the structure becomes visible:

```
   a[]:      1     2     3     4     5     6
           ┌─────┐
  tree[1]  │  2  │
           └─────┘
           ┌───────────┐
  tree[2]  │     7     │
           └───────────┘
                       ┌─────┐
  tree[3]              │  1  │
                       └─────┘
           ┌───────────────────────┐
  tree[4]  │           12          │
           └───────────────────────┘
                                   ┌─────┐
  tree[5]                          │  9  │
                                   └─────┘
                                   ┌───────────┐
  tree[6]                          │    12     │
                                   └───────────┘
```

### Prefix query: strip one set bit at a time

```
prefix(i):
    s = 0
    while i > 0:
        s = s ⊕ tree[i]
        i -= lsb(i)          # equivalently: i &= i - 1
    return s
```

```
prefix(6):   6 = 110₂
   tree[6] = 12          (covers a[5..6])
   6 − 2 = 4 = 100₂
   tree[4] = 12          (covers a[1..4])
   4 − 4 = 0 → stop
   TOTAL = 24 ✔   (2+5+1+4+9+3 = 24)

   Note the two ranges a[1..4] and a[5..6] TILE a[1..6] exactly — disjoint,
   no gaps. That is not a coincidence; see below.

prefix(5):   5 = 101₂
   tree[5] = 9  (a[5..5]);  5−1 = 4;  tree[4] = 12 (a[1..4]);  4−4 = 0
   TOTAL = 21 ✔   (2+5+1+4+9 = 21)

prefix(3):   3 = 011₂
   tree[3] = 1  (a[3..3]);  3−1 = 2;  tree[2] = 7  (a[1..2]);  2−2 = 0
   TOTAL = 8 ✔    (2+5+1 = 8)

range(2,5) = prefix(5) − prefix(1) = 21 − 2 = 19 ✔   (5+1+4+9 = 19)
```

**Why the ranges tile exactly.** Writing *i* in binary, subtracting its lowest set bit clears
exactly that bit. So the sequence *i*, *i* − lsb(*i*), … visits the values obtained by clearing set
bits one at a time from the bottom, and terminates at 0. There are **popcount(*i*) ≤ ⌈log₂ *n*⌉**
steps. Each `tree[j]` in the sequence covers a block whose length is exactly the bit that was just
cleared, and those blocks abut perfectly because clearing a bit is exactly stepping back by that
block's length. **The binary representation of *i* is the decomposition of the prefix.** ∎

### Update: add set bits instead of stripping them

```
update(i, delta):
    while i <= n:
        tree[i] = tree[i] ⊕ delta
        i += lsb(i)
```

```
update(3, +10):     a[3] goes 1 → 11
   tree[3] += 10  → 11        (3 = 011₂;  lsb = 1)
   3 + 1 = 4
   tree[4] += 10  → 22        (4 = 100₂;  lsb = 4)
   4 + 4 = 8 > 6 → stop

   Verify: prefix(3) = tree[3] + tree[2] = 11 + 7 = 18
           direct:    2 + 5 + 11        = 18 ✔
           prefix(6) = tree[6] + tree[4] = 12 + 22 = 34
           direct:    2+5+11+4+9+3      = 34 ✔
```

The two loops are exact duals: the query strips low set bits, the update adds them. Each visits
O(log *n*) cells. The whole structure is **eight lines of code and *n* integers**.

## 22.7 Segment tree versus Fenwick tree

| | Segment tree | Fenwick tree |
|---|---|---|
| Space | 2*n* (often 4*n* allocated) | **exactly *n*** |
| Point update | O(log *n*) | O(log *n*), **~2× better constant** |
| Prefix query | O(log *n*) | O(log *n*) |
| Range query | O(log *n*), **any monoid** | O(log *n*), **requires a group (invertible)** |
| **min / max queries** | ✔ | **✘** — min has no inverse |
| Range update | ✔ with lazy propagation | awkward (needs two Fenwick trees) |
| Arbitrary custom summaries | ✔ | limited |
| Code size | ~40 lines | **~8 lines** |
| Cache behaviour | tree-shaped access | **flat array, bit-strided — better** |
| Descend to find "first prefix ≥ x" | ✔ | ✔ (binary lifting on the bits) |

> **The Fenwick tree is the space-optimized cousin, and the thing it trades away is precisely
> stated: it exploits *invertibility* to discard the half of the segment tree that only prefix
> queries never need.** Give up invertibility — ask for `min` instead of `sum` — and the trick
> evaporates, because you cannot subtract a prefix minimum out of a longer prefix minimum.
>
> This is Volume 3 §19.4's lesson in a different register: **an invariant is information, and
> information you can derive is information you do not have to store.** There, knowing that a
> separator only needs to *separate* let you truncate it. Here, knowing the operation is invertible
> lets you delete half the tree.

## 22.8 Where these run

**Fenwick's original motivation was data compression**, and it is worth knowing because it explains
the shape of the structure perfectly. Arithmetic coding needs **cumulative symbol frequencies** to
encode each symbol — that is a prefix query — and *adaptive* arithmetic coding updates a symbol's
frequency after each occurrence — that is a point update. Prefix query plus point update, millions
of times per second. The structure was designed for exactly that loop.

**Competitive programming** is where both structures are most heavily used, and the canonical
applications are worth knowing because they show up in real systems too:

- **Rank and order statistics.** Store 1 at each present value; `prefix(x)` is "how many elements
  ≤ *x*". Descending the tree finds the *k*-th smallest in O(log *n*).
- **Counting inversions** while merge-sorting, in O(*n* log *n*).
- **2D dominance counting**: sweep one dimension, Fenwick over the other.

**Real systems:**

- **Query optimizers** maintain histograms to estimate selectivity, and a histogram bucket update
  plus a "how many rows below this value" query is exactly prefix-sum-with-point-update.
- **Time-series and monitoring systems** answer range aggregates over time windows; segment trees
  and their variants (or precomputed rollup hierarchies, which are the same idea materialized) are
  the standard approach.
- **Rate limiting and sliding-window counters** need "sum of events in the last *N* seconds" with
  constant updates.
- **Sparse / dynamic segment trees** handle key spaces too large to allocate (10¹⁸ possible
  timestamps) by creating nodes lazily — the segment tree becoming, in effect, a binary trie over
  the key's bits with aggregates attached. Chapters 21 and 22 meeting in the middle.
- **Interval scheduling and stabbing queries** — the segment tree's other classical use, inserting
  each interval into its O(log *n*) canonical nodes. Which is Chapter 23's problem, approached from
  the other side.

---


# Chapter 18 — Search, Insert, Delete

## 18.1 Search

```
def search(node, k):
    while node is not None:
        i = 0
        while i < node.num_keys and k > node.keys[i]:
            i += 1
        if i < node.num_keys and k == node.keys[i]:
            return (node, i)                      # found
        if node.is_leaf:
            return None                           # not present
        node = node.children[i]                   # descend
```

One page read per level. Note the plain B-tree can **terminate early** — if the key happens to be
in an internal node, you stop there. §19.1 explains why this apparent advantage is worthless.

### Worked example

On §17.2's running tree, searching for **140** and then for **145**:

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

search(140):
  READ 1 — root [90].           140 > 90        → child c₁
  READ 2 — node [120, 150].     120 < 140 < 150 → child c₁
  READ 3 — leaf [130, 140].     140 == 140      → FOUND
                                                    3 page reads.

search(145):
  READ 1 — root [90].           145 > 90        → child c₁
  READ 2 — node [120, 150].     120 < 145 < 150 → child c₁
  READ 3 — leaf [130, 140].     145 > 140, leaf → NOT PRESENT
                                                    3 page reads.
```

Two observations that will matter later. **A failed search costs exactly the same as a successful
one** — unlike Volume 1 §1.2's unsorted array where proving absence always cost the maximum. And
**the failed search terminated exactly at the position where 145 would have to be inserted**, which
is the same fact Volume 2 §8.3 exploited: insertion is a failed search plus a local modification.

## 18.2 Within-node search: a real design decision

With ~500 keys per node, how you search *inside* a node is not a triviality.

| Method | Comparisons | Cache behaviour | When to use |
|---|---|---|---|
| **Linear scan** | ~*f*/2 = 250 | **Excellent** — sequential, prefetchable | Small nodes; cheap comparisons |
| **Binary search** | log₂(*f*) ≈ 9 | **Poor** — ~7–9 cache misses within the page | Large nodes; expensive comparisons (strings, collations) |
| **Hybrid** | ~9 then ~8 | Good | What most real implementations do |
| **SIMD scan** | 250/8 vector ops | Excellent | Fixed-width integer keys |

The tension is exactly §15's tension, one level down: binary search minimizes *comparisons*, linear
scan minimizes *cache misses*, and which wins depends on how expensive a comparison is. For 8-byte
integers, comparisons are nearly free and linear or SIMD scanning often beats binary search
outright. For collated text comparisons costing hundreds of nanoseconds each, binary search wins
easily.

> This is the same question §15.5 answered for page accesses, appearing at the cache-line level.
> It is the clearest possible illustration of the thesis Volume 6 will build on: **the memory
> hierarchy poses the same problem at every boundary, and the answer always has the same shape.**

## 18.3 Insertion, and why the median

Insertion is: descend to the correct leaf, insert in order, and if the node overflows, split.

```
def insert(root, k):
    leaf = descend_to_leaf(root, k)      # recording the path
    insert_into_node(leaf, k)            # keys stay sorted
    node = leaf
    while node.num_keys > m - 1:         # overflow
        node = split(node)               # may return the parent to re-check
    ...
```

### The split, derived

A split must turn one overfull node into **two legal nodes plus one key to send up.** Legality
means both halves satisfy I2: at least ⌈*m*/2⌉ − 1 keys each.

Overflow state: the node holds *m* keys (its maximum *m* − 1, plus the one we just added). Split at
position *i* (0-indexed): the left node gets keys[0…*i*−1] = ***i*** keys, key[*i*] goes **up**,
and the right node gets keys[*i*+1…*m*−1] = ***m* − 1 − *i*** keys.

Both must satisfy I2:

$$
i \ge \left\lceil \tfrac{m}{2} \right\rceil - 1
\qquad\text{and}\qquad
m - 1 - i \ge \left\lceil \tfrac{m}{2} \right\rceil - 1
$$

The second rearranges to *i* ≤ *m* − ⌈*m*/2⌉ = ⌊*m*/2⌋. So:

$$
\left\lceil \tfrac{m}{2} \right\rceil - 1 \;\le\; i \;\le\; \left\lfloor \tfrac{m}{2} \right\rfloor
$$

Now evaluate that interval:

- **Odd *m* = 2*t* + 1:** ⌈*m*/2⌉ = *t* + 1, so *i* ∈ [*t*, *t*]. **Exactly one legal split point,
  and it is the median.**
- **Even *m* = 2*t*:** ⌈*m*/2⌉ = *t*, so *i* ∈ [*t* − 1, *t*]. **Two adjacent legal choices**, one
  either side of centre.

> **So "split at the median" is not an aesthetic preference about balance. For odd order it is the
> only legal split point — every other choice violates the minimum-occupancy invariant on one
> side. For even order there are exactly two choices, and the median-ish one is preferred because
> it maximizes the smaller half, and therefore maximizes how many future insertions either side can
> absorb before splitting again.**

Verify at *m* = 5 (*t* = 2): overflow gives 5 keys; *i* = 2; left gets 2 keys, the 3rd key goes up,
right gets 2 keys. Both at exactly the minimum — §17.3's self-maintenance, concretely.

And note the exception that §17.7 already flagged: the *rightmost-page* heuristic deliberately
violates the preference for the median (though never the *legality* constraint) in order to fix the
sequential-insertion trap. Legality is mandatory; centring is a heuristic.

## 18.4 Building a tree from scratch — fully worked

Order 5 (max 4 keys). Insert 10, 20, 30, …, 170 in order. This is the sequential-insertion pattern,
using naive median splits so you can see the mechanism cleanly.

```
STEP 1 — insert 10, 20, 30, 40.  All fit in the root leaf.

    ┌────────────────┐
    │ 10, 20, 30, 40 │       4 keys = max. Legal, but full.
    └────────────────┘
```

```
STEP 2 — insert 50.  Overflow: [10,20,30,40,50] = 5 keys.
         Split at i = 2:  left = {10,20},  UP = 30,  right = {40,50}
         There is no parent, so a NEW ROOT is created. Height 0 → 1.

              ┌────┐
              │ 30 │
              └─┬──┘
         ┌──────┴──────┐
    ┌────────┐    ┌────────┐
    │ 10, 20 │    │ 40, 50 │
    └────────┘    └────────┘
```

```
STEP 3 — insert 60, 70.  Both go to the right leaf.

              ┌────┐
              │ 30 │
              └─┬──┘
         ┌──────┴──────┐
    ┌────────┐  ┌────────────────┐
    │ 10, 20 │  │ 40, 50, 60, 70 │   full
    └────────┘  └────────────────┘
```

```
STEP 4 — insert 80.  Right leaf overflows: [40,50,60,70,80].
         Split at i = 2:  left = {40,50},  UP = 60,  right = {70,80}
         The parent [30] has room, so 60 is simply inserted there.

                  ┌──────────┐
                  │  30, 60  │
                  └────┬─────┘
         ┌─────────────┼─────────────┐
    ┌────────┐    ┌────────┐    ┌────────┐
    │ 10, 20 │    │ 40, 50 │    │ 70, 80 │
    └────────┘    └────────┘    └────────┘
```

```
STEP 5 — insert 90, 100.  Right leaf → [70,80,90,100], full.
STEP 6 — insert 110.  Overflow → split: left {70,80}, UP = 90, right {100,110}
         Parent becomes [30, 60, 90].

                     ┌──────────────┐
                     │  30, 60, 90  │
                     └──────┬───────┘
        ┌──────────┬────────┴────────┬──────────┐
   ┌────────┐ ┌────────┐      ┌────────┐  ┌──────────┐
   │ 10, 20 │ │ 40, 50 │      │ 70, 80 │  │ 100, 110 │
   └────────┘ └────────┘      └────────┘  └──────────┘
```

```
STEP 7 — insert 120, 130 → rightmost leaf [100,110,120,130], full.
STEP 8 — insert 140.  Overflow → split: left {100,110}, UP = 120, right {130,140}
         Parent becomes [30, 60, 90, 120] — 4 keys, FULL but still legal.

                    ┌────────────────────┐
                    │  30, 60, 90, 120   │
                    └─────────┬──────────┘
      ┌──────────┬────────────┼────────────┬────────────┐
 ┌────────┐ ┌────────┐  ┌────────┐  ┌──────────┐  ┌──────────┐
 │ 10, 20 │ │ 40, 50 │  │ 70, 80 │  │ 100, 110 │  │ 130, 140 │
 └────────┘ └────────┘  └────────┘  └──────────┘  └──────────┘
```

```
STEP 9 — insert 150, 160 → rightmost leaf [130,140,150,160], full.

STEP 10 — insert 170.  THE CASCADE.

  (a) Leaf [130,140,150,160,170] overflows.
      Split at i = 2: left = {130,140}, UP = 150, right = {160,170}

  (b) The parent is [30,60,90,120] — already full. Inserting 150 gives
      [30,60,90,120,150] = 5 keys → THE PARENT OVERFLOWS TOO.
      Split at i = 2: left = {30,60}, UP = 90, right = {120,150}

  (c) There is no parent above. A NEW ROOT is created holding 90.
      HEIGHT 1 → 2.
```

```
FINAL TREE:
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

VERIFY:
  I1 no node exceeds 4 keys                                    ✔
  I2 every non-root node has ≥ 2 keys                          ✔
  I3 root has 1 key, 2 children                                ✔
  I4 all six leaves at depth 2                                 ✔
  I5 left node [30,60]: children <30, 30–60, >60               ✔
     right node [120,150]: children <120, 120–150, >150        ✔
  In-order traversal: 10,20,30,40,50,60,70,80,90,100,110,120,
                      130,140,150,160,170                       ✔ sorted, 17 keys
```

**17 keys is exactly the minimum for a height-2 order-5 tree** (§17.5's sanity check). The
sequential-insertion pattern produced the sparsest legal tree — which is §17.7's trap, visible in
the finished artifact: every non-root node sits at exactly 50% occupancy, and none of the left-hand
nodes will ever receive another key.

## 18.5 The cascade and the root split

Two properties are now visible, and they are the ones to remember.

**Splits cascade upward, and each level costs O(1) pages.** A split writes two pages at level *d*
and modifies one at level *d*+1. Worst case it repeats at every level: **O(*h*) page writes**,
which is O(log_f *n*) — four writes for a billion keys. Nothing outside the root-to-leaf path is
ever touched, which is exactly what ISAM could not achieve (§16.2).

**The root split is the only operation that increases height.** And it increases it for every path
at once, which is why I4 holds automatically (§17.4). A root split is also the only operation that
changes *which page is the root*, which turns out to matter enormously for implementation: readers
must be able to find a root that can move. The standard solution is a fixed-location **metapage**
whose contents are a pointer to the current root — one level of indirection so the root can
relocate. Volume 5 returns to this.

**How often does a cascade happen?** Rarely, and the arithmetic is reassuring. Splits at the leaf
level happen roughly once every *f*/2 insertions. A split at level 1 happens once every *f*/2 leaf
splits, so once every (*f*/2)² insertions. For *f* = 500: leaf split every ~250 insertions, level-1
split every ~62,500, level-2 split every ~15.6 million, root split every ~4 billion.

$$
\text{amortized page writes per insertion} \approx 1 + \frac{2}{f/2} + \frac{2}{(f/2)^2} + \cdots \approx 1.008
$$

**Amortized, an insertion writes barely more than one page.** The worst case is O(*h*), the average
is essentially 1. This is the same structure of result as Volume 1 §1.3's amortized array growth
and Volume 2 §11.5's amortized red-black restructuring — and it carries the same caveat: the rare
expensive operation is a real latency spike, not a fiction.

## 18.6 Preemptive versus reactive splitting

A genuine design fork, and one whose motivation is entirely about concurrency.

**Reactive (bottom-up), what §18.4 did.** Descend to the leaf, insert, split on the way back up as
needed. Requires remembering the path (a stack, or parent pointers) so you can revisit ancestors.

**Preemptive (top-down), which is what CLRS presents.** On the way *down*, split every full node
you pass through, whether or not it needs it. Since you split the parent before descending, **the
parent always has room when a child splits, so a split never cascades.**

| | Reactive | Preemptive |
|---|---|---|
| Splits performed | Only when necessary | Some unnecessary ones |
| Average occupancy | ~69% (§17.7) | **Lower** — you split nodes that would have been fine |
| Needs the path remembered? | **Yes** | No — single downward pass |
| Can release a lock on a node once you leave it? | **No** — you may have to come back | **Yes** |
| Cascade possible? | Yes, O(*h*) | **No, never** |

That fourth row is the whole reason preemptive splitting exists. Under concurrency, holding locks
on ancestors while you descend is what kills parallelism — the root is touched by *every*
operation, so any scheme that holds a lock on it serializes the entire index. Preemptive splitting
lets a writer release each node's lock as it moves down, because it will never need to return.

The cost is measurably worse space utilization, and the modern answer is neither: it is Lehman &
Yao's algorithm, which achieves single-node locking *with* reactive splitting by adding sibling
links and a clever recovery rule for readers. That is Volume 5's central topic, and this section
exists mainly so you know what problem it is solving.

## 18.7 Deletion

Deletion is the hard half, for the reason §17.3 gave: **I2 is self-maintaining under insertion and
not under deletion.** Removing a key can drop a node below ⌈*m*/2⌉ − 1 keys — an **underflow** — and
there is no natural mechanism that repairs it.

There are exactly two repairs, and each is forced by an invariant that would otherwise break.

### Repair 1 — borrow from a sibling (redistribution)

If an adjacent sibling has **more than** the minimum, take one of its keys.

But you cannot simply move a key sideways, and **understanding why is the derivation.** Suppose
node *X* is deficient, its right sibling *Y* has a spare key, and the parent's separator between
them is *s*. If you moved *Y*'s smallest key *y* directly into *X*, then *X* would contain *y* > *s*
— and *X* is the child *left* of separator *s*. **I5 broken.**

So the separator must move too, and there is only one arrangement that works: **rotate through the
parent.**

```
BEFORE — X is deficient, Y has a spare key                AFTER — rotate through the parent

        parent:  [ …, s, … ]                                  parent:  [ …, y₁, … ]
                  /       \                                             /        \
     X: [ too few keys ]   Y: [ y₁, y₂, y₃ ]              X: [ …, s ]              Y: [ y₂, y₃ ]

    s comes DOWN into X (it is greater than           I5 restored: X's keys are all < y₁ ✔
    everything in X, so it appends legally)                        Y's keys are all > y₁ ✔
    y₁ goes UP to become the new separator            X gained a key; Y is still ≥ minimum ✔
```

The separator's job is to be a boundary between the two children. Move the boundary to *Y*'s new
first key, and the old boundary — which is genuinely between *X*'s keys and *Y*'s remaining keys —
becomes *X*'s new largest key. Every key still appears exactly once, and I5 holds.

### Repair 2 — merge

If **no** adjacent sibling can spare a key, then every sibling sits at exactly ⌈*m*/2⌉ − 1. There
is nothing to borrow. So instead, **combine** the deficient node, one sibling, and the separator
between them into a single node.

**Does it fit?** This is the question the invariants must answer, and they do:

- deficient node: ⌈*m*/2⌉ − 2 keys
- sibling at minimum: ⌈*m*/2⌉ − 1 keys
- the separator pulled down: 1 key
- **total: 2⌈*m*/2⌉ − 2**

Against the maximum of *m* − 1:

| | Total after merge | Max allowed | Fits? |
|---|---|---|---|
| Odd *m* = 2*t*+1 | 2*t* = *m* − 1 | *m* − 1 | ✔ **exactly full** |
| Even *m* = 2*t* | *m* − 2 | *m* − 1 | ✔ one slot spare |

**A merge always fits, and for odd order it produces a completely full node.** That is not luck —
it falls directly out of choosing the minimum to be half the maximum (§17.3). The same choice that
makes splitting self-maintaining makes merging always feasible.

**And then the parent loses a key**, because the separator went down into the merged node. So the
parent may underflow, and the repair **cascades upward** — the exact mirror of the split cascade.
If the cascade reaches the root and the root loses its last key, the merged child becomes the new
root and **the tree's height decreases by one.** The only height-decreasing operation, mirroring
the root split.

### The algorithm

```
def delete(node, k):
    if k is in an internal node:
        # cannot remove it directly — it is a separator, and I5 needs a boundary there.
        # Same trick as Volume 2 §8.4: replace it with its in-order predecessor or
        # successor (which lives in a LEAF), then delete THAT from the leaf.
        replace k with its predecessor p from the leftmost leaf of the right subtree
        k, node = p, that leaf
    remove k from the leaf
    while node is not root and node.num_keys < ceil(m/2) - 1:
        if a sibling has a spare key: borrow(node); break          # terminates
        else:                         node = merge(node)           # may cascade
```

Note the internal-node case reuses Volume 2 §8.4's insight exactly: do not remove the *node*,
remove the *key*, by first moving a legally-substitutable key into its place from a position where
deletion is easy. In a B-tree that position is always a leaf, so the recursion terminates
immediately.

## 18.8 Deletion, fully worked

Both repairs, on concrete trees.

### Part A — a borrow

Start from §18.4's final tree with 180 additionally inserted, so one leaf has a spare key:

```
                          ┌────┐
                          │ 90 │
                          └─┬──┘
              ┌─────────────┴─────────────┐
        ┌──────────┐                 ┌───────────┐
        │  30, 60  │                 │ 120, 150  │
        └────┬─────┘                 └─────┬─────┘
     ┌───────┼───────┐            ┌────────┼──────────┐
┌────────┐┌───────┐┌───────┐ ┌──────────┐┌──────────┐┌───────────────┐
│ 10, 20 ││ 40,50││ 70,80 │ │ 100, 110 ││ 130, 140 ││ 160, 170, 180 │
└────────┘└───────┘└───────┘ └──────────┘└──────────┘└───────────────┘

DELETE 130.

  Leaf [130,140] → [140].  1 key < 2 minimum → UNDERFLOW.
  Right sibling [160,170,180] has 3 keys > 2 → CAN SPARE. Borrow.

  Separator between them in the parent [120,150] is 150.
    → 150 comes DOWN into the deficient leaf:      [140] → [140, 150]
    → 160 goes UP to be the new separator:          parent [120,150] → [120,160]
    → sibling loses its first key:                  [160,170,180] → [170,180]
```

```
RESULT:
                          ┌────┐
                          │ 90 │
                          └─┬──┘
              ┌─────────────┴─────────────┐
        ┌──────────┐                 ┌───────────┐
        │  30, 60  │                 │ 120, 160  │
        └────┬─────┘                 └─────┬─────┘
     ┌───────┼───────┐            ┌────────┼────────┐
┌────────┐┌───────┐┌───────┐ ┌──────────┐┌──────────┐┌──────────┐
│ 10, 20 ││ 40,50││ 70,80 │ │ 100, 110 ││ 140, 150 ││ 170, 180 │
└────────┘└───────┘└───────┘ └──────────┘└──────────┘└──────────┘

VERIFY I5 on [120, 160]:  children <120 ✔, 120–160 ✔, >160 ✔
VERIFY I2: every non-root node has ≥ 2 keys ✔
In-order (right subtree): 100,110,120,140,150,160,170,180
  — original was 100,110,120,130,140,150,160,170,180; we removed 130. ✔
  Note 150 and 160 each still appear EXACTLY ONCE — 150 moved from an
  internal node into a leaf, 160 moved from a leaf into an internal node. ✔
  No key was duplicated or lost; only their positions rotated.
```

### Part B — a merge that cascades to the root

Back to §18.4's final tree, where **every** non-root node has exactly the minimum 2 keys — so no
borrow is ever possible:

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

DELETE 10.

  (a) Leaf [10,20] → [20].  UNDERFLOW.
      No left sibling (leftmost). Right sibling [40,50] has exactly 2 = minimum.
      → CANNOT BORROW. MERGE.

      Merge [20] + separator 30 (pulled down) + [40,50]  →  [20, 30, 40, 50]
      = 4 keys = m − 1. Exactly full, as the odd-order derivation predicts. ✔

      Parent [30,60] loses 30 → becomes [60], with 2 children.

              ┌────┐
              │ 90 │
              └─┬──┘
        ┌───────┴────────┐
     ┌──────┐        ┌───────────┐
     │  60  │        │ 120, 150  │        ← [60] has 1 key < 2 → UNDERFLOW
     └──┬───┘        └─────┬─────┘           at the INTERNAL level
   ┌────┴─────┐         ┌──┼───┐
[20,30,40,50] [70,80]  ...

  (b) Internal node [60] underflows.
      Its only sibling [120,150] has exactly 2 = minimum → CANNOT BORROW. MERGE.

      Merge [60] + separator 90 (pulled down from the root) + [120,150]
        →  [60, 90, 120, 150]   = 4 keys ✔
      Children collected in order:
        [20,30,40,50], [70,80], [100,110], [130,140], [160,170]  = 5 children ✔
        (4 keys + 1 = 5 children, satisfying I5)

  (c) The root loses its only key 90 → the root is now empty.
      The merged node becomes the NEW ROOT.  HEIGHT 2 → 1.
```

```
RESULT:
                  ┌──────────────────────┐
                  │  60, 90, 120, 150    │
                  └──────────┬───────────┘
     ┌──────────────┬────────┼────────┬──────────────┐
┌──────────────┐┌───────┐┌──────────┐┌──────────┐┌──────────┐
│ 20,30,40,50  ││ 70,80││ 100, 110 ││ 130, 140 ││ 160, 170 │
└──────────────┘└───────┘└──────────┘└──────────┘└──────────┘

VERIFY I5:  separators 60, 90, 120, 150 → ranges <60, 60–90, 90–120, 120–150, >150
   [20,30,40,50] all < 60          ✔
   [70,80]       between 60 and 90 ✔
   [100,110]     between 90 and 120 ✔
   [130,140]     between 120 and 150 ✔
   [160,170]     > 150             ✔
VERIFY I4: all five leaves at depth 1 ✔
In-order: 20,30,40,50,60,70,80,90,100,110,120,130,140,150,160,170
   — 16 keys, the original 17 minus the deleted 10. ✔
```

**One deletion cascaded through two levels and shrank the tree.** Compare §18.4 Step 10, where one
insertion cascaded through two levels and grew it. The operations are exact mirrors, and both are
O(*h*) page writes in the worst case.

## 18.9 Why real systems often do not do this

Everything in §18.7 is correct, elegant, and **widely not implemented.** Most production B-tree
systems do not merge and do not borrow. They delete the key, leave the node underfull, and move on.

Three reasons, and they are all about the environment rather than the algorithm.

**1. Merging requires locking multiple pages at once.** A merge touches the deficient node, a
sibling, and the parent, and must do so atomically. §18.6 already showed that holding locks across
multiple nodes and levels is the thing that destroys concurrency. Worse — and this is the deep
reason — a merge moves keys **leftward**, while the standard high-concurrency algorithm (Lehman &
Yao) depends critically on content only ever moving **rightward**, so that a reader with a stale
pointer can always recover by walking right. **Implementing merge would break the concurrency
scheme outright.** Volume 5 develops this properly; it is the single most important trade-off in
production B-tree design.

**2. In an MVCC database, the index does not know what is dead.** A deleted row's index entry
cannot be removed at deletion time, because concurrent transactions with older snapshots may still
need to see it — and index entries typically carry no visibility information at all. So deletion
becomes an asynchronous, deferred, batched activity rather than something the deleting transaction
does. Volume 5.

**3. Deferred cleanup is usually cheaper.** Rebalancing on every deletion does work that the next
insertion may immediately undo. The cheapest way to do work is often to promise to do it later and
then do it in bulk — Volume 1 §1.4 noted the same thing about tombstones in sorted arrays, and
§20.6 shows an entire structure built on that principle.

**The cost paid:** an index whose key distribution shifts over time accumulates sparsely-filled
pages that are never reclaimed. This is **index bloat**, and the only true remedy is to rebuild the
index. It is not a bug; it is the deliberate price of cheap concurrent descent.

> **The transferable lesson**, and it is Volume 2 §8.4's Hibbard-deletion lesson at a larger scale:
> a textbook algorithm can be individually correct and collectively wrong for its environment.
> §18.7's merge is *provably* correct and *practically* rejected, and the rejection is not
> laziness — it is a considered trade of space against concurrency. When you find that real systems
> do not implement the algorithm you were taught, the interesting question is always which
> constraint the textbook was not modelling.

---


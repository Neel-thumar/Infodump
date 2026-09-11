# Chapter 23 — Interval Trees: When the Data Are Ranges

## 23.1 The problem, and why sorting cannot solve it

Chapter 22's data were points at positions, and the query was a range. **Now invert it: the stored
data are intervals, and the query asks which of them overlap a given interval.**

- A calendar: each event is [start, end]. "Does this proposed meeting conflict with anything?"
- A genome: each gene, exon or read is [begin, end] on a chromosome. "Which annotations overlap this
  region?"
- A firewall: each rule covers an IP range and a port range. "Which rules apply to this packet?"
- A register allocator: each variable is live over an interval of the instruction stream. "Which
  live ranges overlap, and therefore cannot share a register?"

The obvious attempt: put the intervals in a BST or B-tree ordered by their **low endpoint**. Then a
query [*q*ₗ, *q*ₕ] should be a range query, right?

**No — and the counterexample is one line:**

```
Stored:   [0, 1000]   [1, 2]   [3, 4]   [5, 6]   [7, 8]  …  [995, 996]
Query:    [999, 1001]

Ordered by low endpoint, [0, 1000] is the LEFTMOST interval in the tree.
It is also the ONLY match.

A range query on low endpoints would look near 999 and find nothing.
Pruning the left subtree — which is what a BST descent DOES — discards
the answer.
```

The problem is precise: **an interval's low endpoint tells you nothing about how far right it
reaches.** An interval that begins early can extend arbitrarily far, so no bound on low endpoints
lets you rule out a subtree. Ordering by high endpoints fails symmetrically. Keeping two indexes and
intersecting them does not help either, because each index individually returns Θ(*n*) candidates in
the bad case.

> The general shape of this failure is worth naming, because it recurs in Chapter 25: **a BST
> descent prunes a subtree by comparing the query against the subtree's key *range*. That works only
> when a node's key fully determines where its descendants can be. For intervals it does not — an
> interval is two numbers, and ordering by one of them discards the other.**

## 23.2 The invariant: augmentation

The fix is not a new tree. It is **an ordinary balanced BST with extra information stored at each
node.**

> **Interval tree invariant.**
> **1.** An ordinary BST (or red-black tree) keyed on each interval's **low endpoint**.
> **2.** Each node additionally stores **`max_hi`** — the **maximum high endpoint over its entire
>    subtree**, including itself.

And that second line is enough. Here is the pruning rule it buys:

> If `node.left.max_hi < q_lo`, then **every** interval in the left subtree ends before the query
> begins, so none of them can overlap. **Prune the entire left subtree.**

That is the missing information restored. Ordering by low endpoint told us nothing about rightward
reach; `max_hi` tells us exactly that, for a whole subtree, in one number.

### Augmentation, stated generally — because we will use it four more times

This is the technique the whole volume runs on, so let me state it properly. It has been mentioned
in passing three times already (Volume 2 §11.8's EEVDF scheduler, Volume 3 in passing, and this
volume's preface) and this is where it gets defined.

> **Augmentation.** Store at each node *x* a value *f*(*x*) summarizing *x*'s subtree, such that:
>
> **(a) Composability** — *f*(*x*) is computable in **O(1)** from *x*'s own data plus
> *f*(*x*.left) and *f*(*x*.right).
>
> **(b) Usefulness** — reading *f*(*x*) lets you either answer the query directly or **discard
> *x*'s entire subtree** without descending into it.

Condition (a) is not a convenience; it is what makes augmentation compatible with **balancing**, and
that is the crucial engineering fact:

> A rotation (Volume 2 §9.7) changes the subtree membership of only **O(1) nodes** — the two nodes
> involved. Every other node's subtree is unchanged. So if *f* is computable from children in O(1),
> a rotation can repair *f* in O(1) by recomputing it at those two nodes, bottom-up. **Therefore any
> composable augmentation can be bolted onto a red-black or AVL tree without changing its
> asymptotics.**
>
> Conversely, a summary that is *not* computable from children — "the median of my subtree", "the
> second-largest gap between consecutive elements" — cannot be maintained under rotation in O(1),
> and augmentation does not apply.

Volume 2's four balancing schemes and Volume 3's B-trees both survive augmentation unchanged. That
is why the Linux kernel can take its existing red-black tree implementation and produce an interval
tree from it with a few dozen lines (§23.6).

## 23.3 A worked interval tree

Intervals: [15,20], [10,30], [17,19], [5,20], [12,15], [30,40].

Insert in that order, keyed by low endpoint (15, 10, 17, 5, 12, 30):

```
                        [15,20]
                       /        \
                [10,30]          [17,19]
                /      \                 \
          [5,20]      [12,15]           [30,40]
```

Now compute `max_hi` bottom-up — this is exactly a post-order traversal (Volume 1 §4.2: information
flowing from the leaves up to the root):

```
  [5,20]  : max_hi = max(20)                 = 20
  [12,15] : max_hi = max(15)                 = 15
  [10,30] : max_hi = max(30, 20, 15)         = 30
  [30,40] : max_hi = max(40)                 = 40
  [17,19] : max_hi = max(19, —, 40)          = 40
  [15,20] : max_hi = max(20, 30, 40)         = 40
```

```
                   ┌──────────────────────┐
                   │ [15,20]   max_hi 40  │
                   └──────────┬───────────┘
              ┌───────────────┴───────────────┐
   ┌──────────────────────┐          ┌──────────────────────┐
   │ [10,30]   max_hi 30  │          │ [17,19]   max_hi 40  │
   └──────────┬───────────┘          └──────────┬───────────┘
        ┌─────┴──────┐                          └──────┐
┌──────────────┐ ┌──────────────┐          ┌──────────────────────┐
│[5,20] max 20 │ │[12,15] max15 │          │ [30,40]   max_hi 40  │
└──────────────┘ └──────────────┘          └──────────────────────┘
```

### The search algorithm

```
find_any_overlap(node, q):
    while node is not None:
        if node.interval overlaps q:            # lo <= q.hi and hi >= q.lo
            return node.interval
        if node.left is not None and node.left.max_hi >= q.lo:
            node = node.left
        else:
            node = node.right
    return NONE
```

**Note there is only one recursive path — no branching.** That is surprising and it needs a proof;
§23.4 gives one.

### Query 1: find an interval overlapping [21, 23]

```
At [15,20], max_hi 40:
    overlap? 15 ≤ 23 ✔ and 20 ≥ 21 ✘  →  NO overlap
    left child [10,30] has max_hi = 30 ≥ 21  →  the left subtree MIGHT reach us
    GO LEFT

At [10,30], max_hi 30:
    overlap? 10 ≤ 23 ✔ and 30 ≥ 21 ✔  →  OVERLAP.  Return [10,30].

Two nodes visited.  ✔  ([10,30] does indeed cover 21–23.)
```

### Query 2: find an interval overlapping [41, 50] — the pruning case

```
At [15,20], max_hi 40:
    overlap? 20 ≥ 41 ✘  →  no
    left child [10,30] has max_hi = 30 < 41  →  NOTHING in the left subtree
                                                reaches 41. PRUNE IT.
    GO RIGHT

At [17,19], max_hi 40:
    overlap? 19 ≥ 41 ✘  →  no
    left child: none  →  GO RIGHT

At [30,40], max_hi 40:
    overlap? 40 ≥ 41 ✘  →  no
    left child: none  →  GO RIGHT  →  None

RESULT: no overlap.  ✔  Three nodes visited; the whole left subtree
        ([10,30], [5,20], [12,15]) was discarded by reading ONE number.
```

The left subtree held half the data and was eliminated by a single integer comparison. That is
condition (b) of §23.2 doing its job.

## 23.4 Why one path suffices — the theorem

The algorithm above descends **one** root-to-leaf path, so it is O(log *n*) rather than O(log *n*)
*per branch*. That requires justification, and the argument is short and rather satisfying.

> **Claim.** If we go **left** (because `left.max_hi ≥ q_lo`) and the left subtree contains no
> overlapping interval, then the right subtree contains none either — so descending left loses
> nothing.

**Proof.** Let *i* be the interval in the left subtree achieving the maximum high endpoint, so
*i*.hi = `left.max_hi` ≥ *q*ₗ.

By assumption *i* does not overlap *q*. Overlap means *i*.lo ≤ *q*ₕ **and** *i*.hi ≥ *q*ₗ. We know
the second conjunct holds. So the first must fail:

$$
i.\text{lo} > q_h
$$

Now take any interval *j* in the **right** subtree. The tree is a BST on low endpoints, so
*j*.lo ≥ node.lo ≥ *i*.lo (since *i* is in the left subtree, *i*.lo ≤ node.lo). Therefore:

$$
j.\text{lo} \ge i.\text{lo} > q_h
$$

So *j* starts after the query ends, and cannot overlap. ∎

And the other direction is immediate: if we go **right** because `left.max_hi < q_lo`, then every
interval in the left subtree ends before the query starts, so none overlaps.

**Either way, exactly one direction can contain an answer, and the algorithm goes that way.** The
`max_hi` augmentation converts an apparently two-dimensional search into a one-dimensional descent.

**For reporting *all* overlaps** rather than one, you do branch — but you only branch into subtrees
that can contain an answer, giving **O(*k* log *n*)** for *k* reported intervals with the simple
version, and O(log *n* + *k*) with a more careful traversal.

## 23.5 Two other structures called "interval tree", and a related one

Terminology in this area is genuinely muddled, so it is worth disambiguating.

**The augmented BST above** is what CLRS calls an interval tree and what most software means by the
term. Dynamic (supports insert and delete), O(log *n*) for one overlap, O(*n*) space.

**The centered interval tree**, from computational geometry, is a different structure with the same
name. Pick a **center point** *c*; partition the intervals into those entirely left of *c*, those
entirely right, and those **crossing** *c*. Store the crossing ones twice — once sorted by low
endpoint, once by high endpoint — and recurse on left and right. A stabbing query at point *p*
compares *p* to *c* and scans the appropriate sorted list until it passes *p*. Static (built once,
awkward to update) but with good constants and a clean O(log *n* + *k*) bound.

**A segment tree over intervals** (Ch 22) is a third approach: build a segment tree over the
endpoint coordinates, and insert each interval into the O(log *n*) canonical nodes covering it. A
stabbing query then walks one root-to-leaf path and collects everything stored along it. This is
the classical answer for *static* interval sets and it composes beautifully with aggregation — you
can ask "how many intervals cover this point?" in O(log *n*) instead of enumerating them.

**Priority search trees** — Edward McCreight, 1985, "Priority search trees", *SIAM J. Computing* —
handle *three-sided* range queries (two bounds in one dimension, one in the other) in O(log *n* + *k*).

> Note the author. **The same Edward McCreight** who co-invented the B-tree in 1972 (Volume 3
> §16.1) and who will turn up again in Chapter 26 with a linear-time suffix tree construction in
> 1976. Three structures in three different chapters of this book, from one person.

## 23.6 Where interval trees run

**The Linux kernel** is the most instructive example, because you can see the augmentation
literally.

The kernel provides `lib/interval_tree.c` and `include/linux/interval_tree_generic.h`, built on top
of its existing red-black tree via `rbtree_augmented.h` — the general augmentation framework §23.2
described. And `struct vm_area_struct` (a virtual memory area) contains:

```c
struct vm_area_struct {
    unsigned long vm_start;          /* the interval's low endpoint  */
    unsigned long vm_end;            /* the interval's high endpoint */
    ...
    struct {
        struct rb_node rb;
        unsigned long  rb_subtree_last;   /*  ←  max_hi.  Literally §23.2. */
    } shared;
    ...
};
```

`rb_subtree_last` **is** `max_hi`. The uses:

- **Reverse mapping** (`i_mmap` interval tree per file, `anon_vma` interval trees): given a physical
  page, find every process mapping it. The query is "which VMAs overlap this file offset range?"
  Needed for page reclaim, for `mmap` writeback, and for copy-on-write fork handling.
- **MMU notifiers**: when a range of memory is invalidated, notify every registered subscriber whose
  watched range overlaps.

*(Confidence: high on the augmentation framework and `rb_subtree_last`; moderate on the current set
of users, since VMA tracking itself moved to the maple tree in Linux 6.1 — Volume 3 §19.8.)*

**Genomics**, where interval overlap is arguably the single most-performed computation in the field.
Every genomic feature — gene, exon, transcript, sequencing read, variant, ChIP-seq peak — is an
interval on a chromosome, and the core operation of nearly every analysis is "intersect these two
sets of intervals". `bedtools intersect` is one of the most-run commands in biology. The structures
used in practice include augmented interval trees, **NCLists** (nested containment lists, Alekseyenko
& Lee 2007) and **AIList** (augmented interval lists, Feng et al. 2019), which trade generality for
cache behaviour on the specific distributions genomic intervals have. *(Confidence: moderate on the
specific structures; high on the centrality of the operation.)*

**Compilers — register allocation.** Linear scan register allocation (Poletto & Sarkar, 1999)
computes each variable's **live interval** over the linearized instruction stream. Two variables can
share a register exactly when their live intervals do not overlap, so the allocator's inner loop is
interval overlap. *(Confidence: high on linear scan and live intervals.)*

**Calendars and scheduling.** Conflict detection, resource booking, room allocation. Direct.

**Networking and security.** Firewall and ACL rule matching over IP and port ranges; IP reputation
and blocklist lookups over CIDR ranges — though note that for *prefix*-structured ranges
specifically, Chapter 21's trie is usually the better tool, because CIDR ranges are prefixes and
longest-prefix-match is a trie's native operation.

**Computational geometry.** Windowing queries, segment intersection (Bentley–Ottmann sweep),
rectangle overlap. This is where the structure originated and where the centered variant is standard.

---


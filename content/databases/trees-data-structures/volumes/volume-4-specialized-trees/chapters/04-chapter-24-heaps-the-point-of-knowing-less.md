# Chapter 24 — Heaps: The Point of Knowing Less

## 24.1 A different question: priority, not order

Every structure so far has answered questions about **order**: where is key *k*, what lies in
[*l*, *r*], what overlaps this interval. Now consider a different access pattern:

> Repeatedly: **give me the most urgent item**, while new items keep arriving.

That is a **priority queue**, and it is one of the most-used abstractions in computing —
Dijkstra's algorithm, A*, event simulation, task scheduling, Huffman coding, merge of *k* sorted
runs, top-*k* selection.

Here is the awkward part: **a balanced BST already does this.** The minimum is the leftmost node,
found in O(log *n*); insert is O(log *n*); delete-min is O(log *n*). Volume 2 gave us four ways to
guarantee those bounds. So why does a separate structure exist at all?

Not for the asymptotics. **For what you stop having to know.**

## 24.2 The invariant, and why it is deliberately weak

> **Min-heap invariant.** For every node *x*: `x.key ≤ key of each of x's children`.
>
> **That is all.** There is no constraint between siblings, and no constraint between a node and
> anything outside its own subtree.

Compare the BST invariant (Volume 2 §8.1): *everything* in the left subtree < *x* < *everything* in
the right subtree. Two-sided, and reaching across the whole subtree.

Count what each invariant determines:

| | BST | Heap |
|---|---|---|
| Constrains | both children, and transitively all descendants, in **both** directions | children only, in **one** direction |
| Relationship between siblings | fully determined | **completely unspecified** |
| Arrangements per shape (distinct keys) | **exactly 1** | **many** |
| What you can read off in O(1) | the root's key, and nothing else useful | **the minimum of the whole collection** |
| What a search for arbitrary key *k* costs | **O(log *n*)** | **O(*n*)** |

The last two rows are the trade, stated exactly. **A heap knows one thing very well — where the
minimum is — and knows almost nothing else.** Finding an arbitrary key in a heap requires examining
Θ(*n*) nodes, because the invariant gives you no way to choose a direction. Range queries are
impossible. In-order traversal is meaningless.

### And here is what the weakness buys

Because the invariant says **nothing about which child a value goes to**, the structure's *shape* is
not determined by the data. So you can **dictate** the shape. And if you dictate "**complete**"
(Volume 2 §7.2 — every level full except the last, filled left to right), you unlock Volume 1
§6.3's implicit array representation:

$$
\text{parent}(i) = \left\lfloor \frac{i-1}{2} \right\rfloor \qquad
\text{left}(i) = 2i+1 \qquad
\text{right}(i) = 2i+2
$$

**No pointers. Eight bytes per element. One allocation. Perfect cache locality at the top of the
tree. Position-independent, so it can be `memcpy`'d, `mmap`'d, or shipped over a socket.**

Volume 1 §6.3 and Volume 2 §7.2 both left this promise outstanding, so let me discharge it plainly:

> **A BST lets the data dictate the shape, and pays for that with 32–48 bytes per node
> (Volume 2 §11.7) and an entire volume's worth of rebalancing machinery.**
>
> **A heap dictates the shape, and pays for that by knowing less.**
>
> Volume 1 §6.3 showed that the implicit array representation catastrophically fails for a
> degenerate tree — 30 nodes inserted in sorted order would need 8.6 GB. A heap can use the
> representation *precisely because* its weak invariant lets it guarantee completeness. **The
> invariant was weakened on purpose, and the array layout is the payment received.**

## 24.3 The operations

```
peek()          →  a[0].                                            O(1)
insert(v)       →  append at a[n] (preserves completeness),
                   then SIFT UP while smaller than parent.          O(log n)
extract_min()   →  save a[0]; move a[n-1] into a[0]
                   (preserves completeness); shrink;
                   then SIFT DOWN while larger than a child.        O(log n)
heapify(array)  →  sift down from index n/2-1 down to 0.            O(n)  ← not n log n
```

The two `insert`/`extract_min` implementations are worth reading as a pair: both work by making the
*shape* correct first (append at the end / fill the hole from the end) and then repairing the
*invariant* along a single path. Shape is cheap to fix because it is under our control; the
invariant is cheap to fix because it is weak.

### heapify is O(*n*), and the derivation is a nice amortization

Building a heap by *n* successive inserts costs O(*n* log *n*). Building it by sifting down from the
middle costs **O(*n*)**, and the reason is that most nodes are near the bottom, where sifting down
is cheap.

At height *h* above the leaves there are at most *n*/2^(*h*+1) nodes, and sifting one down costs
O(*h*):

$$
\sum_{h=0}^{\lfloor \log_2 n \rfloor} \frac{n}{2^{h+1}} \cdot O(h)
\;=\; O\!\left(n \sum_{h \ge 0} \frac{h}{2^{h+1}}\right)
\;=\; O\!\left(\frac{n}{2} \cdot 2\right)
\;=\; O(n)
$$

using Σ_{h≥0} *h*/2^*h* = 2. **Half the nodes are leaves and cost nothing; only the single root
costs log *n*.** The expensive cases are rare enough to be free.

## 24.4 Worked example

Build a min-heap from *a* = [9, 4, 7, 1, 8, 3] using `heapify`. Start at *i* = ⌊*n*/2⌋ − 1 = 2.

```
INITIAL:  [9, 4, 7, 1, 8, 3]

              9 (0)
            /       \
         4 (1)      7 (2)
        /     \     /
     1 (3)  8 (4) 3 (5)
```

```
i = 2:  node 7, children: a[5] = 3.  Smallest child 3 < 7  →  SWAP.

          [9, 4, 3, 1, 8, 7]              9
                                        /   \
                                      4       3
                                    /   \    /
                                   1     8  7
```

```
i = 1:  node 4, children: a[3] = 1, a[4] = 8.  Smallest 1 < 4  →  SWAP.

          [9, 1, 3, 4, 8, 7]              9
                                        /   \
                                      1       3
                                    /   \    /
                                   4     8  7

        Continue sifting the 4 down from index 3: no children. Done.
```

```
i = 0:  node 9, children: a[1] = 1, a[2] = 3.  Smallest 1 < 9  →  SWAP.

          [1, 9, 3, 4, 8, 7]              1
                                        /   \
                                      9       3
                                    /   \    /
                                   4     8  7

        Continue sifting the 9 down from index 1:
                children a[3] = 4, a[4] = 8.  Smallest 4 < 9  →  SWAP.

          [1, 4, 3, 9, 8, 7]              1
                                        /   \
                                      4       3
                                    /   \    /
                                   9     8  7

        Continue from index 3: no children. Done.
```

```
FINAL HEAP:  [1, 4, 3, 9, 8, 7]

VERIFY the invariant at every node:
    1 ≤ 4 ✔   1 ≤ 3 ✔   4 ≤ 9 ✔   4 ≤ 8 ✔   3 ≤ 7 ✔          valid min-heap ✔

NOW LOOK AT WHAT IT IS NOT:
    Not sorted:      [1, 4, 3, …] — 3 comes after 4.
    Not a BST:       3 sits in the RIGHT subtree of the root but is
                     smaller than 4 in the left subtree.
    In-order traversal is 9, 4, 8, 1, 3, 7 — meaningless.

    THAT is §24.2 made concrete. The heap has no opinion about the
    relationship between 4 and 3, and it does not need one.
```

### extract_min

```
Return a[0] = 1.  Move the last element (a[5] = 7) into a[0]; size → 5.

          [7, 4, 3, 9, 8]                 7
                                        /   \
                                      4       3
                                    /   \
                                   9     8

SIFT DOWN 7:  children 4 and 3.  Smallest 3 < 7  →  SWAP.

          [3, 4, 7, 9, 8]                 3
                                        /   \
                                      4       7
                                    /   \
                                   9     8

7 at index 2 now has no children (2·2+1 = 5 ≥ size).  Done.

VERIFY:  3 ≤ 4 ✔   3 ≤ 7 ✔   4 ≤ 9 ✔   4 ≤ 8 ✔                 ✔
Next minimum is correctly 3.
```

## 24.5 The heap family, and a familiar fanout trade

| Structure | insert | extract-min | decrease-key | **merge** | Notes |
|---|---|---|---|---|---|
| **Binary heap** | O(log *n*) | O(log *n*) | O(log *n*) | **O(*n*)** | array-based; **best constants and cache behaviour** |
| ***d*-ary heap** | O(log_*d* *n*) | O(*d* log_*d* *n*) | O(log_*d* *n*) | O(*n*) | see below |
| **Binomial heap** | O(log *n*) | O(log *n*) | O(log *n*) | **O(log *n*)** | a *forest* of trees; mergeable |
| **Fibonacci heap** | **O(1)** am. | O(log *n*) am. | **O(1)** am. | **O(1)** | Fredman & Tarjan 1987; theoretically optimal, dreadful constants |
| **Pairing heap** | **O(1)** | O(log *n*) am. | O(log *n*) am. | **O(1)** | Fredman, Sedgewick, Sleator & Tarjan 1986; simple, good in practice |
| **Leftist / skew heap** | O(log *n*) | O(log *n*) | — | **O(log *n*)** | pointer-based, trivially mergeable |

> **Confidence: high on Fibonacci and pairing heap authorship and dates.** The tight bound for
> pairing-heap `decrease-key` was open for a long time; Fredman showed it cannot be O(1), and the
> exact bound is, as I recall, still not fully settled. Flagging rather than asserting.

**Fibonacci heaps** were designed for one purpose: Dijkstra's algorithm performs O(*E*)
`decrease-key` operations and O(*V*) `extract-min` operations, so making `decrease-key` O(1)
amortized improves Dijkstra from O(*E* log *V*) to **O(*E* + *V* log *V*)**. This is a genuinely
important theoretical result.

It is also a well-known example of a structure that is **worse in practice** than the thing it
beats asymptotically, for exactly the reasons Volume 1 §1.6 established: Fibonacci heaps are
pointer-heavy, allocate per node, have poor locality, and carry large constants. For most real graph
sizes a plain binary heap wins outright. *(Confidence: high — this is a widely reported and
frequently re-measured finding.)*

### The *d*-ary heap is Volume 3's fanout trade, in miniature

Give each node *d* children instead of 2. Height becomes log_*d* *n*, so:

- **`insert` and `decrease-key` get cheaper**: they sift *up*, comparing against one parent per
  level → O(log_*d* *n*).
- **`extract-min` gets more expensive**: it sifts *down*, and must find the smallest of *d*
  children per level → O(*d* log_*d* *n*).

**This is precisely Volume 3 §17.8 and §18.2.** Increasing fanout reduces the number of levels and
increases the work per level, and the optimum depends on which operation dominates and on how the
per-level work interacts with the cache. In practice *d* = 4 is a common choice, because with 8-byte
entries four children occupy half a cache line and are fetched together — so "compare against 4
children" costs one cache miss instead of one per level.

**The same trade, three times, at three scales:** B-tree fanout versus within-node search (Volume 3),
ART's node types versus symbol-at-a-time descent (§21.6), and *d*-ary heap arity versus sift-down
cost (here). Volume 6 argues this is not a coincidence.

## 24.6 Where heaps run

**Graph algorithms.** Dijkstra, A*, Prim. The priority queue *is* the algorithm's engine.

**Huffman coding.** Volume 1 §2.3 introduced Huffman's 1952 construction as one of the earliest
cases where the tree *is* the answer. Its construction repeatedly extracts the two lowest-frequency
symbols and inserts their merged parent — which is `extract-min` twice and `insert` once, *n* times.
**A heap builds a tree.** Nice symmetry.

**Heapsort, and `std::sort`'s safety net.** Heapsort is in-place and O(*n* log *n*) worst case. Its
most important production role is as the fallback in **introsort**: `std::sort` runs quicksort, and
if the recursion depth exceeds ~2 log *n* (a sign that the pivots are going badly, possibly
adversarially — Volume 2 §9.5's threat model), it switches to heapsort to guarantee O(*n* log *n*).
**A worst-case guarantee deployed specifically as a defence**, exactly as Volume 2 §11.8 described
Java's `HashMap` treeification. *(Confidence: high.)*

**Top-*k* over a stream.** To find the *k* largest of *n* items in one pass: keep a **min**-heap of
size *k*; for each item, if it exceeds the heap's minimum, replace it and sift down. **O(*n* log *k*)
time and O(*k*) space** — and note that *n* never has to be known or stored. This is what
`heapq.nlargest` does, and it is the standard answer for "top trending items" over an unbounded
stream.

**k-way merge — and a direct tie back to Volume 3.** To merge *k* sorted runs, keep a heap of *k*
elements (the current head of each run), repeatedly extract the minimum and pull the next element
from that run. O(*N* log *k*) for *N* total elements.

This is the engine of **external merge sort**, and of **LSM-tree compaction** (Volume 3 §20.6 and
§20.7). When RocksDB merges ten SSTables into one, the merge is driven by a *k*-way merge over a
min-heap of size ten. **Volume 3's storage engine has a heap in its inner loop**, and this is where
that comes from.

**Event-driven simulation and timers.** A discrete-event simulator is a loop over `extract-min` on a
heap of scheduled events. Timer wheels and hierarchical timing wheels are the specialized
alternative when the key range is bounded and known.

**Median maintenance.** Two heaps — a max-heap of the lower half and a min-heap of the upper half,
kept balanced in size. `insert` and `get-median` in O(log *n*) and O(1).

**And one we have already met.** Volume 2 §13.2's **treap** is a BST on keys *and* a max-heap on
random priorities. Its entire power comes from imposing two invariants on two different attributes
at once — a BST invariant on the thing you search by, and a heap invariant on the thing that
controls the shape. Worth rereading now that the heap invariant has been examined on its own terms.

## 24.7 What a heap cannot do, stated plainly

For completeness, because the weakness is the design and should not be soft-pedalled:

| Operation | Heap | Balanced BST |
|---|---|---|
| find the minimum | **O(1)** | O(log *n*) |
| extract the minimum | O(log *n*) | O(log *n*) |
| insert | O(log *n*), tiny constant | O(log *n*) |
| **find an arbitrary key** | **O(*n*)** | **O(log *n*)** |
| **delete an arbitrary key** | O(*n*) to find it, then O(log *n*) | O(log *n*) |
| **range query** | **impossible** | O(log *n* + *k*) |
| **enumerate in sorted order** | O(*n* log *n*) — you must drain it | **O(*n*)** |
| predecessor / successor | **impossible** without a scan | O(log *n*) |
| space per element | **8 bytes** | 32–48 bytes |

> If your workload ever needs the bottom half of that table, you do not want a heap — you want a
> balanced BST, and you will read its minimum in O(log *n*) and be perfectly happy. **The heap is
> the right answer only when the *only* thing you ever ask for is the extreme**, and its reward for
> that narrowness is a 4–6× space saving and the best cache behaviour of any structure in this book.
>
> The standard workaround for `decrease-key` — which needs "find an arbitrary key", the O(*n*)
> row — is to keep a side hash map from key to array index, updated on every swap. That is the
> honest cost of the weak invariant: you bolt an index back on when you find you needed one after
> all.

---


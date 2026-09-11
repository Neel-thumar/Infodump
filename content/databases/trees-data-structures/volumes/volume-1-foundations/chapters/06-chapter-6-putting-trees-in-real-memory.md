# Chapter 6 — Putting Trees in Real Memory

Everything so far has treated a tree as a mathematical object with edges. Edges are not a thing
hardware has. Chapter 6 is about the gap between the abstraction and the machine — and the gap
turns out to be where most of the real performance lives.

## 6.1 Pointer-based nodes: the byte-level accounting

The default representation:

```c
struct Node {
    int64_t  key;      /*  8 bytes */
    Node    *left;     /*  8 bytes */
    Node    *right;    /*  8 bytes */
};                     /* 24 bytes, and that is before the allocator gets involved */
```

Add a parent pointer (needed for iterative traversal without a stack, for successor/predecessor
queries, and for most rebalancing implementations) and it is 32 bytes. Add a balance factor or
color bit for Volume 2's trees and, thanks to alignment, it is usually still 32 — the flag fits in
padding, which is a small free lunch worth knowing about.

Then the allocator. Each node is a separate `malloc`, and general-purpose allocators add a header
and round up:

| Node contents | Struct size | Actual heap footprint (glibc) | Overhead vs. 8-byte payload |
|---|---|---|---|
| key + 2 children | 24 | 32 | 300% |
| key + 2 children + parent | 32 | 48 | 500% |
| key + 2 children + parent + color | 40 | 48 | 500% |

So a red-black tree of a million `int64` keys occupies roughly **48 MB** to store **8 MB** of
keys. That ratio — you pay 4–6× your data size — is the standing cost of pointer-based trees, and
it is why §6.3 and §6.4 exist.

## 6.2 Where the time goes, and a subtle result about arrays

A tree search visits one node per level. Each node is at an address you cannot know until you
have loaded its parent. That is the **pointer-chasing dependency chain** from §1.6, and it means
every level is a potential full-latency cache miss with no prefetching possible.

For a balanced tree of 10⁶ nodes (height ~20), scattered in memory:

```
20 levels × ~80 ns (DRAM latency)  ≈  1.6 µs per lookup
```

Now compare **binary search over a sorted array** of the same million elements. Also ~20 probes.
Naively, the same 1.6 µs. But it is meaningfully better, for a reason that is easy to miss:

**Binary search's first probes are always the same addresses.** Every single search starts at
index 500,000, then goes to 250,000 or 750,000, then one of four addresses, and so on. The top
~10 levels of the implicit tree touch only ~1,000 distinct cache lines — about 64 KB — which
comfortably fits in L2. Those levels are effectively *free after the first few searches*. Only
the last ~10 probes, which spread across the whole 8 MB array, actually miss.

```
Binary search over 10⁶ sorted int64:
   probes 1–10  : ≤1024 distinct addresses, ~64 KB working set → L1/L2 hits, ~1–4 ns each
   probes 11–20 : spread over 8 MB → DRAM misses, ~80 ns each
   total ≈ 10×3 + 10×80 ≈ 830 ns

Pointer tree, 10⁶ nodes, nodes scattered by the allocator:
   every level  : unpredictable address → DRAM miss, ~80 ns
   total ≈ 20×80 ≈ 1600 ns
```

**The array is roughly 2× faster despite doing identical work asymptotically**, purely because its
hot nodes share addresses across queries and its cold nodes are the minority.

Two lessons, and they set up the rest of the book:

1. **A structure's memory layout can be worth a factor of two or more at identical asymptotics.**
   Volume 6's cache-aware and cache-oblivious trees are entirely about reclaiming this.
2. **The top of a search tree is hot and tiny; the bottom is cold and huge.** This is a completely
   general fact about search trees, and it is why Volume 3's B-trees are so effective: the upper
   levels of a B-tree are small enough to stay permanently cached, so a four-level tree costs
   about one real I/O rather than four. That observation is the whole ballgame for databases, and
   it is visible already, here, in an in-memory setting.

## 6.3 The implicit (array) representation, and its exact failure mode

There is a way to store a binary tree with **no pointers at all.** Put the nodes in an array in
level-order and compute the edges arithmetically. With 0-based indexing:

$$
\text{left}(i) = 2i+1 \qquad \text{right}(i) = 2i+2 \qquad \text{parent}(i) = \left\lfloor \frac{i-1}{2} \right\rfloor
$$

```
              0:50
            /      \
        1:30        2:70
        /    \      /    \
    3:20   4:40  5:60   6:80
    /
 7:10

array:  [ 50, 30, 70, 20, 40, 60, 80, 10 ]
index:     0   1   2   3   4   5   6   7
```

Check: left(1) = 3 → 20 ✔; right(1) = 4 → 40 ✔; parent(6) = ⌊5/2⌋ = 2 → 70 ✔.

**Why the formula works.** In level-order, depth *d* occupies indices 2^*d* − 1 through
2^(*d*+1) − 2 — that is 2^*d* slots, matching Fact 2 in §3.5. Node *i*'s position within its
level is *i* − (2^*d* − 1), and its children occupy twice that offset within the next level,
which starts at 2^(*d*+1) − 1. Grinding through the algebra gives 2*i* + 1. The formula is just
Fact 2 in index form.

**The advantages are substantial:**

| | Pointer-based | Implicit array |
|---|---|---|
| Bytes per node (int64 key) | 32–48 | **8** |
| Pointer dereferences to reach a child | 1 (cache miss) | **0** (arithmetic) |
| Locality of the top levels | Poor (scattered) | **Excellent** (indices 0–14 are one cache line region) |
| Allocations | *n* | **1** |
| Can be `memcpy`'d, mmapped, sent over a socket | No | **Yes** |

That last row is not a small thing. An implicit tree is **position-independent** — it contains no
addresses, so it can be written to a file, memory-mapped, or shipped to another process and used
directly with no fix-up whatsoever. §6.6 explains why that matters enormously on disk.

**And now the failure mode, which is total.** The array must have a slot for every *possible*
position up to the tree's height, whether occupied or not. So the array size is determined by
**height, not node count**: 2^(*h*+1) − 1 slots.

For a degenerate tree — the sorted-insertion case from §3.6 — height is *n* − 1:

| *n* nodes, degenerate | Required array slots | Memory (8 B/slot) |
|---|---|---|
| 10 | 1,023 | 8 KB |
| 20 | 1,048,575 | 8 MB |
| 30 | ~1.07 × 10⁹ | **8.6 GB** |
| 64 | ~1.8 × 10¹⁹ | **exceeds addressable memory** |

**Thirty nodes inserted in sorted order would require 8.6 gigabytes.** The implicit
representation does not degrade gracefully; it explodes.

> **The rule this gives you, which is exactly why binary heaps look the way they do:**
> The implicit array representation is only viable for trees whose shape is **structurally
> guaranteed complete** — every level full except possibly the last, filled left to right.
>
> A **binary heap** is defined that way *on purpose*, and that is not a coincidence: the heap
> gives up the BST ordering invariant (which would force shape to follow the data) in exchange
> for a shape invariant it controls, and the reward is the zero-overhead array representation.
> A BST cannot do this, because in a BST the data determines the shape. Volume 4 develops this
> trade properly; note now that it is a trade, and that the array layout is the payment received.

## 6.4 Arena allocation and indices-instead-of-pointers

There is a middle path that captures much of the array representation's benefit without requiring
a complete tree. Allocate all nodes from one contiguous **arena** (a large array or memory pool),
and let "pointers" be 32-bit **indices into the arena** rather than 64-bit machine addresses:

```c
typedef uint32_t NodeRef;              /* index into arena; 0xFFFFFFFF = null */

struct Node {
    int64_t key;                       /* 8 */
    NodeRef left, right;               /* 4 + 4 */
};                                     /* 16 bytes — half of the pointer version */

struct Arena { Node *nodes; uint32_t count, capacity; };
```

What this buys:

- **Node size halves** (16 vs 32 bytes) → **twice as many nodes per cache line**, so ~4 nodes per
  64-byte line instead of 2. Fewer misses for the same traversal.
- **One allocation instead of *n***, eliminating per-node allocator overhead entirely.
- **Locality by construction**: nodes created around the same time sit adjacent, and since tree
  nodes are usually created in bulk or in related batches, they tend to be traversed together.
- **Position independence returns.** No absolute addresses, so the arena can be serialized,
  mmapped, or relocated wholesale.
- **Bulk free** is a single deallocation.

The costs: a 4-byte index caps you at ~4 billion nodes (fine); freeing individual nodes requires
maintaining your own free list; and you lose the type-safety and debugger friendliness of real
pointers, since every dereference becomes `arena.nodes[ref]`.

This pattern is pervasive in performance-sensitive code — game engines, compilers (the Rust
compiler's arena-allocated ASTs, LLVM's bump allocators), and essentially every database's
in-memory structures. It is worth recognizing as a standard technique rather than a trick: **it is
the systematic way to get array-representation locality on a tree whose shape you cannot
control.**

## 6.5 Trees with arbitrary numbers of children

Everything so far assumed binary. For a general tree — a file system, a DOM, a JSON document —
you need something else, and there are two main options with a genuinely interesting trade.

### Option A: a child array (or vector) per node

```c
struct Node {
    Value    value;
    Node   **children;      /* pointer to an array of child pointers */
    uint32_t n_children, capacity;
};
```

**Good:** O(1) access to the *i*-th child; children contiguous, so iterating them is
cache-friendly. **Bad:** a second allocation per node; dynamic-array growth cost when children are
added (§1.3 all over again, one level down); and wasted capacity slack per node.

Best when: the number of children is known at construction or changes rarely, and you need
indexed access. DOM nodes and parsed ASTs usually use this.

### Option B: first-child / next-sibling

Give every node exactly **two** pointers — but reinterpret what they mean:

```c
struct Node {
    Value  value;
    Node  *first_child;      /* the leftmost child */
    Node  *next_sibling;     /* the next child of MY parent */
};
```

The general tree on the left is stored as the binary structure on the right:

```
      GENERAL TREE                    STORED AS (first-child ↓, next-sibling →)

            A                              A
         /  |  \                           ↓
        B   C   D                          B ────► C ────► D
       / \      |                          ↓               ↓
      E   F     G                          E ──► F         G
         / \                                     ↓
        H   I                                    H ──► I
```

Fixed two pointers per node, no arrays, no allocation per child, and unlimited arity. Accessing
the *i*-th child costs O(*i*) hops rather than O(1) — usually irrelevant, since most code iterates
all children anyway.

> **This is Knuth's "natural correspondence" between forests and binary trees, and it is a
> genuine bijection** (*TAOCP* Vol 1 §2.3.2). Every ordered forest maps to exactly one binary
> tree and back. Which has a striking consequence: **any theorem about binary trees is secretly a
> theorem about general trees.** All the counting results, all the traversal machinery, all the
> representation techniques carry across. This is why a book about trees can spend most of
> Volume 2 on binary trees without loss of generality.

One wrinkle worth noticing: pre-order on the general tree corresponds to pre-order on the binary
encoding, but **post-order does not** map to post-order — it maps to in-order. If you use this
representation, verify which traversal you are actually getting.

## 6.6 Crossing to disk: when a pointer costs 100,000× more

Everything in §6.1–6.5 assumed nodes live in RAM. Change that assumption and every conclusion
changes with it. This section is deliberately short, because it is Volume 3's entire subject — but
you should see the shape of it now.

**A pointer is an address in an address space.** In RAM, dereferencing one costs ~1–80 ns. If your
tree lives on disk, a "pointer" is a **block number**, and dereferencing it means asking the
storage device for that block:

| Where the child lives | Cost to dereference one pointer | Relative to L1 |
|---|---|---|
| L1 cache | ~1 ns | 1× |
| DRAM | ~80 ns | 80× |
| NVMe SSD | ~20,000–100,000 ns | ~10⁵× |
| Spinning disk | ~8,000,000 ns | ~10⁷× |
| Network storage | ~500,000–5,000,000 ns | ~10⁶× |

A binary tree over a billion keys has height ~30 (§3.5). On a spinning disk that is
30 × 8 ms = **240 milliseconds per lookup.** The structure that was excellent in RAM is unusable.

Three consequences follow, and each is a chapter of Volume 3:

1. **The cost unit becomes the block, not the comparison.** You cannot read 24 bytes from a disk;
   you read a 4 KB or 8 KB block whether you want to or not. So a 24-byte node wastes 99.4% of
   the transfer, and the objective function changes from "minimize comparisons" to **"minimize
   the number of blocks touched."**

2. **Therefore: make a node exactly one block.** If a block is 8 KB and an entry is 20 bytes, a
   node holds ~400 children instead of 2. Height drops from log₂(*n*) to log₄₀₀(*n*) — from 30 to
   4 for a billion keys. Combined with §6.2's observation that the top of a tree stays cached,
   the real cost is **one or two device reads.** That is a B-tree, and that single change is worth
   five orders of magnitude.

3. **Pointers must stop being addresses.** A memory address is meaningless after a restart or in
   another process, so on-disk trees store **block numbers or offsets relative to a base**, not
   absolute addresses. Converting between the two on load and store is called **pointer
   swizzling**, and it is a real source of complexity in systems that do it. Notice that §6.3's
   implicit array and §6.4's arena-with-indices representations are *already* position-independent
   and need no swizzling at all — which is exactly why those techniques show up so often in
   on-disk and memory-mapped formats. The trick you learned for cache locality turns out to be
   the trick you need for persistence.

## 6.7 Serialization: which traversals uniquely determine a tree?

This ties Chapter 4 to Chapter 6, and it is a genuinely useful piece of knowledge with a
surprising negative result in it.

To write a tree to a file or send it over a network you must flatten it to a sequence, and later
rebuild the original **exactly**. Which sequences suffice?

### Pre-order with explicit null markers — YES, and it is the practical choice

From §4.3, the BST serializes to:

```
50 30 20 10 # # # 40 # # 70 60 # # 80 # #
```

Reconstruction consumes the stream left to right with no lookahead:

```
def deserialize(stream):
    tok = stream.next()
    if tok == "#": return None
    n = Node(tok)
    n.left  = deserialize(stream)     # consumes exactly its own subtree
    n.right = deserialize(stream)
    return n
```

Unique, single-pass, works for any binary tree including ones with duplicate values. Cost:
*n* + 1 null markers for *n* nodes — roughly 2× the tokens. Level-order with null markers works
equally well and is what most "serialize a binary tree" interview answers use.

### Pre-order alone, no markers — NO

`50 30 20 10 40 70 60 80` is consistent with many different trees. Without markers you cannot tell
where a subtree ends.

**Exception, and it is a nice one: for a BST, pre-order alone IS sufficient.** The ordering
invariant supplies the missing information — after the root 50, every following value less than 50
belongs to the left subtree and the first value greater than 50 begins the right subtree. So a BST
can be serialized in *n* tokens with no markers at all. The structure is recoverable because the
*constraint* encodes it. This is a small, elegant instance of a big idea: **invariants are
information, and information you can derive is information you do not have to store.** Volume 4's
succinct data structures push that idea to its limit.

### In-order alone — NO, and worse than pre-order

In-order gives you `10 20 30 40 50 60 70 80`, which is just the sorted order and says nothing
about shape. Every one of the (2n choose n)/(n+1) possible binary tree shapes on those 8 values
produces this same in-order sequence for *some* assignment. In-order alone is maximally
uninformative about structure.

### Pre-order + in-order — YES (for distinct values)

Pre-order's first element is the root. Find it in the in-order sequence: everything to its left is
the left subtree, everything to its right is the right subtree, and the sizes tell you where to
split the pre-order. Recurse.

Worked, on the §4.6 BST:

```
pre = [50, 30, 20, 10, 40, 70, 60, 80]
in  = [10, 20, 30, 40, 50, 60, 70, 80]

Root = pre[0] = 50.  Find 50 in `in` → index 4.
  left  subtree: in[0..3] = [10,20,30,40]  (4 nodes) → pre[1..4] = [30,20,10,40]
  right subtree: in[5..7] = [60,70,80]     (3 nodes) → pre[5..7] = [70,60,80]

Recurse left:  pre=[30,20,10,40], in=[10,20,30,40]
  Root = 30, at in-index 2 → left = [10,20] / [20,10] ; right = [40] / [40]
    Recurse: pre=[20,10], in=[10,20] → root 20, left=[10], right=[]
      Recurse: root 10, leaf.
    Recurse: root 40, leaf.
Recurse right: pre=[70,60,80], in=[60,70,80]
  Root = 70 → left=[60], right=[80]

Reconstructed tree matches the original exactly. ✔
```

**Post-order + in-order — YES**, by the same argument (post-order's *last* element is the root).

### Pre-order + post-order — NO. Here is the counterexample

This one surprises people, and the counterexample is as small as counterexamples get:

```
        Tree 1              Tree 2
          A                   A
         /                     \
        B                       B

  pre:  A, B             pre:  A, B          ← identical
  post: B, A             post: B, A          ← identical
```

Two structurally different trees, identical pre-order **and** identical post-order. So the pair
cannot distinguish them.

**Why it fails, stated generally:** pre-order and post-order both tell you about a node's position
relative to *all* of its descendants, but neither says anything about the boundary *between* its
two children. In-order is the only one of the three that reports that boundary — it is
literally the visit that happens *between* the subtrees (§4.1). So in-order carries information
the other two do not, and no amount of pre- and post-order makes up for it.

The exception, predictably: if the tree is **full** (every node has 0 or 2 children), then
pre+post *is* sufficient, because the ambiguous case — a node with exactly one child, where you
cannot tell left from right — has been excluded by construction.

### Summary

| Given | Uniquely determines the tree? | Notes |
|---|---|---|
| Pre-order + null markers | **Yes** | Single-pass rebuild; the practical default |
| Level-order + null markers | **Yes** | Also single-pass |
| Pre-order alone | No | **Yes** for a BST — the invariant supplies the shape |
| In-order alone | No | Says nothing about shape |
| Post-order alone | No | **Yes** for a BST |
| Pre-order + in-order | **Yes** | Requires distinct values |
| Post-order + in-order | **Yes** | Requires distinct values |
| Pre-order + post-order | **No** | Counterexample above; **yes** if the tree is full |

## 6.8 Choosing a representation

| Situation | Representation |
|---|---|
| General-purpose in-memory BST/map | Pointer-based nodes |
| Shape guaranteed complete (heap, tournament tree) | **Implicit array** — 8 bytes/node, no pointers |
| Many nodes, performance-critical, shape uncontrolled | **Arena + 32-bit indices** — half the size, one allocation |
| Must be written to disk or memory-mapped | Anything **position-independent**: implicit array, or arena with offsets |
| Nodes live on disk / across a network | **One node = one block.** High fanout. This is Volume 3. |
| Arbitrary arity, indexed child access needed | Child array per node |
| Arbitrary arity, iteration only, memory-tight | **First-child / next-sibling** — 2 pointers, unlimited arity |
| Sending a tree over the wire | Pre-order **with null markers** (or pre+in for distinct keys) |
| Read-only, memory is the binding constraint | Succinct/implicit encodings — Volume 6 |

---


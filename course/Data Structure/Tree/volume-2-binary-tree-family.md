# Trees: A Complete Guide to the Data Structure, From First Principles to Production Systems

## Volume 2 — The Binary Tree Family

---

### Where we left off

Volume 1 ended with a specific, unresolved failure. We had derived the binary search tree from
binary search's own control flow, and shown that storing the edges as pointers rather than
recomputing them from indices buys us cheap structural change while keeping the halving behaviour
that makes search logarithmic. Then §3.6 pointed out the hole: **nothing in the definition of a
tree constrains its shape.** A tree of *n* nodes can have height anywhere from ⌈log₂(*n*+1)⌉ − 1
to *n* − 1, and which one you get depends entirely on the order the data arrived in.

And the input that produces the worst possible shape is sorted input — autoincrement primary
keys, timestamps, alphabetized names, a file you loaded from a sorted export. Not a pathological
case somebody constructed. The most ordinary input in existence.

Volume 2 is about fixing that, and the reason it takes a whole volume is that there are **four
fundamentally different philosophies** for how to fix it, they disagree with each other in
interesting ways, and the disagreement is exactly why your language's standard library made the
specific choice it made. By the end of this volume you should be able to look at
`std::map`, Java's `TreeMap`, the Linux scheduler, and a competitive programmer's hand-rolled
treap and explain why each one is the right answer to a *different* question.

Chapter numbering continues from Volume 1. The conventions from §3.4 still hold: **root at depth
0, leaf height 0, empty tree height −1.**

---

# Chapter 7 — Binary Trees, Formally

## 7.1 Why binary, when Volume 1 showed fanout is a lever?

Volume 1 §3.5 made a point that ought to be nagging at you. A 200-ary tree of height 3 holds
eight million keys; a binary tree of height 3 holds fifteen. If fanout is that powerful, why
would anyone build a binary tree?

Three reasons, and they are all about the assumption that the tree is in RAM.

**1. In RAM, a comparison is the unit of cost, and fanout does not reduce comparisons.** A
*k*-ary node with *k*−1 keys requires you to search *within* the node to pick a child. If you do
that with a linear scan, you perform (*k*−1)/2 comparisons per level on average and log_*k*(*n*)
levels — total comparisons roughly ((*k*−1)/2)·log₂(*n*)/log₂(*k*), which is *minimized near k = 2*
and grows with *k*. If you binary-search within the node instead, you perform log₂(*k*) per level
across log_*k*(*n*) levels — exactly log₂(*n*) total, the same as a binary tree. **Fanout never
reduces the comparison count. It reduces the *page* count.** Volume 1 §1.2 established that these
are different cost models, and Volume 3 is what happens when the second one dominates.

**2. Binary is the minimum viable branching, so it is the simplest place to study balance.**
Every idea in this volume — rotation, balance invariants, amortized restructuring, randomized
priorities — appears in its cleanest form at *k* = 2. And thanks to Knuth's natural correspondence
(Volume 1 §6.5), results about binary trees are secretly results about all ordered trees, so
nothing is lost by starting here.

**3. Node size.** A binary node is 24–32 bytes and fits comfortably in a cache line. A 200-ary
node is a page. If your data is in RAM, the binary node is the granularity that matches the
hardware you are actually running on.

So: binary trees are the right structure when the whole tree is in memory, and Volume 3 will show
exactly where that assumption breaks and what replaces it.

## 7.2 The five shape words, pinned down

These five terms are used loosely everywhere, including in textbooks, and the looseness causes
real confusion because two of them are almost-but-not-quite the same. Here they are precisely.

### Full (also *proper*, also *strict*)

> Every node has **either 0 or 2 children**. No node has exactly one child.

```
       FULL                       NOT FULL
        ●                            ●
       / \                          / \
      ●   ●                        ●   ●
     / \                          /
    ●   ●                        ●          ← this node has exactly one child
```

Says nothing about height or balance. A full tree can be arbitrarily lopsided:

```
     also FULL, height 3, badly lopsided
        ●
       / \
      ●   ●
         / \
        ●   ●
           / \
          ●   ●
```

**Why it matters:** Volume 1 Fact 4 (§3.5) says leaves = two-child nodes + 1. In a full tree,
*every* internal node has two children, so **leaves = internal nodes + 1**, hence a full tree
always has an odd number of nodes. Expression trees are full by construction (a binary operator
has exactly two operands), which is why Volume 1 §6.7 noted that pre-order + post-order *does*
uniquely determine a full tree — the single-child ambiguity has been excluded.

### Perfect

> All internal nodes have 2 children **and** all leaves are at the same depth.

```
       PERFECT, height 2
            ●
          /   \
         ●     ●
        / \   / \
       ●   ● ●   ●
```

The most constrained shape. It exists only for *n* = 2^(h+1) − 1: 1, 3, 7, 15, 31, 63… A perfect
tree of 100 nodes does not exist. This is why "perfect" is a theoretical reference point rather
than something you build.

### Complete

> Every level is completely filled **except possibly the last**, and the last level is filled
> **left to right** with no gaps.

```
       COMPLETE, n = 6                    NOT COMPLETE (gap in last level)
            ●                                       ●
          /   \                                   /   \
         ●     ●                                 ●     ●
        / \   /                                 / \     \
       ●   ● ●                                 ●   ●     ●
                                                        ↑ gap to its left
```

**This is the one that matters practically**, and Volume 1 §6.3 explained why: a complete tree is
exactly the shape for which the implicit array representation works with zero waste. Indices
0…*n*−1 are all occupied, children live at 2*i*+1 and 2*i*+2, no pointers needed, 8 bytes per node.

A binary heap is *defined* to be complete precisely so it can use that representation. This is not
a happy coincidence — it is a deliberate trade. The heap gives up the BST ordering invariant
(which would let the data dictate the shape) in exchange for a shape invariant it controls, and
the payment received is the array layout.

> **Terminology hazard, flagged because it bites people.** Some authors, and a lot of code
> comments, use "complete" to mean what I have called *perfect*. Others use "almost complete" for
> what I call complete. When you read a claim like "a complete binary tree of *n* nodes has height
> ⌊log₂ *n*⌋", check which definition is in play. Under my definitions that statement is true for
> complete and true-but-trivial for perfect.

### Balanced

> Height is O(log *n*).

Deliberately vague, and the vagueness is the point: **"balanced" is a *family* of definitions,
and choosing one is the central design decision of this entire volume.** Each structure we meet
picks a different concrete criterion:

| Structure | Its concrete definition of "balanced" |
|---|---|
| **Height-balanced** (AVL) | For every node, \|height(left) − height(right)\| ≤ 1 |
| **Red-black** | For every node, every root-to-leaf path has the same count of black nodes |
| **Weight-balanced** (BB[α]) | For every node, each subtree holds at least an α fraction of the weight |
| **Randomized** (treap) | No invariant at all; height is O(log *n*) *in expectation* |
| **Amortized** (splay) | No invariant at all; cost is O(log *n*) *amortized over a sequence* |

Note the last two do not constrain the tree's shape *at any moment*. They constrain a
statistical or aggregate property instead. That is a genuinely different kind of guarantee and
§12 and §13 are about what you get and give up by accepting it.

### Degenerate (also *pathological*, also *a linked list wearing a costume*)

> Every node has at most one child. Height = *n* − 1.

```
   ●
    \
     ●
      \
       ●
        \
         ●
```

The failure case. Chapter 9 performs its construction.

### Relationships, so you can keep them straight

```
   perfect  ⟹  complete    ✔        (last level is full, so certainly gapless)
   perfect  ⟹  full        ✔        (every internal node has 2 children)
   perfect  ⟹  balanced    ✔        (height is exactly log₂(n+1) − 1)

   complete ⟹  balanced    ✔        (height is ⌊log₂ n⌋)
   complete ⟹  full        ✘        (a lone left child in the last level breaks fullness)

   full     ⟹  balanced    ✘        (see the lopsided full tree above)
   full     ⟹  complete    ✘        (same)

   balanced ⟹  anything    ✘        ("balanced" is only a height claim)
```

The pair worth memorizing: **complete constrains where the gaps are; full constrains how many
children each node has; neither implies the other.**

## 7.3 How many binary trees are there? And why the answer is a warning

A question that looks like idle combinatorics but delivers a genuinely important result.

**How many distinct binary tree shapes are there on *n* nodes?** Let *C*ₙ be the count. Pick the
root; then *i* nodes go left and *n*−1−*i* go right, for any *i* from 0 to *n*−1, and the two sides
are independent:

$$
C_n = \sum_{i=0}^{n-1} C_i \, C_{n-1-i}, \qquad C_0 = 1
$$

That recurrence defines the **Catalan numbers**, with closed form:

$$
C_n = \frac{1}{n+1}\binom{2n}{n} \sim \frac{4^n}{n^{3/2}\sqrt{\pi}}
$$

| *n* | *C*ₙ (distinct shapes) | *n*! (insertion orders) |
|---|---|---|
| 3 | 5 | 6 |
| 5 | 42 | 120 |
| 10 | 16,796 | 3,628,800 |
| 20 | ~6.56 × 10⁹ | ~2.43 × 10¹⁸ |

And here is the useful part. On *n* **distinct keys**, the number of valid BSTs is also exactly
*C*ₙ — because once you fix the shape, the key placement is forced by the ordering invariant.
So there are far more insertion *orders* than resulting *shapes*, which means shapes are hit with
wildly different probabilities. Compute it for *n* = 3, keys {1,2,3}:

| Insertion order | Resulting shape | Height |
|---|---|---|
| 1, 2, 3 | right chain | 2 |
| 3, 2, 1 | left chain | 2 |
| 1, 3, 2 | 1 → 3 → 2 (zig) | 2 |
| 3, 1, 2 | 3 → 1 → 2 (zig) | 2 |
| **2, 1, 3** | **balanced** | **1** |
| **2, 3, 1** | **balanced** | **1** |

Two of six orders give the balanced shape. And the effect compounds violently: for a *path*-shaped
tree (every node one child), the insertion sequence must add each new key at one of the two ends
of the current range, so exactly 2^(*n*−1) of the *n*! orders produce *some* path. For *n* = 20:

$$
\frac{2^{19}}{20!} = \frac{524{,}288}{2.43\times10^{18}} \approx 2\times10^{-13}
$$

**A randomly ordered insertion sequence essentially never produces a degenerate tree.** Which is
extremely reassuring, and also completely useless, for a reason worth stating carefully:

> Real input is not a uniformly random permutation. Real input is sorted, reverse-sorted, or
> nearly sorted, far more often than chance would suggest — because real data comes from
> counters, clocks, alphabetized lists, and sorted exports. The probability calculation above is
> correct and irrelevant. **The bad case is astronomically unlikely under randomness and extremely
> likely in practice**, and that gap is where the bugs live.

This is the same lesson as hash tables: uniform hashing gives beautiful average-case bounds, and
then someone sends you a million keys that all collide. Chapter 9 §9.5 develops the adversarial
version, and Chapter 13's treaps are the direct structural answer to it.

## 7.4 Two very different notions of "random", and why the distinction matters

While we are here, a subtlety that trips up even experienced people, because there are two ways to
pick a "random" binary tree and they give **wildly different heights**.

**Random insertion order.** Take a uniformly random permutation of *n* keys and insert them into a
BST. Then:

- Expected depth of a node: ≈ 2 ln *n* ≈ **1.39 log₂ *n***
- Expected **height**: ≈ 4.311 ln *n* ≈ **2.99 log₂ *n***

> **Confidence: high on the constants' existence, moderate on the digits.** The 4.311… constant
> is due to Luc Devroye (1986), who proved height/ln *n* converges to the root of a specific
> transcendental equation; Bruce Reed (2003) later pinned down the variance and lower-order terms.
> The 2 ln *n* average depth is elementary and appears in Knuth.

**Uniformly random *shape*.** Pick one of the *C*ₙ shapes uniformly at random. Then:

- Expected height: ≈ 2√(π*n*) ≈ **3.54 √*n***

For *n* = 10⁶ that is ≈ 3,545 — versus ≈ 60 for random insertion order, versus 19 optimal.

> **Confidence: moderate.** The Θ(√n) order is a classical result (Flajolet & Odlyzko, 1982); I
> am reporting the leading constant from memory and would check it before quoting it in a paper.

Why the enormous gap? Because uniform-over-shapes weights each shape equally, and *most* Catalan
shapes are spindly. Uniform-over-insertion-orders weights each shape by how many permutations
produce it, and balanced shapes are produced by exponentially more permutations (§7.3). **Random
insertion order is heavily biased toward balance, and that bias is doing all the work.**

Keep this filed away, because Chapter 13's central theorem is precisely that a treap with random
priorities has the shape distribution of *random insertion order* — the good one — regardless of
what order the keys actually arrive in. That is the entire trick.

---

# Chapter 8 — The Binary Search Tree

## 8.1 The invariant, stated exactly — and the version most people state, which is wrong

> **BST invariant.** For every node *x*:
> **every key in *x*'s entire left subtree** is less than *x*.key, and
> **every key in *x*'s entire right subtree** is greater than *x*.key.

The emphasis is load-bearing. The invariant is about **entire subtrees**, not immediate children.
Here is the classic bug this distinction catches:

```
            ┌────┐
            │ 20 │
            └─┬──┘
        ┌─────┴─────┐
     ┌──▼─┐      ┌──▼─┐
     │ 10 │      │ 30 │
     └────┘      └─┬──┘
              ┌────┴────┐
           ┌──▼─┐    ┌──▼─┐
           │ 15 │    │ 40 │      ← 15 < 20, but it is in 20's RIGHT subtree
           └────┘    └────┘
```

Every **parent–child** pair is fine: 10 < 20 ✔, 30 > 20 ✔, 15 < 30 ✔, 40 > 30 ✔. And the tree is
broken. Search for 15: at 20, since 15 < 20, go **left** — to 10, then nothing. Reports "not
found" for a key that is present.

So a `is_valid_bst` function that only checks parent-against-child is wrong, and this is one of
the most common interview-and-real-code errors in the subject. The correct check threads a
**range** down the recursion:

```
def is_bst(n, lo=-∞, hi=+∞):
    if n is None: return True
    if not (lo < n.key < hi): return False
    return is_bst(n.left,  lo,      n.key) and \
           is_bst(n.right, n.key,   hi)
```

Each node's permitted interval narrows as you descend. That interval is exactly what the invariant
means, and notice it is a **pre-order** computation (Volume 1 §4.3): the constraint flows *down*
from root to leaves, which is the signature of enablement flowing downward. The alternative
correct check is: **in-order traversal must be strictly increasing** (Volume 1 §4.4) — a
post-order/streaming formulation of the same fact. Two traversal orders, two correct algorithms,
same invariant.

### Duplicates

The invariant as stated forbids equal keys. Real implementations pick one of:

1. **Reject them.** `std::set`, `std::map` — insert returns a flag saying "already present."
2. **Store a count per node.** Cheapest for multisets and keeps the tree smaller.
3. **Relax one side to ≤.** Permits duplicates but makes deletion and search subtly harder,
   because all equal keys must be found and they may straddle a subtree boundary.
4. **Break ties by a secondary key.** Making the total order strict again.

Option 4 is worth remembering; it is exactly what PostgreSQL does by treating the physical row
location as an implicit final key column, which turns a multiset into a set and makes targeted
deletion cheap. Volume 3 covers this. The general principle: **duplicates are awkward in every
ordered structure, and the cleanest fix is usually to make them not be duplicates.**

## 8.2 Search, performed

```
def search(n, k):
    while n is not None:
        if   k == n.key: return n
        elif k <  n.key: n = n.left
        else:            n = n.right
    return None
```

One comparison per level. Note it is naturally iterative and needs no stack — descending a search
tree is one of the few tree operations with no recursion pressure at all.

Worked, on this tree, searching for 40 and then for 45:

```
                  ┌────┐
                  │ 50 │
                  └─┬──┘
          ┌─────────┴─────────┐
       ┌──▼─┐              ┌──▼─┐
       │ 30 │              │ 70 │
       └─┬──┘              └─┬──┘
      ┌──┴──┐             ┌──┴──┐
   ┌──▼─┐ ┌─▼──┐       ┌──▼─┐ ┌─▼──┐
   │ 20 │ │ 40 │       │ 60 │ │ 80 │
   └────┘ └────┘       └────┘ └────┘

search(40):  at 50 → 40 < 50 → left
             at 30 → 40 > 30 → right
             at 40 → equal → FOUND.   3 comparisons.

search(45):  at 50 → 45 < 50 → left
             at 30 → 45 > 30 → right
             at 40 → 45 > 40 → right
             null → NOT FOUND.        3 comparisons.
```

Two things to notice. First, an unsuccessful search costs the same as a successful one at the same
depth — unlike the unsorted array (Volume 1 §1.2), where proving absence always cost the maximum.
Second, the failed search **ended exactly where 45 would have to be inserted.** That is not a
coincidence and it is the whole of the next section.

## 8.3 Insert, performed

Because a failed search terminates at precisely the null pointer where the key belongs, insertion
*is* a failed search followed by one pointer write:

```
def insert(root, k):
    if root is None: return Node(k)
    parent, n = None, root
    while n is not None:
        parent = n
        if   k < n.key: n = n.left
        elif k > n.key: n = n.right
        else: return root                # duplicate: policy choice
    if k < parent.key: parent.left  = Node(k)
    else:              parent.right = Node(k)
    return root
```

**Insertion always creates a leaf. It never restructures anything.** That is the good news (it is
why insertion is O(height) with a tiny constant) and it is precisely the bad news, because it
means **the tree's shape is determined entirely by the order the keys arrive in, and the structure
has no say in the matter.** Chapter 9 is the bill for that.

Insert 45 into the tree above: the search above ended at 40's right pointer, so 45 becomes 40's
right child. One write.

## 8.4 Delete, performed — three cases, and the one that is actually interesting

Deletion is where BSTs get their reputation. There are three cases and the third has a real idea
in it.

### Case 1 — the node is a leaf

Set the parent's pointer to null. Done. The invariant cannot be disturbed, because removing keys
from a subtree cannot violate an upper or lower bound.

### Case 2 — the node has exactly one child

Splice it out: connect the parent directly to the only child.

```
   delete 30:              becomes:
        50                      50
       /                       /
     30            ──►       20
     /                       /
   20                      10
   /
 10
```

Correct because everything in 30's subtree was already on the correct side of 50, and 20's
subtree *is* 30's subtree minus 30.

### Case 3 — the node has two children. This is the interesting one

You cannot just remove it: two orphaned subtrees, one parent pointer. And you cannot promote
either child arbitrarily — promoting the left child would put its whole right subtree on the wrong
side of things.

**The insight:** we do not have to remove the *node*. We have to remove the *key*. So find a key
that can legally take the deleted node's place, move it there, and delete *it* from its old
position instead — a position we will have chosen to be an easy case.

Which key can legally sit in that slot? Exactly two candidates:

- The **in-order predecessor**: the largest key in the left subtree. It is greater than everything
  else on the left and less than everything on the right. ✔
- The **in-order successor**: the smallest key in the right subtree. Symmetric. ✔

And here is the payoff. The largest key in a subtree is found by going right until you cannot,
so it **has no right child**. The smallest goes left until it cannot, so it **has no left child**.
Either candidate therefore falls into Case 1 or Case 2 — never Case 3. **The recursion terminates
after exactly one step.** That is the elegant part, and it is why deletion is O(height) rather
than something worse.

```
def delete(n, k):
    if n is None: return None
    if   k < n.key: n.left  = delete(n.left, k)
    elif k > n.key: n.right = delete(n.right, k)
    else:
        if n.left  is None: return n.right      # cases 1 & 2
        if n.right is None: return n.left       # cases 1 & 2
        s = n.right                             # case 3: find successor
        while s.left: s = s.left
        n.key = s.key                           # move the key up
        n.right = delete(n.right, s.key)        # delete it from below (easy case)
    return n
```

### Worked example

```
Delete 30 (two children) from:

                  ┌────┐
                  │ 50 │
                  └─┬──┘
          ┌─────────┴─────────┐
       ┌──▼─┐              ┌──▼─┐
       │ 30 │              │ 70 │
       └─┬──┘              └────┘
      ┌──┴──┐
   ┌──▼─┐ ┌─▼──┐
   │ 20 │ │ 40 │
   └─┬──┘ └────┘
     │
  ┌──▼─┐
  │ 25 │
  └────┘

In-order successor of 30 = smallest in {40} = 40.  40 has no children (Case 1).
Copy 40 into 30's slot, then delete the original 40.

                  ┌────┐
                  │ 50 │
                  └─┬──┘
          ┌─────────┴─────────┐
       ┌──▼─┐              ┌──▼─┐
       │ 40 │              │ 70 │
       └─┬──┘              └────┘
          │
       ┌──▼─┐
       │ 20 │
       └─┬──┘
          │
       ┌──▼─┐
       │ 25 │
       └────┘

Verify by in-order traversal: 20, 25, 40, 50, 70  ✔ strictly increasing.
```

Using the **predecessor** instead (largest in {20, 25} = 25) gives:

```
                  ┌────┐
                  │ 50 │
                  └─┬──┘
          ┌─────────┴─────────┐
       ┌──▼─┐              ┌──▼─┐
       │ 25 │              │ 70 │
       └─┬──┘              └────┘
      ┌──┴──┐
   ┌──▼─┐ ┌─▼──┐
   │ 20 │ │ 40 │
   └────┘ └────┘
```

Both are valid. Note the second one is *better balanced* — which brings us to a real and rather
famous problem with this algorithm.

### Hibbard deletion and the asymmetry problem

The algorithm above — always taking the **successor** — is **Hibbard deletion**, from Thomas
Hibbard's 1962 paper (Volume 1 §2.4). It is correct, it is what most textbooks present, and it has
a defect: it is **asymmetric**. It always removes a node from the right subtree, so it
systematically drains the right side and leaves trees leaning left.

> **Confidence: moderate on the precise result, high on the phenomenon.** The empirical
> degradation was noticed early (Knuth discusses it), and the standard analytical result — usually
> credited to Culberson, and Culberson & Munro in the mid-1980s — is that under a long sequence of
> random insertions alternated with Hibbard deletions, the expected path length grows to **Θ(√n)**
> rather than settling at Θ(log *n*). I am confident about the Θ(√n) order and about the
> asymmetry being the cause; I would verify the exact citation before relying on it.

This is a genuinely instructive failure. The algorithm has no bug. Every individual operation is
correct and O(height). And yet **running it for a long time makes the structure worse**, because
each operation applies a small, consistent bias, and biases accumulate. The standard mitigation is
to alternate — take the predecessor on even deletions, successor on odd, or choose based on which
subtree is taller.

> **The general lesson, which recurs in Volume 5:** a data structure operation can be individually
> correct and collectively corrosive. Long-run behaviour is a separate property from per-operation
> correctness, and it needs to be reasoned about separately. Volume 5's material on index bloat
> and deferred cleanup is the same lesson at a much larger scale.

## 8.5 Successor, predecessor, and iteration

Three operations that fall out of the structure and that you will need constantly.

**Minimum / maximum:** walk left / right until you cannot. O(height).

**Successor of a node *x*** (the next key in sorted order):

```
def successor(x):
    if x.right is not None:
        return minimum(x.right)          # case A
    # case B: climb until x is a LEFT child
    p = x.parent
    while p is not None and x is p.right:
        x, p = p, p.parent
    return p
```

Case A is easy. Case B is the one to understand: if there is no right subtree, everything below
*x* is already smaller, so the successor is above. Climb until you make a move that goes *up-left*
— that node is the first key larger than *x*.

Note this needs a **parent pointer**, which is 8 more bytes per node (Volume 1 §6.1). The
alternative is to keep an explicit stack in the iterator, which is exactly the iterative in-order
traversal from Volume 1 §5.3 — trading per-node space for per-iterator space. Both designs exist
in real libraries: `std::map` nodes carry a parent pointer; many functional and immutable trees
use the stack-in-the-iterator approach because they cannot afford parent pointers (a parent
pointer would make structural sharing impossible, which Volume 5 explains).

**Full in-order iteration** via repeated `successor` is Θ(*n*) total, not Θ(*n* log *n*), by an
amortization argument: each edge of the tree is traversed at most twice across the whole walk
(once down, once up), and there are *n*−1 edges (Volume 1 Fact 1).

## 8.6 Why O(log *n*) "in theory", and exactly what the theory assumes

Every operation above costs **Θ(height)**. Not Θ(log *n*) — Θ(height). Those coincide only when
the tree is balanced, and §8.3 established that nothing in the BST makes it so.

Precisely:

| | Height *h* | Search / insert / delete |
|---|---|---|
| Best case (perfect) | log₂(*n*+1) − 1 | Θ(log *n*) |
| Random insertion order | ≈ 2.99 log₂ *n* | Θ(log *n*) with a ~3× constant |
| **Worst case (sorted input)** | ***n* − 1** | **Θ(*n*)** |

So the honest claim about an unbalanced BST is: **O(log *n*) if you are lucky about the input
order, O(*n*) if you are not, and "unlucky" means "sorted", which is the most common thing input
can be.**

That is not a data structure you can ship. Chapter 9 makes the failure concrete.

---

# Chapter 9 — The Balance Catastrophe

## 9.1 Performing it

Let us actually do it. Insert 1, 2, 3, …, 10 into an empty BST, using the algorithm from §8.3
exactly as written, step by step.

```
insert 1:   1 is the root.

    1

insert 2:   at 1 → 2 > 1 → go right → null → attach.

    1
     \
      2

insert 3:   at 1 → right; at 2 → right → null → attach.  (2 comparisons)

    1
     \
      2
       \
        3

insert 4:   at 1, 2, 3 → all right.  (3 comparisons)

    1
     \
      2
       \
        3
         \
          4

insert 5:                              insert 6:
    1                                      1
     \                                      \
      2                                      2
       \                                      \
        3                                      3
         \                                      \
          4                                      4
           \                                      \
            5                                      5
                                                    \
                                                     6
```

By the time we reach 10:

```
    1
     \
      2
       \
        3
         \
          4
           \
            5
             \
              6
               \
                7
                 \
                  8
                   \
                    9
                     \
                      10

    n = 10,  height = 9,  optimal height = 3
```

**Every single node has exactly one child. This is a linked list.** It satisfies the BST invariant
perfectly — check any node: empty left subtree, and everything to the right is larger. It is a
completely valid binary search tree. And it delivers none of the benefit.

The mechanism is trivial once you see it: each new key is larger than every key present, so the
search from §8.2 turns right at every node and terminates at the rightmost null. The insertion
point is always the deepest position. **Sorted input drives the insertion point to the maximum
possible depth, every time, by construction.**

Reverse-sorted input gives the mirror image — a left chain. And notice from §7.3 that a *specific*
degenerate shape is one of *n*! orders, yet here we produced it deterministically on the first
try, because we did not sample from *n*! orders. We used the order the data came in.

## 9.2 The cost, derived

### Search becomes Θ(*n*)

Searching for 10 requires visiting 1, 2, 3, …, 10 — ten comparisons, versus 4 in a balanced tree
of the same size. Average successful search cost is (1+2+…+*n*)/*n* = (*n*+1)/2. **Exactly the
unsorted array's cost from Volume 1 §1.2**, but now with 32 bytes of pointer overhead per element
and pointer-chasing cache behaviour instead of contiguous scanning. We have built something
strictly worse than the array we started with. That deserves to be stated plainly:

> **A degenerate BST is worse than the unsorted array from Volume 1 §1.2 in every dimension.**
> Same Θ(*n*) search. 4× the memory. Pointer-chasing instead of prefetchable sequential access,
> which Volume 1 §1.6 measured at up to 80× slower per element. All the complexity of tree code
> and none of the benefit. Volume 1's entire derivation is undone.

### Building the tree becomes Θ(*n*²)

Insert *i* traverses *i*−1 nodes:

$$
\sum_{i=1}^{n} (i-1) = \frac{n(n-1)}{2} = \Theta(n^2)
$$

For *n* = 10⁶ that is 5 × 10¹¹ pointer dereferences, each a likely cache miss at ~80 ns:
**roughly eleven hours** to build an index that should take under a second. This is the kind of
number that turns into an incident report.

### Recursive traversal crashes

Volume 1 §5.4: peak stack depth equals height. Height 10⁶ at ~48 bytes per frame is 48 MB of
stack against an 8 MB limit. **Segmentation fault**, no catchable exception on most platforms,
and a core dump that is unhelpful because the stack is the thing that was destroyed.

So the failure is not merely "slower than hoped." It is: quadratic build time, linear lookups,
higher memory use than an array, and a hard crash on any recursive walk.

## 9.3 Sorted input is the norm, not the exception

If sorted input were rare, we could shrug. Consider where data actually comes from:

| Source | Ordering |
|---|---|
| `id SERIAL PRIMARY KEY`, auto-increment, sequences | **Strictly increasing** |
| Timestamps, log entries, event streams, `created_at` | **Strictly increasing** |
| Reading a sorted file, a CSV export with `ORDER BY`, a merge output | **Sorted** |
| Alphabetized names, sorted product SKUs, dictionary loading | **Sorted** |
| Rebuilding an index by scanning the old one | **Sorted** |
| Monotonic version numbers, sequence numbers, offsets | **Increasing** |
| UUID v7 / ULID / Snowflake IDs (time-prefixed) | **Approximately increasing** |

That is most of the data in most systems. And the last row is worth dwelling on: the modern
recommendation to prefer time-ordered UUIDs over random UUID v4 exists precisely *because*
sequential keys give good locality in a B-tree — a benefit Volume 3 explains at length. So the
industry is actively moving *toward* sorted insertion patterns, which makes an unbalanced BST's
worst case more common over time, not less.

## 9.4 Nearly-sorted is nearly as bad

You might hope the disaster needs *perfectly* sorted input. It does not; degradation is graceful
in the wrong direction. Take *n* keys that are sorted except for local shuffling within windows of
size *w*:

- The tree becomes a **chain of small subtrees**: a spine of about *n*/*w* nodes, each carrying a
  little balanced tree of ~*w* keys.
- Height ≈ *n*/*w* + log₂ *w*.

| *n* | Window *w* | Height | Optimal |
|---|---|---|---|
| 10⁶ | 1 (fully sorted) | 999,999 | 19 |
| 10⁶ | 10 | ~100,003 | 19 |
| 10⁶ | 1,000 | ~1,010 | 19 |
| 10⁶ | 10⁶ (fully random) | ~60 | 19 |

You need the shuffling window to be a *constant fraction of n* before you approach the random
case. "Mostly sorted with some noise" — which describes an enormous amount of real data — is
firmly in the disaster region.

## 9.5 Even randomization has an adversary

A reasonable idea: shuffle the input before inserting. This works, and Chapter 13 shows a much
better version of it. But note the limit — **you cannot always shuffle**, because you do not always
have the input up front:

- A database index receives rows one at a time, over months. There is no "the input" to shuffle.
- A network service receives keys chosen by clients.
- A scheduler receives tasks as they arrive.

And if the keys are attacker-chosen, an attacker who knows you use a plain BST can send keys in
sorted order and turn every lookup into Θ(*n*). This is a **complexity-based denial of service**,
and it is the exact analogue of hash-flooding — where an attacker sends colliding keys to force a
hash table into linear-time buckets. Hash flooding was demonstrated publicly against many web
frameworks around 2011–2012 and led essentially every major language to adopt randomized,
seeded hashing (SipHash and similar).

> **Confidence: high on the phenomenon and the ~2011–2012 disclosures; moderate on which specific
> frameworks and dates.** Java's `HashMap` response is a nice concrete artifact: since Java 8, a
> hash bucket that accumulates 8 or more colliding entries is converted from a linked list into a
> **red-black tree**, so a flooding attack degrades to O(log *n*) per bucket rather than O(*n*).
> A balanced tree deployed specifically as a defence against adversarial input. We will meet it
> again in §11.8.

The takeaway: **average-case bounds are a statement about the input distribution, and the input
distribution is sometimes chosen by someone who wants you to fail.** Any fix must be either a
worst-case guarantee (AVL, red-black) or a randomization the adversary cannot predict (treaps).

## 9.6 What "balanced" has to mean to be useful

We need a balance criterion. Not just any criterion — one that is actually implementable. Three
requirements:

**1. It must bound the height to O(log *n*).** Otherwise it does not solve the problem.

**2. It must be checkable and repairable *locally*.** If verifying balance required examining the
whole tree, every insertion would cost Θ(*n*) and we would have traded a slow search for a slow
insert. What we need is a property that is (a) a conjunction of per-node conditions, and (b)
disturbed only along the single root-to-leaf path an insertion touched.

**3. Repair must be cheap** — O(1) work per level at worst, so the whole repair is O(log *n*).

Requirement 2 is the demanding one, and it explains why the perfectly natural criterion
"height(left) = height(right) for every node" is **useless**: it is only satisfiable for
*n* = 2^k − 1, so almost every insertion would violate it and repair would mean rebuilding.
A workable criterion must have **slack** — enough looseness that most insertions violate nothing,
and violations are repairable without global work.

Every structure in this volume is a different answer to "how much slack, and how do we repair?"

## 9.7 The rotation: one primitive, and everything is built from it

Before the structures, the tool. Every balanced BST in this volume — every single one — is built
from one O(1) operation.

**The problem it solves:** we need to change a tree's *shape* without changing its *contents or
ordering*. Specifically, we need to make one subtree shallower and the other deeper, locally.

**The rotation.** Take a node *y* with left child *x*. Make *x* the root of this subtree and *y*
its right child. *x*'s right subtree, which sits between them in key order, becomes *y*'s new left
subtree:

```
        RIGHT ROTATION at y                    LEFT ROTATION at x
        (x rises, y descends)                  (the exact inverse)

           y                                        x
          / \                                      / \
         x   C          ───────►                  A   y
        / \             ◄───────                     / \
       A   B                                        B   C

   key order:  A < x < B < y < C          key order:  A < x < B < y < C
                                                      ↑ IDENTICAL
```

**Proof that the BST invariant survives.** Read the key order off both pictures. Left:
everything in A is < *x*; *x* < everything in B; everything in B is < *y* (since B is inside *y*'s
left subtree); *y* < everything in C. So A < *x* < B < *y* < C. Right: A < *x*; *x* < *y* (as *y*
is in *x*'s right subtree); B < *y* since B is *y*'s left subtree, and B > *x* since B is in *x*'s
right subtree; *y* < C. So again A < *x* < B < *y* < C. **The in-order traversal is character for
character identical, so the two trees contain the same keys in the same order.** ∎

That last sentence is the cleanest way to remember why rotations are safe: **a rotation changes
the tree's shape while leaving its in-order traversal invariant.** If you ever need to check
whether a restructuring operation is legal, compute its in-order sequence before and after.

**The code**, and note there are only three pointer writes:

```
def rotate_right(y):
    x       = y.left
    y.left  = x.right          # B moves across
    x.right = y                # y descends
    return x                   # x is the new subtree root

def rotate_left(x):
    y       = x.right
    x.right = y.left
    y.left  = x
    return y
```

Three pointer assignments — plus a parent-pointer fixup if your nodes carry one, and a
height/color update for whichever structure you are implementing. **Θ(1), unconditionally, with no
dependence on subtree sizes.** Subtrees A, B, C are moved by relinking, never by touching their
contents.

### What one rotation buys you

```
BEFORE: height 3, node A at depth 3      AFTER right rotation at y: height 2
        internal path length = 6                  path length = 5

           y                                        x
          / \                                      / \
         x   C  (depth 1)                         A   y     (A now depth 1)
        / \                                          / \
       A   B                                        B   C
      (A at depth 2, its                    left subtree shrank by 1 level,
       children at depth 3)                 right subtree grew by 1 level
```

**A rotation moves exactly one level of height from one side to the other.** That is the whole
mechanism. Every balanced tree in this volume works by detecting "this side is too deep" and
applying rotations to shift levels across until the imbalance is gone.

### The one thing a single rotation cannot fix

This is important enough to isolate, because it is precisely why double rotations exist.

A rotation moves the *child* up. If the problem is not in the child but in the **grandchild on the
inner side**, a single rotation just moves the problem:

```
Problem: too deep on the left, but the depth is in x's RIGHT subtree (the "inner" side)

           y                    rotate_right(y)          x
          / \                    ──────────►            / \
         x   C   (short)                               A   y     ← still lopsided!
        / \                                               / \    B's depth moved,
       A   B   ← the deep one                            B   C   but B is still deep
      (short)                                          (deep)
```

Before: the left side is too deep because of B. After: the *right* side is too deep, because of B.
We have swapped which side is broken without fixing anything. The imbalance is a
**zig-zag** — left then right — and a single rotation only handles **zig-zig** — same direction
twice.

The fix: rotate the child first to convert zig-zag into zig-zig, *then* rotate the parent. Two
rotations, still O(1):

```
Step 1: rotate_left(x)              Step 2: rotate_right(y)

      y                                     B
     / \                                   / \
    B   C                                 x   y
   / \                                   /     \
  x   B_r                               A       C
 /
A            (B's pieces distributed)   balanced ✔
```

This pattern — **four cases, two of which are "zig-zig" needing one rotation and two of which are
"zig-zag" needing two** — is the shape of AVL rebalancing, of red-black insertion fixup, and of
splay steps. Recognizing it once means recognizing it everywhere in the rest of this volume.

We now have the diagnosis (Chapter 9) and the instrument (§9.7). The remaining question is
**policy**: when do you look, what do you look for, and how hard do you insist? Four answers
follow.

---

# Chapter 10 — AVL Trees: Enforce Balance Strictly

## 10.1 History: Moscow, 1962

> **Confidence: high on the paper, moderate on the biographical detail.**

**Georgy Maximovich Adelson-Velsky** and **Evgenii Mikhailovich Landis** published "An algorithm
for the organization of information" in *Doklady Akademii Nauk SSSR* (Proceedings of the USSR
Academy of Sciences), volume 146, 1962, pages 263–266. An English translation appeared in *Soviet
Mathematics — Doklady* volume 3 the same year. The structure has been called the **AVL tree** ever
since, from the authors' initials.

This is, by a comfortable margin, **the first self-balancing binary search tree** — it predates
red-black trees by a decade. It is worth pausing on the sequencing: the binary search tree itself
was published in 1960 (Volume 1 §2.4) and nobody is quite sure who invented it, and the *balanced*
version arrived two years later with clear, single-paper authorship. That ordering tells you
something real: the BST is obvious once you have pointers, and balancing it is not obvious at all.

Some context on the authors, because it is genuinely interesting and rarely mentioned:
Adelson-Velsky went on to lead the team behind **Kaissa**, the Soviet chess program that won the
first World Computer Chess Championship in 1974 — so the inventor of the balanced search tree also
built a world-champion game-tree searcher, which is a pleasing symmetry. Landis was primarily a
mathematician working in partial differential equations, and is better known in that field than
in computer science.

> I am reasonably confident about the Kaissa connection and the 1974 championship, and about
> Landis being a PDE specialist. I would verify the specifics before repeating them as
> established fact — Soviet-era computing history is thinly documented in English and secondary
> sources repeat each other.

## 10.2 The invariant

AVL takes the most direct possible reading of §9.6's requirements: define balance as
**heights differing by at most one, at every node.**

> **AVL invariant.** For every node *x*:
> $$\big|\,\text{height}(x.\text{left}) - \text{height}(x.\text{right})\,\big| \le 1$$

Store that difference explicitly as the **balance factor**:

$$
\text{bf}(x) = \text{height}(x.\text{left}) - \text{height}(x.\text{right}) \in \{-1, 0, +1\}
$$

(Using the Volume 1 convention that an empty subtree has height −1.) A balance factor of **+2**
means "left is too deep" and **−2** means "right is too deep"; those are the only two illegal
values reachable from a legal state by one insertion or deletion, which is exactly the local
checkability §9.6 demanded.

Check it against §9.6's three requirements:

1. **Bounds height to O(log *n*)?** Yes — §10.3 proves it, and the bound is remarkably tight.
2. **Locally checkable?** Yes — it is a conjunction of per-node conditions, and an insertion
   changes heights only along the one root-to-leaf path it walked.
3. **Cheaply repairable?** Yes — §10.4 shows one or two rotations suffice per violation.

**Storage cost.** The balance factor takes 2 bits (three legal values). Most implementations store
a full `int` height instead, because computing balance factors from heights is less error-prone —
costing 4 bytes per node rather than 2 bits. Given a 32-byte node (Volume 1 §6.1), padding often
absorbs it, so the real marginal cost is frequently zero.

## 10.3 Why ±1 bounds the height — a Fibonacci argument

The question: what is the **tallest** an AVL tree with *n* nodes can be? Equivalently, and easier
to attack: what is the **fewest** nodes an AVL tree of height *h* can have? Call it *N*(*h*).

To make a tree of height *h* as sparse as possible, be as lopsided as the invariant permits: one
subtree of height *h*−1, and the other of height *h*−2 (height *h*−3 would violate ±1). Each
subtree is itself minimally populated. So:

$$
N(h) = 1 + N(h-1) + N(h-2), \qquad N(0) = 1,\; N(1) = 2
$$

**That is the Fibonacci recurrence.** Indeed *N*(*h*) = *F*(*h*+3) − 1 with *F*(1) = *F*(2) = 1:

| *h* | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| *N*(*h*) | 1 | 2 | 4 | 7 | 12 | 20 | 33 | 54 | 88 | 143 | 232 |

Verify: *N*(4) = 1 + *N*(3) + *N*(2) = 1 + 7 + 4 = 12 ✔. And *F*(7) − 1 = 13 − 1 = 12 ✔.

The minimal (**Fibonacci**) AVL tree of height 4, with 12 nodes:

```
                        ●                    height 4
                    ┌───┴───┐
                    ●       ●                left: h=3    right: h=2
                 ┌──┴──┐   ┌┴─┐
                 ●     ●   ●  ●
              ┌──┴─┐  ┌┴┐
              ●    ●  ● ●
            ┌─┴┐
            ●  ●

   Every node satisfies |bf| ≤ 1, and this is as sparse as height 4 can be.
```

Since *F*(*k*) ≈ φ^*k*/√5 with φ = (1+√5)/2 ≈ 1.618, we get *N*(*h*) ≈ φ^(*h*+3)/√5, and inverting:

$$
h \le \log_\varphi(n+1) - c \approx \mathbf{1.4404 \log_2 n} + O(1)
$$

because 1/log₂(φ) = 1/0.6942 = 1.4404.

**An AVL tree is never more than about 44% taller than a perfectly balanced tree.** In concrete
terms:

| *n* | Optimal height | AVL worst-case height | Ratio |
|---|---|---|---|
| 1,000 | 9 | 13 | 1.44 |
| 10⁶ | 19 | 27 | 1.42 |
| 10⁹ | 29 | 41 | 1.41 |

That is an extremely strong guarantee, and it is achieved with two bits of metadata per node. It
also matters that this is a **worst case**, not an average: it holds regardless of insertion order,
which is exactly what §9.5's adversary defeats us on with a plain BST.

> **The golden ratio appearing here is not a coincidence or a curiosity.** The recurrence
> *N*(*h*) = 1 + *N*(*h*−1) + *N*(*h*−2) *is* the Fibonacci recurrence, and it arose directly from
> the choice of "±1" as the slack. Choose ±2 slack instead and you get a different recurrence,
> a larger constant, and a taller tree. **The height bound is a direct function of how much slack
> you allow**, and that is the dial every structure in this volume is turning. Red-black trees
> turn it toward more slack (§11.7).

## 10.4 The four rebalancing cases, derived

Insert a node. Update heights on the way back up. Find the **lowest** node *z* whose balance factor
has become ±2. There are exactly four configurations, and they follow from §9.7's zig-zig /
zig-zag distinction.

Let *z* be the unbalanced node, *y* its taller child, and *x* the taller child of *y*.

### Case LL — left-left, "zig-zig". bf(z) = +2, bf(y) ≥ 0

The new node went into the **left** subtree of *z*'s **left** child. The depth is on the outside.
**One right rotation at *z*.**

```
            z (+2)                                  y (0)
           /     \                                 /     \
        y (+1)    D  h                          x        z
        /    \                 rotate_right(z)  / \      / \
     x        C  h            ─────────────►   A   B    C   D
    / \                                       h+1 h    h    h
   A   B    heights h+1 total
  (subtree containing the new node)

   Before: left subtree of z has height h+2, right has height h  → bf = +2
   After:  y's children have heights h+1 and h+1 → bf(y) = 0, height h+2
```

Note the crucial bookkeeping: **the subtree's total height after rebalancing is *h*+2, which is
what it was *before the insertion*.** So no ancestor of *z* sees any change. That is why AVL
insertion needs at most one rebalancing — §10.5.

### Case RR — right-right, "zig-zig". bf(z) = −2, bf(y) ≤ 0

Mirror image. **One left rotation at *z*.**

```
       z (−2)                                    y (0)
      /     \                                   /     \
   A  h    y (−1)          rotate_left(z)      z       x
           /   \          ─────────────►      / \     / \
          B     x                            A   B   C   D
              /   \
             C     D
```

### Case LR — left-right, "zig-zag". bf(z) = +2, bf(y) < 0

The new node went into the **right** subtree of *z*'s **left** child. The depth is on the *inside*,
and §9.7 showed a single rotation cannot fix this — it just moves the imbalance to the other side.

**Two rotations: left at *y*, then right at *z*.**

```
STEP 0 — the problem                STEP 1 — rotate_left(y)         STEP 2 — rotate_right(z)

       z (+2)                              z (+2)                          x
      /     \                             /     \                        /   \
   y (−1)    D  h                      x         D  h                   y     z
   /   \                               / \                             / \   / \
  A     x        ← inner depth        y   C                           A   B C   D
 h    /   \                          / \
     B     C                        A   B
     (one of B,C holds the new node)

Final balance factors depend on which of B, C received the new node:
   new node in B  →  bf(y) = 0,  bf(z) = −1
   new node in C  →  bf(y) = +1, bf(z) = 0
   x IS the new node (B = C = empty)  →  bf(y) = bf(z) = 0
In every case |bf| ≤ 1 for x, y, and z, and the subtree height is restored. ✔
```

### Case RL — right-left, "zig-zag". bf(z) = −2, bf(y) > 0

Mirror image. **Right rotation at *y*, then left rotation at *z*.**

### The decision table, which is all you need to implement it

| bf(*z*) | bf(taller child *y*) | Case | Fix |
|---|---|---|---|
| +2 | ≥ 0 | LL | `rotate_right(z)` |
| +2 | < 0 | LR | `rotate_left(z.left)` then `rotate_right(z)` |
| −2 | ≤ 0 | RR | `rotate_left(z)` |
| −2 | > 0 | RL | `rotate_right(z.right)` then `rotate_left(z)` |

The whole of AVL rebalancing is those four lines. Everything else is height maintenance.

## 10.5 Insertion, and why one rebalance always suffices

```
def avl_insert(n, k):
    if n is None: return Node(k)
    if   k < n.key: n.left  = avl_insert(n.left, k)
    elif k > n.key: n.right = avl_insert(n.right, k)
    else: return n
    n.height = 1 + max(height(n.left), height(n.right))
    return rebalance(n)                     # applies the table above if |bf| = 2
```

**Theorem.** An AVL insertion requires at most **one** rebalancing operation (one single or one
double rotation).

**Proof sketch.** Insertion increases the height of the subtree it touched by at most 1. Let *z* be
the lowest node that became unbalanced. Before the insertion, *z*'s subtree had some height *H*;
after the insertion it has *H*+1, which is what made bf(*z*) = ±2. Every diagram in §10.4 shows the
rebalanced subtree having height *H* again — **rebalancing restores the original height.** So *z*'s
parent, and every ancestor above it, sees a subtree whose height is unchanged from before the
insertion, and therefore cannot have become unbalanced. ∎

Note what the theorem does *not* say: heights (or balance factors) may still need updating all the
way to the root, because we do not know *a priori* where *z* is. So insertion is **O(log *n*)
metadata writes and at most 2 pointer-rotations.** That distinction between metadata writes and
structural rotations will be the crux of §11.7.

### Worked example — build an AVL tree from 10, 20, 30, 40, 50, 25

This exercises RR twice and RL once, which covers both flavours.

```
insert 10:                insert 20:                insert 30:
                                                    → 10 has bf −2, child 20 has bf −1
   10                        10                        ⇒ Case RR: rotate_left(10)
                               \
                                20                        20
                                                         /  \
                                                       10    30
```

```
insert 40:                                  insert 50:
→ path 20 → 30 → right. Check:              → path 20 → 30 → 40 → right.
   bf(30) = −1, bf(20) = −1. Legal.            bf(40) = −1
                                               bf(30) = 0 − 2 = −2  ⇒ UNBALANCED
      20                                       child 40 has bf −1 ⇒ Case RR
     /  \                                      ⇒ rotate_left(30)
   10    30
           \                                      20
            40                                   /  \
                                               10    40
                                                    /  \
                                                  30    50
```

```
insert 25:  path 20 → 40 → 30 → left.

      20                        Now walk back up computing heights:
     /  \                         h(25) = 0
   10    40                       h(30) = 1  bf = 0 − (−1) = +1   legal
        /  \                      h(40) = 2  bf = 1 − 0 = +1      legal
      30    50                    h(20) = 3  bf = 0 − 2 = −2      UNBALANCED at z = 20
     /
   25                           z = 20, bf = −2, taller child y = 40, bf(y) = +1 > 0
                                  ⇒ Case RL:  rotate_right(40), then rotate_left(20)
```

```
STEP 1 — rotate_right(40):            STEP 2 — rotate_left(20):

      20                                       30
     /  \                                     /   \
   10    30                                 20     40
        /  \                               /  \      \
      25    40                           10    25     50
              \
               50

Final balance check:
   bf(10) = 0,  bf(25) = 0,  bf(50) = 0
   bf(20) = 0 − 0 = 0        ✔
   bf(40) = −1 − 0 = −1      ✔
   bf(30) = 1 − 1 = 0        ✔
   Height = 2 with n = 6.  Optimal for n = 6 is 2.  ✔ PERFECT.

In-order: 10, 20, 25, 30, 40, 50  ✔ sorted — the rotations preserved the ordering (§9.7).
```

Compare with Chapter 9: the plain BST given 10, 20, 30, 40, 50 produced a height-4 chain. The AVL
tree given the same input plus one more key has height 2. **Two rotations, applied at the right
moments, converted a linked list into a near-perfect tree.**

## 10.6 Deletion, and why it is genuinely worse

Deletion follows §8.4 (three cases) and then rebalances on the way back up. Same four cases, same
table. But the theorem from §10.5 **fails**, and understanding why is the most important thing in
this section.

Insertion made a subtree *taller*, and rebalancing restored the original height — so the change
stopped there. Deletion makes a subtree *shorter*. Now look at what rebalancing does:

```
Before deletion (legal):        After deleting from D:        After rotate_right(z):
        z (+1)                        z (+2)                        y (0)
       /     \                       /     \                       /     \
    y         D  h                y         D  h−1                x       z
   / \                           / \                             / \     / \
  x   C                         x   C                           A   B   C   D
 / \                           / \
A   B                         A   B

  height of z's subtree           still h+2                     h+1  ← ONE SHORTER
     = h + 2                      (bf illegal)                  than before deletion
```

**The rebalanced subtree can be shorter than it was before the deletion.** Which means *z*'s parent
now sees a shortened child, which may make *the parent* unbalanced. The imbalance **propagates
upward**, potentially all the way to the root.

| | Rotations per operation |
|---|---|
| AVL insertion | ≤ 1 rebalance (≤ 2 rotations) — **guaranteed constant** |
| **AVL deletion** | **up to ⌊h/2⌋ rebalances — Θ(log *n*) rotations** |

You can construct a sequence of deletions from a Fibonacci tree that forces a rotation at *every
level* on a single delete. It is not a hypothetical worst case; it is reachable.

This asymmetry — cheap insertion, expensive deletion — is a real cost. Every rotation is 3+ pointer
writes across 2–3 nodes, meaning 2–3 cache lines dirtied, and under concurrency (Volume 5) it means
locks held across multiple nodes at multiple levels. It is precisely the problem red-black trees
were designed to fix.

> **Confidence: moderate.** Amortized analysis softens the picture. Insertion-only sequences are
> O(1) amortized rotations per operation. I recall a result of Amani, Lai and Tarjan (around 2016)
> establishing amortized constant rebalancing for AVL insertions, and — importantly — that
> **intermixed** insertions and deletions do *not* enjoy an amortized constant bound. I would
> verify that before quoting it, but the worst-case Θ(log *n*) rotations per deletion is
> uncontroversial and is the number that drives design decisions.

## 10.7 The cost of strictness, and where AVL is the right answer

AVL trades write cost for read cost, and it does so deliberately:

**What you buy:** the tightest practical height bound of any structure in this volume —
1.44 log₂ *n* worst case. Shorter trees mean fewer comparisons, fewer cache misses, and fewer page
reads per lookup.

**What you pay:** more rebalancing. The invariant is tight enough that a large fraction of
insertions disturb it somewhere, and deletions can cascade.

So: **AVL is the right choice when reads dominate writes.** Concretely:

- A lookup table built once and queried constantly.
- An in-memory index over a mostly-static dataset.
- Anything where the tree fits in cache and the height difference (say 21 vs 24 levels for a
  million nodes) translates into a measurable latency difference.

And it is the wrong choice for write-heavy workloads with lots of deletion, which is most of what
an operating system kernel or a general-purpose `map` does. Hence Chapter 11.

> **Where you will actually find AVL trees in the wild:** they are less common in standard
> libraries than red-black trees, but they show up in **database index implementations** for
> in-memory tables, in some **filesystem** code, and — notably — in **WAVL trees** (weak AVL,
> Haeupler, Sen & Tarjan, 2015), a hybrid that keeps AVL's height bound for insertion-only
> workloads while bounding deletion rebalancing like a red-black tree. WAVL is the "we thought
> about this for fifty more years" answer, and it is a good illustration that this design space is
> still active. *(Confidence: high on WAVL existing and its authors; moderate on the year.)*

---

# Chapter 11 — Red-Black Trees: Enforce Balance Loosely

## 11.1 History, and a name with a good story

> **Confidence: high on the papers; the anecdote is flagged below.**

**Rudolf Bayer, 1972** — the same Rudolf Bayer who, in the same year, co-authored the B-tree paper
that Volume 3 is built around — published "Symmetric binary B-trees: data structure and maintenance
algorithms" in *Acta Informatica*. That title tells you the whole idea: this structure is a
**B-tree of a specific small order, encoded as a binary tree.** §11.2 makes that precise, because
it is by far the best way to understand red-black trees and most treatments bury it.

**Leo Guibas and Robert Sedgewick, 1978** — "A dichromatic framework for balanced trees", at FOCS
— reframed Bayer's structure using **one bit of colour per node** and unified several balanced-tree
schemes under a single presentation. This is the version everyone implements, and it is where the
name comes from.

> **The colour anecdote — confidence: moderate, as an anecdote.** Sedgewick has recounted that
> red and black were chosen because the laser printers at Xerox PARC produced particularly good
> red. He has told this story himself in talks, so the attribution is solid; whether it is the
> complete explanation, I could not say. It is a nice reminder that notation is often contingent.

Sedgewick returned to the subject in 2008 with **left-leaning red-black trees (LLRB)**, which
forbid right-leaning red links to halve the number of cases — an attempt to make the code teachable.
It is elegant and it has its critics (the deletion code is still hard, and the extra constraint
costs some rotations).

## 11.2 The right way to understand red-black trees: they are 2-3-4 trees in disguise

Most presentations hand you five invariants and ask you to accept them. That is unsatisfying,
because the invariants look arbitrary — especially "every path has the same number of black nodes",
which is a strange thing to invent from scratch.

They are not arbitrary. Here is where they come from.

Imagine a tree where a node may hold **1, 2, or 3 keys**, with correspondingly **2, 3, or 4
children**, and where — critically — **all leaves are at exactly the same depth.** That is a
**2-3-4 tree**, a B-tree of order 4, and it is trivially balanced because leaf depth uniformity is
part of its definition. (Volume 3 shows how splitting maintains that.)

Now encode each multi-key node as a small cluster of binary nodes, using **colour to mark "this
node is glued into its parent — we are really the same B-tree node":**

```
2-NODE (1 key, 2 children)          →   one BLACK node
     ┌───┐                                   ┌────┐
     │ b │                                   │ b  │ black
     └───┘                                   └────┘
     /   \                                   /    \

3-NODE (2 keys, 3 children)         →   BLACK node with ONE RED child
   ┌───┬───┐                            ┌────┐              ┌────┐
   │ a │ b │                            │ b  │B      or     │ a  │B
   └───┴───┘                            └────┘              └────┘
   /   |   \                            /                        \
                                    ┌────┐                      ┌────┐
                                    │ a  │R                     │ b  │R
                                    └────┘                      └────┘

4-NODE (3 keys, 4 children)         →   BLACK node with TWO RED children
 ┌───┬───┬───┐                                     ┌────┐
 │ a │ b │ c │                                     │ b  │B
 └───┴───┴───┘                                     └────┘
 /   |   |   \                                    /       \
                                              ┌────┐    ┌────┐
                                              │ a  │R   │ c  │R
                                              └────┘    └────┘
```

**Now every red-black invariant derives itself:**

| Red-black invariant | What it is really saying about the 2-3-4 tree |
|---|---|
| Nodes are red or black | Red = "glued into my parent's B-tree node"; black = "I am the top of a B-tree node" |
| The root is black | The topmost B-tree node has a top |
| A red node's children are both black | **A B-tree node holds at most 3 keys** — you cannot glue three generations together, because that would be a 5-node |
| Every root-to-leaf path has the same number of **black** nodes | **All B-tree leaves are at the same depth** — since each black node is exactly one B-tree level, counting blacks counts B-tree levels |
| Null leaves are black | Bookkeeping convenience so the count above works uniformly |

That fourth row is the payoff. **"Equal black height" is not a strange invented condition — it is
literally the B-tree's uniform-leaf-depth property, expressed in the binary encoding.** Black
height *is* B-tree height. Once you see that, red-black trees stop being a bag of cases and become
one idea with an encoding.

And it explains the insertion algorithm before we even look at it. In a 2-3-4 tree, insertion adds
a key to a leaf node; if that node overflows past 3 keys, you **split it** and push the middle key
up to the parent, which may itself overflow, cascading toward the root. In red-black terms:
adding a red node is adding a key to an existing B-tree node; a **red-red violation is an
overflowing node**; and the recolouring that fixes it — parent and uncle to black, grandparent to
red — is exactly **a split with the middle key pushed up.** §11.5's cases are B-tree splits wearing
a costume.

## 11.3 The five invariants

Stated properly, for reference:

1. Every node is either **red** or **black**.
2. The **root** is black.
3. Every **leaf** (the NIL sentinels) is black.
4. If a node is red, then **both its children are black.** (Equivalently: **no red node has a red
   parent** — no two reds in a row.)
5. For every node, **all paths from that node down to its descendant NILs contain the same number
   of black nodes.** This count is the node's **black height**, bh(*x*).

Invariants 4 and 5 do the work; 1–3 are framing.

## 11.4 Why this bounds the height

**Step 1: a subtree with black height *bh* contains at least 2^*bh* − 1 nodes.**

By induction. Black height 0 means the subtree is a NIL: 2⁰ − 1 = 0 nodes ✔. For black height
*bh*, each child subtree has black height at least *bh* − 1 (exactly *bh* − 1 if the child is
black, *bh* if red), so the node count is at least
1 + 2(2^(*bh*−1) − 1) = 2^*bh* − 1 ✔.

Hence *n* ≥ 2^*bh* − 1, giving **bh ≤ log₂(*n*+1)**.

**Step 2: at least half the nodes on any root-to-leaf path are black.** By invariant 4, reds
cannot be adjacent, so on any path reds are separated by blacks. Therefore
**h ≤ 2 · bh**.

**Combining:**

$$
h \le 2\log_2(n+1)
$$

### The comparison that defines this chapter

| *n* | Optimal | **AVL** (1.44 log₂ *n*) | **Red-black** (2 log₂ *n*) |
|---|---|---|---|
| 1,000 | 9 | 13 | 19 |
| 10⁶ | 19 | 27 | 39 |
| 10⁹ | 29 | 41 | 59 |

**A red-black tree can be up to about 2× the optimal height; an AVL tree only 1.44×.** In the worst
case, a red-black lookup performs ~44% more comparisons than an AVL lookup on the same data.

That is a real regression, and it is bought deliberately. §11.7 explains what it purchases.

> **In practice the gap is much smaller than the worst-case bounds suggest.** On randomly ordered
> insertions, both structures land close to log₂ *n* — measurements typically show red-black trees
> only a few percent taller than AVL trees, not 44%. The worst cases are reachable but not typical.
> Worst-case bounds matter because §9.5's adversary can aim for them; typical behaviour matters
> because that is what your latency graph shows. Both numbers are worth knowing, and conflating
> them is a common error in both directions.

## 11.5 Insertion

**Step 1: insert as an ordinary BST leaf, coloured RED.**

Why red? Look at the invariants. Adding a **black** node would add one to the black height of every
path through it — instantly violating invariant 5 across the whole tree, which is a global,
expensive violation. Adding a **red** node changes no black height at all, so invariant 5 is
preserved *for free*. Invariants 1, 2 (unless the tree was empty), 3 and 5 all still hold.

**Only invariant 4 can break, only between the new node and its parent.** One violation, in one
known place, of one invariant. That is exactly the local, repairable situation §9.6 asked for, and
choosing red is what engineered it.

**Step 2: fix the possible red-red violation.** Let *z* = the new (red) node, *p* = its parent,
*g* = grandparent, *u* = uncle (*g*'s other child).

---

**Case 0 — *p* is black.** No violation. Done. *(This is the common case: nothing happens at all.)*

---

**Case 1 — *u* is RED.** Both *p* and *u* are red, and *g* must be black (invariant 4 held before).

Recolour: *p* → black, *u* → black, *g* → red. No rotation.

```
        g(B)                          g(R)   ← may now conflict with ITS parent
       /    \                        /    \
    p(R)    u(R)     ─────►       p(B)    u(B)
    /                             /
  z(R)  ← red-red with p        z(R)   ← resolved
```

Black heights are preserved: every path through *g* gained a black at *p* or *u* and lost one at
*g*. But *g* is now red and might have a red parent, so **the violation moves up two levels.**
Set *z* ← *g* and repeat. This can iterate O(log *n*) times.

> **In 2-3-4 terms** (§11.2): *g* with two red children was a **4-node**, already full. Adding
> another key overflowed it. The recolouring **splits** it into two 2-nodes (*p* and *u*, now black)
> and pushes the middle key (*g*) up into the parent — which may itself overflow. **Case 1 is a
> B-tree node split.** Volume 3 will show the identical mechanism at fanout 400 instead of 4.

---

**Case 2 — *u* is BLACK, and *z* is the "inner" grandchild (zig-zag).**

*p* is a left child and *z* is a right child, or vice versa. As §9.7 proved, one rotation cannot
fix a zig-zag. Rotate *p* to convert this into Case 3.

```
       g(B)                              g(B)
      /    \                            /    \
   p(R)    u(B)    rotate_left(p)    z(R)    u(B)
      \             ───────────►     /
      z(R)                        p(R)
                                  ↑ now a zig-zig; relabel and fall through to Case 3
```

---

**Case 3 — *u* is BLACK, and *z* is the "outer" grandchild (zig-zig).**

Rotate *g* and swap the colours of *p* and *g*:

```
       g(B)                                  p(B)
      /    \                                /     \
   p(R)    u(B)     rotate_right(g)      z(R)     g(R)
   /                 ──────────────►                 \
 z(R)                + recolour                      u(B)

Black heights verified: before, a path through z had blacks {g} plus below;
after, it has blacks {p} plus below. Paths through u had {g, u}; now {p, g, u}
minus... — check directly: p is black and g is now red, so each path
through the subtree still crosses exactly one black at the top. ✔
```

**No red-red remains and no further propagation is possible**, because the new subtree root *p* is
**black** — a black node can have a parent of any colour. **Case 3 terminates.**

---

### The property that makes red-black trees good at writes

Read the case analysis again with one question in mind: *which cases rotate, and which cases
propagate?*

| Case | Rotations | Propagates upward? |
|---|---|---|
| 0 | 0 | no |
| 1 (red uncle) | **0** | **yes**, up to O(log *n*) times |
| 2 → 3 (zig-zag) | 2 | **no** — terminates |
| 3 (zig-zig) | 1 | **no** — terminates |

**The case that can repeat does no rotations. The cases that rotate cannot repeat.** Therefore:

> **A red-black insertion performs at most 2 rotations, ever**, plus O(log *n*) recolourings.

Compare with AVL, whose *deletion* can perform Θ(log *n*) rotations. This is the entire trade, and
it is worth being precise about why recolourings are so much cheaper than rotations:

| | Recolouring | Rotation |
|---|---|---|
| Memory written | **1 bit** in one node | 3+ pointers across 2–3 nodes |
| Cache lines dirtied | **1** | 2–3 |
| Structure changed | **none** — every parent/child link is untouched | pointer topology changes |
| Concurrency (Volume 5) | a node-local flag flip | must lock multiple nodes; readers can observe torn structure |
| Iterator/pointer stability | **preserved** | node positions move |

That last row is not a footnote. `std::map` guarantees that references and iterators to elements
remain valid across insertions of *other* elements. Recolouring cannot break that; it changes no
node's address and no link. **A structure that does its rebalancing mostly by recolouring is much
easier to make safe for concurrent readers and stable iterators**, and that is a large part of why
it won the standard-library slot.

### Worked example 1 — insert 10, 20, 30, 40, 50

```
insert 10 → root, black                        insert 20 → red, parent black: Case 0
   ┌─────┐                                        ┌─────┐
   │ 10B │                                        │ 10B │
   └─────┘                                        └──┬──┘
                                                      \
                                                    ┌─────┐
                                                    │ 20R │
                                                    └─────┘

insert 30 → z=30R, p=20R (red!), g=10B, u = 10's left = NIL (black)
            z is the right child of p, p is the right child of g → zig-zig → CASE 3
            rotate_left(10), swap colours of 20 and 10

                                ┌─────┐
                                │ 20B │
                                └──┬──┘
                          ┌────────┴────────┐
                       ┌─────┐           ┌─────┐
                       │ 10R │           │ 30R │
                       └─────┘           └─────┘

insert 40 → z=40R, p=30R (red!), g=20B, u=10R → UNCLE IS RED → CASE 1
            recolour 30→B, 10→B, 20→R; but 20 is the root, so force it black.
            (In 2-3-4 terms: the 4-node {10,20,30} split; 20 became the new root.)

                                ┌─────┐
                                │ 20B │
                                └──┬──┘
                          ┌────────┴────────┐
                       ┌─────┐           ┌─────┐
                       │ 10B │           │ 30B │
                       └─────┘           └──┬──┘
                                              \
                                            ┌─────┐
                                            │ 40R │
                                            └─────┘

insert 50 → z=50R, p=40R (red!), g=30B, u = 30's left = NIL (black)
            zig-zig right-right → CASE 3: rotate_left(30), swap colours 40 ↔ 30

                                ┌─────┐
                                │ 20B │
                                └──┬──┘
                          ┌────────┴─────────┐
                       ┌─────┐            ┌─────┐
                       │ 10B │            │ 40B │
                       └─────┘            └──┬──┘
                                     ┌───────┴───────┐
                                  ┌─────┐         ┌─────┐
                                  │ 30R │         │ 50R │
                                  └─────┘         └─────┘

Verify:  no red-red ✔
         black heights: 20→10→NIL = {10} = 1;  20→40→30→NIL = {40} = 1;
                        20→40→50→NIL = {40} = 1.  All equal ✔
         height 2 with n = 5 — optimal.
```

Note this is the **same final shape** the AVL tree reached for the same input in §10.5. On
well-behaved input the two structures frequently agree; they diverge on *how insistently* they
correct, and therefore on the worst case and on the write cost.

### Worked example 2 — a zig-zag, to exercise Case 2

Insert 10, 30, 20:

```
10 → root black.   30 → red right child, parent black: Case 0.

   ┌─────┐
   │ 10B │
   └──┬──┘
        \
      ┌─────┐
      │ 30R │
      └─────┘

insert 20 → path: 20 > 10 → right to 30; 20 < 30 → left of 30.
            z=20R, p=30R (red!), g=10B, u = NIL (black).
            z is the LEFT child of p; p is the RIGHT child of g → ZIG-ZAG → CASE 2.

  Step 1: rotate_right(p = 30)               Step 2: now zig-zig → CASE 3
                                                     rotate_left(g = 10), swap colours
   ┌─────┐
   │ 10B │                                        ┌─────┐
   └──┬──┘                                        │ 20B │
        \                                         └──┬──┘
      ┌─────┐                             ┌──────────┴──────────┐
      │ 20R │                          ┌─────┐               ┌─────┐
      └──┬──┘                          │ 10R │               │ 30R │
           \                           └─────┘               └─────┘
         ┌─────┐
         │ 30R │                        Verify: no red-red ✔, black heights all 0
         └─────┘                        (only the root is black), height 1. ✔
```

## 11.6 Deletion — the hard part, honestly

Red-black deletion is the most error-prone routine in this volume. I will give you the structure
and the reason it is hard rather than an exhaustive case walk, because exhaustive case walks are
where errors hide and the *concept* is what transfers.

**The setup.** Delete as in §8.4 to reduce to removing a node with at most one child. Then:

- If the removed node was **red**: no black height changed anywhere. **Done, no fixup at all.**
- If the removed node was **black**: every path through it lost exactly one black node.
  **Invariant 5 is now violated** on that side.

That deficiency is conventionally modelled as a phantom extra black — a **"doubly black"** node,
carrying one unit of black-height debt. The fixup's job is to discharge the debt: either find a
red node nearby that can be recoloured black to pay it, or push the debt up the tree until it
reaches the root (where it simply evaporates, since removing a black from *every* path preserves
invariant 5).

**The four cases**, with *x* the doubly-black node and *s* its sibling:

| Case | Condition | Action | Terminates? |
|---|---|---|---|
| D1 | *s* is **red** | Rotate the parent, recolour, to reduce to D2/D3/D4 | no — falls through |
| D2 | *s* black, both *s*'s children black | Recolour *s* red; **move the debt to the parent** | **no — propagates** |
| D3 | *s* black, **near** child red, far child black | Rotate *s* to convert into D4 | no — falls through |
| D4 | *s* black, **far** child red | Rotate the parent, recolour | **yes — debt paid** |

Same structural signature as insertion: **the propagating case (D2) does no rotation, and the
rotating terminal case (D4) does not propagate.** So:

> **A red-black deletion performs at most 3 rotations**, plus O(log *n*) recolourings.

Contrast AVL deletion's Θ(log *n*) rotations. **This is the number red-black trees exist to
achieve**, and it is the answer to "why wasn't AVL enough?" It was enough for reads. It was not
enough for a general-purpose container that deletes as often as it inserts.

**Why the code is hard**, concretely: four cases × two mirror directions = eight branches; the
NIL sentinel must behave like a real black node so `s->left->color` does not fault (which is why
many implementations use a shared static NIL object rather than actual null pointers); and the
node being *removed* may not be the node whose key you asked to delete (§8.4 Case 3), so you must
track colours across a key-move. Every one of those is a documented source of bugs in real
libraries.

## 11.7 AVL versus red-black: the actual numbers

| | AVL | Red-black |
|---|---|---|
| Height bound | **1.44 log₂ *n*** | 2 log₂ *n* |
| Worst height, *n* = 10⁶ | **27** | 39 |
| Typical height, random *n* = 10⁶ | ~21 | ~22–23 |
| Metadata per node | 2 bits (bf) or 4 bytes (height) | **1 bit (colour)** |
| Rotations per **insert** | ≤ 2 | ≤ 2 |
| Rotations per **delete** | **Θ(log *n*)** | **≤ 3** |
| Metadata writes per op | O(log *n*) heights | O(log *n*) colours |
| Search performance | **better** (shorter tree) | slightly worse |
| Update performance | worse (esp. deletes) | **better** |

**Choose AVL when reads dominate. Choose red-black when updates are frequent — especially
deletions.** That is the whole of it, and it is why red-black trees are the default in
general-purpose libraries: a general-purpose container cannot assume a read-heavy workload, and the
worst-case *update* cost is what determines whether it can be used in a latency-sensitive path.

One more advantage that does not appear in complexity tables: the colour bit fits in **one bit**,
which can be **stolen from a pointer's low bits** thanks to alignment. §11.8 shows the Linux kernel
doing exactly that, making a red-black node's metadata cost literally zero bytes.

## 11.8 Real code: three implementations you use every day

### The Linux kernel — `lib/rbtree.c`

> **Confidence: high on the structure and API; moderate on which subsystems currently use it,
> since the kernel changes and some have migrated (see the maple tree note below).**

The node type is a masterclass in space efficiency:

```c
struct rb_node {
    unsigned long  __rb_parent_color;   /* parent pointer AND colour, packed */
    struct rb_node *rb_right;
    struct rb_node *rb_left;
} __attribute__((aligned(sizeof(long))));

#define rb_parent(r)   ((struct rb_node *)((r)->__rb_parent_color & ~3))
/* RB_RED = 0, RB_BLACK = 1, stored in the low bit */
```

Two things worth admiring:

**1. The colour lives in the low bit of the parent pointer.** Because the struct is
`long`-aligned, every valid `rb_node*` has its low 2 bits zero — so those bits are free real
estate. The colour costs **zero additional bytes.** The node is 24 bytes on 64-bit: three
words, holding a parent pointer, two child pointers, and a colour.

**2. The tree is *intrusive*.** You do not allocate tree nodes; you **embed** an `rb_node` inside
your own struct and recover the containing object with `container_of`:

```c
struct my_thing {
    struct rb_node node;
    int key;
    /* ... your data ... */
};

#define rb_entry(ptr, type, member) container_of(ptr, type, member)
```

No separate allocation per tree entry, no `void*`, no double indirection to reach your data. In a
kernel — where you cannot allocate on many code paths, and where a pointer chase is a cache miss
you cannot afford — this design is close to mandatory. It is also why the kernel's rbtree API makes
*you* write the comparison and the descent loop: it has no idea what your keys are.

`rb_insert_color(node, root)` is the fixup from §11.5. Faithful sketch of its shape:

```c
while (true) {
    parent = rb_parent(node);
    if (!parent) { rb_set_black(node); break; }        /* node is the root */
    if (rb_is_black(parent)) break;                    /* CASE 0 — the common exit */
    gparent = rb_parent(parent);
    uncle   = (parent == gparent->rb_left) ? gparent->rb_right : gparent->rb_left;

    if (uncle && rb_is_red(uncle)) {                   /* CASE 1 — recolour, ascend */
        rb_set_black(parent); rb_set_black(uncle); rb_set_red(gparent);
        node = gparent; continue;                      /*  ← the propagating case  */
    }
    if (/* zig-zag */) __rb_rotate(parent, ...);       /* CASE 2 → converts to 3 */
    __rb_rotate(gparent, ...);                         /* CASE 3 — recolour, DONE */
    break;
}
```

Note the `continue` in Case 1 and the `break` after Case 3 — §11.5's "the propagating case does no
rotation" is right there in the control flow.

**The CFS / EEVDF scheduler** is the best-known user. Each runnable task's `sched_entity` embeds an
`rb_node`, and the run queue is a red-black tree keyed by **`vruntime`** — a virtual runtime scaled
by the task's weight, so that "least virtual runtime" means "most deserving of CPU." The scheduler
then needs one operation constantly: *find the leftmost node*. Which is O(log *n*)… except that
Linux uses `struct rb_root_cached`, which **caches a pointer to the leftmost node** and updates it
on insert and erase. So:

- Pick the next task to run: **O(1)** (read the cached leftmost pointer)
- Enqueue / dequeue a task: **O(log *n*)**

That caching trick recurs — `std::map` does the same thing for `begin()`, below. Whenever a tree's
hot query is "the minimum", cache the minimum.

> **Confidence: moderate on current details.** The Completely Fair Scheduler was replaced by
> **EEVDF** (Earliest Eligible Virtual Deadline First) in Linux 6.6, around late 2023. EEVDF still
> uses a red-black tree, now *augmented* with per-subtree minimum-vruntime information so it can
> efficiently select among "eligible" tasks. Augmented trees — where each node caches an aggregate
> over its subtree — are a general and very useful technique; Volume 4 develops it properly for
> interval and segment trees.

**Other kernel users** include `epoll`'s registered-file-descriptor set, ext3/ext4 hashed directory
indexing, the deadline and BFQ I/O schedulers, `timerqueue`, and cgroup bookkeeping.

> **A significant migration, and a direct pointer to Volume 3.** Virtual memory areas (`vm_area_struct`)
> were tracked in a red-black tree (`mm_struct.mm_rb`) for many years. In **Linux 6.1** (late 2022)
> that was replaced by the **maple tree** — an RCU-safe, range-based **B-tree** — largely because a
> B-tree's higher fanout gives better cache behaviour and because RCU-safe lock-free reads are far
> more tractable on a wide, shallow structure than on a binary one. *(Confidence: high on the change
> and version; moderate on the full rationale.)*
>
> That is Volume 3's thesis arriving in the kernel: **once you care about cache lines, the binary
> tree is the wrong fanout** — and Volume 5's thesis too, since concurrency was the other driver.

### C++ `std::map` / `std::set` — libstdc++

`_Rb_tree` in `<bits/stl_tree.h>`. The node base:

```cpp
struct _Rb_tree_node_base {
    _Rb_tree_color  _M_color;      // _S_red or _S_black
    _Base_ptr       _M_parent;
    _Base_ptr       _M_left;
    _Base_ptr       _M_right;
};
```

Two implementation details worth knowing:

**The header node trick.** The tree keeps a sentinel `_M_header` whose `_M_parent` points at the
real root, whose `_M_left` points at the **leftmost** node, and whose `_M_right` points at the
**rightmost**. Consequences: `begin()` and `rbegin()` are **O(1)**, `end()` is the header itself,
and iterator increment/decrement never needs a null check at the boundaries.

**The rebalancing code is not templated.** `_Rb_tree_insert_and_rebalance` and
`_Rb_tree_rebalance_for_erase` operate purely on `_Rb_tree_node_base` — no key type, no value type
— so they live in the *compiled* library rather than in the header. One copy of the fixup logic
serves every `std::map<K,V>` in your program. That is a deliberate and rather elegant
decoupling: the *structural* algorithm knows nothing about the data, exactly like the kernel's
intrusive design, arrived at from the opposite direction.

This is also the mechanism behind a guarantee you rely on constantly: **`std::map` iterators and
references remain valid when other elements are inserted or erased.** §11.7 explained why that is
compatible with red-black rebalancing — most of the work is recolouring, which moves nothing.

### Java — `TreeMap`, and `HashMap`'s collision defence

`java.util.TreeMap` is a textbook red-black tree; the methods are literally named
`fixAfterInsertion` and `fixAfterDeletion`, and `Entry<K,V>` carries `boolean color = BLACK`.
Reading it alongside §11.5 and §11.6 is a genuinely good exercise, because the case structure maps
one-to-one.

More interesting is **`HashMap`**. Since Java 8, when a single hash bucket accumulates
`TREEIFY_THRESHOLD` = 8 or more colliding entries (and the table is at least
`MIN_TREEIFY_CAPACITY` = 64), that bucket's linked list is converted into a **red-black tree**;
it reverts below `UNTREEIFY_THRESHOLD` = 6. So a hash-flooding attack (§9.5) that forces every key
into one bucket degrades lookups to **O(log *n*)** rather than O(*n*).

**A balanced tree deployed specifically as a defence against adversarial input.** It is a nice
closing note for this chapter: red-black trees earn their place not because they are the fastest
structure for any single operation, but because their *worst case* is bounded and cheap to
maintain — and a worst-case bound is exactly what you need when someone is aiming at you.

---

# Chapter 12 — Splay Trees: Do Not Enforce Balance; Repair On Access

## 12.1 A different question entirely

AVL and red-black trees both accept the same framing: *maintain an invariant that bounds the
height, and pay a little on every update to keep it.* Both store metadata to make the invariant
checkable.

In 1985, Daniel Sleator and Robert Tarjan asked whether the invariant is necessary at all.

> **Confidence: high.** Daniel Dominic Sleator and Robert Endre Tarjan, "Self-adjusting binary
> search trees", *Journal of the ACM* 32(3), 1985, pp. 652–686. One of the most influential data
> structures papers ever written, and the origin of the **amortized potential-function method** as
> a standard analysis technique.

Their answer is the **splay tree**, and its design is startling:

- **No balance invariant.** At any moment the tree may be a degenerate chain of *n* nodes.
- **No metadata.** No colour bit, no balance factor, no height, no priority. A node is a key and
  two pointers. This is the *only* structure in this volume with zero space overhead beyond a
  plain BST.
- **Restructure on every access** — including every *read*. Whatever node you touch is rotated all
  the way to the root by a specific procedure called **splaying**.
- The guarantee is **amortized**, not worst-case: any sequence of *m* operations costs
  O((*m* + *n*) log *n*). A single operation may cost Θ(*n*).

The motivating observation is empirical rather than theoretical. Real access patterns are almost
never uniform:

- 90% of requests hit 10% of the keys.
- A network router forwards a burst of packets to the same destination.
- A compiler's symbol table looks up the same identifiers repeatedly within a scope.
- A cache, a working set, a loop, a session — all temporally clustered.

A balanced tree treats every key identically: whether a key is requested a million times a second
or never, it sits at depth log *n*. **That is optimal for uniform access and leaves a lot on the
table for skewed access.** If 10 keys receive 90% of traffic, they should live near the root, at
depth ~3, not at depth 20.

The splay tree's bet: **move whatever you touch to the root, and the access pattern will sort the
tree for you** — with no statistics gathered, no frequencies counted, and no configuration.

## 12.2 Why naive move-to-root fails — and this is the crux

The obvious implementation is: rotate the accessed node up one level at a time until it is the
root. This is **move-to-root**, analyzed by Allen and Munro in 1978, and **it does not work.**
Not "works less well" — it fails to give any useful bound.

Watch it fail concretely. Take the degenerate left chain of 7 nodes (root 7, deepest 1) and access
node 1 by repeated single rotations from the bottom:

```
BEFORE                 after rotating 1 up, one level at a time...          AFTER
 7                                                                          1
 |                                                                           \
 6                                                                            7
 |                                                                           /
 5                                                                          6
 |                        (six single rotations)                           /
 4                       ─────────────────────►                           5
 |                                                                       /
 3                                                                      4
 |                                                                     /
 2                                                                    3
 |                                                                   /
 1                                                                  2

internal path length = 0+1+2+3+4+5+6 = 21          path length = 0+1+2+3+4+5+6 = 21
```

**The path length is unchanged.** Node 1 is at the root now, but the other six nodes are still a
chain of depth 6. So the very next access — to node 2, at depth 6 — costs 6 again, and moving *it*
to the root reproduces the same shape with 2 on top. **Accessing 1, 2, 3, 4, … in order costs
Θ(n) per operation, forever.** Move-to-root did real work and achieved nothing structural.

Now splay the same tree with the correct procedure. The difference is one detail: for a
**zig-zig** configuration (node, parent and grandparent all leaning the same way), splay rotates
the **grandparent first**, then the parent — the *opposite order* from move-to-root.

```
Chain: 7←6←5←4←3←2←1.  splay(1) with zig-zig steps, bottom-up:

STEP 1: (1, 2, 3) is left-left → rotate at 3, then at 2

     7                7
     |                |
     6                6
     |                |
     5                5
     |                |
     4      ───►      4
     |                |
     3                1
     |                 \
     2                  2
     |                   \
     1                    3

STEP 2: (1, 4, 5) is left-left → rotate at 5, then at 4

     7                     7
     |                     |
     6                     6
     |                     |
     5        ───►         1
     |                      \
     4                       4
     |                      / \
     1                     2   5
      \                     \
       2                     3
        \
         3

STEP 3: (1, 6, 7) is left-left → rotate at 7, then at 6

     7                              1
     |                               \
     6         ───►                   6
     |                               /  \
     1                              4    7
      \                            / \
       4                          2   5
      / \                          \
     2   5                          3
      \
       3

FINAL: depths → 1:0, 6:1, 4:2, 7:2, 2:3, 5:3, 3:4
       internal path length = 0+1+2+2+3+3+4 = 15    (was 21)
       height = 4                                    (was 6)
```

**The whole access path got shallower, not just the accessed node.** Depth 6 became depth 4, and
the path length dropped from 21 to 15. Do it again and it drops further. That is the property
move-to-root lacked, and it is what the amortized bound is built on.

> **The one-sentence version, worth memorizing:** *move-to-root* relocates the accessed node;
> *splaying* **roughly halves the depth of every node on the access path**. The difference is
> entirely in the order of the two rotations in the zig-zig case.

## 12.3 The three splay steps

Let *x* be the accessed node, *p* its parent, *g* its grandparent. Repeat until *x* is the root:

### Zig — *x*'s parent is the root

One rotation. Only happens at most once, at the very end, when the path length is odd.

```
      p                x
     / \              / \
    x   C    ───►    A   p
   / \                  / \
  A   B                B   C
```

### Zig-zig — *x* and *p* are the same-side children

Both left children (or both right). **Rotate at *g* first, then at *p*.**

```
        g                    p                     x
       / \                  / \                   / \
      p   D   rotate(g)    x   g    rotate(p)    A   p
     / \      ────────►   / \ / \   ────────►       / \
    x   C                A  B C  D                 B   g
   / \                                                / \
  A   B                                              C   D
```

Compare to move-to-root, which would rotate at *p* first, then at *g*, and end with
*x* → *p* → *g* still forming a chain. **The order is the entire difference.**

### Zig-zag — *x* and *p* are opposite-side children

*x* is a right child and *p* is a left child, or vice versa. Rotate at *p*, then at *g*. (Here the
order does not matter as much; this is the same double rotation as AVL's LR case, §10.4.)

```
       g                       g                       x
      / \                     / \                    /   \
     p   D    rotate(p)      x   D   rotate(g)      p     g
    / \       ────────►     / \     ────────►      / \   / \
   A   x                   p   C                   A   B C   D
      / \                 / \
     B   C               A   B
```

**Bottom-up, always.** Splaying starts at *x* and works upward. (A top-down variant exists and is
what most production implementations actually use, since it avoids needing parent pointers, but the
bottom-up version is the one to understand.)

### Every operation is built from splay

```
search(k):   descend to k (or to where it would be); splay that node to the root.
             → even a FAILED search restructures the tree.

insert(k):   BST-insert as a leaf, then splay the new node to the root.

delete(k):   splay k to the root; now k has two subtrees L and R.
             Remove k, splay the maximum of L to L's root
             (that node then has no right child), and attach R there.

join(L, R):  splay L's maximum to L's root; attach R as its right child.  O(log n) amortized.
split(k):    splay k to the root; detach the two subtrees.               O(log n) amortized.
```

Note that `split` and `join` are trivially cheap here, which is a genuine advantage over AVL and
red-black trees where both are fiddly. Treaps share this property (§13.7).

## 12.4 The amortized analysis, in outline

The full proof is a page of algebra; the *idea* is what transfers, and it introduced a technique
you will use elsewhere.

Define the **size** *s*(*x*) as the number of nodes in *x*'s subtree, and the **rank**
*r*(*x*) = log₂ *s*(*x*). Define the tree's **potential**:

$$
\Phi(T) = \sum_{x \in T} r(x) = \sum_{x \in T} \log_2 s(x)
$$

Potential is high when the tree is deep and spindly (many nodes have large subtrees beneath them)
and low when it is bushy. Amortized cost is defined as actual cost plus the change in potential:

$$
\text{amortized cost} = \text{actual cost} + \Delta\Phi
$$

**Access Lemma (Sleator–Tarjan).** The amortized cost of splaying node *x* in a tree with root *t*
is at most

$$
3\big(r(t) - r(x)\big) + 1
$$

Since *r*(*t*) = log₂ *n* and *r*(*x*) ≥ 0, this is at most **3 log₂ *n* + 1** — amortized
O(log *n*) per operation.

**Why it works, informally.** Each zig-zig or zig-zag step does O(1) actual work. The step also
changes the subtree sizes of *x*, *p*, *g*. The algebra turns on the **concavity of the
logarithm**: if *a* + *b* ≤ *c*, then log *a* + log *b* ≤ 2 log *c* − 2. So when a splay step
splits a large subtree into two smaller ones, the sum of their ranks is *strictly less* than you
might expect — and that deficit is potential released, which pays for the work. **Deep, unbalanced
regions carry high potential; splaying through them cashes it in.**

And now the connection back to §12.2: this argument requires that the step **reduce the depth of
the whole path**, which is exactly what zig-zig does and what two successive zigs do not. Run the
same analysis on move-to-root and the potential does not drop enough to pay for the work. The
proof fails precisely where the algorithm fails.

## 12.5 What you get: four theorems, and one famous open problem

The amortized O(log *n*) bound is the least interesting thing about splay trees. The remarkable
results are about *adaptivity*.

**Balance Theorem.** *m* accesses take O(*m* log *n* + *n* log *n*). No worse than a balanced tree,
asymptotically.

**Static Optimality Theorem.** If item *i* is accessed *q*ᵢ times out of *m* total, the total cost
is

$$
O\left(m + \sum_i q_i \log \frac{m}{q_i}\right)
$$

That expression is *m* times the **entropy** of the access distribution — and it is, up to a
constant factor, **the cost of the optimal static binary search tree for those frequencies.**

Sit with that. Building the optimal static BST requires knowing all the frequencies in advance and
running a dynamic-programming algorithm (Knuth's O(*n*²) construction). **A splay tree matches it
to within a constant factor while knowing nothing** — no frequencies, no counters, no
configuration, no second pass. The access pattern configures the structure by being executed.

**Static Finger Theorem.** For any fixed "finger" item *f*, the cost of accessing item *i* is
O(log(|*i* − *f*| + 1)) amortized — accesses near a fixed point are cheap.

**Working Set Theorem.** The amortized cost of accessing item *i* is O(log *t*ᵢ), where *t*ᵢ is the
number of **distinct** items accessed since *i* was last accessed.

This last one is the most practically meaningful. If your working set is 50 items out of a million,
your accesses cost ~log₂(50) ≈ 6, not log₂(10⁶) = 20. **A splay tree is, for free, a cache-aware
structure with an LRU-flavoured cost model.** Nothing in the design says "cache"; it emerges.

### The Dynamic Optimality Conjecture — still open after forty years

Sleator and Tarjan conjectured something much stronger: that splay trees are within a constant
factor of **any** binary search tree algorithm, including one that knows the entire access sequence
in advance and rearranges optimally.

**This is still unproven.** It is one of the best-known open problems in data structures.

> **Confidence: high that it remains open as of my knowledge; high on Tango trees.** The best known
> progress is **Tango trees** (Demaine, Harmon, Iacono and Pătraşcu, 2004), which are provably
> O(log log *n*)-competitive with the offline optimum — not constant, but a long way from
> O(log *n*). Volume 6's frontier section returns to this.

## 12.6 What you pay, and why splay trees are rare in production

The costs are severe, and they are all consequences of one design decision.

### Every read is a write

This is the fatal one, and it cascades:

| Consequence | Why it matters |
|---|---|
| **Cannot be used concurrently by readers** | Two threads reading different keys both restructure the tree. Any lock-free or read-mostly scheme is impossible; readers need *exclusive* locks. Volume 5 explains why this is disqualifying for most systems. |
| **Cannot live in read-only memory** | No `const` trees, no memory-mapped shared structures, no immutable snapshots. |
| **Dirties cache lines on reads** | A read-only workload still generates memory writes, defeating shared caches and (on multicore) causing cache-line ping-ponging between cores. |
| **Incompatible with copy-on-write / persistence** | Volume 5's immutable trees rely on reads not mutating. |
| **Terrible for replicated or logged structures** | Every read would generate a write-ahead log record (Volume 5 §crash safety). |

> **A real-world illustration — confidence: moderate.** The Windows NT memory manager historically
> used splay trees to index Virtual Address Descriptors, and (as I recall from *Windows Internals*)
> switched to AVL trees in a later version, with concurrency being a principal motivation:
> splay's read-mutates-structure behaviour forces exclusive locking on lookups. I would verify the
> specifics before repeating them as fact, but the *reason* is exactly the one above and it is a
> textbook case of the trade-off biting.

### No worst-case bound on a single operation

Accessing the deepest node of a degenerate splay tree costs Θ(*n*). The amortized bound says this
cannot happen often — but "not often" is no comfort if you have a p99.9 latency budget. Amortized
guarantees smooth over exactly the spikes that SLOs are written about. (Volume 1 §1.3 made the same
point about dynamic array resizing; it is a recurring theme.)

### Higher constant factors

Splaying does 2–3× the rotations of a balanced tree's update path, on *every* operation including
reads. Even when the amortized bound holds, the constant is worse.

### The upside, restated fairly

- **Zero metadata.** The smallest possible node: key + two pointers. On a 24-byte node that is a
  real saving against red-black's (packed) colour or AVL's height field.
- **Simple to implement correctly.** There is no deletion case analysis, no double-black debt, no
  eight-branch fixup. Compare §11.6. For hand-written code, this genuinely matters.
- **Adaptive for free**, per §12.5.
- **`split` and `join` are trivial**, unlike in AVL or red-black trees.

## 12.7 Where splay trees actually get used

> **Confidence: moderate on specifics; high on the categories.**

- **GCC** ships `splay-tree.c` in `libiberty` and uses splay trees for various internal tables.
  A compiler is single-threaded over a given translation unit and has strongly clustered access
  patterns — a good fit.
- **Link-cut trees** (Sleator & Tarjan, same era) use splay trees as their core component, to
  represent dynamically changing forests. These are the standard tool for dynamic connectivity and
  appear inside advanced maximum-flow algorithms. This may be splay trees' most important
  application: not as a map, but as a *component of a more powerful structure*.
- **Competitive programming**, heavily — especially "implicit splay trees" over sequences, where
  `split`/`join` cheapness is the point.
- **Some memory allocators** and specialized caches, where the working-set behaviour is exactly
  what you want.

**The honest summary:** splay trees are theoretically gorgeous, practically niche, and their
niche is defined precisely by the absence of concurrent readers. They are also the reason the
amortized potential method is a standard tool, which is arguably a larger contribution than the
structure itself.

---

# Chapter 13 — Treaps: Do Not Enforce Balance; Make Imbalance Improbable

## 13.1 The fourth philosophy

Recap the three so far:

1. **AVL:** enforce a tight invariant. Pay on writes. Shortest trees.
2. **Red-black:** enforce a loose invariant. Bound the *rotations*. Cheaper writes.
3. **Splay:** enforce nothing; repair opportunistically on access. Adaptive, but every read writes.

The fourth is different in kind. Recall §9.5's diagnosis: a plain BST's shape is determined by the
insertion order, and the adversary (or reality) controls the insertion order. §7.3 showed that a
*random* order essentially never produces a bad shape — the probability of a degenerate tree at
*n* = 20 is about 2 × 10⁻¹³.

So the plain BST's average case is excellent. **The only problem is that we do not get to choose
the order.**

The treap's answer: **stop caring about the order the keys arrive in. Attach a random number to
each key and let the tree behave as if the keys had arrived in *that* random order.**

> **History — confidence: moderate-to-high.** The structure — a binary tree simultaneously ordered
> by one attribute and heap-ordered by another — was described by **Jean Vuillemin** in 1980 ("A
> unifying look at data structures", *CACM*) under the name **Cartesian tree**. Its use as a
> *randomized* search tree, and the name **treap** (tree + heap), are due to **Cecilia Aragon and
> Raimund Seidel**, "Randomized search trees", FOCS 1989, with an expanded journal version in
> *Algorithmica* 1996. So the shape predates the idea of randomizing it by about a decade — a
> common pattern in this field.

## 13.2 The structure

Every node stores its **key** and a **priority**, assigned at insertion from a random source
(commonly a 32- or 64-bit random integer).

> **Treap invariants.**
> **1. BST property on keys:** left subtree keys < node key < right subtree keys.
> **2. Max-heap property on priorities:** every node's priority ≥ both children's priorities.

Two orderings, on two different attributes, in one structure. Example:

```
                    ┌──────────┐
                    │  20 (40) │            key (priority)
                    └────┬─────┘
                          \
                     ┌──────────┐
                     │  50 (20) │
                     └────┬─────┘
                     ┌────┴─────┐
              ┌──────────┐  ┌──────────┐
              │  30 (15) │  │  70 (5)  │
              └────┬─────┘  └──────────┘
                    \
               ┌──────────┐
               │  40 (10) │
               └──────────┘

BST on keys:       in-order = 20, 30, 40, 50, 70   ✔ sorted
Max-heap on prio:  40 ≥ 20 ✔;  20 ≥ 15, 20 ≥ 5 ✔;  15 ≥ 10 ✔
```

## 13.3 The theorem that makes it work

Everything about treaps follows from one fact, and it is worth proving because the proof is three
lines and the consequence is enormous.

> **Uniqueness Theorem.** For a set of (key, priority) pairs with all keys distinct and all
> priorities distinct, there is **exactly one** treap. Moreover, it is **identical to the BST you
> would obtain by inserting the keys in decreasing order of priority.**

**Proof.** By the heap property, the node with the highest priority must be the root — it cannot be
anyone's child. By the BST property, its key then partitions all remaining keys into those that
must go left and those that must go right. Both subsets are themselves sets of (key, priority)
pairs, so recurse. At every step the choice is forced. Hence the treap is unique. And the
construction just described — take the highest priority first, then partition — is exactly what
BST insertion in decreasing-priority order does. ∎

**Now chain it with §7.4.** Assign priorities uniformly at random. Then "decreasing order of
priority" is a **uniformly random permutation** of the keys. Therefore:

> **A treap's shape is distributed exactly as the shape of a BST built from a uniformly random
> insertion order — no matter what order the keys were actually inserted in.**

And §7.4 gave us those numbers:

| | Treap with random priorities |
|---|---|
| Expected depth of a node | ≈ 2 ln *n* ≈ **1.39 log₂ *n*** |
| Expected height | ≈ 4.311 ln *n* ≈ **2.99 log₂ *n*** |
| Expected search / insert / delete | **O(log *n*)** |
| Probability of height > *c* log *n* | falls off **polynomially** in *n* for suitable *c* |

We have converted the plain BST's *average case over inputs* into a *guarantee that holds for
every input, in expectation over our own coin flips.* That is the whole trick, and it is worth
stating as sharply as possible:

> **The adversary controls the keys and their arrival order. The adversary does not control the
> priorities. Since the shape depends only on the priorities, the adversary cannot influence the
> shape at all.**

This is exactly the structure of the fix for hash flooding (§9.5): the attacker controls the keys,
so you randomize the *hash function* with a secret seed, and the attacker can no longer aim.
Same disease, same cure, different structure. Note the one caveat that carries over too: your
random source must not be predictable. A treap seeded from a fixed constant, or from a weak PRNG
whose state an attacker can infer, is back to being aimable.

## 13.4 Insertion

Two phases, and no case analysis at all:

```
def treap_insert(root, k):
    node = Node(k, priority = random())
    root = bst_insert_as_leaf(root, node)          # phase 1: ordinary BST insert
    # phase 2: bubble up while the heap property is violated
    while node.parent and node.priority > node.parent.priority:
        if node is node.parent.left: rotate_right(node.parent)
        else:                        rotate_left(node.parent)
    return new_root
```

Phase 1 establishes the BST property. Phase 2 restores the heap property by rotating the node
upward — and §9.7 proved that **rotations preserve the in-order traversal**, so phase 2 cannot
break what phase 1 established. The two invariants do not fight each other, which is why there is
no case table.

**Expected rotations per insertion is O(1)** — in fact less than 2 on average. Compare AVL's
Θ(log *n*) rotations per *deletion*.

> **Confidence: moderate on the constant, high on the O(1).** The expected number of rotations
> per treap insertion or deletion being bounded by a small constant is a standard result from
> Aragon & Seidel; I recall the bound as "fewer than 2" and would check the exact statement.

### Worked example — insert key 35 with priority 50

Into the treap from §13.2. Priority 50 is higher than everything present, so 35 must end up at the
root — which means the rotations will carry it all the way up.

```
PHASE 1 — ordinary BST insert of 35:
  35 > 20 → right → 50;  35 < 50 → left → 30;  35 > 30 → right → 40;  35 < 40 → left of 40.

                  20 (40)
                        \
                        50 (20)
                       /       \
                 30 (15)       70 (5)
                        \
                        40 (10)
                        /
                  35 (50)      ← heap violated: 50 > 10
```

```
PHASE 2, rotation 1 — 35 is the LEFT child of 40 → rotate_right(40):

                  20 (40)
                        \
                        50 (20)
                       /       \
                 30 (15)       70 (5)
                        \
                        35 (50)
                              \
                              40 (10)
                                          heap still violated: 50 > 15
```

```
PHASE 2, rotation 2 — 35 is the RIGHT child of 30 → rotate_left(30):

                  20 (40)
                        \
                        50 (20)
                       /       \
                 35 (50)       70 (5)
                /       \
          30 (15)       40 (10)
                                          still violated: 50 > 20
```

```
PHASE 2, rotation 3 — 35 is the LEFT child of 50 → rotate_right(50):

                  20 (40)
                        \
                        35 (50)
                       /       \
                 30 (15)       50 (20)
                               /      \
                        40 (10)       70 (5)
                                          still violated: 50 > 40
```

```
PHASE 2, rotation 4 — 35 is the RIGHT child of 20 → rotate_left(20):

                        35 (50)
                       /        \
                20 (40)          50 (20)
                       \        /       \
                 30 (15)  40 (10)       70 (5)

VERIFY:
  BST:  in-order = 20, 30, 35, 40, 50, 70                        ✔ sorted
  Heap: 35(50) ≥ 20(40) ✔ and ≥ 50(20) ✔
        20(40) ≥ 30(15) ✔
        50(20) ≥ 40(10) ✔ and ≥ 70(5) ✔                          ✔ valid treap
```

**And now confirm the Uniqueness Theorem empirically.** Sort the six nodes by decreasing priority
and insert them into a plain BST in that order: 35(50), 20(40), 50(20), 30(15), 40(10), 70(5).

```
35 → root
20 → 20 < 35 → left of 35
50 → 50 > 35 → right of 35
30 → 30 < 35 → left to 20; 30 > 20 → right of 20
40 → 40 > 35 → right to 50; 40 < 50 → left of 50
70 → 70 > 35 → right to 50; 70 > 50 → right of 50

                        35
                       /   \
                    20      50
                      \    /   \
                      30  40    70
```

**Identical to the treap we built by rotation.** The theorem is not an abstraction; the structure
really is "the BST for the priority order", however you got there.

## 13.5 Deletion — two ways, both easy

Compare §11.6's double-black debt. Treap deletion has no case analysis whatsoever.

**Method 1 — rotate down to a leaf, then remove.** The target must go somewhere; rotate it
downward, always promoting the child with the **higher** priority (which keeps the heap property
intact above), until the target is a leaf. Then delete it.

```
def treap_delete(node):
    while not is_leaf(node):
        if node.right is None or (node.left and node.left.priority > node.right.priority):
            rotate_right(node)        # promote the left child
        else:
            rotate_left(node)         # promote the right child
    detach(node)
```

**Method 2 — the "−∞ priority" trick.** Set the node's priority to −∞ and sift it down. Same
effect, but it makes the framing clear: *a node with the lowest possible priority belongs at the
bottom*, so the heap property itself drives it there. Once it is a leaf, remove it.

Either way: **expected O(log *n*) rotations, no cases, no debt, no eight-branch fixup.** For
hand-written code this is a decisive practical advantage — the number of published, shipped,
subtly-wrong red-black deletion implementations is not small.

## 13.6 Split and join: the treap's real superpower

Priorities give you two operations that are painful in AVL and red-black trees and nearly free
here.

**`split(T, k)` → (L, R)** where L holds all keys < *k* and R all keys ≥ *k*:

Insert a sentinel node with key *k* and priority **+∞**. By the heap property it becomes the root.
By the BST property its left subtree is exactly L and its right subtree is exactly R. Detach both
and discard the sentinel. **O(log *n*) expected.**

**`join(L, R)`** where every key in L < every key in R:

The inverse. Create a temporary root with priority −∞, hang L and R from it, then delete it by
sifting down (§13.5).

```
       split(T, k):                              join(L, R):

    insert (k, +∞) → it rises to the root      create root with priority −∞
                                                       (−∞)
              (k, +∞)                                 /     \
              /      \                              L        R
        L               R
                                                then sift the −∞ node down
       detach → done                             and remove it → done
```

Both are O(log *n*) and both are about ten lines. In a red-black tree, `split` and `join` are
real algorithms with real case analysis.

### Implicit treaps: sequences instead of keys

Here is where it gets genuinely powerful. Replace the key with **the node's position in the
in-order sequence**, computed from subtree sizes stored at each node. There are now no keys at all
— the tree represents a *sequence*, and the "search key" is an index.

You get, all in O(log *n*) expected:

- insert at position *i*
- delete at position *i*
- **split** the sequence at position *i*
- **concatenate** two sequences
- **reverse** a range (with a lazy flag propagated down)
- range aggregates (sum, min, max) over a positional interval

That is a **rope** — the structure text editors use so that inserting a character in the middle of
a 100 MB file does not memmove 50 MB (Volume 1 §1.4's problem, solved). It is also why implicit
treaps are a staple of competitive programming.

## 13.7 Descendants and relatives

**Skip lists** (William Pugh, 1989 — Volume 1 §1.9) are the same philosophy in list form:
randomize node heights instead of enforcing a balance invariant. They are widely used precisely
because randomization also makes *concurrent* implementations far simpler than balanced trees —
there is no rebalancing to coordinate. Redis's sorted sets and LevelDB's in-memory write buffer
use them. Volume 5 returns to this.

**Zip trees** (Tarjan, Levy and Timmel, 2019) unify the two: a binary search tree whose
rebalancing is expressed as "zip" and "unzip" operations driven by random ranks drawn from a
geometric distribution. They achieve the same bounds as treaps with less state and arguably
simpler code. *(Confidence: high on existence and authors; moderate on the year.)*

**Randomized binary search trees** (Martínez and Roura, 1998) achieve the same shape distribution
*without* storing priorities, by using subtree sizes to make randomized decisions during insertion.
They trade stored randomness for computed randomness.

## 13.8 Where treaps fit

**Use a treap when:**

- **You need `split`/`join`, or you need sequence operations** (ropes, implicit treaps). This is
  the strongest reason — nothing else in this volume comes close.
- **You are writing it by hand and correctness matters more than the last 10%.** Treap deletion is
  ten lines; red-black deletion is a hundred and is where bugs live.
- **Input may be adversarial and you want a simple defence** (§13.3).
- **You want expected-case guarantees without worst-case machinery.**

**Do not use a treap when:**

- **You need a hard worst-case bound.** A treap *can* be a chain; it is merely astronomically
  unlikely. If you must guarantee latency rather than expect it, use red-black or AVL.
- **Space is very tight.** The priority costs 4–8 bytes per node — more than AVL's balance factor
  and much more than red-black's pointer-packed colour bit (§11.8).
- **Your randomness is predictable.** A weak or fixed-seed PRNG hands the adversary back the
  ability to aim.

---

# Chapter 14 — Comparison, and What This Volume Was Really About

## 14.1 The comparison table

Complexities are for a tree of *n* nodes. "Metadata" is per-node overhead beyond a key and two
child pointers.

| | Plain BST | AVL | Red-black | Splay | Treap |
|---|---|---|---|---|---|
| **Search** | O(*n*) worst<br>O(log *n*) if random input | **O(log *n*) worst** | **O(log *n*) worst** | O(log *n*) **amortized**<br>O(*n*) single op | O(log *n*) **expected**<br>O(*n*) worst |
| **Insert** | O(*n*) worst | **O(log *n*) worst** | **O(log *n*) worst** | O(log *n*) amortized | O(log *n*) expected |
| **Delete** | O(*n*) worst | **O(log *n*) worst** | **O(log *n*) worst** | O(log *n*) amortized | O(log *n*) expected |
| **Height bound** | *n* − 1 | **1.44 log₂ *n*** | 2 log₂ *n* | unbounded | ≈ 3 log₂ *n* expected |
| **Rotations / insert** | 0 | ≤ 2 | ≤ 2 | O(depth), every access | O(1) expected |
| **Rotations / delete** | 0 | **Θ(log *n*)** | **≤ 3** | O(depth) | O(log *n*) expected |
| **Metadata / node** | **none** | 2 bits – 4 bytes | **1 bit** (packable into a pointer) | **none** | 4–8 bytes (priority) |
| **Reads mutate?** | no | no | no | **YES** | no |
| **Concurrent readers?** | fine | fine | fine | **impossible** | fine |
| **`split` / `join`** | hard | hard | hard | **easy** | **easy** |
| **Adapts to access skew?** | no | no | no | **YES** | no |
| **Implementation difficulty** | trivial | moderate | **hard** (deletion) | easy | **easy** |
| **Worst case is adversary-reachable?** | **yes** | no | no | per-op yes | **no** (randomized) |

### Best fit

| Structure | Use it when |
|---|---|
| **Plain BST** | Never in production, unless you can prove the input is randomly ordered. Excellent for teaching. |
| **AVL** | Read-dominated workloads. In-memory indexes over near-static data. Where the ~44% height advantage is measurable. |
| **Red-black** | The general-purpose default. Mixed reads and writes, frequent deletion, worst-case bounds needed, concurrent readers, stable iterators. Hence `std::map`, `TreeMap`, the Linux kernel. |
| **Splay** | Strongly skewed access, single-threaded, no latency SLO. As a *component* of link-cut trees. When you need zero metadata. |
| **Treap** | When you need `split`/`join` or sequence operations (ropes). When you are hand-writing it. When adversarial input is a concern and expected-case bounds suffice. |

## 14.2 The four philosophies, which is the real content of this volume

Strip away the mechanisms and there are only four distinct answers to §9's problem, plus one that
Volume 3 will supply.

**1. Enforce a tight invariant. — AVL**
Check balance after every update; restore it immediately. Tightest height, most rebalancing work,
worst deletion behaviour. *Pay on writes, win on reads.*

**2. Enforce a loose invariant. — Red-black**
Accept a weaker balance condition, chosen so that the *propagating* repair case needs no rotation
and the *rotating* repair cases cannot propagate. Taller trees, bounded structural change, stable
iterators, safe for concurrent readers. *Pay a little on both, win on predictability.*

**3. Enforce nothing; repair opportunistically. — Splay**
No invariant, no metadata. Restructure the access path on every touch. Adaptive to skew, provably
near-optimal against a static competitor, and every read becomes a write.
*Pay on reads, win on locality.*

**4. Enforce nothing; make the bad case improbable. — Treap**
No invariant. Attach randomness the adversary cannot control, so the shape distribution is the
good one regardless of input. Expected rather than worst-case bounds, trivial code, cheap
`split`/`join`. *Pay a little space, win on simplicity and adversary-resistance.*

**5. Change the node so the tree cannot get tall. — B-trees, Volume 3**
None of the above touches the *fanout*. All four accept "binary" and manage shape within that
constraint. Volume 3's move is different: increase the number of children per node from 2 to
several hundred, so height collapses from log₂ *n* to log₄₀₀ *n* — from 30 levels to 4 for a
billion keys — and the balance problem becomes almost incidental by comparison.

That fifth answer is not a competitor to the first four; it operates on a different axis. And
§7.1 explained why it is pointless in RAM (fanout does not reduce comparisons) and §11.2 has
already shown you a B-tree in disguise. Volume 3 is about the environment in which that axis
becomes the only one that matters.

## 14.3 Three transferable lessons

**Slack is the design variable.** §10.3's Fibonacci height bound came directly from choosing ±1 as
the permitted imbalance. Red-black's 2 log *n* came from choosing a looser condition. The
structures differ not in cleverness but in **how much deviation from perfect they tolerate**, and
tolerance buys cheaper repair. This dial exists in almost every self-maintaining system — B-tree
fill factors, load factors in hash tables, watermarks in queues, replication lag bounds. Whenever
you see a system that must maintain a property under continuous modification, look for the slack
parameter; it is where the trade-off is encoded.

**The right question about a repair operation is not "how expensive is it?" but "can it
propagate?"** §11.5's key insight — that red-black's propagating case does no rotations and its
rotating cases cannot propagate — is what bounds structural change at a constant. AVL deletion is
expensive for precisely the opposite reason: its repair can both rotate *and* propagate.
Separating "does work" from "triggers more work" is a general analytical move.

**Guarantees come in four flavours and they are not interchangeable.** This volume gave you one of
each:

| Flavour | Structure | What it promises | What it does not |
|---|---|---|---|
| **Worst case** | AVL, red-black | Every operation, always | Nothing about typical performance |
| **Amortized** | Splay | The *sequence* is fast | Any *individual* operation may be slow |
| **Expected** | Treap | Fast on average over *our* coin flips | Nothing certain about any single run |
| **Average case** | Plain BST | Fast if input is randomly ordered | Anything, if input is sorted or chosen by an adversary |

The last is the weakest and the one most often quoted as if it were the first. An average-case
bound is a claim about the *input distribution*, and §9.5 showed the input distribution is
sometimes chosen by someone who wants you to fail. **Amortized and expected bounds are real
guarantees; average-case bounds are assumptions.** Knowing which flavour you have is the
difference between a system that degrades gracefully and one that falls over on a Tuesday.

---

# Volume 2 is complete

**File: `volume-2-binary-tree-family.md`** — ready.

## What Volume 3 will cover: CROSSING THE MEMORY WALL — B-TREES AND DISK STRUCTURES

Volume 2 solved the shape problem within the binary constraint. Volume 3 removes the constraint,
because the environment changes and makes it untenable. Volume 1 §6.6 previewed the numbers; now
we take them seriously.

- **The actual physics.** Real latency figures for L1, L2, L3, RAM, NVMe, SATA SSD, spinning disk
  and network storage — then the derivation of why **minimizing access count beats minimizing
  comparison count** once you cross into disk-latency territory, and why every structure in
  Volume 2 becomes the wrong answer at that point.
- **The history.** Rudolf Bayer and Edward McCreight at Boeing Research Labs, the original problem
  (maintaining large indexed sequential files), and the 1972 paper. Bayer will be a familiar name
  by then — §11.1.
- **B-tree formal mechanics.** Order and degree (and untangling the terminology hazard flagged in
  Volume 1 §3.4), minimum and maximum keys per node, the invariant that keeps all leaves at equal
  depth, the height formula derived, and the arithmetic showing how brutally high fanout crushes
  tree height at millions and billions of keys.
- **Search, insert, delete** — with the split derived from first principles: why the median, why
  splits cascade upward, and the root-split case that is the only thing that makes the tree
  taller. Then deletion's borrow-from-sibling and merge cases, each derived from the invariant
  that would break without it.
- **B+-trees.** Why plain B-trees are insufficient for range queries and sequential scans, the
  refinement of pushing all records to the leaves and linking them, and why this became the
  near-universal choice for databases and filesystems.
- **Variants and their niches.** B\*-trees (higher fill factor via 2-to-3 splits), Bε-trees
  (write-optimized, buffered messages — TokuDB, BetrFS), and **LSM-trees** as a sibling lineage
  solving the same problem in the opposite direction: why write-heavy workloads favour append-only
  log-structured merges over in-place B-tree updates, with Cassandra, RocksDB and LevelDB as the
  worked examples. Volume 1 §1.4 already hinted at this when it noted that the way to make a
  sorted array work is to stop inserting into it.

Say **continue** when you would like me to start Volume 3.

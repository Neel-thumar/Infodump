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


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


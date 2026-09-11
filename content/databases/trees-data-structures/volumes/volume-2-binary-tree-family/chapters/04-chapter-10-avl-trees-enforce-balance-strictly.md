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


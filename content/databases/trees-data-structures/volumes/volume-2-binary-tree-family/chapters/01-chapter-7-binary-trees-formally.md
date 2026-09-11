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


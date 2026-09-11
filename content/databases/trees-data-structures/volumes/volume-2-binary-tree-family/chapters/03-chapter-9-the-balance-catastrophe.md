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


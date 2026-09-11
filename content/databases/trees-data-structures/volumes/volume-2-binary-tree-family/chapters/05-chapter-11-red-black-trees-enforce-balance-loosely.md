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


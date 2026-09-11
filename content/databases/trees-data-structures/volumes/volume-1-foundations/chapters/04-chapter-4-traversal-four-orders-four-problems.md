# Chapter 4 — Traversal: Four Orders, Four Problems

"Traversal" means visiting every node exactly once. Since there are *n* nodes and you must visit
each one, every traversal is Θ(*n*) and no order is faster than another. So why does anyone care
which order?

Because for a large class of real problems, **exactly one order produces a correct answer and the
others produce garbage, corruption, or a crash.** The orders are not stylistic options. They are
answers to a question about dependency: *what must be true before I can process this node?*

That is the frame for this chapter. For each order, I will give you a problem where that order is
**forced** — where choosing another one is not merely slower but wrong.

## 4.1 There is only one walk; the orders are three viewpoints on it

Before the four orders, the unifying picture. Imagine tracing the outline of a tree with a pencil,
never lifting it, keeping the tree on your left:

```
                        start ↓
                          ┌───┐
             ┌────────────│ A │◄───────────┐
             │   1st      └───┘     3rd    │
             ▼            ▲   ▲            │
          ┌───┐     2nd   │   │            │
     ┌────│ B │───────────┘   └────────┐   │
     │1st └───┘◄──┐                    │   │
     ▼   ▲        │                    ▼   │
  ┌───┐  │      ┌───┐               ┌───┐  │
  │ D │──┘      │ E │──┐            │ C │──┘
  └───┘         └───┘  │            └───┘
   (leaf: all         (leaf)         (leaf)
   three visits
   collapse)
```

Walking this outline, you pass each **internal** node three times:

1. **On the way down into it**, before any of its children.
2. **Between** its children (for a binary node: after the left subtree, before the right).
3. **On the way back up out of it**, after all of its children.

This single walk is called an **Euler tour** of the tree, and here is the punchline:

> **Pre-order, in-order, and post-order are not three different walks. They are the same walk,
> recording the node at visit #1, visit #2, or visit #3 respectively.**

That is why the three are so structurally similar in code — they differ by *one line's position*:

```
def traverse(node):
    if node is None: return
    # ── visit here → PRE-ORDER  (1st encounter)
    traverse(node.left)
    # ── visit here → IN-ORDER   (2nd encounter)
    traverse(node.right)
    # ── visit here → POST-ORDER (3rd encounter)
```

Move one statement, get a different algorithm. That is a rare thing in programming, and it is a
sign you are looking at something fundamental rather than incidental.

Level-order is the exception — it is genuinely a different walk, and §4.5 explains why that
difference is deeper than it looks.

## 4.2 Post-order: forced when children must be finished before the parent

**Visit order: all children (left to right), then the node itself.**

### The forcing problem: freeing a tree

You have a tree of heap-allocated nodes and you need to release all of them. Here is the obvious
code, and it is catastrophically wrong:

```c
void free_tree_WRONG(Node *n) {
    if (n == NULL) return;
    free(n);                      /* ← n's memory is now invalid */
    free_tree_WRONG(n->left);     /* ← reading n->left is use-after-free */
    free_tree_WRONG(n->right);    /* ← ditto, and n->right may be garbage */
}
```

The bug: the *only* way to reach the children is through the parent's pointers. Free the parent
and you have destroyed the map to everything below it. What you get is a **use-after-free**, which
means it will usually appear to work — the freed memory typically still contains the old pointer
values for a while — and then fail catastrophically and non-deterministically under memory
pressure or with a different allocator. This is a genuinely common bug and it is exactly the kind
that survives testing and dies in production.

The fix is not a matter of taste:

```c
void free_tree(Node *n) {
    if (n == NULL) return;
    free_tree(n->left);      /* children first */
    free_tree(n->right);
    free(n);                 /* parent last */
}
```

**Post-order is the only correct order here.** Pre-order corrupts memory. In-order corrupts memory
(it frees the parent while the right subtree is still unreached). Level-order would work only if
you first recorded all the pointers somewhere else — at which point you have used Θ(*n*) extra
space to avoid a Θ(1)-space traversal that was already available.

The same constraint appears everywhere resources nest: C++ destructors of member objects run
before the containing object's memory is reclaimed; `rm -r` must empty a directory before
`rmdir` can remove it, because POSIX `rmdir` fails on a non-empty directory; closing a database
connection pool means closing the connections first.

### Second example: aggregation, where the parent's value is a function of its children

Compute the total size of a directory tree — what `du` does:

```
size(node) = own_size(node) + Σ size(child) for each child
```

You cannot evaluate the left-hand side until every term on the right is known. The recursion
*must* bottom out at leaves and build upward. Post-order.

Worked example on the running tree, with `own_size` = 1 for every node:

```
Compute size(A):
  needs size(B), size(C), size(D)
    size(B) needs size(E), size(F)
      size(E) = 1                              ← leaf, resolved first
      size(F) needs size(H), size(I)
        size(H) = 1
        size(I) = 1
        size(F) = 1 + 1 + 1 = 3
      size(B) = 1 + 1 + 3 = 5
    size(C) = 1                                ← leaf
    size(D) needs size(G)
      size(G) = 1
      size(D) = 1 + 1 = 2
  size(A) = 1 + 5 + 1 + 2 = 9   ✔ (matches n = 9)

Resolution order:  E, H, I, F, B, C, G, D, A   ← exactly post-order
```

Every "height of a tree", "count the nodes", "is this subtree balanced", "sum of all values", and
"validate this subtree" function you will ever write is this same shape. **Post-order is the order
of *synthesis*: information flowing from the leaves up to the root.**

### Third example: expression evaluation

Take the expression tree for (3 + 5) × (10 − 4):

```
                    ┌───┐
                    │ × │
                    └─┬─┘
              ┌───────┴───────┐
            ┌─▼─┐           ┌─▼─┐
            │ + │           │ − │
            └─┬─┘           └─┬─┘
           ┌──┴──┐         ┌──┴──┐
         ┌─▼─┐ ┌─▼─┐     ┌─▼─┐ ┌─▼─┐
         │ 3 │ │ 5 │     │10 │ │ 4 │
         └───┘ └───┘     └───┘ └───┘
```

To apply `×` you need both operand *values*, so both subtrees must be fully evaluated first.
Post-order:

```
Visit:  3, 5, +, 10, 4, −, ×
Stack:  [3] [3,5] [8] [8,10] [8,10,4] [8,6] [48]
```

That visit sequence — `3 5 + 10 4 - *` — is **reverse Polish notation**, and the stack machine
above is how nearly every calculator, every stack-based VM, and every bytecode interpreter
evaluates arithmetic. RPN is not a quirky notation someone invented; it is literally the
post-order traversal of the expression tree, which is why it needs no parentheses: the tree
structure is recoverable from the sequence alone.

> **Forward reference.** This is also how a compiler emits code from an AST. Post-order emission
> yields instructions in an order where operands are computed before the operation that consumes
> them, which is exactly what a register or stack machine requires.

## 4.3 Pre-order: forced when the parent must exist before the children can be handled

**Visit order: the node itself, then all children (left to right).**

### The forcing problem: copying or serializing a tree

```
def copy(n):
    if n is None: return None
    m = Node(n.value)         # ← the parent must EXIST before
    m.left  = copy(n.left)    #   anything can be attached to it
    m.right = copy(n.right)
    return m
```

You cannot attach a child to a parent that has not been created. Post-order would require
building orphaned subtrees and holding them until their parent appears — which works, but it
inverts the natural dependency and is exactly the awkwardness that tells you you are fighting the
problem.

This becomes sharpest in **serialization**, where output is a stream and you cannot go back:

```
serialize(n):
    if n is None: emit("#"); return       # explicit null marker
    emit(n.value)
    serialize(n.left)
    serialize(n.right)
```

For the BST below,

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
   └─┬──┘ └────┘       └────┘ └────┘
     │
  ┌──▼─┐
  │ 10 │
  └────┘
```

the pre-order serialization is:

```
50 30 20 10 # # # 40 # # 70 60 # # 80 # #
```

And that string can be read back **left to right, in a single pass, with no lookahead and no
backtracking**: read 50, make it the root, recursively build its left subtree from what follows,
then its right. The reconstruction algorithm is the *same shape* as the serialization algorithm.
That property — a stream you can consume in one pass to rebuild the structure — is why pre-order
is the default choice for tree serialization formats. §6.7 works through which traversals have
this property and which do not.

### Second example: nested markup, where a parent must be opened before its children

```
render(n):
    emit("<" + n.tag + ">")        # pre:  open the parent
    for c in n.children:
        render(c)                  #       children nest inside
    emit("</" + n.tag + ">")       # post: close the parent
```

`<div>` must be written before its contents. HTML, XML, JSON, and every S-expression-based format
share this: **the opening token is a pre-order visit and the closing token is a post-order
visit of the same node.** Which is the Euler tour from §4.1, made textual. The indentation of
pretty-printed JSON is the depth of the node. The tree is right there in the whitespace.

### Third example, the one that shows the two orders in tension: recursive `chmod`

You want to remove execute permission from a directory tree: `chmod -R a-x mydir`.

On a directory, the execute bit is what grants permission to *traverse into* it. So:

- Do it **pre-order** — parent first — and after you strip `x` from `mydir`, you can no longer
  enter `mydir`. The traversal locks itself out and the descendants keep their permissions.
- Do it **post-order** — children first — and every descendant is processed while access is
  still available, and the parent is stripped last, on the way out. Correct.

Now consider the opposite operation, *adding* execute permission to a tree that lacks it. Now
**pre-order is forced**: you must grant yourself entry to the parent before you can reach the
children at all.

> **The general principle, which is worth more than any of the individual examples:**
> **Pre-order when the action on a node *enables* the processing of its descendants.**
> **Post-order when the action on a node *destroys or depends on* its descendants.**
>
> Notice these are the *same* traversal machinery pointed in opposite directions, and which one
> is correct is determined entirely by the direction the dependency runs. If you can identify the
> dependency direction, you have identified the traversal.

## 4.4 In-order: forced when the ordering *among* children carries meaning

**Visit order: left subtree, then the node, then right subtree.**

In-order is the odd one out. Pre- and post-order generalize cleanly to any number of children;
in-order does not (§4.7). It is fundamentally about **binary** trees, and it earns its place
because of one property.

### The forcing problem: getting sorted output from a BST

The BST invariant says: everything in a node's left subtree is less than the node, and
everything in the right subtree is greater. So "everything smaller, then me, then everything
larger" — which is precisely in-order — emits values in ascending order.

On the BST above:

```
In-order:   10, 20, 30, 40, 50, 60, 70, 80      ← sorted, Θ(n), no comparisons
Pre-order:  50, 30, 20, 10, 40, 70, 60, 80      ← not sorted
Post-order: 10, 20, 40, 30, 60, 80, 70, 50      ← not sorted
Level:      50, 30, 70, 20, 40, 60, 80, 10      ← not sorted
```

Only one of those four is useful for "list all users alphabetically." And it costs Θ(*n*) with
zero comparisons, because the comparisons were already paid for at insertion time. That is the
answer to a question Chapter 1 left open: a tree gives you Θ(log *n*) search *and* Θ(*n*) sorted
enumeration, which is exactly the pair the sorted array had and the linked list lost.

**Range queries fall out of the same mechanism.** "All values between 25 and 65": descend to 25,
then in-order-walk until you exceed 65. You touch only the nodes in the range plus the O(log *n*)
descent — you never look at 10, 20, 70, or 80. This is the operation that a hash table cannot do
at any price, and it is the single biggest reason database indexes are trees rather than hash
tables. Volume 3 leans on this constantly.

### Second example: printing infix notation

Take the same expression tree as §4.2. In-order gives `3 + 5 × 10 − 4` — the conventional infix
form. Note that this is **lossy**: read back with standard precedence it means
3 + (5×10) − 4 = 49, not 48. The tree said (3+5)×(10−4).

That is not a defect in in-order traversal; it is the reason parentheses exist. Infix notation
does not uniquely encode a tree, so it needs extra syntax (parentheses, or precedence rules) to
disambiguate. Pre-order and post-order need neither. So the correct infix printer emits
parentheses at every internal node:

```
print_infix(n):
    if n is a leaf: emit(n.value); return
    emit("(")
    print_infix(n.left)
    emit(n.value)          # ← the in-order position
    print_infix(n.right)
    emit(")")
```

giving `((3 + 5) × (10 − 4))`. And notice the shape: the `(` is a pre-order action, the operator
is an in-order action, and the `)` is a post-order action. **All three visit positions from the
Euler tour, used in a single function.** That is the clearest possible demonstration that §4.1's
unification is real and not just a cute observation.

### A note on reverse in-order

Right subtree, node, left subtree, gives **descending** order. `ORDER BY x DESC` on an indexed
column is exactly this — a backward in-order walk of the index. Volume 5 has a nasty surprise
about why walking a concurrent tree backwards is harder than walking it forwards.

## 4.5 Level-order: forced when *distance from the root* is the thing you care about

**Visit order: all nodes at depth 0, then all at depth 1, then depth 2, …** Left to right within
each level. Also called **breadth-first traversal** (BFS).

### The forcing problem: find the shallowest node satisfying a condition

Find the nearest ancestorless-path match — say, the shallowest node in a file system tree
containing a `.git` directory, or the nearest matching DOM ancestor, or the shortest sequence of
moves to a winning game state.

Depth-first traversal can plunge down a 10,000-deep branch and find a match at depth 9,999,
having never looked at the depth-1 node next door that also matched. To use DFS you would have
to explore the *entire* tree and keep the minimum depth seen — Θ(*n*) unavoidably.

Level-order finds it at depth *d* after examining only the nodes at depths ≤ *d*. **It can stop
early and be certain**, because it has provably already seen everything shallower. That certainty
is the property, and no depth-first order has it.

This is the same reason BFS finds shortest paths in unweighted graphs, and it is why
`git log --graph`, web crawlers with depth limits, and iterative-deepening game search all care
about level structure.

### Second example: rendering by rows

Drawing the org chart in §3.1 requires all of depth 1 laid out before you can position depth 2,
because sibling positions depend on the widths of their subtrees at the level above. Any layout
algorithm that assigns *y* by depth and *x* by horizontal packing wants level-order.

### The structural difference: a queue, not a stack

Here is the punchline of this section, and it is more profound than it first appears. Write a
generic traversal, parameterized only by the container:

```
def traverse(root, container):
    container.add(root)
    while not container.empty():
        node = container.remove()
        visit(node)
        for c in node.children:
            container.add(c)
```

- Make `container` a **stack** (LIFO) → you get **depth-first** traversal.
- Make `container` a **queue** (FIFO) → you get **breadth-first** traversal.

*One word.* The entire difference between depth-first and breadth-first search — two algorithms
usually taught as separate topics with separate proofs — is the removal policy of the pending set.
Nothing else changes.

And that explains something that otherwise looks arbitrary: **why level-order has no natural
recursive form.** Recursion gives you a stack for free, because the call stack *is* a stack. It
does not give you a queue. So pre-, in-, and post-order are trivially recursive and level-order
is not. You can fake it — recurse once per level, or thread a queue through the recursion — but
the first is Θ(*n*·*h*) work and the second is just an explicit queue with extra ceremony. The
"asymmetry" between DFS and BFS in code is an artifact of which container the language hands you
for free.

### The memory trade-off, which is real and frequently decisive

| | Depth-first | Breadth-first |
|---|---|---|
| Peak auxiliary space | O(**height**) | O(**width**) |
| Balanced binary tree, *n* = 10⁶ | ~20 frames | **~500,000 queue entries** |
| Degenerate tree, *n* = 10⁶ | **~10⁶ frames (crash)** | ~1 entry |

For a perfect binary tree, the bottom level holds *n*/2 nodes, and BFS necessarily has all of
them queued at once. So on a balanced tree **DFS uses logarithmic memory and BFS uses linear
memory** — a factor of 25,000 at a million nodes. On a degenerate tree the situation exactly
inverts.

This is not a footnote. "Traverse a large tree without running out of memory" is a real
constraint, and the answer depends on the tree's shape, which means it depends on everything in
Volume 2.

## 4.6 All four, on one tree, fully worked

Using the BST from §4.3:

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
   └─┬──┘ └────┘       └────┘ └────┘
     │
  ┌──▼─┐
  │ 10 │
  └────┘
```

**Pre-order** (node, left, right):

```
50 → left subtree of 50
     30 → left subtree of 30
          20 → left subtree of 20
               10 → (no children)
             → right subtree of 20: empty
        → right subtree of 30
          40
   → right subtree of 50
     70 → 60 → 80

Result: 50, 30, 20, 10, 40, 70, 60, 80
```

**In-order** (left, node, right):

```
Descend left as far as possible: 50 → 30 → 20 → 10, then start emitting.
10 (no left)         → emit 10, no right
back to 20           → emit 20, no right
back to 30           → emit 30, right subtree is 40
40                   → emit 40
back to 50           → emit 50, right subtree is 70
descend left of 70   → 60 → emit 60
back to 70           → emit 70, right is 80
80                   → emit 80

Result: 10, 20, 30, 40, 50, 60, 70, 80         ← sorted ✔
```

**Post-order** (left, right, node):

```
Result: 10, 20, 40, 30, 60, 80, 70, 50
```

Trace the last few to convince yourself: after finishing 30's whole subtree
(10, 20, 40, 30) we do 50's right subtree (60, 80, 70) and only then 50 itself. The root is
**always last** in post-order, and **always first** in pre-order. Those are useful sanity checks.

**Level-order:**

```
Queue trace:
  [50]                    → visit 50, enqueue 30, 70
  [30, 70]                → visit 30, enqueue 20, 40
  [70, 20, 40]            → visit 70, enqueue 60, 80
  [20, 40, 60, 80]        → visit 20, enqueue 10
  [40, 60, 80, 10]        → visit 40
  [60, 80, 10]            → visit 60
  [80, 10]                → visit 80
  [10]                    → visit 10
  []                      → done

Result: 50, 30, 70, 20, 40, 60, 80, 10
        └┬┘  └──┬──┘  └─────┬─────┘ └┬┘
      depth 0  depth 1    depth 2   depth 3
```

Note the peak queue length: 4, which equals the tree's width. Compare DFS's peak stack depth of
4, which equals height + 1. On this small, roughly balanced tree they coincide; §4.5's table
shows how violently they diverge at scale.

**Side by side:**

| Order | Sequence | Root position | Sorted? |
|---|---|---|---|
| Pre-order | 50, 30, 20, 10, 40, 70, 60, 80 | first | no |
| In-order | 10, 20, 30, 40, 50, 60, 70, 80 | middle | **yes** |
| Post-order | 10, 20, 40, 30, 60, 80, 70, 50 | last | no |
| Level-order | 50, 30, 70, 20, 40, 60, 80, 10 | first | no |

## 4.7 How many orders are there really, and what about *k*-ary trees?

**Six, for binary trees.** We have been assuming children are visited left-to-right, but nothing
requires that. Allow right-before-left and each of the three positions gives two variants:

| Name | Sequence rule | Notable use |
|---|---|---|
| Pre-order | N, L, R | serialization, copying |
| Reverse pre-order | N, R, L | — |
| In-order | L, N, R | sorted ascending |
| Reverse in-order | R, N, L | sorted **descending** (`ORDER BY … DESC`) |
| Post-order | L, R, N | deallocation, aggregation |
| Reverse post-order | R, L, N | — |

Reverse post-order has one lovely property worth knowing: **reverse post-order on a DAG is a
topological sort.** That is how build systems (`make`, Bazel), package managers resolving
dependencies, and compilers ordering basic blocks decide what to do first. It is one of the most
economically important traversals in existence, and it is post-order read backwards.

**For *k*-ary trees, pre- and post-order generalize; in-order does not.** With *k* children there
are *k*+1 possible slots for "visit the node" — before child 1, between children 1 and 2, …,
after child *k*. There is no canonical choice, so "in-order" is simply not defined for general
*k*-ary trees.

There is one important exception, and it is a preview of Volume 3. In a **B-tree**, a node holds
*m* keys *and* *m*+1 children, arranged alternately:

```
        ┌────┬─────┬────┬─────┬────┬─────┬────┐
        │ c₀ │ k₁  │ c₁ │ k₂  │ c₂ │ k₃  │ c₃ │
        └────┴─────┴────┴─────┴────┴─────┴────┘
```

Now the interleaving *is* canonical: subtree c₀, key k₁, subtree c₁, key k₂, … This gives a
perfectly well-defined in-order traversal that emits keys in sorted order, exactly as in a BST.
The reason B-trees can do this and generic *k*-ary trees cannot is that a B-tree node's keys are
*separators* — they live logically *between* their children rather than above them. Keep that in
mind; it is the structural feature that makes B-trees searchable, and it is easy to miss when you
first meet one.

## 4.8 Decision table: which order is forced?

| If you need to… | Order | Because |
|---|---|---|
| Free / destroy a tree | **Post** | The parent holds the only pointers to the children |
| Compute size, height, sum, or any aggregate | **Post** | The parent's value is a function of the children's |
| Evaluate an expression tree | **Post** | Operators need evaluated operands |
| Emit code from an AST | **Post** | Operands must be computed before the operation |
| Topologically sort a dependency DAG | **Reverse post** | Dependencies must precede dependents |
| Copy / clone a tree | **Pre** | The parent must exist before children attach |
| Serialize to a one-pass stream | **Pre** | Enables single-pass reconstruction (§6.7) |
| Emit nested markup (HTML/XML/JSON) | **Pre** for open tags, **post** for close | Both, from the same Euler tour |
| Grant permissions down a tree | **Pre** | You must be able to enter before descending |
| Revoke permissions down a tree | **Post** | Revoking the parent blocks descent |
| List a BST's contents in sorted order | **In** | The BST invariant is exactly "left < node < right" |
| Answer a range query | **In**, from the range start | Emits in order; stops when past the end |
| Sorted descending | **Reverse in** | Mirror image |
| Find the *shallowest* node matching a predicate | **Level** | Only BFS can stop early and be certain |
| Shortest path in an unweighted structure | **Level** | Depth is discovered in increasing order |
| Lay out a tree visually by rows | **Level** | Positions depend on the level above |
| Traverse a deep tree in bounded memory | **Any DFS** | O(height), not O(width) |
| Traverse a very wide, shallow tree in bounded memory | **Level** | O(width) beats O(height) here — check which |

If you take one thing from this chapter: **identify the direction the dependency runs, and the
traversal order is determined for you.** Information flowing up from leaves to root is post-order.
Enablement flowing down from root to leaves is pre-order. Ordering *among* siblings is in-order.
Distance from the root is level-order. You never have to guess.

---


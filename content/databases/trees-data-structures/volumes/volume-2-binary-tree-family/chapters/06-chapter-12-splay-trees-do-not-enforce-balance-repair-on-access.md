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


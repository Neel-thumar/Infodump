# Chapter 3 — Vocabulary, Built Twice

We are going to define the tree twice: once loosely, using an analogy your intuition already
has, and then again formally, in a way you could hand to a proof assistant. Both are necessary.
The analogy is how you will actually think about trees when debugging at 2am. The formalism is
how you will avoid the specific mistakes that intuition makes.

## 3.1 The better analogy is the org chart, not the family tree

The family tree gave us our words, so it is the natural first reach. But it is a poor model of a
computer-science tree, and it is poor in an instructive way. Start with the org chart instead.

```
                         ┌─────────────────┐
                         │      CEO        │
                         └────────┬────────┘
                ┌─────────────────┼─────────────────┐
        ┌───────▼──────┐  ┌───────▼──────┐  ┌───────▼──────┐
        │  VP Eng      │  │  VP Sales    │  │  VP Finance  │
        └───────┬──────┘  └──────────────┘  └───────┬──────┘
          ┌─────┴─────┐                             │
   ┌──────▼─────┐ ┌───▼────────┐            ┌───────▼──────┐
   │ Dir. Infra │ │ Dir. Apps  │            │ Controller   │
   └────────────┘ └─────┬──────┘            └──────────────┘
                  ┌─────┴─────┐
           ┌──────▼────┐ ┌────▼──────┐
           │ Eng Alice │ │ Eng Bob   │
           └───────────┘ └───────────┘
```

Everything you need is visible here:

- **Exactly one person is at the top.** There is precisely one CEO, and everyone else reports,
  directly or indirectly, up to them.
- **Everyone else has exactly one boss.** Not zero (you'd be unmanaged), not two (that's the
  matrix-management org, and it is famously not a tree — hold that thought).
- **There are no loops.** You cannot follow "reports to" and arrive back where you started.
  If you could, someone would be their own manager's manager.
- **Any sub-org is itself an org chart.** Cut out VP Eng and everyone under them and you have a
  perfectly well-formed smaller org chart, with VP Eng at the top. **This self-similarity is the
  single most important property in this chapter**, and Chapter 5 is entirely about exploiting it.
- **Order among peers may or may not mean something.** Whether "VP Eng is left of VP Sales"
  carries meaning depends on the chart. In computing this matters enormously and we will make it
  explicit.

Those five bullets are, almost verbatim, the formal definition. We will make them precise in a
moment.

## 3.2 Where the family-tree analogy breaks, and why the break is the definition

The family tree fails on the second bullet, and it fails hard: **everyone has two parents.**
Follow the "child of" relation upward from any person and you get a structure that doubles at
every generation. Follow it downward from two people who later have children together and the
branches *rejoin*.

That structure has a name — it is a **directed acyclic graph (DAG)** — and it is not a tree.
The difference is not pedantry; almost every practical property of trees comes from
single-parenthood:

| Property | Requires one parent? | Why |
|---|---|---|
| A unique path from the root to any node | **Yes** | Two parents ⇒ at least two distinct routes down |
| Unambiguous pathnames (`/usr/local/bin`) | **Yes** | Two parents ⇒ a node has multiple valid names |
| *n* nodes ⇒ *n* − 1 edges | **Yes** | Edge count is derived from parent count (§3.5) |
| Recursive processing without visited-set tracking | **Yes** | Rejoining branches ⇒ nodes processed twice |
| Safe recursive deallocation | **Yes** | Shared nodes ⇒ double-free |

That last row is the one that bites people in production. A structure you *believe* is a tree but
which actually has a shared node is a double-free waiting to happen, and this is exactly the
failure that reference counting and garbage collection exist to handle. If you have ever seen a
"tree" library that maintains a `visited` set, that is a strong signal it is not operating on a
tree.

> **Practical rule.** The moment two nodes can point to the same child, you have left tree
> country. Your algorithms need cycle/revisit protection, your memory management needs sharing
> semantics, and your mental model needs to change. Volume 5's section on persistent
> (immutable) trees is precisely about doing this *deliberately* and correctly — structural
> sharing is a DAG wearing a tree's interface, and it is a very powerful thing when you know
> that's what you have.

## 3.3 Formalization, two ways

Both of these definitions describe the same object. Which one you reach for depends on what you
are trying to do, and being able to switch between them fluently is a real skill.

### Definition A — the graph-theoretic one

> A **tree** is a connected, acyclic, undirected graph.
>
> A **rooted tree** is a tree together with a distinguished vertex called the **root**. Given a
> root, every edge acquires a natural orientation: away from the root.

This definition is best for **counting and proving things**. All of §3.5 comes out of it easily.

Note how spare it is. There is no mention of parents, children, depth, or leaves — those are all
*derived* notions that appear the instant you pick a root. Before you pick a root, a tree has no
top and no direction; "root" is a choice imposed on it, not a property it has. This is worth
sitting with, because it explains a real phenomenon: the same set of nodes and edges can be
viewed as many different rooted trees depending on where you stand, and some algorithms (rerooting
in tree DP, for instance) exploit exactly that.

### Definition B — the recursive one

> A **tree** is either:
> - empty, **or**
> - a **node** (holding some value) together with an ordered sequence of zero or more trees,
>   called its **children** or **subtrees**.

This definition is best for **writing code**. It is literally an algebraic data type:

```
Tree(T) = Empty | Node(value: T, children: List[Tree(T)])
```

and in the binary case:

```
BinaryTree(T) = Empty | Node(value: T, left: BinaryTree(T), right: BinaryTree(T))
```

Two things to notice, because both will pay off shortly.

First, this definition **includes the empty tree**, whereas Definition A does not naturally (a
graph with no vertices is a degenerate case). The empty tree matters in code far more than in
proofs — it is your recursion's base case, and it is why `null`/`None`/`Empty` handling is the
first line of nearly every tree function you will ever write.

Second, this definition says **ordered sequence** of children. That is an addition beyond
Definition A. A graph-theoretic tree has a *set* of neighbors; a data-structure tree almost
always has an ordered *list* of children, because in memory they sit in a definite order and
because "left child" and "right child" must be distinguishable for a BST to mean anything. The
formal name is an **ordered tree** (or *plane tree*). Almost every tree in this book is ordered,
and it is a real distinction:

```
   these are the SAME unordered tree        and DIFFERENT ordered trees
                                            (also different binary trees!)

            A                                        A
           /                                          \
          B                                            B
```

For a BST, one of these is valid and the other violates the ordering invariant, so this
distinction is doing genuine work.

## 3.4 The glossary, with a worked annotation

Here is the tree we will annotate. It is deliberately lopsided, because symmetric examples let
you get definitions subtly wrong without noticing.

```
depth 0                         ┌───┐
                                │ A │
                                └─┬─┘
                     ┌────────────┼────────────┐
depth 1          ┌───▼───┐    ┌───▼───┐    ┌───▼───┐
                 │   B   │    │   C   │    │   D   │
                 └───┬───┘    └───────┘    └───┬───┘
                ┌────┴────┐                    │
depth 2     ┌───▼───┐ ┌───▼───┐            ┌───▼───┐
            │   E   │ │   F   │            │   G   │
            └───────┘ └───┬───┘            └───────┘
                     ┌────┴────┐
depth 3          ┌───▼───┐ ┌───▼───┐
                 │   H   │ │   I   │
                 └───────┘ └───────┘
```

### The terms

**Node** (also *vertex*). A single element of the tree: a value plus its links. Here: A through I,
nine nodes.

**Edge** (also *link*, *branch*, *arc*). A connection between a parent and a child. Here there are
eight: A–B, A–C, A–D, B–E, B–F, D–G, F–H, F–I. That eight is not a coincidence; see §3.5.

**Root.** The unique node with no parent. Here: **A**. Every non-empty tree has exactly one.

**Parent.** The node one step closer to the root. B's parent is A; H's parent is F. The root has
no parent. Every other node has exactly one — this is the definition doing its work.

**Child.** The inverse of parent. A's children are B, C, D. F's children are H, I. C has none.

**Siblings.** Nodes sharing a parent. {B, C, D} are siblings; {H, I} are siblings; {E, F} are
siblings. Note that **E and G are not siblings** even though they are at the same depth — a common
error. Same depth is not the same as same parent; the term for that broader relation is *cousins*
(informally) or just "same level."

**Leaf** (also *external node*, *terminal node*). A node with no children. Here: **C, E, G, H, I** —
five leaves.

**Internal node** (also *branch node*, *non-terminal*). A node with at least one child. Here:
**A, B, D, F** — four internal nodes. Note 5 + 4 = 9. ✔

**Ancestor.** Any node on the path from a node up to the root, inclusive of neither or both
depending on convention. H's *proper* ancestors are F, B, A. By convention a node is usually
considered its own ancestor in the non-proper sense; when it matters, say "proper ancestor."

**Descendant.** The inverse. B's proper descendants are E, F, H, I.

**Path.** The unique sequence of nodes connecting two nodes. From H to A: H → F → B → A. **Its
uniqueness is a theorem, not an assumption** — it follows from connectivity plus acyclicity, and
it is why pathnames work.

**Depth** (also *level*). The number of **edges** from the root down to the node. A has depth 0.
H has depth 3.

**Height of a node.** The number of edges on the longest downward path from that node to a leaf.
Every leaf has height 0. F has height 1 (to H or I). B has height 2 (B→F→H). A has height 3.

**Height of the tree.** The height of its root. Here: **3**.

**Subtree rooted at *v*.** *v* together with all its descendants, and the edges among them. The
subtree at B is {B, E, F, H, I}. It is itself a valid tree with root B — the self-similarity from
§3.1, now stated precisely, and the reason recursion works.

**Degree of a node.** Its number of children. (Careful: in *graph theory* degree counts all
incident edges, so a graph-theorist would say B has degree 3 — one to its parent, two to its
children. In *data structures* we almost always mean children only. I will always mean children.)

**Degree / arity / order of a tree.** The maximum degree over all nodes. Here: 3, because A has
three children. A tree of degree 2 is a **binary tree**; degree *k* is ***k*-ary**.

> **Terminology hazard, flagged now to save you pain in Volume 3.** The word "order" is
> catastrophically overloaded. It means (a) the arity of a tree, (b) the traversal sequence
> (pre-order, in-order), and (c) in B-tree literature, the maximum number of children *or* the
> maximum number of keys, depending on the author. Volume 3 opens by untangling (c). When you see
> "order" in a paper, find out which one is meant before you trust any formula containing it.

**Forest.** A set of zero or more disjoint trees. The cleanest way to see why this term is useful:
**delete the root of a tree and what remains is a forest** — here, deleting A leaves the three
trees rooted at B, C, and D. Many tree algorithms are most naturally written as
"process a forest" precisely because that is what the recursive step is handed.

**Size.** The number of nodes. Here: 9. Sometimes written |*T*|.

**Width.** The maximum number of nodes at any single depth. Here: 3 (at depth 1 and again at
depth 2 — wait, depth 2 has E, F, G, also 3). Width = 3. This matters in Chapter 4 because
breadth-first traversal's memory cost is proportional to width, not height.

### Every node, tabulated

| Node | Parent | Children | Degree | Depth | Height | Leaf? | Siblings |
|---|---|---|---|---|---|---|---|
| A | — | B, C, D | 3 | 0 | 3 | no | — |
| B | A | E, F | 2 | 1 | 2 | no | C, D |
| C | A | — | 0 | 1 | 0 | **yes** | B, D |
| D | A | G | 1 | 1 | 1 | no | B, C |
| E | B | — | 0 | 2 | 0 | **yes** | F |
| F | B | H, I | 2 | 2 | 1 | no | E |
| G | D | — | 0 | 2 | 0 | **yes** | — |
| H | F | — | 0 | 3 | 0 | **yes** | I |
| I | F | — | 0 | 3 | 0 | **yes** | H |

Look at the Depth and Height columns together, because conflating them is the most common
beginner error in this whole subject and it survives well into intermediate work:

> **Depth looks up. Height looks down.**
> Depth is a property of a node *relative to the root* — a node's depth changes if you re-root the
> tree or graft it under something else.
> Height is a property of the node's *own subtree* — it does not change if the node is moved.
>
> A leaf always has height 0 but can have any depth. The root always has depth 0 but its height
> is the height of the whole tree. In a **balanced** tree the two are roughly complementary
> (depth + height ≈ constant); in a degenerate tree they are not, and that discrepancy is
> literally what "unbalanced" means.

### Two conventions you must pin down before using any formula

These are genuinely not standardized, and mixing conventions produces off-by-one bugs that are
maddening to find.

**1. Is the root at depth 0 or depth 1?** I use **0**, which is the dominant modern convention and
makes the formulas in §3.5 clean (a node at depth *d* has at most *k*^*d* peers). Knuth in *TAOCP*
uses "level", also 0-based. But plenty of textbooks and papers start at 1, in which case a tree of
*n* nodes has "height" one greater than mine everywhere.

**2. What is the height of the empty tree?** I use **−1**, which makes "height = number of edges
on the longest path" work out consistently and makes the recurrence
`height(node) = 1 + max(height(children))` correct with no special case for leaves. Others define
it as 0. Others define height as a count of *nodes* rather than edges, making a single-node tree
have height 1.

> **The practical rule:** when you read a formula involving height or depth, check the source's
> convention against a one-node tree first. If the formula gives a sensible answer for *n* = 1,
> you have probably matched conventions. If it is off by exactly one, you have not.

## 3.5 Things you can prove from the definition

These are not trivia. Each one gets used later, and deriving them now means you will never have
to look them up.

### Fact 1 — A tree with *n* nodes has exactly *n* − 1 edges

**Proof.** Every edge in a rooted tree connects some node to its parent. Every node except the
root has exactly one parent, hence exactly one edge going up. Every node other than the root
therefore contributes exactly one edge, and no edge is contributed twice, because each edge has
exactly one lower endpoint. The map from non-root nodes to edges is a bijection. Therefore
#edges = *n* − 1. ∎

Check the running example: 9 nodes, 8 edges. ✔

**Corollary.** The degrees (child counts) of all nodes sum to *n* − 1, since every edge is
counted once as somebody's child link. In our example: 3+2+0+1+0+2+0+0+0 = 8 = 9 − 1. ✔

**Why you care.** This is what makes trees maximally sparse among connected graphs: *n* − 1 edges
is the minimum possible for connectivity, and one more edge anywhere creates a cycle. A tree is
exactly a graph that is connected with nothing to spare. It is also the reason memory overhead is
one pointer per node rather than something worse.

### Fact 2 — Maximum nodes at a given depth, and in a whole tree

In a *k*-ary tree, the root is one node, and each node has at most *k* children, so by induction
depth *d* holds at most *k*^*d* nodes:

$$
\text{nodes at depth } d \le k^d
$$

Summing over all depths 0 through *h* (geometric series):

$$
n \le \sum_{d=0}^{h} k^d = \frac{k^{h+1}-1}{k-1}
$$

For binary (*k* = 2) this simplifies to the one worth memorizing:

$$
n \le 2^{h+1} - 1
$$

| Height *h* | Max nodes, binary | Max nodes, 10-ary | Max nodes, 200-ary |
|---|---|---|---|
| 1 | 3 | 11 | 201 |
| 3 | 15 | 1,111 | 8,040,201 |
| 10 | 2,047 | ~1.1 × 10¹⁰ | ~10²³ |
| 20 | 2,097,151 | ~1.1 × 10²⁰ | — |

That third column is a preview of Volume 3, and it is the reason B-trees exist. A *three-level*
200-ary tree holds eight million things. Fanout is a lever with absurd mechanical advantage.

### Fact 3 — Minimum height for *n* nodes

Invert Fact 2. The best case — the shortest a tree can be — is when every level is packed full:

$$
n \le \frac{k^{h+1}-1}{k-1} \implies h \ge \log_k\!\big(n(k-1)+1\big) - 1
$$

For binary trees this is *h* ≥ ⌈log₂(*n* + 1)⌉ − 1. Concretely:

| *n* | Minimum binary height | Levels |
|---|---|---|
| 15 | 3 | 4 |
| 1,000 | 9 | 10 |
| 1,000,000 | 19 | 20 |
| 1,000,000,000 | 29 | 30 |

Compare that to §1.4's binary search probe counts: 20 for a million, 30 for a billion. **They are
the same numbers**, which they had better be — §1.8 showed these are the same structure. The
minimum height of a binary tree over *n* items is exactly the number of probes binary search needs.

This is also the **theoretical floor** for any comparison-based search: log₂ *n* comparisons,
because each comparison yields one bit and you need log₂ *n* bits to identify one of *n* items.
No comparison-based structure can beat it. Volume 2 is the story of how close we can get to the
floor while still supporting cheap updates; Volume 4 covers the structures that beat it by *not*
being comparison-based (tries look at pieces of the key, not at whole-key comparisons — that is
how they escape).

### Fact 4 — In a binary tree, #leaves = #(two-child nodes) + 1

Let *n*₀, *n*₁, *n*₂ be the counts of nodes with 0, 1, 2 children.

Total nodes: *n* = *n*₀ + *n*₁ + *n*₂.
Total edges, counted as child-links: *n* − 1 = 0·*n*₀ + 1·*n*₁ + 2·*n*₂.

Substitute:

$$
n_0 + n_1 + n_2 - 1 = n_1 + 2n_2 \implies \boxed{n_0 = n_2 + 1}
$$

Check the running example, treating it as-is (A has 3 children so it is not binary — use the
subtree at B, which is): nodes B(2 children), E(0), F(2), H(0), I(0). So *n*₂ = 2 (B and F),
*n*₀ = 3 (E, H, I). And 3 = 2 + 1. ✔

**Why you care.** It means you can never have "lots of leaves and few branch points" in a binary
tree — the two are locked together. It also gives you a free consistency check when writing tree
code: if your leaf count and your two-child count do not differ by exactly one, you have a bug.
And it generalizes: in a *k*-ary tree where every internal node is full,
*n*₀ = (*k* − 1)·*n_internal* + 1.

## 3.6 A first look at shape, and why it is the whole game

Facts 2 and 3 bracket the possibilities. A tree of *n* nodes has height somewhere between
⌈log₂(*n*+1)⌉ − 1 and *n* − 1. Those extremes look like this:

```
  PERFECT (n = 7, height 2)              DEGENERATE (n = 7, height 6)

              ┌───┐                            ┌───┐
              │ 4 │                            │ 1 │
              └─┬─┘                            └─┬─┘
         ┌──────┴──────┐                         └──┌───┐
      ┌──▼─┐        ┌──▼─┐                          │ 2 │
      │ 2  │        │ 6  │                          └─┬─┘
      └─┬──┘        └─┬──┘                            └──┌───┐
    ┌───┴───┐     ┌───┴───┐                              │ 3 │
 ┌──▼┐   ┌──▼┐ ┌──▼┐   ┌──▼┐                             └─┬─┘
 │ 1 │   │ 3 │ │ 5 │   │ 7 │                               └── ... down to 7
 └───┘   └───┘ └───┘   └───┘

  search cost: 3 comparisons            search cost: up to 7 comparisons
  = a real tree                         = a linked list with extra steps
```

Both are legal trees. Both contain the same seven values. Both satisfy the BST ordering property
if you check. **One of them delivers the entire benefit of Chapter 1's derivation and the other
delivers none of it.**

So: *n* determines the number of nodes, but *shape* determines the cost, and nothing in the
definition of a tree constrains the shape. Everything we have built so far is potential
performance, not actual performance.

The formal vocabulary for shape — full, complete, perfect, balanced, degenerate — plus the
mechanisms that *guarantee* good shape under adversarial input, is Volume 2. For now, note the
looming problem and its trigger, because we can already see it from §1.8: build a BST by
inserting values in sorted order, and each new value is larger than everything present, so it
goes right, right, right... and you construct the right-hand picture above. Every time.
Sorted input is not a rare pathological case. Sorted input is *what data looks like*.

We will fix it. First we need to be able to walk a tree at all.

---


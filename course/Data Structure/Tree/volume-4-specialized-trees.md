# Trees: A Complete Guide to the Data Structure, From First Principles to Production Systems

## Volume 4 — Specialized Trees, Each Solving a Problem Plain Trees Can't

---

### Where we left off, and what changes now

Volumes 2 and 3 were the same volume twice. Both asked *"how do I find key k among n keys?"* and
both answered *"a balanced ordered tree"* — differing only in which device the tree lived on, and
therefore in the fanout. Volume 2 solved it for RAM with four flavours of balance; Volume 3 solved
it for disk by turning the fanout dial to 500 and discovering that balance then took care of itself.

**Volume 4 changes the question.** Every structure here exists because a BST or B-tree answers the
wrong question, or answers the right question badly. Some of the problems are not lookup problems
at all.

Volume 1 §2.6 made a promise about this:

> *"About half the structures in this book are trees because a tree is fast; the other half are
> trees because the problem was a tree all along and someone finally noticed. Volume 4 is largely
> the second kind."*

The format for each chapter is the one the whole book uses, applied tightly: **the specific thing a
BST or B-tree handles badly, the new invariant that fixes it, a worked example performed rather
than described, and where it actually runs in production.**

There is also a single idea running underneath all nine chapters, and I am going to name it now
rather than save it for the synthesis, because it makes everything easier to follow:

> **Every structure in this volume stores, at each node, a *summary of that node's subtree* —
> chosen so that the summary can be computed in O(1) from the children's summaries, and so that
> reading it lets you either answer the query directly or discard a whole subtree without looking
> inside it.**
>
> A search tree's summary is "the range of keys below me". A segment tree's is a sum. An interval
> tree's is a maximum endpoint. A Merkle tree's is a hash. An R-tree's is a bounding box. A
> decision tree's is a prediction. **Volumes 1–3 were the special case.** Chapter 29 makes this
> precise and shows why the O(1)-from-children condition is exactly what makes augmentation
> compatible with rebalancing.

Chapter numbering continues from Volume 3. Conventions from Volume 1 §3.4 hold throughout.

---

# Chapter 21 — Tries: Stop Comparing Whole Keys

## 21.1 What a BST does badly with strings

A comparison-based tree treats a key as an **atom**: an opaque value handed to a comparator that
returns less, equal or greater. That abstraction is what makes a BST work for any ordered type, and
it is exactly what makes it wrong for strings.

**Failure 1 — the comparison is not O(1), and the analysis silently assumed it was.**

Volume 2 §8.6 gave BST search as O(log *n*) *comparisons*. For 8-byte integers a comparison is one
instruction and the two costs coincide. For strings of length *m*, a comparison costs up to O(*m*)
character examinations. So the real cost is:

$$
O(m \log n) \text{ character examinations}
$$

Search a dictionary of 100,000 English words for `internationalization` (20 characters):
log₂(100,000) ≈ 17 comparisons, each examining up to 20 characters — **up to 340 character
examinations for a 20-character word.**

**Failure 2 — and this is why: the same prefix is examined over and over.** Every one of those 17
comparisons walks down `i-n-t-e-r-n-a-t-i-o-n...` again from scratch. The work is not just
repeated; it is *identically* repeated. Any structure that re-derives the same information 17 times
is leaving something on the table.

**Failure 3 — space: shared prefixes are stored repeatedly.** `internationalize`,
`internationalization`, `internationally`, `international` — a BST stores the 13-character prefix
`international` four separate times. Across a real dictionary this is most of the bytes.

**Failure 4 — one query a comparison tree simply cannot do: longest prefix match.**

This is the important one, because failures 1–3 are inefficiencies and this one is an
impossibility. Consider an IP routing table:

```
  10.0.0.0/8      → interface A
  10.1.0.0/16     → interface B
  10.1.2.0/24     → interface C
```

A packet arrives for `10.1.2.5`. It matches **all three** entries, and the router must use the
**longest** (most specific) match — interface C.

Now try to express that as a query on an ordered index. The stored keys are *prefixes of differing
lengths*, not points. "Longest prefix match" is not a point lookup, not a range query, and not a
nearest-neighbour query. There is no ordering of the routing table that makes a B-tree descent
produce the right answer, because the answer depends on **how much of the query key each stored key
constrains** — information the comparator throws away.

> To be fair to the BST: *prefix enumeration* ("all keys starting with `inter`") **is** expressible
> as a range query — all keys ≥ `inter` and < `intes`. So that is not a categorical failure, just
> an inefficient one. **Longest prefix match is the categorical failure**, and so is anything
> requiring you to reason about partial key agreement, like fuzzy matching (§21.7).

## 21.2 The invariant: the path *is* the key

The fix is to stop comparing keys and start **consuming** them.

> **Trie invariant.** Each edge is labelled with one symbol from the alphabet. The concatenation of
> edge labels along the path from the root to a node **is** a key prefix. A node is marked
> *terminal* if that prefix is itself a stored key.

No key is stored anywhere in the structure. **The keys are the paths.** Consequences, each of which
kills one of §21.1's failures:

| | Consequence |
|---|---|
| Search cost | **O(\|key\|), independent of *n*.** One symbol examined per level, each exactly once. |
| Shared prefixes | Stored **once**, structurally. |
| Prefix queries | Descend to the prefix node; its whole subtree is the answer set. |
| Longest prefix match | Descend while you can, remembering the deepest terminal node you passed. |

### How this escapes the log *n* lower bound

Volume 2 §3.5 established that log₂ *n* comparisons is a hard floor for any comparison-based
search, because each comparison yields one bit and you need log₂ *n* bits to identify one of *n*
items.

A trie does not violate that bound; it **sidesteps it by not being comparison-based.** Each step
examines a symbol and branches to one of σ children, extracting **log₂ σ bits** of information
rather than 1. For byte-oriented keys, σ = 256 and each step is worth 8 bits. That is why the
search cost depends on the key length rather than on the collection size.

> **The general principle, worth carrying:** a lower bound is always a lower bound *for a model of
> computation*. If a bound is blocking you, the productive question is not "how do I beat it?" but
> "what is the model assuming, and can I stop paying for that assumption?" Radix sort escapes the
> Ω(*n* log *n*) sorting bound the same way, for the same reason.

## 21.3 History

> **Confidence: high on Fredkin and Morrison; moderate on de la Briandais.**

- **René de la Briandais, 1959** — "File searching using variable length keys", *Proceedings of the
  Western Joint Computer Conference*. Describes the structure, including the linked-list-of-children
  node representation, before it had a name.
- **Edward Fredkin, 1960** — "Trie memory", *CACM*. Coins the name, from re**trie**val. Fredkin
  pronounced it "tree"; the profession settled on "try" to keep it distinguishable in speech, which
  means the name is now pronounced in a way that destroys the pun it was built on.
- **Donald R. Morrison, 1968** — "PATRICIA — Practical Algorithm To Retrieve Information Coded In
  Alphanumeric", *JACM*. The compressed binary trie (§21.5). Gernot Gwehenberger is generally
  credited with an independent discovery the same year.
- **Judy arrays** — Doug Baskins at HP, early 2000s. A ferociously optimized 256-way radix tree with
  many node representations, aimed at cache behaviour.
- **Adaptive Radix Tree (ART)** — Viktor Leis, Alfons Kemper, Thomas Neumann, "The adaptive radix
  tree: ARTful indexing for main-memory databases", ICDE 2013. §21.6. Used in HyPer and DuckDB.

## 21.4 A worked trie, and its space problem

Insert `cat`, `car`, `card`, `care`, `dog`.

```
                          (root)
                         /      \
                        c        d
                       /          \
                      a            o
                     / \            \
                    t   r            g ●        ● = terminal
                    ●   ●
                       / \
                      d   e
                      ●   ●

Keys and their paths:
  cat  = root → c → a → t         (t is terminal)
  car  = root → c → a → r         (r is terminal)
  card = root → c → a → r → d     (d is terminal)
  care = root → c → a → r → e     (e is terminal)
  dog  = root → d → o → g         (g is terminal)

Search "card": 4 symbol steps. Never compared against "cat" or "dog" at all.
Search "cab":  root → c → a, then no 'b' child → NOT PRESENT, in 3 steps.
Prefix "car":  descend to r; its subtree {r●, d●, e●} → {car, card, care}.
```

Notice `car` is a prefix of `card` — handled without special cases, because terminality is a flag
on a node rather than a property of being a leaf.

### And now the problem

Count the nodes: root, c, a, t, r, d, e, d, o, g = **10 nodes for 5 keys totalling 17 characters.**
And look at `dog`: a chain `d → o → g` where every node has exactly one child. Three nodes to
express one key with no sharing at all.

Now cost it. If each node is an array of σ child pointers — the representation that makes descent
O(1) — then for byte keys σ = 256 and a node is 256 × 8 = **2,048 bytes**:

```
  10 nodes × 2,048 bytes = 20,480 bytes  to store  17 characters.
                                          ────────────────────────
                                          1,200× overhead.
```

**This is the worst space overhead of any structure in this book**, and it is far worse than the
300–400% Volume 1 §1.5 measured for linked lists. Two independent problems produce it:

1. **Single-child chains** waste a whole node per symbol where there is nothing to decide.
2. **Sparse nodes**: a node with 2 children still pays for 256 pointers.

§21.5 fixes the first. §21.6 fixes the second.

## 21.5 Path compression: radix trees and PATRICIA

**The observation.** A node with exactly one child and no terminal marker represents no decision.
Descending through it tells you nothing you did not already know. So collapse every such chain into
a single edge labelled with the whole **string**.

> **Radix tree (compressed trie, PATRICIA tree) invariant.** Every internal node has at least two
> children, or is terminal. Edges are labelled with strings rather than single symbols.

```
BEFORE (trie, 10 nodes)              AFTER (radix tree, 6 nodes)

        (root)                              (root)
       /      \                            /       \
      c        d                       "ca"       "dog" ●
      |        |                       /    \
      a        o                    "t"●    "r" ●
     / \        \                            /   \
    t●  r●       g●                       "d"●   "e"●
       / \
     d●   e●
```

**Six nodes instead of ten**, and the `dog` chain is now a single edge. In general:

> A compressed trie over *k* keys has **at most *k* leaves**, hence at most *k* − 1 branching
> internal nodes, hence **O(*k*) nodes total — independent of key length.** (Volume 1 Fact 4:
> leaves = two-child nodes + 1.)

That is the crucial bound: the trie's node count was O(total characters); the radix tree's is
O(number of keys). Edge labels are stored as (offset, length) references into the original key
data, not copies, so the labels cost nothing extra.

**Binary radix tree / PATRICIA.** With σ = 2 — treating keys as bit strings — each node stores just
"which bit position do we branch on?" and two children. This is Morrison's original formulation, and
it is what a binary trie over IP addresses looks like:

```
Routing table:  10.0.0.0/8, 10.1.0.0/16, 10.1.2.0/24, 0.0.0.0/0 (default)

  Bits of 10.1.2.5 = 00001010 00000001 00000010 00000101
                     └──/8──┘ └───/16───────┘ └──/24─────┘

  root ●(default route)
    │  descend 8 bits: 00001010
    ▼
   /8 ●(→ interface A)
    │  descend 8 more: 00000001
    ▼
   /16 ●(→ interface B)
    │  descend 8 more: 00000010
    ▼
   /24 ●(→ interface C)      ← deepest terminal node passed = the answer

LONGEST PREFIX MATCH = "walk down as far as the key permits, and remember
                        the deepest terminal node you passed."
```

**That is the whole algorithm, and it is three lines.** The query a B-tree structurally cannot
answer (§21.1 failure 4) is a trie's most natural operation, because a trie descent *is* a
progressive commitment to more and more of the key, which is exactly what prefix specificity
measures.

## 21.6 Node representation: the real engineering

Path compression fixed the chains. The sparse-node problem remains: how do you store a node's
children so that both space and lookup are good?

| Representation | Space for *k* children (σ = 256) | Lookup per level |
|---|---|---|
| **Array of σ pointers** | 2,048 B always | **O(1)** — index directly |
| **Sorted array** of (symbol, pointer) | 9*k* B | O(log *k*) binary search |
| **Linked list** of children | 17*k* B | O(*k*) |
| **Hash map** | ~1.3 × 9*k* B | O(1) expected, poor locality |
| **Bitmap (σ bits) + packed pointers** | 32 B + 8*k* B | O(1) with a `popcount` instruction |

The bitmap row is elegant and worth understanding: a 256-bit bitmap says *which* symbols are
present, and the pointers are packed densely. To find symbol *s*'s child, check bit *s*, then count
the set bits below *s* (`popcount` of the masked bitmap — one instruction on modern CPUs) to get
the index into the packed array. **O(1) lookup at O(*k*) space.** This is the technique behind HAMTs
(hash array mapped tries), which is how Clojure's and Scala's persistent maps work — and which
Volume 5 will revisit, since it is also the foundation of immutable structural sharing.

### ART: pick the representation per node

The Adaptive Radix Tree's contribution is to stop choosing. Each node uses whichever of four
layouts fits its current child count, and nodes are promoted and demoted as they grow and shrink:

| ART node type | Children | Layout | Lookup |
|---|---|---|---|
| **Node4** | 1–4 | 4 keys + 4 pointers, ~36 B | linear scan (4 comparisons) |
| **Node16** | 5–16 | 16 keys + 16 pointers, ~144 B | **SIMD** — compare all 16 at once |
| **Node48** | 17–48 | 256-byte index + 48 pointers, ~656 B | two array lookups |
| **Node256** | 49–256 | 256 pointers, ~2,048 B | direct index, O(1) |

The Node16 case is the one that makes ART fast in practice: a single SSE/AVX instruction compares
the search byte against all 16 keys simultaneously, so a "linear scan" costs one instruction.
**This is the same lesson as Volume 3 §18.2's within-node search** — for small *k*, a vectorized
linear scan beats binary search because it is cache- and branch-friendly. The hierarchy problem
reappears at every scale, and so does the answer.

ART also applies **lazy expansion** (don't create nodes below the point where a key becomes unique)
and **path compression** (§21.5), and reports comparable performance to hash tables while
preserving order — which hash tables cannot do at all.

## 21.7 What tries are for

**Autocomplete and prefix search.** Descend `|prefix|` steps, then enumerate the subtree. Cost
O(|prefix| + output size). Rank the subtree's terminal nodes by a stored frequency to get "top 10
completions" — an augmentation (Ch 29), storing max-frequency-in-subtree at each node to prune the
enumeration.

**IP routing — longest prefix match.** §21.5. The Linux kernel's IPv4 forwarding table used an
**LC-trie** (level-compressed trie, from Nilsson and Karlsson's work) in `net/ipv4/fib_trie.c`.
Level compression is the third compression idea: where a subtrie is dense, collapse *several*
levels into one wide node, trading space for fewer memory accesses. *(Confidence: moderate-high on
`fib_trie` being an LC-trie; kernel internals change.)*

**Fuzzy matching and spell correction — and this is the deepest reason tries win.** To find all
dictionary words within edit distance 2 of a query, you run the Levenshtein dynamic program. Over a
word list you run it *n* times, once per word. Over a **trie** you run it once, over the trie:

```
Query "recieve", searching the trie for words within edit distance 2.

  At each trie node you hold one DP row (the edit distances from the query
  prefixes to THIS node's prefix). Descending one edge computes the next row.

  KEY PRUNE: if every entry in a node's row exceeds 2, then no word in that
             entire subtree can be within distance 2 — cut the whole subtree.

  Because the trie shares prefixes, the DP row for "rec" is computed ONCE and
  reused for every word beginning "rec". A word list recomputes it thousands
  of times.
```

Prefix sharing turns into **computation sharing**, and the bound turns into pruning. Nothing about a
sorted word list gives you this.

**Dictionary minimization — the DAWG.** A trie shares prefixes. Now also share *suffixes*: merge
any two nodes whose subtrees are identical. The result is a **DAWG** (directed acyclic word graph),
which is a minimal DFA accepting exactly your key set. English dictionaries compress by roughly an
order of magnitude. Used in spell checkers and Scrabble/word-game engines.

Note what happened: it is no longer a tree. Volume 1 §3.2 warned that sharing children turns a tree
into a DAG, and that DAGs need visited-set tracking and sharing-aware memory management. That is
exactly the trade, taken deliberately for space.

> **The reframing worth keeping: a trie is a deterministic finite automaton that accepts your key
> set.** Terminal nodes are accepting states, edges are transitions. Once you see that, DAWG
> minimization is just DFA minimization, fuzzy search is an automaton intersection, and Chapter 26's
> suffix structures become obviously related.

**Databases.** ART in HyPer and DuckDB as a main-memory index. Judy arrays as a general
associative-array replacement. Ethereum's state storage uses a **Merkle Patricia Trie** — a radix
tree with Chapter 27's hashing bolted on.

**Compilers and interpreters.** String interning and symbol tables, where you are repeatedly asking
"have I seen this identifier?" over keys with heavy prefix overlap.

## 21.8 The trade, honestly

| | BST / B-tree | Trie / radix tree |
|---|---|---|
| Search | O(*m* log *n*) char examinations | **O(*m*)**, independent of *n* |
| Space | Prefixes duplicated | Prefixes shared; **but** node overhead |
| Prefix enumeration | Possible via range query | **Native** |
| **Longest prefix match** | **Not expressible** | **Native** |
| Fuzzy / edit-distance search | O(*n*) DP runs | **One shared DP with pruning** |
| Range queries on the key order | **Native** | Native (lexicographic order = DFS order) |
| Works on any comparable type | **Yes** | **No** — needs decomposable keys |
| Cache behaviour | Moderate | **Worse** — one indirection per symbol |

That penultimate row is the real limitation. A trie requires keys that decompose into a sequence of
symbols with a fixed alphabet. Strings, integers (as byte sequences, big-endian so that
lexicographic order matches numeric order), and IP addresses qualify. Arbitrary types with only a
comparator do not.

And the cache row matters more than it looks: a trie descent is one dependent pointer hop per
symbol, which is Volume 1 §1.6's pointer-chasing pathology once per character. For a 20-byte key
that is up to 20 dependent cache misses, against a B-tree's 3–4 page reads. This is precisely why
ART, Judy and LC-tries all invest so heavily in cramming more decision per node — they are
converting symbol-at-a-time descent into several-symbols-at-a-time descent, which is the fanout
lesson of Volume 3 applied to a non-comparison structure.

---

# Chapter 22 — Segment Trees and Fenwick Trees: Hierarchical Aggregates

## 22.1 The problem, and a familiar impossibility

You have an array of *n* numbers. Two operations, interleaved arbitrarily:

- `update(i, v)` — set `a[i] = v`
- `query(l, r)` — return the sum of `a[l..r]`

Try the obvious structures:

| | `update` | `query(l,r)` |
|---|---|---|
| **Plain array** | **O(1)** | O(*n*) — scan the range |
| **Prefix-sum array** *P*[*i*] = *a*[0]+…+*a*[*i*] | O(*n*) — rebuild every *P*[*j*], *j* ≥ *i* | **O(1)** — *P*[*r*] − *P*[*l*−1] |

**One operation is O(1) and the other is O(*n*), and you cannot have both.** If that shape feels
familiar, it should — it is Volume 1 §1.7, arriving for the second time:

> *"The array has random access but pays Θ(n) to rearrange. The linked list rearranges in Θ(1) but
> has no random access. Each structure gives up exactly what the other needs."*

And the *reason* is the same reason Volume 1 §1.7 gave: **the prefix-sum array encodes global
information at every position.** *P*[500,000] depends on *a*[0]. So a change to one element
invalidates a linear amount of stored information, and there is no way to express that repair
locally.

Volume 1 §1.8's escape applies verbatim: **stop storing per-element values or global aggregates,
and store aggregates for a *hierarchy of ranges* instead.** Then a point update invalidates only the
O(log *n*) ranges that contain that point, and a range query is assembled from O(log *n*)
precomputed pieces.

## 22.2 The segment tree

> **Segment tree invariant.** The root covers [0, *n*−1]. Every internal node covering [lo, hi]
> splits it at mid = ⌊(lo+hi)/2⌋ into children covering [lo, mid] and [mid+1, hi]. Each node stores
> the **aggregate of its own range**.

The shape is fixed by *n* alone — the data does not influence it at all, so there is nothing to
balance and no insertion order to worry about. It is a complete-ish binary tree of height
⌈log₂ *n*⌉.

### Worked example

*a* = [2, 5, 1, 4, 9, 3], *n* = 6, aggregate = sum.

```
                        ┌───────────────┐
                        │ [0,5]  sum 24 │
                        └───────┬───────┘
              ┌─────────────────┴─────────────────┐
      ┌───────────────┐                   ┌───────────────┐
      │ [0,2]  sum  8 │                   │ [3,5]  sum 16 │
      └───────┬───────┘                   └───────┬───────┘
        ┌─────┴──────┐                      ┌─────┴──────┐
 ┌─────────────┐ ┌──────────┐       ┌─────────────┐ ┌──────────┐
 │ [0,1] sum 7 │ │[2,2]  1  │       │ [3,4] sum13 │ │[5,5]  3  │
 └──────┬──────┘ └──────────┘       └──────┬──────┘ └──────────┘
    ┌───┴────┐                          ┌──┴─────┐
┌────────┐┌────────┐              ┌────────┐┌────────┐
│[0,0] 2 ││[1,1] 5 │              │[3,3] 4 ││[4,4] 9 │
└────────┘└────────┘              └────────┘└────────┘

Verify bottom-up:  2+5 = 7 ✔   7+1 = 8 ✔   4+9 = 13 ✔   13+3 = 16 ✔   8+16 = 24 ✔
Direct sum: 2+5+1+4+9+3 = 24 ✔
```

### Query: sum over [1, 4]

Expected answer: 5 + 1 + 4 + 9 = **19**.

```
query([1,4]) at [0,5]:          partial overlap → recurse both children

  ├─ [0,2]:                     partial (want 1..2) → recurse
  │   ├─ [0,1]:                 partial (want 1..1) → recurse
  │   │   ├─ [0,0]:             NO overlap        → 0
  │   │   └─ [1,1]:             FULLY inside      → 5      ◄── stop here
  │   └─ [2,2]:                 FULLY inside      → 1      ◄── stop here
  │                             subtotal = 6
  └─ [3,5]:                     partial (want 3..4) → recurse
      ├─ [3,4]:                 FULLY inside      → 13     ◄── stop here
      └─ [5,5]:                 NO overlap        → 0
                                subtotal = 13

TOTAL = 6 + 13 = 19 ✔

Nodes that actually contributed: [1,1], [2,2], [3,4].  Three of them.
Note [3,4] answered for TWO elements in one read — that is the whole point.
```

**Why it is O(log *n*).** At each level of the tree, at most **two** nodes are partially
overlapping — the one containing *l* and the one containing *r*. Every other node at that level is
entirely inside the query (so we stop and read its aggregate) or entirely outside (so we return
immediately). So the recursion branches at most twice per level, giving at most 2·⌈log₂ *n*⌉ nodes
visited. ∎

### Update: `a[4] = 9 → 100`

```
Touch exactly the leaf-to-root path:

  [4,4]:   9  → 100
  [3,4]:  13  → 104      (4 + 100)
  [3,5]:  16  → 107      (104 + 3)
  [0,5]:  24  → 115      (8 + 107)

Four nodes. O(log n). Nothing else in the tree changed.
```

Compare the prefix-sum array, which would have had to rewrite *P*[4] and *P*[5] — and for *i* = 0
would rewrite all *n* of them. **The hierarchy localized the damage.**

## 22.3 The generalization that makes segment trees important

Nothing in §22.2 used the fact that the operation was addition. Look at what was actually required:

> **The aggregate must be associative:** (*x* ⊕ *y*) ⊕ *z* = *x* ⊕ (*y* ⊕ *z*), so that combining
> child aggregates gives the parent's aggregate regardless of grouping. Plus an identity element for
> the empty range. That is a **monoid** — and nothing more.

So a segment tree answers range queries for *any* monoid:

| Aggregate | Monoid? | Notes |
|---|---|---|
| sum, product | ✔ | identity 0, 1 |
| **min, max** | ✔ | identity +∞, −∞ |
| gcd, lcm | ✔ | |
| bitwise AND / OR / XOR | ✔ | |
| matrix product | ✔ | non-commutative — order matters, and that's fine |
| "count of elements equal to *k*" | ✔ | |
| "max subarray sum in this range" | ✔ | store (total, best prefix, best suffix, best) per node |
| **average** | ✘ | not associative — but store (sum, count) and divide at the end |
| **median** | ✘ | genuinely not decomposable |

That table is the payoff. **A segment tree is not a sum structure; it is a machine for answering
range queries over any associative summary.** The last non-trivial row — max subarray sum — is worth
noticing: by enlarging the summary from one number to four, a problem that looks non-decomposable
becomes decomposable. Choosing the right summary is the creative act.

## 22.4 Lazy propagation: range updates

So far updates were point updates. What about `add v to every element in [l, r]`?

Naively that is O(*r* − *l*) point updates. But observe: a range update also decomposes into
O(log *n*) canonical nodes, exactly as a query does. So mark those nodes with a **pending
operation** and do not touch anything below them:

```
Node [3,5] receives "add 10 to all of [3,5]":

  ┌──────────────────────────────┐
  │ [3,5]  sum 16 → 46           │      sum updated immediately:
  │        lazy: +10             │      16 + 10 × 3 elements = 46
  └──────────────────────────────┘
     children [3,4] and [5,5] are NOT touched.
     The "+10" is owed to them, and will be PUSHED DOWN
     only if a later query or update needs to look inside.
```

Every descent through a node first **pushes down** any pending operation to its children, then
proceeds. So the work is deferred until it is actually needed, and if nobody ever looks inside that
subtree, the work is never done at all. Range update and range query both become O(log *n*).

> **This is the third time this book has used the same idea.** Volume 1 §1.4 noted that tombstones
> convert Θ(*n*) deletion into Θ(1) by deferring the cleanup. Volume 3 §18.9 explained that real
> B-trees skip rebalancing on delete and let a background process reclaim later. Volume 3 §20.6
> built an entire storage engine (the LSM-tree) on buffering writes and reconciling in the
> background. **Lazy propagation is the same move at the smallest scale: the cheapest way to do
> work is to promise to do it later, and then only if someone asks.**

## 22.5 A word on the implicit array representation

Segment trees are almost always stored in a flat array using Volume 1 §6.3's implicit layout —
children of *i* at 2*i*+1 and 2*i*+2. The shape is data-independent, so there is no risk of Volume
1 §6.3's catastrophic failure mode.

But there is a milder version of it. For *n* not a power of two, the tree is not perfectly complete,
and the implicit layout leaves gaps. The standard defensive answer is to allocate **4*n*** slots
rather than the 2*n*−1 nodes the tree actually has. That is Volume 1 §6.3's "array size is
determined by height, not node count" showing up as a 2× constant factor rather than as an 8.6 GB
disaster — a good illustration that the failure mode is not binary but graded.

An iterative bottom-up formulation exists that uses exactly 2*n* slots and has better constants,
and it is what performance-sensitive code uses.

## 22.6 Fenwick trees: the same problem, half the space

> **Confidence: high on Fenwick; moderate on the earlier attribution.** Peter M. Fenwick, "A new
> data structure for cumulative frequency tables", *Software: Practice and Experience*, 1994. Boris
> Ryabko is generally credited with describing the same structure in 1989. Also called the **binary
> indexed tree (BIT)**.

### The derivation

A segment tree stores 2*n* aggregates and supports arbitrary range queries over any monoid. Now
weaken the requirement in two ways:

1. **Only prefix queries.** We will compute `prefix(i)` = *a*[1] ⊕ … ⊕ *a*[*i*].
2. **The operation is invertible** — it forms a **group**, not just a monoid. Then any range query
   is `prefix(r) ⊖ prefix(l−1)`.

Given those two concessions, how much of the segment tree do we actually need? Look at the segment
tree and ask which nodes ever appear in a *prefix* query decomposition. The answer is: only the
nodes that are **left children** — a prefix query never needs a node whose range starts in the
middle of the array and extends right past the query. Half the tree is dead weight.

The Fenwick tree keeps exactly the useful half, in exactly *n* cells, using a beautiful indexing
trick:

> **Fenwick invariant.** `tree[i]` stores the aggregate of *a*[*i* − lsb(*i*) + 1 … *i*], where
> lsb(*i*) is the value of the lowest set bit of *i*. (1-indexed.)

### Worked example

*a*[1..6] = [2, 5, 1, 4, 9, 3].

```
  i  binary  lsb(i)   tree[i] covers      tree[i] value
  ─────────────────────────────────────────────────────────
  1   001      1      a[1..1]             2
  2   010      2      a[1..2]             2+5      = 7
  3   011      1      a[3..3]             1
  4   100      4      a[1..4]             2+5+1+4  = 12
  5   101      1      a[5..5]             9
  6   110      2      a[5..6]             9+3      = 12

  tree = [ -, 2, 7, 1, 12, 9, 12 ]        (index 0 unused)
```

Picture the coverage as a staircase — this is where the structure becomes visible:

```
   a[]:      1     2     3     4     5     6
           ┌─────┐
  tree[1]  │  2  │
           └─────┘
           ┌───────────┐
  tree[2]  │     7     │
           └───────────┘
                       ┌─────┐
  tree[3]              │  1  │
                       └─────┘
           ┌───────────────────────┐
  tree[4]  │           12          │
           └───────────────────────┘
                                   ┌─────┐
  tree[5]                          │  9  │
                                   └─────┘
                                   ┌───────────┐
  tree[6]                          │    12     │
                                   └───────────┘
```

### Prefix query: strip one set bit at a time

```
prefix(i):
    s = 0
    while i > 0:
        s = s ⊕ tree[i]
        i -= lsb(i)          # equivalently: i &= i - 1
    return s
```

```
prefix(6):   6 = 110₂
   tree[6] = 12          (covers a[5..6])
   6 − 2 = 4 = 100₂
   tree[4] = 12          (covers a[1..4])
   4 − 4 = 0 → stop
   TOTAL = 24 ✔   (2+5+1+4+9+3 = 24)

   Note the two ranges a[1..4] and a[5..6] TILE a[1..6] exactly — disjoint,
   no gaps. That is not a coincidence; see below.

prefix(5):   5 = 101₂
   tree[5] = 9  (a[5..5]);  5−1 = 4;  tree[4] = 12 (a[1..4]);  4−4 = 0
   TOTAL = 21 ✔   (2+5+1+4+9 = 21)

prefix(3):   3 = 011₂
   tree[3] = 1  (a[3..3]);  3−1 = 2;  tree[2] = 7  (a[1..2]);  2−2 = 0
   TOTAL = 8 ✔    (2+5+1 = 8)

range(2,5) = prefix(5) − prefix(1) = 21 − 2 = 19 ✔   (5+1+4+9 = 19)
```

**Why the ranges tile exactly.** Writing *i* in binary, subtracting its lowest set bit clears
exactly that bit. So the sequence *i*, *i* − lsb(*i*), … visits the values obtained by clearing set
bits one at a time from the bottom, and terminates at 0. There are **popcount(*i*) ≤ ⌈log₂ *n*⌉**
steps. Each `tree[j]` in the sequence covers a block whose length is exactly the bit that was just
cleared, and those blocks abut perfectly because clearing a bit is exactly stepping back by that
block's length. **The binary representation of *i* is the decomposition of the prefix.** ∎

### Update: add set bits instead of stripping them

```
update(i, delta):
    while i <= n:
        tree[i] = tree[i] ⊕ delta
        i += lsb(i)
```

```
update(3, +10):     a[3] goes 1 → 11
   tree[3] += 10  → 11        (3 = 011₂;  lsb = 1)
   3 + 1 = 4
   tree[4] += 10  → 22        (4 = 100₂;  lsb = 4)
   4 + 4 = 8 > 6 → stop

   Verify: prefix(3) = tree[3] + tree[2] = 11 + 7 = 18
           direct:    2 + 5 + 11        = 18 ✔
           prefix(6) = tree[6] + tree[4] = 12 + 22 = 34
           direct:    2+5+11+4+9+3      = 34 ✔
```

The two loops are exact duals: the query strips low set bits, the update adds them. Each visits
O(log *n*) cells. The whole structure is **eight lines of code and *n* integers**.

## 22.7 Segment tree versus Fenwick tree

| | Segment tree | Fenwick tree |
|---|---|---|
| Space | 2*n* (often 4*n* allocated) | **exactly *n*** |
| Point update | O(log *n*) | O(log *n*), **~2× better constant** |
| Prefix query | O(log *n*) | O(log *n*) |
| Range query | O(log *n*), **any monoid** | O(log *n*), **requires a group (invertible)** |
| **min / max queries** | ✔ | **✘** — min has no inverse |
| Range update | ✔ with lazy propagation | awkward (needs two Fenwick trees) |
| Arbitrary custom summaries | ✔ | limited |
| Code size | ~40 lines | **~8 lines** |
| Cache behaviour | tree-shaped access | **flat array, bit-strided — better** |
| Descend to find "first prefix ≥ x" | ✔ | ✔ (binary lifting on the bits) |

> **The Fenwick tree is the space-optimized cousin, and the thing it trades away is precisely
> stated: it exploits *invertibility* to discard the half of the segment tree that only prefix
> queries never need.** Give up invertibility — ask for `min` instead of `sum` — and the trick
> evaporates, because you cannot subtract a prefix minimum out of a longer prefix minimum.
>
> This is Volume 3 §19.4's lesson in a different register: **an invariant is information, and
> information you can derive is information you do not have to store.** There, knowing that a
> separator only needs to *separate* let you truncate it. Here, knowing the operation is invertible
> lets you delete half the tree.

## 22.8 Where these run

**Fenwick's original motivation was data compression**, and it is worth knowing because it explains
the shape of the structure perfectly. Arithmetic coding needs **cumulative symbol frequencies** to
encode each symbol — that is a prefix query — and *adaptive* arithmetic coding updates a symbol's
frequency after each occurrence — that is a point update. Prefix query plus point update, millions
of times per second. The structure was designed for exactly that loop.

**Competitive programming** is where both structures are most heavily used, and the canonical
applications are worth knowing because they show up in real systems too:

- **Rank and order statistics.** Store 1 at each present value; `prefix(x)` is "how many elements
  ≤ *x*". Descending the tree finds the *k*-th smallest in O(log *n*).
- **Counting inversions** while merge-sorting, in O(*n* log *n*).
- **2D dominance counting**: sweep one dimension, Fenwick over the other.

**Real systems:**

- **Query optimizers** maintain histograms to estimate selectivity, and a histogram bucket update
  plus a "how many rows below this value" query is exactly prefix-sum-with-point-update.
- **Time-series and monitoring systems** answer range aggregates over time windows; segment trees
  and their variants (or precomputed rollup hierarchies, which are the same idea materialized) are
  the standard approach.
- **Rate limiting and sliding-window counters** need "sum of events in the last *N* seconds" with
  constant updates.
- **Sparse / dynamic segment trees** handle key spaces too large to allocate (10¹⁸ possible
  timestamps) by creating nodes lazily — the segment tree becoming, in effect, a binary trie over
  the key's bits with aggregates attached. Chapters 21 and 22 meeting in the middle.
- **Interval scheduling and stabbing queries** — the segment tree's other classical use, inserting
  each interval into its O(log *n*) canonical nodes. Which is Chapter 23's problem, approached from
  the other side.

---

# Chapter 23 — Interval Trees: When the Data Are Ranges

## 23.1 The problem, and why sorting cannot solve it

Chapter 22's data were points at positions, and the query was a range. **Now invert it: the stored
data are intervals, and the query asks which of them overlap a given interval.**

- A calendar: each event is [start, end]. "Does this proposed meeting conflict with anything?"
- A genome: each gene, exon or read is [begin, end] on a chromosome. "Which annotations overlap this
  region?"
- A firewall: each rule covers an IP range and a port range. "Which rules apply to this packet?"
- A register allocator: each variable is live over an interval of the instruction stream. "Which
  live ranges overlap, and therefore cannot share a register?"

The obvious attempt: put the intervals in a BST or B-tree ordered by their **low endpoint**. Then a
query [*q*ₗ, *q*ₕ] should be a range query, right?

**No — and the counterexample is one line:**

```
Stored:   [0, 1000]   [1, 2]   [3, 4]   [5, 6]   [7, 8]  …  [995, 996]
Query:    [999, 1001]

Ordered by low endpoint, [0, 1000] is the LEFTMOST interval in the tree.
It is also the ONLY match.

A range query on low endpoints would look near 999 and find nothing.
Pruning the left subtree — which is what a BST descent DOES — discards
the answer.
```

The problem is precise: **an interval's low endpoint tells you nothing about how far right it
reaches.** An interval that begins early can extend arbitrarily far, so no bound on low endpoints
lets you rule out a subtree. Ordering by high endpoints fails symmetrically. Keeping two indexes and
intersecting them does not help either, because each index individually returns Θ(*n*) candidates in
the bad case.

> The general shape of this failure is worth naming, because it recurs in Chapter 25: **a BST
> descent prunes a subtree by comparing the query against the subtree's key *range*. That works only
> when a node's key fully determines where its descendants can be. For intervals it does not — an
> interval is two numbers, and ordering by one of them discards the other.**

## 23.2 The invariant: augmentation

The fix is not a new tree. It is **an ordinary balanced BST with extra information stored at each
node.**

> **Interval tree invariant.**
> **1.** An ordinary BST (or red-black tree) keyed on each interval's **low endpoint**.
> **2.** Each node additionally stores **`max_hi`** — the **maximum high endpoint over its entire
>    subtree**, including itself.

And that second line is enough. Here is the pruning rule it buys:

> If `node.left.max_hi < q_lo`, then **every** interval in the left subtree ends before the query
> begins, so none of them can overlap. **Prune the entire left subtree.**

That is the missing information restored. Ordering by low endpoint told us nothing about rightward
reach; `max_hi` tells us exactly that, for a whole subtree, in one number.

### Augmentation, stated generally — because we will use it four more times

This is the technique the whole volume runs on, so let me state it properly. It has been mentioned
in passing three times already (Volume 2 §11.8's EEVDF scheduler, Volume 3 in passing, and this
volume's preface) and this is where it gets defined.

> **Augmentation.** Store at each node *x* a value *f*(*x*) summarizing *x*'s subtree, such that:
>
> **(a) Composability** — *f*(*x*) is computable in **O(1)** from *x*'s own data plus
> *f*(*x*.left) and *f*(*x*.right).
>
> **(b) Usefulness** — reading *f*(*x*) lets you either answer the query directly or **discard
> *x*'s entire subtree** without descending into it.

Condition (a) is not a convenience; it is what makes augmentation compatible with **balancing**, and
that is the crucial engineering fact:

> A rotation (Volume 2 §9.7) changes the subtree membership of only **O(1) nodes** — the two nodes
> involved. Every other node's subtree is unchanged. So if *f* is computable from children in O(1),
> a rotation can repair *f* in O(1) by recomputing it at those two nodes, bottom-up. **Therefore any
> composable augmentation can be bolted onto a red-black or AVL tree without changing its
> asymptotics.**
>
> Conversely, a summary that is *not* computable from children — "the median of my subtree", "the
> second-largest gap between consecutive elements" — cannot be maintained under rotation in O(1),
> and augmentation does not apply.

Volume 2's four balancing schemes and Volume 3's B-trees both survive augmentation unchanged. That
is why the Linux kernel can take its existing red-black tree implementation and produce an interval
tree from it with a few dozen lines (§23.6).

## 23.3 A worked interval tree

Intervals: [15,20], [10,30], [17,19], [5,20], [12,15], [30,40].

Insert in that order, keyed by low endpoint (15, 10, 17, 5, 12, 30):

```
                        [15,20]
                       /        \
                [10,30]          [17,19]
                /      \                 \
          [5,20]      [12,15]           [30,40]
```

Now compute `max_hi` bottom-up — this is exactly a post-order traversal (Volume 1 §4.2: information
flowing from the leaves up to the root):

```
  [5,20]  : max_hi = max(20)                 = 20
  [12,15] : max_hi = max(15)                 = 15
  [10,30] : max_hi = max(30, 20, 15)         = 30
  [30,40] : max_hi = max(40)                 = 40
  [17,19] : max_hi = max(19, —, 40)          = 40
  [15,20] : max_hi = max(20, 30, 40)         = 40
```

```
                   ┌──────────────────────┐
                   │ [15,20]   max_hi 40  │
                   └──────────┬───────────┘
              ┌───────────────┴───────────────┐
   ┌──────────────────────┐          ┌──────────────────────┐
   │ [10,30]   max_hi 30  │          │ [17,19]   max_hi 40  │
   └──────────┬───────────┘          └──────────┬───────────┘
        ┌─────┴──────┐                          └──────┐
┌──────────────┐ ┌──────────────┐          ┌──────────────────────┐
│[5,20] max 20 │ │[12,15] max15 │          │ [30,40]   max_hi 40  │
└──────────────┘ └──────────────┘          └──────────────────────┘
```

### The search algorithm

```
find_any_overlap(node, q):
    while node is not None:
        if node.interval overlaps q:            # lo <= q.hi and hi >= q.lo
            return node.interval
        if node.left is not None and node.left.max_hi >= q.lo:
            node = node.left
        else:
            node = node.right
    return NONE
```

**Note there is only one recursive path — no branching.** That is surprising and it needs a proof;
§23.4 gives one.

### Query 1: find an interval overlapping [21, 23]

```
At [15,20], max_hi 40:
    overlap? 15 ≤ 23 ✔ and 20 ≥ 21 ✘  →  NO overlap
    left child [10,30] has max_hi = 30 ≥ 21  →  the left subtree MIGHT reach us
    GO LEFT

At [10,30], max_hi 30:
    overlap? 10 ≤ 23 ✔ and 30 ≥ 21 ✔  →  OVERLAP.  Return [10,30].

Two nodes visited.  ✔  ([10,30] does indeed cover 21–23.)
```

### Query 2: find an interval overlapping [41, 50] — the pruning case

```
At [15,20], max_hi 40:
    overlap? 20 ≥ 41 ✘  →  no
    left child [10,30] has max_hi = 30 < 41  →  NOTHING in the left subtree
                                                reaches 41. PRUNE IT.
    GO RIGHT

At [17,19], max_hi 40:
    overlap? 19 ≥ 41 ✘  →  no
    left child: none  →  GO RIGHT

At [30,40], max_hi 40:
    overlap? 40 ≥ 41 ✘  →  no
    left child: none  →  GO RIGHT  →  None

RESULT: no overlap.  ✔  Three nodes visited; the whole left subtree
        ([10,30], [5,20], [12,15]) was discarded by reading ONE number.
```

The left subtree held half the data and was eliminated by a single integer comparison. That is
condition (b) of §23.2 doing its job.

## 23.4 Why one path suffices — the theorem

The algorithm above descends **one** root-to-leaf path, so it is O(log *n*) rather than O(log *n*)
*per branch*. That requires justification, and the argument is short and rather satisfying.

> **Claim.** If we go **left** (because `left.max_hi ≥ q_lo`) and the left subtree contains no
> overlapping interval, then the right subtree contains none either — so descending left loses
> nothing.

**Proof.** Let *i* be the interval in the left subtree achieving the maximum high endpoint, so
*i*.hi = `left.max_hi` ≥ *q*ₗ.

By assumption *i* does not overlap *q*. Overlap means *i*.lo ≤ *q*ₕ **and** *i*.hi ≥ *q*ₗ. We know
the second conjunct holds. So the first must fail:

$$
i.\text{lo} > q_h
$$

Now take any interval *j* in the **right** subtree. The tree is a BST on low endpoints, so
*j*.lo ≥ node.lo ≥ *i*.lo (since *i* is in the left subtree, *i*.lo ≤ node.lo). Therefore:

$$
j.\text{lo} \ge i.\text{lo} > q_h
$$

So *j* starts after the query ends, and cannot overlap. ∎

And the other direction is immediate: if we go **right** because `left.max_hi < q_lo`, then every
interval in the left subtree ends before the query starts, so none overlaps.

**Either way, exactly one direction can contain an answer, and the algorithm goes that way.** The
`max_hi` augmentation converts an apparently two-dimensional search into a one-dimensional descent.

**For reporting *all* overlaps** rather than one, you do branch — but you only branch into subtrees
that can contain an answer, giving **O(*k* log *n*)** for *k* reported intervals with the simple
version, and O(log *n* + *k*) with a more careful traversal.

## 23.5 Two other structures called "interval tree", and a related one

Terminology in this area is genuinely muddled, so it is worth disambiguating.

**The augmented BST above** is what CLRS calls an interval tree and what most software means by the
term. Dynamic (supports insert and delete), O(log *n*) for one overlap, O(*n*) space.

**The centered interval tree**, from computational geometry, is a different structure with the same
name. Pick a **center point** *c*; partition the intervals into those entirely left of *c*, those
entirely right, and those **crossing** *c*. Store the crossing ones twice — once sorted by low
endpoint, once by high endpoint — and recurse on left and right. A stabbing query at point *p*
compares *p* to *c* and scans the appropriate sorted list until it passes *p*. Static (built once,
awkward to update) but with good constants and a clean O(log *n* + *k*) bound.

**A segment tree over intervals** (Ch 22) is a third approach: build a segment tree over the
endpoint coordinates, and insert each interval into the O(log *n*) canonical nodes covering it. A
stabbing query then walks one root-to-leaf path and collects everything stored along it. This is
the classical answer for *static* interval sets and it composes beautifully with aggregation — you
can ask "how many intervals cover this point?" in O(log *n*) instead of enumerating them.

**Priority search trees** — Edward McCreight, 1985, "Priority search trees", *SIAM J. Computing* —
handle *three-sided* range queries (two bounds in one dimension, one in the other) in O(log *n* + *k*).

> Note the author. **The same Edward McCreight** who co-invented the B-tree in 1972 (Volume 3
> §16.1) and who will turn up again in Chapter 26 with a linear-time suffix tree construction in
> 1976. Three structures in three different chapters of this book, from one person.

## 23.6 Where interval trees run

**The Linux kernel** is the most instructive example, because you can see the augmentation
literally.

The kernel provides `lib/interval_tree.c` and `include/linux/interval_tree_generic.h`, built on top
of its existing red-black tree via `rbtree_augmented.h` — the general augmentation framework §23.2
described. And `struct vm_area_struct` (a virtual memory area) contains:

```c
struct vm_area_struct {
    unsigned long vm_start;          /* the interval's low endpoint  */
    unsigned long vm_end;            /* the interval's high endpoint */
    ...
    struct {
        struct rb_node rb;
        unsigned long  rb_subtree_last;   /*  ←  max_hi.  Literally §23.2. */
    } shared;
    ...
};
```

`rb_subtree_last` **is** `max_hi`. The uses:

- **Reverse mapping** (`i_mmap` interval tree per file, `anon_vma` interval trees): given a physical
  page, find every process mapping it. The query is "which VMAs overlap this file offset range?"
  Needed for page reclaim, for `mmap` writeback, and for copy-on-write fork handling.
- **MMU notifiers**: when a range of memory is invalidated, notify every registered subscriber whose
  watched range overlaps.

*(Confidence: high on the augmentation framework and `rb_subtree_last`; moderate on the current set
of users, since VMA tracking itself moved to the maple tree in Linux 6.1 — Volume 3 §19.8.)*

**Genomics**, where interval overlap is arguably the single most-performed computation in the field.
Every genomic feature — gene, exon, transcript, sequencing read, variant, ChIP-seq peak — is an
interval on a chromosome, and the core operation of nearly every analysis is "intersect these two
sets of intervals". `bedtools intersect` is one of the most-run commands in biology. The structures
used in practice include augmented interval trees, **NCLists** (nested containment lists, Alekseyenko
& Lee 2007) and **AIList** (augmented interval lists, Feng et al. 2019), which trade generality for
cache behaviour on the specific distributions genomic intervals have. *(Confidence: moderate on the
specific structures; high on the centrality of the operation.)*

**Compilers — register allocation.** Linear scan register allocation (Poletto & Sarkar, 1999)
computes each variable's **live interval** over the linearized instruction stream. Two variables can
share a register exactly when their live intervals do not overlap, so the allocator's inner loop is
interval overlap. *(Confidence: high on linear scan and live intervals.)*

**Calendars and scheduling.** Conflict detection, resource booking, room allocation. Direct.

**Networking and security.** Firewall and ACL rule matching over IP and port ranges; IP reputation
and blocklist lookups over CIDR ranges — though note that for *prefix*-structured ranges
specifically, Chapter 21's trie is usually the better tool, because CIDR ranges are prefixes and
longest-prefix-match is a trie's native operation.

**Computational geometry.** Windowing queries, segment intersection (Bentley–Ottmann sweep),
rectangle overlap. This is where the structure originated and where the centered variant is standard.

---

# Chapter 24 — Heaps: The Point of Knowing Less

## 24.1 A different question: priority, not order

Every structure so far has answered questions about **order**: where is key *k*, what lies in
[*l*, *r*], what overlaps this interval. Now consider a different access pattern:

> Repeatedly: **give me the most urgent item**, while new items keep arriving.

That is a **priority queue**, and it is one of the most-used abstractions in computing —
Dijkstra's algorithm, A*, event simulation, task scheduling, Huffman coding, merge of *k* sorted
runs, top-*k* selection.

Here is the awkward part: **a balanced BST already does this.** The minimum is the leftmost node,
found in O(log *n*); insert is O(log *n*); delete-min is O(log *n*). Volume 2 gave us four ways to
guarantee those bounds. So why does a separate structure exist at all?

Not for the asymptotics. **For what you stop having to know.**

## 24.2 The invariant, and why it is deliberately weak

> **Min-heap invariant.** For every node *x*: `x.key ≤ key of each of x's children`.
>
> **That is all.** There is no constraint between siblings, and no constraint between a node and
> anything outside its own subtree.

Compare the BST invariant (Volume 2 §8.1): *everything* in the left subtree < *x* < *everything* in
the right subtree. Two-sided, and reaching across the whole subtree.

Count what each invariant determines:

| | BST | Heap |
|---|---|---|
| Constrains | both children, and transitively all descendants, in **both** directions | children only, in **one** direction |
| Relationship between siblings | fully determined | **completely unspecified** |
| Arrangements per shape (distinct keys) | **exactly 1** | **many** |
| What you can read off in O(1) | the root's key, and nothing else useful | **the minimum of the whole collection** |
| What a search for arbitrary key *k* costs | **O(log *n*)** | **O(*n*)** |

The last two rows are the trade, stated exactly. **A heap knows one thing very well — where the
minimum is — and knows almost nothing else.** Finding an arbitrary key in a heap requires examining
Θ(*n*) nodes, because the invariant gives you no way to choose a direction. Range queries are
impossible. In-order traversal is meaningless.

### And here is what the weakness buys

Because the invariant says **nothing about which child a value goes to**, the structure's *shape* is
not determined by the data. So you can **dictate** the shape. And if you dictate "**complete**"
(Volume 2 §7.2 — every level full except the last, filled left to right), you unlock Volume 1
§6.3's implicit array representation:

$$
\text{parent}(i) = \left\lfloor \frac{i-1}{2} \right\rfloor \qquad
\text{left}(i) = 2i+1 \qquad
\text{right}(i) = 2i+2
$$

**No pointers. Eight bytes per element. One allocation. Perfect cache locality at the top of the
tree. Position-independent, so it can be `memcpy`'d, `mmap`'d, or shipped over a socket.**

Volume 1 §6.3 and Volume 2 §7.2 both left this promise outstanding, so let me discharge it plainly:

> **A BST lets the data dictate the shape, and pays for that with 32–48 bytes per node
> (Volume 2 §11.7) and an entire volume's worth of rebalancing machinery.**
>
> **A heap dictates the shape, and pays for that by knowing less.**
>
> Volume 1 §6.3 showed that the implicit array representation catastrophically fails for a
> degenerate tree — 30 nodes inserted in sorted order would need 8.6 GB. A heap can use the
> representation *precisely because* its weak invariant lets it guarantee completeness. **The
> invariant was weakened on purpose, and the array layout is the payment received.**

## 24.3 The operations

```
peek()          →  a[0].                                            O(1)
insert(v)       →  append at a[n] (preserves completeness),
                   then SIFT UP while smaller than parent.          O(log n)
extract_min()   →  save a[0]; move a[n-1] into a[0]
                   (preserves completeness); shrink;
                   then SIFT DOWN while larger than a child.        O(log n)
heapify(array)  →  sift down from index n/2-1 down to 0.            O(n)  ← not n log n
```

The two `insert`/`extract_min` implementations are worth reading as a pair: both work by making the
*shape* correct first (append at the end / fill the hole from the end) and then repairing the
*invariant* along a single path. Shape is cheap to fix because it is under our control; the
invariant is cheap to fix because it is weak.

### heapify is O(*n*), and the derivation is a nice amortization

Building a heap by *n* successive inserts costs O(*n* log *n*). Building it by sifting down from the
middle costs **O(*n*)**, and the reason is that most nodes are near the bottom, where sifting down
is cheap.

At height *h* above the leaves there are at most *n*/2^(*h*+1) nodes, and sifting one down costs
O(*h*):

$$
\sum_{h=0}^{\lfloor \log_2 n \rfloor} \frac{n}{2^{h+1}} \cdot O(h)
\;=\; O\!\left(n \sum_{h \ge 0} \frac{h}{2^{h+1}}\right)
\;=\; O\!\left(\frac{n}{2} \cdot 2\right)
\;=\; O(n)
$$

using Σ_{h≥0} *h*/2^*h* = 2. **Half the nodes are leaves and cost nothing; only the single root
costs log *n*.** The expensive cases are rare enough to be free.

## 24.4 Worked example

Build a min-heap from *a* = [9, 4, 7, 1, 8, 3] using `heapify`. Start at *i* = ⌊*n*/2⌋ − 1 = 2.

```
INITIAL:  [9, 4, 7, 1, 8, 3]

              9 (0)
            /       \
         4 (1)      7 (2)
        /     \     /
     1 (3)  8 (4) 3 (5)
```

```
i = 2:  node 7, children: a[5] = 3.  Smallest child 3 < 7  →  SWAP.

          [9, 4, 3, 1, 8, 7]              9
                                        /   \
                                      4       3
                                    /   \    /
                                   1     8  7
```

```
i = 1:  node 4, children: a[3] = 1, a[4] = 8.  Smallest 1 < 4  →  SWAP.

          [9, 1, 3, 4, 8, 7]              9
                                        /   \
                                      1       3
                                    /   \    /
                                   4     8  7

        Continue sifting the 4 down from index 3: no children. Done.
```

```
i = 0:  node 9, children: a[1] = 1, a[2] = 3.  Smallest 1 < 9  →  SWAP.

          [1, 9, 3, 4, 8, 7]              1
                                        /   \
                                      9       3
                                    /   \    /
                                   4     8  7

        Continue sifting the 9 down from index 1:
                children a[3] = 4, a[4] = 8.  Smallest 4 < 9  →  SWAP.

          [1, 4, 3, 9, 8, 7]              1
                                        /   \
                                      4       3
                                    /   \    /
                                   9     8  7

        Continue from index 3: no children. Done.
```

```
FINAL HEAP:  [1, 4, 3, 9, 8, 7]

VERIFY the invariant at every node:
    1 ≤ 4 ✔   1 ≤ 3 ✔   4 ≤ 9 ✔   4 ≤ 8 ✔   3 ≤ 7 ✔          valid min-heap ✔

NOW LOOK AT WHAT IT IS NOT:
    Not sorted:      [1, 4, 3, …] — 3 comes after 4.
    Not a BST:       3 sits in the RIGHT subtree of the root but is
                     smaller than 4 in the left subtree.
    In-order traversal is 9, 4, 8, 1, 3, 7 — meaningless.

    THAT is §24.2 made concrete. The heap has no opinion about the
    relationship between 4 and 3, and it does not need one.
```

### extract_min

```
Return a[0] = 1.  Move the last element (a[5] = 7) into a[0]; size → 5.

          [7, 4, 3, 9, 8]                 7
                                        /   \
                                      4       3
                                    /   \
                                   9     8

SIFT DOWN 7:  children 4 and 3.  Smallest 3 < 7  →  SWAP.

          [3, 4, 7, 9, 8]                 3
                                        /   \
                                      4       7
                                    /   \
                                   9     8

7 at index 2 now has no children (2·2+1 = 5 ≥ size).  Done.

VERIFY:  3 ≤ 4 ✔   3 ≤ 7 ✔   4 ≤ 9 ✔   4 ≤ 8 ✔                 ✔
Next minimum is correctly 3.
```

## 24.5 The heap family, and a familiar fanout trade

| Structure | insert | extract-min | decrease-key | **merge** | Notes |
|---|---|---|---|---|---|
| **Binary heap** | O(log *n*) | O(log *n*) | O(log *n*) | **O(*n*)** | array-based; **best constants and cache behaviour** |
| ***d*-ary heap** | O(log_*d* *n*) | O(*d* log_*d* *n*) | O(log_*d* *n*) | O(*n*) | see below |
| **Binomial heap** | O(log *n*) | O(log *n*) | O(log *n*) | **O(log *n*)** | a *forest* of trees; mergeable |
| **Fibonacci heap** | **O(1)** am. | O(log *n*) am. | **O(1)** am. | **O(1)** | Fredman & Tarjan 1987; theoretically optimal, dreadful constants |
| **Pairing heap** | **O(1)** | O(log *n*) am. | O(log *n*) am. | **O(1)** | Fredman, Sedgewick, Sleator & Tarjan 1986; simple, good in practice |
| **Leftist / skew heap** | O(log *n*) | O(log *n*) | — | **O(log *n*)** | pointer-based, trivially mergeable |

> **Confidence: high on Fibonacci and pairing heap authorship and dates.** The tight bound for
> pairing-heap `decrease-key` was open for a long time; Fredman showed it cannot be O(1), and the
> exact bound is, as I recall, still not fully settled. Flagging rather than asserting.

**Fibonacci heaps** were designed for one purpose: Dijkstra's algorithm performs O(*E*)
`decrease-key` operations and O(*V*) `extract-min` operations, so making `decrease-key` O(1)
amortized improves Dijkstra from O(*E* log *V*) to **O(*E* + *V* log *V*)**. This is a genuinely
important theoretical result.

It is also a well-known example of a structure that is **worse in practice** than the thing it
beats asymptotically, for exactly the reasons Volume 1 §1.6 established: Fibonacci heaps are
pointer-heavy, allocate per node, have poor locality, and carry large constants. For most real graph
sizes a plain binary heap wins outright. *(Confidence: high — this is a widely reported and
frequently re-measured finding.)*

### The *d*-ary heap is Volume 3's fanout trade, in miniature

Give each node *d* children instead of 2. Height becomes log_*d* *n*, so:

- **`insert` and `decrease-key` get cheaper**: they sift *up*, comparing against one parent per
  level → O(log_*d* *n*).
- **`extract-min` gets more expensive**: it sifts *down*, and must find the smallest of *d*
  children per level → O(*d* log_*d* *n*).

**This is precisely Volume 3 §17.8 and §18.2.** Increasing fanout reduces the number of levels and
increases the work per level, and the optimum depends on which operation dominates and on how the
per-level work interacts with the cache. In practice *d* = 4 is a common choice, because with 8-byte
entries four children occupy half a cache line and are fetched together — so "compare against 4
children" costs one cache miss instead of one per level.

**The same trade, three times, at three scales:** B-tree fanout versus within-node search (Volume 3),
ART's node types versus symbol-at-a-time descent (§21.6), and *d*-ary heap arity versus sift-down
cost (here). Volume 6 argues this is not a coincidence.

## 24.6 Where heaps run

**Graph algorithms.** Dijkstra, A*, Prim. The priority queue *is* the algorithm's engine.

**Huffman coding.** Volume 1 §2.3 introduced Huffman's 1952 construction as one of the earliest
cases where the tree *is* the answer. Its construction repeatedly extracts the two lowest-frequency
symbols and inserts their merged parent — which is `extract-min` twice and `insert` once, *n* times.
**A heap builds a tree.** Nice symmetry.

**Heapsort, and `std::sort`'s safety net.** Heapsort is in-place and O(*n* log *n*) worst case. Its
most important production role is as the fallback in **introsort**: `std::sort` runs quicksort, and
if the recursion depth exceeds ~2 log *n* (a sign that the pivots are going badly, possibly
adversarially — Volume 2 §9.5's threat model), it switches to heapsort to guarantee O(*n* log *n*).
**A worst-case guarantee deployed specifically as a defence**, exactly as Volume 2 §11.8 described
Java's `HashMap` treeification. *(Confidence: high.)*

**Top-*k* over a stream.** To find the *k* largest of *n* items in one pass: keep a **min**-heap of
size *k*; for each item, if it exceeds the heap's minimum, replace it and sift down. **O(*n* log *k*)
time and O(*k*) space** — and note that *n* never has to be known or stored. This is what
`heapq.nlargest` does, and it is the standard answer for "top trending items" over an unbounded
stream.

**k-way merge — and a direct tie back to Volume 3.** To merge *k* sorted runs, keep a heap of *k*
elements (the current head of each run), repeatedly extract the minimum and pull the next element
from that run. O(*N* log *k*) for *N* total elements.

This is the engine of **external merge sort**, and of **LSM-tree compaction** (Volume 3 §20.6 and
§20.7). When RocksDB merges ten SSTables into one, the merge is driven by a *k*-way merge over a
min-heap of size ten. **Volume 3's storage engine has a heap in its inner loop**, and this is where
that comes from.

**Event-driven simulation and timers.** A discrete-event simulator is a loop over `extract-min` on a
heap of scheduled events. Timer wheels and hierarchical timing wheels are the specialized
alternative when the key range is bounded and known.

**Median maintenance.** Two heaps — a max-heap of the lower half and a min-heap of the upper half,
kept balanced in size. `insert` and `get-median` in O(log *n*) and O(1).

**And one we have already met.** Volume 2 §13.2's **treap** is a BST on keys *and* a max-heap on
random priorities. Its entire power comes from imposing two invariants on two different attributes
at once — a BST invariant on the thing you search by, and a heap invariant on the thing that
controls the shape. Worth rereading now that the heap invariant has been examined on its own terms.

## 24.7 What a heap cannot do, stated plainly

For completeness, because the weakness is the design and should not be soft-pedalled:

| Operation | Heap | Balanced BST |
|---|---|---|
| find the minimum | **O(1)** | O(log *n*) |
| extract the minimum | O(log *n*) | O(log *n*) |
| insert | O(log *n*), tiny constant | O(log *n*) |
| **find an arbitrary key** | **O(*n*)** | **O(log *n*)** |
| **delete an arbitrary key** | O(*n*) to find it, then O(log *n*) | O(log *n*) |
| **range query** | **impossible** | O(log *n* + *k*) |
| **enumerate in sorted order** | O(*n* log *n*) — you must drain it | **O(*n*)** |
| predecessor / successor | **impossible** without a scan | O(log *n*) |
| space per element | **8 bytes** | 32–48 bytes |

> If your workload ever needs the bottom half of that table, you do not want a heap — you want a
> balanced BST, and you will read its minimum in O(log *n*) and be perfectly happy. **The heap is
> the right answer only when the *only* thing you ever ask for is the extreme**, and its reward for
> that narrowness is a 4–6× space saving and the best cache behaviour of any structure in this book.
>
> The standard workaround for `decrease-key` — which needs "find an arbitrary key", the O(*n*)
> row — is to keep a side hash map from key to array index, updated on every swap. That is the
> honest cost of the weak invariant: you bolt an index back on when you find you needed one after
> all.

---

# Chapter 25 — Spatial Trees: When There Is No Total Order

## 25.1 The problem: two dimensions have no useful ordering

Every structure in Volumes 1–3 rested on one assumption so basic it was never stated: **the keys are
totally ordered, and that order reflects what queries care about.** A B-tree works because "between
100 and 200" is a contiguous run in the ordering.

Now move to two dimensions. Query: *"find all points within 10 km of here."* Or: *"what is the
nearest restaurant?"*

**There is no total order on ℝ² that preserves proximity.** This is not a failure of imagination —
it is a fact about the two spaces, and it is worth making quantitative.

### Attempt 1: index by *x*

Suppose *n* points are uniformly distributed in the unit square, and the query is a box of side ε.

```
                  the query box, side ε             the x-STRIP that an index
                  ┌───┐                            on x actually retrieves
     ┌────────────┼───┼──────────────┐        ┌─────┬───┬────────────────────┐
     │            │ ▪ │              │        │     │▪ ▪│                    │
     │       ▪    │▪ ▪│    ▪         │        │  ▪  │▪ ▪│  ▪                 │
     │            │ ▪ │              │        │     │ ▪ │                    │
     │   ▪        └───┘        ▪     │        │  ▪  │ ▪ │        ▪           │
     │        ▪            ▪         │        │  ▪  │ ▪ │    ▪               │
     │    ▪         ▪           ▪    │        │  ▪  │▪ ▪│         ▪          │
     └───────────────────────────────┘        └─────┴───┴────────────────────┘
        points in the box:  ε²n                  points in the strip:  εn
```

$$
\text{overwork ratio} = \frac{\varepsilon n}{\varepsilon^2 n} = \frac{1}{\varepsilon}
$$

| Query box side ε | 2-D overwork (1/ε) | 3-D overwork (1/ε²) |
|---|---|---|
| 0.1 | 10× | 100× |
| 0.01 | **100×** | **10,000×** |
| 0.001 | 1,000× | 1,000,000× |

For a query covering 1% of each axis you examine **100× more points than you need**, in two
dimensions, and it gets exponentially worse with dimension. Two separate indexes (one on *x*, one on
*y*) and an intersection do not help — each returns Θ(ε*n*) candidates in its own right.

### Attempt 2: linearize with a space-filling curve

The genuinely clever attempt. Interleave the bits of the coordinates to produce a single number:

```
  x = 5 = 101₂        Morton (Z-order) code: interleave, x taking even bit positions
  y = 3 = 011₂

  bits:   x₂ y₂ x₁ y₁ x₀ y₀
          1  0  0  1  1  1     =  100111₂ = 39
```

Now index the Morton codes in a B-tree. Nearby points *often* get nearby codes, so a query box maps
to a few contiguous ranges. This is what **geohashes** are (base-32 encoded interleaved lat/lon bits)
and it is genuinely used at scale.

But it does not fully work, and the reason is instructive:

```
THE SEAM PROBLEM

  1-D intuition:  7 = 0111₂  and  8 = 1000₂  are ADJACENT numerically
                  but differ in EVERY bit.

  In 2-D:  two points a millimetre apart, straddling a quadrant boundary,
           get Morton codes that differ in the high bits — so they land
           in completely different parts of the index.

  Consequence: a query box near a boundary decomposes into MANY disjoint
  code ranges, and the number of ranges grows with how many boundaries
  the box straddles. Geohash-based proximity search must therefore query
  the cell AND its eight neighbours, and neighbour computation near the
  poles and the antimeridian is a notorious source of bugs.
```

Hilbert curves have strictly better locality than Morton — the curve never makes a long jump, so
consecutive curve positions are always spatially adjacent — at the cost of much more expensive
encoding and decoding. Google's **S2** library uses a Hilbert curve over a cube projected onto the
sphere, which is a well-engineered version of this approach. Uber's **H3** abandons curves for a
hierarchy of hexagons, which have the pleasant property that all six neighbours are equidistant
(squares have four near and four far).

> **The honest statement:** no mapping ℝ^*d* → ℝ preserves proximity, because a curve has one
> neighbour on each side and a point in the plane has neighbours in all directions. You can *bound*
> the distortion — that is what makes Hilbert curves useful — but you cannot eliminate it.

So: **partition space itself, hierarchically.** Three families follow, and they differ in exactly
one thing: *what decides where the boundary goes.*

## 25.2 KD-trees: split at a data point, alternating axes

> **Confidence: high.** Jon Louis Bentley, "Multidimensional binary search trees used for
> associative searching", *CACM*, 1975.

> **KD-tree invariant.** Each node stores one point and one **axis**. Points in the left subtree have
> a smaller coordinate along that axis; points in the right subtree, larger. The axis **cycles with
> depth**: *x* at depth 0, *y* at depth 1, *x* at depth 2, and so on (or, in the better variants,
> whichever axis currently has the greatest spread).

A KD-tree is a BST where each level compares a *different component* of the key. That is the whole
idea, and it means every node's splitting plane cuts its region in two.

### Worked example — build

Points: (2,3), (5,4), (9,6), (4,7), (8,1), (7,2).

```
depth 0, split on X.  X values: 2, 4, 5, 7, 8, 9.  Take (7,2) as the split point.
    left  (x < 7): (2,3), (5,4), (4,7)
    right (x > 7): (9,6), (8,1)

depth 1, split on Y.
    LEFT group Y values: 3, 4, 7  →  median (5,4)
        left  (y < 4): (2,3)
        right (y > 4): (4,7)
    RIGHT group Y values: 1, 6  →  take (9,6)
        left  (y < 6): (8,1)
        right: —

                       ┌─────────────┐
                       │ (7,2)  ▸X   │
                       └──────┬──────┘
              ┌───────────────┴───────────────┐
       ┌─────────────┐                 ┌─────────────┐
       │ (5,4)  ▸Y   │                 │ (9,6)  ▸Y   │
       └──────┬──────┘                 └──────┬──────┘
        ┌─────┴─────┐                   ┌─────┘
  ┌─────────┐  ┌─────────┐        ┌─────────┐
  │  (2,3)  │  │  (4,7)  │        │  (8,1)  │
  └─────────┘  └─────────┘        └─────────┘
```

And the partition of the plane it induces — this is the picture worth carrying:

```
  y
  8 ┤                        │
  7 ┤        ▪(4,7)          │
  6 ┤────────────────────────│──────── ▪(9,6)
  5 ┤                        │              ← y=6 splits the right half
  4 ┤────────▪(5,4)──────────│
  3 ┤  ▪(2,3)                │            ← y=4 splits the left half
  2 ┤                        │▪(7,2)
  1 ┤                        │        ▪(8,1)
  0 ┼────────────────────────┼──────────────────
    0    2    4    6         7    8    9      x
                             ↑
                        x=7 splits everything
```

### Worked example — nearest neighbour to (6, 5)

```
nn(node, q, best):
    if node is None: return best
    if dist(node.point, q) < dist(best, q): best = node.point
    near, far  =  children ordered by which side of the splitting plane q is on
    best = nn(near, q, best)
    if |q[axis] − node.point[axis]| < dist(best, q):     # ← THE PRUNING TEST
        best = nn(far, q, best)
    return best
```

```
At (7,2), axis X:
    dist² = (6−7)² + (5−2)² = 1 + 9 = 10  →  d = 3.162.   best = (7,2), d = 3.162
    q.x = 6 < 7  →  near = LEFT

  At (5,4), axis Y:
      dist² = 1 + 1 = 2  →  d = 1.414.   BETTER.  best = (5,4), d = 1.414
      q.y = 5 > 4  →  near = RIGHT

    At (4,7):
        dist² = 4 + 4 = 8  →  d = 2.828.   not better.  Leaf.

    back at (5,4): check the FAR side (y < 4).
        |q.y − 4| = |5 − 4| = 1  <  1.414   →  the plane y=4 is CLOSER than
                                               our best, so a nearer point
                                               could hide beyond it. MUST DESCEND.
      At (2,3):
          dist² = 16 + 4 = 20  →  d = 4.472.   not better.  Leaf.

  back at (7,2): check the FAR side (x > 7).
      |q.x − 7| = |6 − 7| = 1  <  1.414   →  MUST DESCEND.

    At (9,6), axis Y:
        dist² = 9 + 1 = 10  →  d = 3.162.   not better.
        q.y = 5 < 6  →  near = LEFT
      At (8,1):
          dist² = 4 + 16 = 20  →  d = 4.472.   not better.
      far side: empty.

ANSWER: (5,4), distance √2 ≈ 1.414.
```

Brute-force check: distances from (6,5) are (2,3)→4.472, **(5,4)→1.414**, (9,6)→3.162,
(4,7)→2.828, (8,1)→4.472, (7,2)→3.162. Minimum is (5,4). ✔

**And notice: we visited all six points.** The pruning test failed both times, because with only six
points spread over the whole region the nearest neighbour is *far* relative to the splitting planes.
That is not a flaw in the example — it is the honest behaviour, and it is the seed of the next
section.

### The curse of dimensionality, quantified

The pruning test is `|q[axis] − split| < r`, where *r* is the current best distance. Pruning happens
when the splitting plane is **farther** than *r*. So pruning works when *r* is **small relative to
the spread of the data**.

Now ask how big *r* is. For *n* points uniform in the unit *d*-cube, the nearest-neighbour distance
scales roughly as:

$$
r \approx \left(\frac{1}{n}\right)^{1/d}
$$

| *d* | *n* = 10⁶ | *r* ≈ | Pruning? |
|---|---|---|---|
| 2 | 10⁶ | 0.001 | **Excellent** — planes are almost always farther than *r* |
| 5 | 10⁶ | 0.063 | Good |
| 10 | 10⁶ | 0.25 | **Marginal** |
| 20 | 10⁶ | **0.50** | **Hopeless** — *r* is half the width of the entire space |
| 100 | 10⁶ | 0.87 | Nothing prunes at all |

At *d* = 20 the nearest neighbour sits half a unit cube away, so **almost every splitting plane is
closer than the current best, and almost nothing is ever pruned.** KD-tree nearest-neighbour search
degrades to a linear scan — with worse constants than an actual linear scan, because of the pointer
chasing.

**Rule of thumb: KD-trees help while *n* ≫ 2^*d*.** *(Confidence: moderate on the exact form of the
rule; high on the phenomenon and the direction.)*

This is the **curse of dimensionality**, and its geometric root is that the volume of a ball becomes
a vanishing fraction of its enclosing cube as *d* grows: at *d* = 20 a unit-diameter ball occupies
about 2 × 10⁻⁸ of the enclosing cube. Almost all of a box is in its corners, and a box-shaped
partition therefore tells you almost nothing about distance.

> **Ball trees** partition with **hyperspheres** rather than axis-aligned hyperplanes, which fits
> the geometry of a distance query much better and pushes the usable dimension somewhat higher.
> `scikit-learn` ships both `KDTree` and `BallTree` and its documentation's guidance on when to
> prefer which is essentially this section.

## 25.3 Quadtrees and octrees: split space, not data

> **Confidence: moderate-high.** Raphael Finkel and Jon Bentley, "Quad trees: a data structure for
> retrieval on composite keys", *Acta Informatica*, 1974. Octrees (the 3-D analogue) are attributed
> variously; Donald Meagher's 1980 work on octree encoding is the usual citation.

> **Quadtree invariant.** Each node owns a square region and splits it into **four equal
> quadrants** — regardless of where the data happen to lie. Subdivide a cell only when it holds
> more than some capacity of points.

The single difference from a KD-tree is where the boundary goes:

| | KD-tree | Quadtree |
|---|---|---|
| Boundary position | **at a data point** (the median) | **at the geometric centre** of the cell |
| Children per node | 2 | 4 (2^*d* in general: 8 for an octree) |
| Balanced? | yes, if built from medians | **no guarantee** |
| Shape depends on | the data *values* | the data **distribution** only |
| Insertion-order dependent? | yes, if built incrementally | **no — completely deterministic** |
| Depth for clustered data | O(log *n*) | **unbounded** |

Two consequences, one good and one bad.

**Good: the structure is canonical.** A quadtree over a given point set is the same tree no matter
what order the points arrived in. There is no balancing, no rotation, no insertion-order pathology —
Volume 2's entire subject simply does not arise. That is a real simplification and it is why
quadtrees are so common in graphics and simulation code.

**Bad: depth is unbounded.** Two points a nanometre apart force subdivision until the cells are
smaller than a nanometre — potentially dozens of levels holding two points. Clustered data (which
is what real spatial data is) is the bad case. The standard mitigations are a maximum depth with
overflow buckets at the leaves, or switching to a KD-tree when clustering is expected.

### The connection to §25.1's space-filling curves

Here is a satisfying unification. **A Morton code is a quadtree path.** Each successive pair of
interleaved bits selects one of the four quadrants:

```
  Morton code   1 0  0 1  1 1
                └┬┘  └┬┘  └┬┘
               level1 level2 level3
                 ↓     ↓     ↓
              quadrant quadrant quadrant

  So a Morton PREFIX names exactly a quadtree CELL, and
  "all points whose Morton code starts with P" = "all points in cell P".
```

Which means a **geohash prefix is a quadtree cell name**, and geohash-based proximity search is a
quadtree traversal expressed as string prefix matching — which in turn means it can be indexed by a
**B-tree or a trie** (Chapter 21!). Three chapters converging. This is genuinely how a lot of
production geospatial indexing works: encode to a curve, store the codes in whatever ordered index
you already have, and accept the seam problem.

### Barnes–Hut: augmentation used for approximation

The *n*-body problem: compute the gravitational force on each of *n* bodies from all the others.
Naively O(*n*²), which at *n* = 10⁹ is not a computation anyone will finish.

The Barnes–Hut algorithm builds an **octree** over the bodies and augments each cell with **its total
mass and its centre of mass** — a textbook §23.2 augmentation, composable in O(1) from the children.
Then, when computing the force on a body:

```
  if the cell is FAR ENOUGH away relative to its size  (s / d < θ, typically θ ≈ 0.5)
      treat the ENTIRE cell as a single point mass at its centre of mass
  else
      recurse into its children

  Result: O(n log n) instead of O(n²).
```

Note what is different from every previous use of augmentation in this book. Chapter 23's `max_hi`
pruned subtrees that provably contained no answer — **exact** pruning. Barnes–Hut prunes subtrees
that contain answers it has decided to **approximate**. The augmentation is being used as a
*summary that stands in for the data*, not as a filter.

> **That is a second, distinct use of the same technique, and it is worth naming: augmentation for
> approximation.** It reappears in the Fast Multipole Method, in level-of-detail rendering (a
> distant object is drawn as its low-detail summary), in hierarchical clustering, and — arguably —
> in Chapter 28's decision trees, where a leaf's stored prediction is a summary standing in for all
> the training points that fell there.

## 25.4 R-trees: a B+-tree for boxes

> **Confidence: high.** Antonin Guttman, "R-trees: a dynamic index structure for spatial searching",
> SIGMOD 1984.

KD-trees and quadtrees index **points**, in memory. Two things they do not handle:

1. **Extended objects** — rectangles, polygons, roads, buildings, a country's border. These have
   spatial extent and can straddle any partition boundary you choose.
2. **Disk.** Volume 3's entire argument applies: a binary or 4-way in-memory partition tree over a
   billion objects has the wrong fanout for a page-based device.

The R-tree is the answer to both, and the cleanest way to describe it is: **it is a B+-tree whose
keys are bounding boxes.**

> **R-tree invariant.** A balanced, page-based tree, with all leaves at the same depth and the same
> minimum/maximum occupancy rules as a B+-tree (Volume 3 §17.2). Leaves hold objects (or their
> bounding boxes plus a pointer). Each internal entry holds a child pointer and the **minimum
> bounding rectangle (MBR)** of everything in that child's subtree.

```
                  ┌──────────────────────────────────────┐
                  │ MBR₁ → child │ MBR₂ → child          │       root page
                  └──────────────────────────────────────┘
                       /                      \
      ┌───────────────────────┐      ┌───────────────────────┐
      │ MBR → leaf │ MBR → …  │      │ MBR → leaf │ MBR → …  │
      └───────────────────────┘      └───────────────────────┘

  Spatially:
      ┌───────────────── MBR₁ ────────────────┐
      │  ┌──────────┐        ┌─────────────┐  │
      │  │ ▭  ▭     │        │   ▭    ▭    │  │
      │  │    ▭     │        │      ▭      │  │
      │  └──────────┘        └─────────────┘  │
      └───────────────────────────────────────┘
              ┌──────── MBR₂ ─────────┐
              │   ┌───────────┐       │      ← MBRs may OVERLAP.
              │   │  ▭    ▭   │       │        A B-tree's key ranges cannot.
              └───┴───────────┴───────┘
```

### The one crucial difference from a B-tree, and everything follows from it

In a B-tree, a node's key ranges are **disjoint and totally ordered**, so a search descends
**exactly one** child. That is what makes a B-tree search O(*h*).

In an R-tree there is no total order, so:

- **MBRs may overlap.** A query rectangle may intersect several children's MBRs, so the search must
  **descend all of them**. Worst case, it visits the whole tree.
- **Insertion has no forced destination.** "Where does this object belong?" has no determined
  answer. Guttman's `ChooseLeaf` heuristic descends into whichever child's MBR requires the **least
  enlargement** to contain the new object, breaking ties by smaller area.
- **Splitting is an optimization problem, not a forced choice.** Volume 3 §18.3 proved that for odd
  order, the median is the *only* legal split point. Here, any partition of the entries into two
  groups satisfying minimum occupancy is legal, and you want the one minimizing the resulting MBRs'
  total area and overlap. Guttman gave three algorithms — exponential (exact), quadratic, and linear
  — because there is no closed form.

> **This is the price of losing the total order, stated exactly.** A B-tree's structure is
> *determined*: given the invariants, split points and descent paths are forced. An R-tree's
> structure is the output of *heuristics*, and its query performance depends on how well those
> heuristics happened to minimize overlap. **Every R-tree variant in the literature is an attempt to
> reduce overlap.**

### The variants, each attacking overlap

| Variant | Idea | Trade |
|---|---|---|
| **R-tree** (Guttman 1984) | least-enlargement insert, three split heuristics | the baseline |
| **R⁺-tree** | forbid overlap by **splitting objects** across multiple leaves | no overlap on search; objects duplicated, harder updates |
| **R\*-tree** (Beckmann, Kriegel, Schneider, Seeger, SIGMOD 1990) | better split criteria (minimize overlap and perimeter, not just area) plus **forced reinsertion** of some entries on overflow | considerably better in practice; **the de facto standard** |
| **Hilbert R-tree** | order entries by the Hilbert code of their centroid, then pack | good bulk-load locality; uses §25.1's curve as a *heuristic* rather than as the index |
| **STR bulk loading** | Sort-Tile-Recursive: sort, tile, pack bottom-up | near-optimal static trees, 100% page occupancy |
| **Priority R-tree** | worst-case-optimal query bound | theoretical guarantee, more complex |

Note the R\*-tree's **forced reinsertion**: on overflow, rather than splitting immediately, remove
~30% of the entries and reinsert them from the root, giving them a chance to find better homes. This
is a *deliberate* structural churn to improve quality — and it is the closest thing in this book to
Volume 2 §12's splay-tree philosophy of restructuring opportunistically, arriving from a completely
different direction.

### BKD-trees: the modern disk-based point index

> **Confidence: moderate-high.** Octavian Procopiuc, Pankaj Agarwal, Lars Arge and Jeffrey Scott
> Vitter, "Bkd-tree: A Dynamic Scalable kd-Tree", 2003.

A BKD-tree is a **KD-tree adapted for disk**, using B-tree-style bulk loading and a small forest of
static trees plus a buffer for updates (which is Volume 3 §20.5's Bε-tree idea, applied spatially).

It matters because **Lucene and Elasticsearch use BKD-trees for all numeric and geo point fields**,
having migrated away from an earlier geohash-prefix-tree approach. For *point* data on disk, BKD has
largely displaced R-trees; R-trees remain the answer for *extended objects*.

## 25.5 Comparison, and where each runs

| | KD-tree | Quadtree / Octree | R-tree | BKD-tree |
|---|---|---|---|---|
| Boundary at | a data point | the cell centre | object MBRs | a data point, page-packed |
| Indexes | points | points (and regions) | **extended objects** | points |
| Balanced | yes (if median-built) | **no** | **yes** (B-tree-style) | yes |
| Children may overlap | no | no | **yes** | no |
| Deterministic shape | no | **yes** | no (heuristic) | mostly |
| Designed for | RAM | RAM | **disk** | **disk** |
| Insertion cost | O(log *n*), rebalancing awkward | O(depth) | O(log *n*) + heuristics | buffered |
| Curse of dimensionality | **severe** past *d* ≈ 10–20 | severe (2^*d* children!) | severe | severe |

**Databases and geospatial:**

- **PostGIS / PostgreSQL** — the **GiST** index (Hellerstein, Naughton, Pfeffer, 1995) is a
  *generalized search tree*: a framework where you supply the predicate and consistency functions,
  and for spatial types the resulting structure is an R-tree. Worth noticing as an engineering idea
  in its own right — a parameterized tree, of which R-trees, B-trees and others are instances.
- **SQLite** ships an `R*Tree` virtual table module. **MySQL** `SPATIAL` indexes are R-trees.
  **Oracle Spatial** uses R-trees.
- **Elasticsearch / Lucene** — BKD-trees for every numeric and geo point field.
- **MongoDB** `2dsphere` — S2 cells (§25.1's Hilbert-on-a-sphere).

**Graphics, games and simulation:**

- **BVH (bounding volume hierarchy)** — essentially an R-tree specialized for ray queries, built
  with a surface-area heuristic. This is the dominant structure for ray tracing, and modern GPUs
  contain **dedicated hardware to traverse BVHs**, which is about as strong a statement about a data
  structure's importance as exists.
- **Octrees** for level-of-detail, frustum culling, voxel worlds, and Barnes–Hut (§25.3).
- **Quadtrees** for 2-D collision detection, terrain, and tile-based games.
- **KD-trees** for point-cloud processing (PCL), photon mapping, and older ray tracers.

**Machine learning — and an honest note.** `scikit-learn` ships `KDTree` and `BallTree` for exact
*k*-NN, and they work well in low dimensions. For high-dimensional approximate nearest neighbour —
embedding search, vector databases, retrieval — **trees have largely lost.** The dominant structures
are **HNSW** (hierarchical navigable small-world *graphs*) and IVF/PQ quantization schemes, as used
in FAISS, and they are not trees at all.

> That is the second time in this volume that the modern answer to a problem turns out not to be a
> tree (Chapter 26 has the other). It is worth being clear-eyed about: **the curse of dimensionality
> defeats hierarchical space partitioning specifically**, because partitioning relies on regions
> being informative about distance, and in high dimensions they are not. A navigable graph makes no
> such assumption.

---

# Chapter 26 — Suffix Trees and Suffix Arrays: Indexing Every Position

## 26.1 The problem

Given a text *T* of length *n*, answer many queries of the form: **"does pattern *P* occur in *T*,
and where?"**

| Approach | Per-query cost | Notes |
|---|---|---|
| Naive scan | O(*n* · \|*P*\|) | |
| **KMP / Boyer–Moore** | O(*n* + \|*P*\|) | optimal *without preprocessing* |
| Trie of all **words** in *T* | O(\|*P*\|) | **only works for whole-word queries** |

The middle row looks fine until you multiply. Consider read alignment in genomics: *T* is a human
genome, *n* ≈ 3.1 × 10⁹ bases, and a single sequencing run produces 10⁸ short reads to locate.

$$
10^8 \text{ queries} \times 3.1\times10^9 \text{ characters} = 3.1 \times 10^{17}
$$

Three hundred quadrillion character comparisons per run. At a billion comparisons per second that
is ten years. **Linear-per-query is not good enough when the text is huge and the queries are
many.** We need cost that depends on |*P*| and not on *n* — which is exactly what Chapter 21
delivered, but only for keys we had chosen to insert.

And the third row's restriction is fatal here: DNA has no words. Neither does a log file you want to
grep for arbitrary fragments, nor a source-code corpus you want to search for a copied snippet.
Substring search is not word search.

## 26.2 The insight

> **Every substring of *T* is a prefix of some suffix of *T*.**

Read that twice, because the whole chapter is in it. If `banana` contains `nan`, then `nan` is a
prefix of the suffix `nana`. **Always** — a substring starts somewhere, and the suffix starting at
that same position begins with it.

Therefore: **build a trie containing all *n* suffixes of *T*.** Substring search becomes prefix
search, which Chapter 21 does in O(|*P*|) **independent of *n*.**

```
T = "banana$"        ($ = a sentinel not in the alphabet, so that no suffix
                        is a prefix of another — every suffix ends at a leaf)

  All 7 suffixes:
     0: banana$
     1: anana$
     2: nana$
     3: ana$
     4: na$
     5: a$
     6: $
```

The sentinel is worth a word: without it, `ana` is a prefix of `anana`, so the suffix `ana$`'s
terminal node would be an internal node. Appending a symbol that occurs nowhere else guarantees
exactly *n*+1 leaves, one per suffix, which makes every subsequent bound clean.

**Problem: a suffix trie is O(*n*²).** The suffixes have total length 1 + 2 + … + *n* = Θ(*n*²), and
an uncompressed trie has a node per character of shared structure. For a genome that is 10¹⁸
nodes — not a data structure, a joke.

**Solution: Chapter 21 §21.5's path compression.** Collapse single-child chains. Then:

> A compressed trie over *n*+1 strings has at most *n*+1 leaves, hence at most *n* branching
> internal nodes, hence **O(*n*) nodes total** (Volume 1 Fact 4 again). And edge labels are stored
> as **(start, length) references into *T***, not copies — so the space is O(*n*), not O(*n*²).

That is the **suffix tree**: a compressed trie of all suffixes, in linear space, supporting
substring search in time proportional to the pattern.

## 26.3 A worked suffix tree

*T* = `banana$`, positions 0–6.

```
                                (root)
            ┌──────────┬───────────────┬───────────────┐
           "$"        "a"          "banana$"          "na"
            │          │               │               │
          [6]          │              [0]              │
                 ┌─────┴─────┐               ┌─────────┴─────────┐
                "$"        "na"             "$"                "na$"
                 │           │               │                   │
                [5]     ┌────┴────┐         [4]                 [2]
                       "$"      "na$"
                        │         │
                       [3]       [1]

Leaf labels = the starting position of the suffix that ends there.
```

Verify every leaf by concatenating its path:

| Path | Spells | Suffix at |
|---|---|---|
| `$` | `$` | **6** ✔ |
| `a` + `$` | `a$` | **5** ✔ |
| `a` + `na` + `$` | `ana$` | **3** ✔ |
| `a` + `na` + `na$` | `anana$` | **1** ✔ |
| `banana$` | `banana$` | **0** ✔ |
| `na` + `$` | `na$` | **4** ✔ |
| `na` + `na$` | `nana$` | **2** ✔ |

All seven suffixes, each exactly once. ✔

### Search: `ana`

```
At root: first symbol 'a' → take the "a" edge.  Matched "a"; 2 symbols of P remain.
At the "a" node: next symbol 'n' → take the "na" edge.  Matched "na"; 0 remain.
                 PATTERN EXHAUSTED.

The subtree below this point has leaves [3] and [1].
  →  "ana" occurs at positions 1 and 3.
```

Check against `banana$`: positions 1–3 are `a n a` ✔, positions 3–5 are `a n a` ✔. Correct.

**Cost: two edge traversals, comparing 3 characters total.** Not 7, not log 7 — just |*P*|.

### And now the queries only a suffix tree answers cheaply

**Count occurrences** — the number of leaves below the match point. Precompute leaf counts at every
node (an augmentation, §23.2, composable in O(1) from children) and it becomes **O(|*P*|)**, with the
count read off in constant time at the end.

**All occurrences** — enumerate the subtree: O(|*P*| + *occ*).

**Longest repeated substring** — the **deepest internal node**, measured by string depth. An internal
node exists exactly where two or more suffixes diverge, so the string spelled by the path to it
occurs at least twice.

```
Internal nodes and their string depths in our tree:
    root                  depth 0
    "a"                   depth 1     ("a" occurs 3×)
    "a" → "na"            depth 3     ("ana" occurs 2×)      ← DEEPEST
    "na"                  depth 2     ("na" occurs 2×)

LONGEST REPEATED SUBSTRING of "banana" = "ana", length 3.  ✔
   ("ana" at positions 1 and 3, overlapping — which is correct and is
    something a naive approach usually gets wrong.)
```

**Longest common substring of two strings** — build a *generalized* suffix tree over both (append
distinct sentinels `$` and `#`), then find the deepest internal node whose subtree contains leaves
from **both**. Linear time, for a problem whose naive solution is O(*n*·*m*).

**Also, in linear time after construction:** matching statistics, all maximal repeats, longest
palindromic substring, Lempel–Ziv factorization (which is how you compute an LZ77 parse optimally),
and the Burrows–Wheeler transform.

## 26.4 Construction, and the name you already know

> **Confidence: high on the three papers.**

| Year | Author | Contribution |
|---|---|---|
| 1973 | **Peter Weiner** | First **linear-time** construction. "Linear pattern matching algorithms." Knuth is often quoted as having called it "the algorithm of 1973" — *(the quote is widely repeated; I would not swear to its exact wording)*. |
| 1976 | **Edward McCreight** | A simpler linear algorithm, *JACM*. |
| 1995 | **Esko Ukkonen** | Online linear-time construction, *Algorithmica* — the version usually taught, because it builds the tree incrementally one character at a time. |

> **Edward McCreight, for the third time in this book.** B-trees with Bayer in 1972 (Volume 3
> §16.1), priority search trees in 1985 (§23.5), and a linear-time suffix tree construction in 1976.
> Three chapters, three structures, one person.

Ukkonen's algorithm is famously hard to explain — its three tricks (implicit suffix trees, suffix
links, and skip/count with edge-label compression, plus the "once a leaf, always a leaf" and "active
point" bookkeeping) are individually simple and collectively slippery. It is one of the standard
examples of an algorithm that is easier to implement from the invariants than to follow from a
narrative.

### The problem with suffix trees, and it is fatal at scale

**Space constant.** The asymptotic O(*n*) hides a large multiplier: every internal node needs child
pointers, a suffix link, and edge-label offsets. Practical implementations land around **10–20 bytes
per character.**

```
Human genome, n ≈ 3.1 × 10⁹ bases:

    suffix tree at 15 bytes/base  ≈  47 GB
```

*(Confidence: moderate on the 10–20 figure; it is the commonly cited range and varies a lot with
implementation and alphabet.)*

Forty-seven gigabytes to index a three-gigabyte string. In 2005 that ended the conversation. Which
is why the next section exists.

## 26.5 Suffix arrays: throw away the tree, keep the order

> **Confidence: high.** Udi Manber and Gene Myers, "Suffix arrays: a new method for on-line string
> searches", SODA 1990 / *SIAM Journal on Computing* 1993.

**The observation:** a suffix tree's leaves, read left to right, are the suffixes in **lexicographic
order**. If that order is the thing doing the work, store just the order — an array of *n* integers —
and discard the tree.

### The suffix array of `banana$`

Sort all suffixes lexicographically (with `$` < `a` < `b` < `n`):

```
  rank   suffix        start position
  ────────────────────────────────────
   0     $                   6
   1     a$                  5
   2     ana$                3
   3     anana$              1
   4     banana$             0
   5     na$                 4
   6     nana$               2

  SA = [ 6, 5, 3, 1, 0, 4, 2 ]
```

Check the two close calls: `ana$` vs `anana$` — they agree on `ana`, then `$` vs `n`, and `$` < `n`,
so `ana$` sorts first ✔. And `na$` < `nana$` by the same argument ✔.

Compare with §26.3's suffix tree: reading its leaves left to right gives 6, 5, 3, 1, 0, 4, 2 —
**exactly SA.** The array *is* the tree's leaf order.

### Search: binary search over the suffixes

```
Find "ana" in SA = [6, 5, 3, 1, 0, 4, 2]:

  Binary search for the first suffix ≥ "ana"  →  rank 2 (suffix at position 3, "ana$")
  Binary search for the last  suffix with prefix "ana"  →  rank 3 (position 1, "anana$")

  MATCH RANGE = ranks [2, 3]  →  positions {3, 1}.   ✔  Same answer as the tree.
```

Cost: O(|*P*| log *n*) naively, because each of the log *n* binary-search probes may compare up to
|*P*| characters. With the **LCP array** it improves to O(|*P*| + log *n*), and with additional
structure to O(|*P*|).

### The LCP array, and why it encodes the tree

`LCP[i]` = the length of the longest common prefix of `SA[i−1]` and `SA[i]`.

```
  rank   suffix        LCP with previous
  ─────────────────────────────────────────
   0     $                  —
   1     a$                 0        (lcp("$", "a$") = 0)
   2     ana$               1        ("a")
   3     anana$             3        ("ana")          ← maximum
   4     banana$            0
   5     na$                0
   6     nana$              2        ("na")

  LCP = [ —, 0, 1, 3, 0, 0, 2 ]
```

**max(LCP) = 3, which is the length of the longest repeated substring — `ana`.** Exactly the answer
§26.3 got from the suffix tree's deepest internal node. That is not a coincidence:

> **The internal nodes of a suffix tree correspond precisely to the local structure of the LCP
> array.** An internal node at string depth *d* covering a leaf range corresponds to a run in LCP
> whose minimum is *d*. So **suffix array + LCP array is informationally equivalent to a suffix
> tree**, and any suffix-tree algorithm can be rewritten to run over the two arrays instead — at a
> fraction of the space, and with far better cache behaviour, since arrays are scanned rather than
> pointer-chased (Volume 1 §1.6).

Kasai et al. (2001) gave an O(*n*) algorithm to construct LCP from SA and *T*. Linear-time suffix
array construction is a well-developed area: **DC3 / skew** (Kärkkäinen & Sanders, 2003) and
**SA-IS** (Nong, Zhang & Chan, 2009) are the standard practical algorithms. *(Confidence:
moderate-high.)*

### The comparison

| | Suffix tree | Suffix array + LCP |
|---|---|---|
| Space, practical | **10–20 bytes/char** | **4–9 bytes/char** |
| Human genome | ≈ 47 GB | ≈ 12–28 GB |
| Search | O(\|*P*\|) | O(\|*P*\| + log *n*) |
| Cache behaviour | poor (pointer chasing) | **good (array scans)** |
| Construction | linear but intricate (Ukkonen) | linear (SA-IS), simpler |
| Tree-shaped algorithms | direct | expressible via LCP |
| Implementation difficulty | **high** | moderate |

**The suffix array won.** It is the structure people actually build.

## 26.6 And then the answer stopped being a tree

> **Confidence: high on the papers and the tools; moderate on the exact index sizes.**

Even 12 GB is inconvenient. The final step — and it is a genuinely beautiful one — abandons trees
and arrays alike.

**The Burrows–Wheeler Transform** (Michael Burrows and David Wheeler, 1994) is a reversible
permutation of *T*, obtained by sorting all rotations of *T* and taking the last column. It has two
remarkable properties: it clusters repeated characters together (which is why **bzip2** is built on
it), and — the crucial part — it can be **searched**.

**The FM-index** (Paolo Ferragina and Giovanni Manzini, 2000) turns the BWT into a **compressed
self-index**: a structure that is smaller than the text, that can locate arbitrary substrings, and
from which the original text can be reconstructed — so you do not need to keep *T* at all.

Searching an FM-index works **backwards** through the pattern, maintaining a shrinking range of the
BWT via an operation called `LF`-mapping (built from rank queries over the BWT, answerable in O(1)
with succinct auxiliary structures). Each step processes one pattern character and narrows the range.
It is Chapter 21's descent, turned inside out.

```
Human genome index sizes, order of magnitude:

    suffix tree                 ≈ 47 GB
    suffix array + LCP          ≈ 12–28 GB
    the raw sequence, 2-bit     ≈ 0.8 GB
    FM-index (BWA / Bowtie)     ≈ 1–5 GB      ← smaller than a suffix array,
                                                and it REPLACES the sequence
```

**This is why short-read alignment became practical on ordinary hardware around 2009.** `bowtie`
(Langmead et al., 2009) and `bwa` (Li & Durbin, 2009) are both FM-index aligners, and their arrival
is one of the clearer cases of a data structure changing what a scientific field could do.

> **The honest note, and it is the second in this volume** (§25.5 had the other): the state of the
> art for substring search at scale is **not a tree**. It is a compressed index derived from the
> same sorted-suffix insight, with the tree structure discarded once its information content had
> been extracted more cheaply.
>
> That progression is worth sitting with, because it is a pattern: **suffix trie → suffix tree
> (compress the paths) → suffix array (keep only the leaf order) → FM-index (keep only what answers
> queries, compressed).** Each step throws away structure that turned out to be re-derivable. Volume
> 3 §19.4 made the same move on a smaller scale when it noticed a B+-tree separator only needs to
> *separate*. **An invariant is information, and information you can derive is information you do
> not have to store** — and this chapter is that principle carried to its limit.

## 26.7 Where these run

**Bioinformatics** is the dominant application area, by a wide margin.

- **Short-read alignment**: `bwa`, `bowtie`, `bowtie2`, `HISAT2` — all FM-index based.
- **Whole-genome alignment**: `MUMmer` uses actual suffix trees to find maximal unique matches.
- **Genome assembly**: overlap detection between reads, and FM-index-based assemblers (`SGA`).
- **Read counting and quantification**: `salmon` and `kallisto` use *k*-mer indexes and coloured de
  Bruijn graphs — related, but a different structure again.

**Data compression.** The BWT is the core of `bzip2`. Optimal LZ77 parsing uses a suffix tree or
suffix array to find the longest match at each position, which is what high-ratio LZMA-family
compressors do.

**Text tooling.** Plagiarism and duplicate detection, `diff` and merge algorithms on large inputs,
indexed `grep` over a fixed corpus, and detecting copy-paste in source code.

**A boundary worth knowing:** for *word*-based full-text search — a search engine over documents —
**inverted indexes** dominate, not suffix structures. An inverted index maps each word to its
posting list of document IDs, which is far more compact and directly supports ranking, boolean
queries, and phrase matching. Suffix structures win when queries are **arbitrary substrings** over a
text with no word boundaries. That distinction — arbitrary substrings versus tokenized words — is
the whole of the selection criterion, and it is why genomics uses suffix structures and Google does
not.

---

# Chapter 27 — Merkle Trees: Verification Instead of Retrieval

## 27.1 A completely different question

Every structure in the previous 26 chapters answered a variant of **"where is X?"** — by key, by
range, by prefix, by overlap, by proximity, by priority. This one answers:

> **"Has X been tampered with — and can you *prove* the answer cheaply, to someone who trusts
> nothing?"**

The setting: you have *n* data blocks. They are stored somewhere you do not control — a peer, a
cloud provider, an untrusted mirror, a disk that might be silently corrupting. You want to verify
that a block you receive is the block that was originally committed.

## 27.2 The two obvious approaches, and a familiar impossibility

**Approach A — store a hash per block.** Keep *H*(*b*ᵢ) for each block. Verifying block *i* is O(1):
hash it and compare.

The problem: *you must store and trust all n hashes.* A verifier — a phone, a light client, a boot
loader — now needs O(*n*) trusted storage, and you have not eliminated the trust problem, only moved
it from *n* blocks to *n* hashes.

**Approach B — store one hash of everything.** *H*(*b*₁ ∥ *b*₂ ∥ … ∥ *b*ₙ). One hash. Beautiful.

The problem: to verify **any single block** you must download and hash **all** the data. O(*n*) per
verification. For a 1 TB dataset, verifying one 4 KB block costs 1 TB of transfer.

| | Verifier storage | Cost to verify one block |
|---|---|---|
| A: *n* hashes | **O(*n*)** | O(1) |
| B: one hash | O(1) | **O(*n*)** |

**That is Volume 1 §1.7 for the third time in this volume.** Chapter 22 hit it as
"per-element values versus global prefix sums"; here it is "per-element hashes versus one global
hash". The diagnosis Volume 1 gave is exactly right again:

> *Per-element information is cheap to update and expensive to trust as a whole. Global information
> is cheap to trust and expensive to update or verify in part.*

And the fix is the one that has worked every time: **a hierarchy of aggregates.** Only now the
aggregate is a cryptographic hash.

## 27.3 The cryptographic prerequisite, briefly

A hash function *H* maps arbitrary-length input to a fixed-length digest (256 bits for SHA-256).
Three properties are usually named; **for Merkle trees, exactly one is load-bearing**:

| Property | Statement | Needed here? |
|---|---|---|
| Preimage resistance | given *H*(*x*), hard to find *x* | not directly |
| Second-preimage resistance | given *x*, hard to find *y* ≠ *x* with *H*(*y*) = *H*(*x*) | yes |
| **Collision resistance** | hard to find **any** *x* ≠ *y* with *H*(*x*) = *H*(*y*) | **this is the one** |

The reason collision resistance is the critical property is that the entire security argument is a
reduction to it:

> If an attacker can produce a valid Merkle proof for data that was not committed, then somewhere
> along the proof path two different inputs produced the same hash — **so a proof forgery *is* a
> collision.** Break the tree and you have broken the hash function.

This is why SHA-1's practical collision (the **SHAttered** attack, 2017) mattered so much to systems
built on Merkle trees, and why git has been migrating to SHA-256. *(Confidence: high.)*

## 27.4 The structure and the proof

> **Merkle tree.** Leaves are the hashes of the data blocks: *H*(*b*ᵢ). Every internal node is the
> hash of the concatenation of its children's hashes. The root is the **Merkle root** — a single
> digest committing to all *n* blocks.

```
                        ROOT = H( H_AB ‖ H_CD )
                       /                        \
        H_AB = H(H_A ‖ H_B)              H_CD = H(H_C ‖ H_D)
          /            \                    /            \
     H_A = H(A)    H_B = H(B)          H_C = H(C)    H_D = H(D)
         │              │                  │              │
      block A       block B            block C       block D
```

### The audit path

To prove that **block C** is committed under a root you already trust, the prover sends C plus the
**siblings along C's path**:

```
  PROOF for block C  =  [ H_D , H_AB ]        ← just two hashes

  Verifier's computation:
      H_C'   = H(C)                     ← hashes the block it received
      H_CD'  = H( H_C' ‖ H_D )          ← combines with the given sibling
      ROOT'  = H( H_AB ‖ H_CD' )        ← combines with the given uncle
      CHECK: ROOT' == ROOT ?            ← the one trusted value it holds
```

If it matches, C is authentic — and the verifier stored **one hash** and received **log₂ *n***.

```
  Proof size, SHA-256 (32 bytes per hash):

     n = 4              2 hashes  =     64 bytes
     n = 1,000         10 hashes  =    320 bytes
     n = 1,000,000     20 hashes  =    640 bytes
     n = 1,000,000,000 30 hashes  =    960 bytes

  INDEPENDENT of how large the blocks are.
```

| | Verifier storage | Verify one block | Proof size |
|---|---|---|---|
| A: *n* hashes | O(*n*) | O(1) | — (no trust anchor) |
| B: one hash of all | O(1) | **O(*n*)** | must send everything |
| **Merkle tree** | **O(1)** — just the root | **O(log *n*)** | **O(log *n*)** hashes |

### The second operation: finding *where* two datasets differ

This one is less often taught and is at least as useful. Given two Merkle trees over the same index
space:

```
  compare(node_ours, node_theirs):
      if hash(ours) == hash(theirs):  return  "identical — STOP"    ← prunes a whole subtree
      if leaf:                        return  "this block differs"
      recurse into both children

  Cost: O(k log n) to locate k differing blocks — NOT O(n).
  If nothing differs, the cost is ONE hash comparison.
```

**That is §23.2's augmentation-as-pruning, with a hash as the summary.** A matching hash proves an
entire subtree is identical, so it can be discarded without inspection. This is the operation behind
`rsync`, and behind replica repair in distributed databases (§27.6).

## 27.5 Two security subtleties, because most treatments skip them

The structure above is *almost* right, and the gap between "almost" and "right" has produced real
vulnerabilities.

### Domain separation: leaves and internal nodes must be hashed differently

If leaves and internal nodes are hashed the same way, an attacker can present an **internal node's
hash as if it were a leaf's**, claiming that the concatenation *H_A* ∥ *H_B* is itself a data block.
This is a second-preimage attack on the tree structure rather than on the hash.

The fix is **domain separation** — prefix a distinguishing byte:

```
   leaf hash     :  H( 0x00 ‖ data )
   internal hash :  H( 0x01 ‖ left ‖ right )
```

**RFC 6962** (Certificate Transparency) specifies exactly this. *(Confidence: high — this is a
well-documented requirement.)*

### Unbalanced trees and duplicated hashes

When a level has an odd number of nodes, something must be done with the odd one out. Bitcoin
**duplicates the last hash** and pairs it with itself. This turned out to allow two *different*
transaction lists to produce the *same* Merkle root, which is a consensus-splitting bug —
**CVE-2012-2459**. *(Confidence: moderate-high on the CVE and the mechanism.)*

> **The general lesson, and it is not a cryptography lesson:** the tree's structure is part of what
> is being committed to, and any ambiguity about *which tree produced this root* is a
> vulnerability. "Two different inputs can produce the same structure" is a collision even if the
> hash function is perfect. Every production spec therefore pins down padding, ordering,
> concatenation, and domain separation precisely — the parts a textbook diagram leaves implicit.

## 27.6 History and applications

> **Confidence: high.** Ralph C. Merkle, Stanford PhD thesis, 1979; US Patent 4,309,569, "Method of
> providing digital signatures", filed 1979, granted 1982.

The original motivation is worth knowing because it is not "verify a file". Merkle was making
**one-time signatures practical**. A one-time signature scheme lets you sign a single message per
key pair — useless alone, since you would need to publish thousands of public keys. Merkle's
insight: **hash all those public keys into a tree and publish only the root.** Then each signature
carries a log *n*-sized proof that its one-time key was among those committed.

Merkle also co-invented public-key cryptography (the Diffie–Hellman–Merkle key exchange) and Merkle's
Puzzles. He has an unusually high hit rate.

### Git — the object model *is* a Merkle DAG

```
  blob    = H( "blob"   ‖ size ‖ file contents )
  tree    = H( "tree"   ‖ size ‖ list of (mode, name, hash) entries )
  commit  = H( "commit" ‖ size ‖ tree hash ‖ parent hashes ‖ author ‖ message )
```

A commit hash therefore commits to the root tree, which commits to every subdirectory tree, which
commits to every blob — **and** to all parent commits, recursively. One 40-character hash commits to
the entire repository state and its whole history. Consequences you use daily:

- **Content-addressable storage.** Identical files anywhere in history are stored once, because
  they hash the same.
- **Fast status and diff.** If a directory's tree hash is unchanged, nothing inside it changed —
  §27.4's pruning. This is why `git status` on a huge repo does not read every file.
- **History is immutable.** Changing an old commit changes its hash, which changes every descendant
  commit's hash. This is not a policy; it is arithmetic. It is also exactly why `rebase` produces
  *new* commits rather than editing old ones.
- **`git fsck`** verifies the whole object graph by recomputing hashes.

> **And note: it is a DAG, not a tree.** Volume 1 §3.2 drew this distinction and warned that a DAG
> loses unique paths, needs visited-set tracking, and needs sharing-aware memory management. Git
> hits all three — unchanged subtrees are *shared* between commits (which is the source of its space
> efficiency), merge commits have multiple parents, and every graph walk in git carries a seen-set.
> Volume 1 §3.2 also promised that Volume 5 would revisit deliberate sharing; git is the case study.

### Blockchain

A Bitcoin block header contains the Merkle root of that block's transactions. That enables **SPV
(simplified payment verification)**: a light client stores only the 80-byte block headers — about
50 MB for the entire chain history — and can verify that a specific transaction is in a specific
block with a ~320-byte proof, without downloading the block. Volume-of-data reduction of many orders
of magnitude, purely from §27.4.

**Ethereum** goes further with the **Merkle Patricia Trie**: a radix tree (Chapter 21!) in which
every node's identity is the hash of its contents. So it is simultaneously a key-value index *and*
an authenticated structure — you can prove "account X has balance Y" with a log-sized proof. Two
chapters of this volume composed into one structure.

### Certificate Transparency

**RFC 6962.** An append-only Merkle tree of every TLS certificate a CA has issued. It supports two
proof types, and the second is the clever one:

- **Inclusion proof** — this certificate is in the log (§27.4).
- **Consistency proof** — the new tree of size *n*′ is an **extension** of the old tree of size *n*:
  nothing was removed, reordered, or altered. This is what makes the log *append-only* in a way
  anyone can check, and it is why a CA cannot quietly retract a mis-issued certificate.

### Distributed databases — anti-entropy

Cassandra, DynamoDB and Riak all use Merkle trees to reconcile replicas. Two replicas exchange
roots; if equal, they are in sync at **O(1) cost**; if not, they recurse to find the differing key
ranges and repair only those. **O(*k* log *n*) instead of O(*n*)** — §27.4's difference-finding
operation, at datacentre scale.

### Filesystems and verified boot

- **ZFS** stores each block's checksum **in the block pointer that references it**, so the whole
  filesystem is a Merkle tree rooted at the uberblock. This enables **self-healing**: a read that
  fails its checksum is detected and repaired from a mirror or from parity. Silent corruption
  becomes detectable rather than merely likely.
- **Btrfs** does the same.
- **dm-verity** (Android, ChromeOS): a Merkle tree over the read-only system partition, with the
  root hash signed and embedded in the boot chain. **Every block read is verified against the tree
  on the fly.** That is verified boot, and it is a Merkle tree in the storage hot path.

### Content addressing and transfer

**IPFS** — a content identifier is a hash, the object graph is a Merkle DAG, so deduplication and
verification come free. **BitTorrent v2** uses per-file Merkle trees (v1 used a flat list of piece
hashes, which required downloading the whole `.torrent` metadata upfront). **rsync** and `zsync` use
hierarchical checksums to transfer only differences.

### Post-quantum signatures — a 1979 structure comes back

Hash-based signature schemes — **XMSS** (RFC 8391) and **SPHINCS+** — are Merkle trees over one-time
keys, i.e. Merkle's original 1979 construction, modernized. Their security rests **only** on hash
function properties, with no number-theoretic assumptions, which makes them believed
quantum-resistant. SPHINCS+ was selected in NIST's post-quantum standardization process.
*(Confidence: moderate-high on the selection.)*

> A structure invented in 1979 to make one-time signatures practical is now a leading candidate for
> signatures that survive quantum computers — for exactly the reason it was invented: it needs
> nothing but a hash function.

## 27.7 The general idea: authenticated data structures

A Merkle tree is the canonical member of a family. The recipe generalizes:

> **Make each node's identity be the hash of its contents, *including its children's identities*.**

Apply it to anything:

| Base structure | Authenticated version | Used by |
|---|---|---|
| Binary tree over blocks | **Merkle tree** | git, Bitcoin, ZFS, CT |
| Radix tree (Ch 21) | **Merkle Patricia Trie** | Ethereum state |
| B-tree (Vol 3) | Merkle B-tree | authenticated databases |
| Skip list | authenticated skip list | early certificate revocation designs |
| Any DAG | **Merkle DAG** | git, IPFS |

And notice what the hash is, in §23.2's terms: **a summary of the subtree, composable in O(1) from
the children's summaries** — condition (a) exactly — **which lets you discard the subtree without
looking inside it** if it matches — condition (b) exactly.

> **A Merkle tree is an augmented tree whose augmentation is a hash.** That is all it is. The
> cryptography supplies the guarantee that the summary cannot be forged; the tree supplies the
> logarithmic proof size. Chapter 29 makes the general point, but this is the cleanest instance of
> it, because the "aggregate" is doing something that looks nothing like aggregation.

---

# Chapter 28 — Decision Trees: A Different Lineage Entirely

## 28.1 Why this chapter is different

Every structure so far **stores your data**, and its correctness criterion is exact: it either finds
what you put in, or it has a bug.

A decision tree stores a **model** — a hypothesis about a relationship — and its correctness
criterion is **statistical**: how well it predicts data it has never seen. There is no "correct"
decision tree for a dataset, and a tree that represents its input perfectly is usually **broken**.

This is a genuinely different intellectual lineage. It comes from statistics and machine learning
rather than from computer science, and the differences run deep:

| | Data-structure trees (Ch 1–27) | Decision trees |
|---|---|---|
| Contains | your data | a **hypothesis** about your data |
| Correctness | **exact** — finds the key or does not | **statistical** — accuracy on unseen data |
| Goal | retrieve what you put in | **generalize to what you have never seen** |
| Failure mode | bug, corruption, imbalance | **overfitting** — fitting noise as if it were signal |
| Optimality | provable (height bounds, lower bounds) | finding the optimal tree is **NP-hard**; every practical algorithm is a greedy heuristic |
| Same input → | the same tree | **different trees under resampling** — and that variance is *exploited* (§28.6) |
| A tree that fits its input perfectly is | **correct** | **worthless** |

That last row is the one to hold onto. It has no analogue anywhere else in this book.

## 28.2 But structurally it is something we have already built

Before the differences, the similarity — because it places the chapter properly.

A decision tree node holds a **test on one feature** (`age < 34?`). Edges are outcomes. Leaves hold
**predictions**. Prediction is a root-to-leaf descent: O(depth), one comparison per level.

**That is a BST search.** And with axis-aligned tests on numeric features, the tree partitions
feature space into axis-aligned boxes, one per leaf — which is exactly Chapter 25's KD-tree:

> **A decision tree with axis-aligned splits *is* a KD-tree over feature space, with two
> differences: its leaves store a prediction instead of a point, and its split points are chosen to
> minimize *impurity* rather than to balance the tree.**

Everything else transfers. Depth determines prediction latency. The axis-aligned partition means a
diagonal decision boundary requires a staircase of many splits (§28.8's main weakness), exactly as a
KD-tree needs many cells to approximate a sphere. And Chapter 25's "augmentation for approximation"
(§25.3, Barnes–Hut) is what a leaf does: it stores a summary standing in for all the training points
that landed there.

## 28.3 History

> **Confidence: high on CART, ID3/C4.5, random forests and gradient boosting; moderate on the
> earliest work.**

| Year | Work | Contribution |
|---|---|---|
| 1963 | **AID**, Morgan & Sonquist | Automatic Interaction Detection — arguably the first regression tree |
| 1980 | **CHAID**, Kass | chi-squared based splits, multiway |
| **1984** | **CART** — Breiman, Friedman, Olshen & Stone | The book. Gini impurity, **cost-complexity pruning**, surrogate splits for missing data, regression trees |
| 1986 | **ID3**, Ross Quinlan | information gain |
| 1993 | **C4.5**, Quinlan | gain ratio, continuous attributes, missing values, pruning |
| 1996 | **Bagging**, Breiman | bootstrap aggregation |
| 1997 | **AdaBoost**, Freund & Schapire | the first practical boosting algorithm |
| **2001** | **Random forests**, Breiman | bagging + random feature subsets |
| **2001** | **Gradient boosting**, Friedman | "Greedy function approximation: a gradient boosting machine" |
| 2016 | **XGBoost**, Chen & Guestrin | regularized objective, second-order, sparsity-aware |
| 2017 | **LightGBM**, Ke et al. | histogram splits, leaf-wise growth |
| 2018 | **CatBoost**, Prokhorenkova et al. | ordered boosting, native categorical handling |

## 28.4 Training: greedy recursive partitioning

Finding the optimal decision tree is NP-hard, so every practical algorithm is the same greedy loop:

```
build(samples):
    if stopping condition:  return Leaf(majority class / mean value of samples)
    best = argmax over all (feature, threshold) of  impurity_decrease
    left, right = partition(samples, best)
    return Node(best, build(left), build(right))
```

**Impurity** measures how mixed a node's labels are. Two standard choices:

$$
\text{Gini}(S) = 1 - \sum_i p_i^2 \qquad\qquad \text{Entropy}(S) = -\sum_i p_i \log_2 p_i
$$

Both are maximal when classes are evenly mixed and zero when a node is pure. The **decrease** from
choosing a split is:

$$
\Delta = I(\text{parent}) - \frac{n_L}{n}I(\text{left}) - \frac{n_R}{n}I(\text{right})
$$

With entropy, Δ is called **information gain** and is measured in bits — literally, how many bits of
uncertainty about the label this question resolves. Which makes the whole training procedure
readable as: **at every node, ask the question that tells you the most.** That is the same framing
Chapter 21 §21.2 used to explain why a trie beats the comparison bound — bits of information per
step — and it is not a coincidence, since both are decision trees over a query space.

## 28.5 A worked example

Predict `Buy?` from `Age` (numeric) and `Income` (categorical).

| # | Age | Income | Buy? |
|---|---|---|---|
| 1 | 22 | Low | No |
| 2 | 25 | High | No |
| 3 | 28 | Low | No |
| 4 | 33 | Low | No |
| 5 | 35 | High | **Yes** |
| 6 | 38 | High | **Yes** |
| 7 | 42 | Low | **Yes** |
| 8 | 45 | High | **Yes** |
| 9 | 50 | Low | No |
| 10 | 55 | High | **Yes** |

**Root:** 5 Yes, 5 No.

$$
\text{Gini} = 1 - (0.5^2 + 0.5^2) = \mathbf{0.5} \qquad \text{Entropy} = 1.0 \text{ bit}
$$

### Evaluate candidate splits

**Candidate A — `Age < 34`:**

```
  left  {1,2,3,4}     : 0 Yes, 4 No   →  Gini = 1 − (0² + 1²)             = 0.000  (pure)
  right {5,6,7,8,9,10}: 5 Yes, 1 No   →  Gini = 1 − ((5/6)² + (1/6)²)     = 0.278

  weighted = (4/10)(0.000) + (6/10)(0.278) = 0.167
  GINI DECREASE = 0.500 − 0.167 = 0.333
```

**Candidate B — `Income = High`:**

```
  High {2,5,6,8,10}   : 4 Yes, 1 No   →  Gini = 1 − (0.8² + 0.2²)         = 0.320
  Low  {1,3,4,7,9}    : 1 Yes, 4 No   →  Gini = 1 − (0.2² + 0.8²)         = 0.320

  weighted = (5/10)(0.320) + (5/10)(0.320) = 0.320
  GINI DECREASE = 0.500 − 0.320 = 0.180
```

**Candidate C — `Age < 47.5`:**

```
  left  {1..8}        : 4 Yes, 4 No   →  Gini = 0.500
  right {9,10}        : 1 Yes, 1 No   →  Gini = 0.500

  weighted = (8/10)(0.500) + (2/10)(0.500) = 0.500
  GINI DECREASE = 0.500 − 0.500 = 0.000       ← useless split
```

**Winner: `Age < 34`, decrease 0.333.** Cross-check with entropy: information gain for A is
1.0 − [0.4(0) + 0.6(0.650)] = **0.610 bits**; for B it is 1.0 − 0.722 = **0.278 bits**. Both criteria
agree, which is typical — Gini and entropy rarely disagree on the winner, and Gini is cheaper because
it needs no logarithms.

### Recurse

```
Left child {1,2,3,4}: 0 Yes, 4 No → PURE → Leaf, predict "No".

Right child {5,6,7,8,9,10}: 5 Yes, 1 No, Gini 0.278.  Evaluate:

  Income = High?    High {5,6,8,10}: 4Y/0N Gini 0.000
                    Low  {7,9}     : 1Y/1N Gini 0.500
                    weighted = (4/6)(0) + (2/6)(0.5) = 0.167   →  decrease 0.111

  Age < 47.5?       left {5,6,7,8} : 4Y/0N Gini 0.000
                    right {9,10}   : 1Y/1N Gini 0.500
                    weighted = 0.167                           →  decrease 0.111

  A TIE. (Ties are common on small data; implementations break them by feature
  order, or randomly — which is itself a source of the variance §28.6 exploits.)
  Take Income = High.

    High {5,6,8,10}: PURE → Leaf, predict "Yes".
    Low  {7,9}     : 7=(42,Yes), 9=(50,No). Split Age < 46 → both pure.
```

### The finished tree

```
                        ┌──────────────┐
                        │  Age < 34 ?  │
                        └──┬────────┬──┘
                     yes ──┘        └── no
                          │              │
                   ┌──────────────┐  ┌───────────────────┐
                   │ Leaf:  No    │  │ Income = High ?   │
                   │ (4/4 correct)│  └──┬─────────────┬──┘
                   └──────────────┘ yes─┘             └─no
                                        │                 │
                                 ┌──────────────┐  ┌──────────────┐
                                 │ Leaf:  Yes   │  │  Age < 46 ?  │
                                 │ (4/4)        │  └──┬────────┬──┘
                                 └──────────────┘ yes─┘        └─no
                                                      │            │
                                               ┌───────────┐ ┌───────────┐
                                               │ Leaf: Yes │ │ Leaf: No  │
                                               │   (1/1)   │ │   (1/1)   │
                                               └───────────┘ └───────────┘

Training accuracy: 10/10 = 100%.   Depth: 3.
```

### Now look at that last split, because it is the whole chapter

The `Age < 46` node separates **exactly two data points**: a 42-year-old low-income buyer and a
50-year-old low-income non-buyer. It asserts that among low-income people over 34, the buying
threshold is at age 46.

**Is that a real pattern, or is it noise?** With *n* = 2 you cannot possibly tell. And the tree has
committed to it as confidently as it committed to `Age < 34`, which was supported by ten points.

This is **overfitting**, and note that it is not a bug — the algorithm did exactly what it was told,
which was to maximize impurity decrease. A fully grown tree can *always* reach 100% training
accuracy: keep splitting until every leaf holds one sample. That tree memorizes the training set
and generalizes to nothing.

> **Every other structure in this book gets better as it represents its input more precisely. This
> one gets worse.** That inversion is the single most important thing to carry out of this chapter.

## 28.6 Regularization, and the bias–variance trade

Two families of remedy:

**Pre-pruning / early stopping** — refuse to make splits that look unsupported: `max_depth`,
`min_samples_split`, `min_samples_leaf`, `min_impurity_decrease`. Cheap, but myopic: a weak split
can be the necessary precondition for a strong one two levels down, and early stopping never finds
out.

**Post-pruning** — grow the tree fully, then cut it back. CART's **cost-complexity pruning**
minimizes

$$
R_\alpha(T) = R(T) + \alpha \,|\text{leaves}(T)|
$$

where *R*(*T*) is training error and α is a penalty per leaf, chosen by cross-validation. **This is
an explicit complexity penalty** — a regularizer — and the shape of it (fit plus a penalty on model
size) is the same shape as ridge regression, lasso, weight decay, and minimum description length. It
is the standard way the machine learning field expresses "prefer the simpler hypothesis".

The underlying dial is the **bias–variance trade-off**:

| Tree depth | Bias | Variance | Behaviour |
|---|---|---|---|
| Shallow (depth 1–3) | **high** | low | underfits; misses real structure; stable across resamples |
| Deep / unpruned | low | **high** | fits noise; wildly different tree from a slightly different sample |

**A single deep decision tree has low bias and high variance.** Hold that sentence — the next two
sections are two opposite strategies for exploiting it.

## 28.7 Ensembles: two opposite exploits of the same weakness

### Bagging and random forests — attack the variance

> **Confidence: high.** Leo Breiman, "Random forests", *Machine Learning*, 2001, building on his own
> bagging (1996) and Tin Kam Ho's random subspace method (1995).

If deep trees have high variance, **average many of them**. Two sources of diversity:

1. **Bootstrap sampling** — each tree trains on *n* samples drawn **with replacement** from the
   training set, so each tree sees a different dataset.
2. **Random feature subsets** — at *each split*, consider only a random subset of features
   (conventionally √*p* for classification).

Grow every tree **deep and unpruned** — you *want* low bias and high variance, because averaging is
going to destroy the variance.

**Why feature subsampling is not optional — the derivation.** Let each tree have variance σ² and
pairwise correlation ρ. The variance of the average of *B* trees is:

$$
\operatorname{Var}\!\left(\frac{1}{B}\sum_{b} T_b\right) = \rho\sigma^2 + \frac{(1-\rho)\sigma^2}{B}
$$

As *B* → ∞ the second term vanishes and you are left with **ρσ²**. So:

> **More trees buys you nothing beyond a point — ρ is the floor.** Bootstrap sampling alone leaves
> trees highly correlated, because they all discover the same dominant feature and put it at the
> root. Feature subsampling exists **specifically to reduce ρ**, and that is why it is the
> distinguishing ingredient of a random forest rather than a refinement of bagging.

**Bonus: out-of-bag error, for free.** Each bootstrap sample omits roughly

$$
\left(1 - \tfrac{1}{n}\right)^n \to \tfrac{1}{e} \approx 36.8\%
$$

of the training data. So every point is out-of-bag for ~37% of the trees, and averaging their
predictions on it gives a validation estimate **with no held-out set and no cross-validation
loop**.

### Gradient boosting — attack the bias

> **Confidence: high.** Jerome Friedman, "Greedy function approximation: a gradient boosting
> machine", *Annals of Statistics*, 2001.

The opposite construction. Train trees **sequentially**, each one correcting the errors of the
ensemble so far:

$$
F_m(x) = F_{m-1}(x) + \nu \cdot h_m(x)
$$

where *h*ₘ is a tree fitted to the **negative gradient of the loss** with respect to the current
predictions — hence the name: it is gradient descent, performed in function space, with each step
being a tree.

And now the trees are **shallow** (depth 3–8, "weak learners"): you *want* high bias and low
variance, because the sequential correction process is what reduces bias, and low-variance
components keep the additive process stable. The learning rate ν (shrinkage, typically 0.01–0.1) is
essential regularization — small ν with many trees consistently beats large ν with few.

### The contrast, which is the cleanest way to remember them

| | **Bagging / Random Forest** | **Gradient Boosting** |
|---|---|---|
| Trees trained | **in parallel**, independently | **sequentially**, each on the last's errors |
| Individual trees | **deep**, low bias, high variance | **shallow**, high bias, low variance |
| Reduces | **variance** | **bias** |
| Diversity from | bootstrap + feature subsets | the sequential residual process |
| Adding more trees | eventually stops helping (ρσ² floor) | **eventually overfits** — needs early stopping |
| Sensitivity to hyperparameters | low — works well out of the box | **high** — needs tuning |
| Parallelizable | **trivially** | only within a tree |

**Modern implementations** and what each contributed: **XGBoost** (a regularized objective with a
second-order Taylor expansion of the loss, plus sparsity-aware split finding), **LightGBM**
(histogram-based split search and leaf-wise rather than level-wise growth — much faster on large
data), **CatBoost** (ordered boosting to eliminate target leakage in categorical encoding, plus
native categorical handling).

## 28.8 Why trees dominate tabular data, and where they fail

**Gradient-boosted trees remain the strongest general method for tabular data**, generally
outperforming deep neural networks on such tasks. *(Confidence: moderate — this is the widely
reported finding, examined explicitly in work such as Grinsztajn et al., 2022, "Why do tree-based
models still outperform deep learning on tabular data?")*

**Why:**

| Property | Why trees have it |
|---|---|
| **Scale-invariant per feature** | Only the *ordering* of a feature's values matters, so no normalization is needed. Nothing else in ML gets this for free. |
| **Mixed types natively** | Numeric and categorical features coexist; the split test just differs. |
| **Missing values** | CART's surrogate splits; modern boosters learn a default direction per node. |
| **Non-smooth, interaction-heavy relationships** | Piecewise-constant axis-aligned functions capture thresholds and interactions directly, which is what tabular relationships often are. |
| **No feature engineering for monotone transforms** | log, sqrt, rank — all invisible to a tree. |
| **Interpretability** | A single tree is readable; ensembles yield feature importances and SHAP attributions. |

**Where they fail:**

- **Smooth and linear relationships.** *y* = 2*x* requires a staircase of splits to approximate what
  linear regression captures in one coefficient.
- **Diagonal decision boundaries.** Axis-aligned splits approximate a diagonal with a staircase —
  exactly Chapter 25's KD-tree-versus-sphere problem. (Oblique trees, which split on linear
  combinations, address this at the cost of interpretability and training time.)
- **Extrapolation — and this one bites people.** A tree's prediction is always a leaf value derived
  from training data, so **it can never predict outside the range of the training targets.** Feed a
  time-series model with a trend into a gradient-boosted tree and it will flatline at the edge of
  the training range. This is a hard structural limit, not a tuning problem.
- **High-dimensional sparse data** (text, images) — where neural networks and linear models with
  proper regularization win.

**Real uses:** credit scoring and insurance pricing (where interpretability is a regulatory
requirement), fraud detection, click-through-rate prediction, medical risk scores, demand
forecasting, and **learning-to-rank** — **LambdaMART**, which is gradient-boosted trees, has been a
mainstay of web search ranking.

**And a closing note tying back to the rest of the book:** at *inference* time, a boosted ensemble
is a data structure being traversed millions of times per second, and its memory layout matters
exactly as much as Volume 1 §6.2 said it would. There is real engineering work on cache-efficient
tree inference — laying out nodes in traversal order, converting trees to branchless arithmetic,
compiling ensembles into straight-line code (QuickScorer, Treelite). **The model is a tree; the
serving system is a Volume 1 §6 layout problem.** Volume 6 returns to this.

---

# Chapter 29 — Synthesis: The Tree as a Summary Machine

## 29.1 One recipe, eight instances

Volume 4 looked like eight unrelated structures. It was one idea eight times. Here is the table
promised in the preface:

| Chapter | A descent step consumes | Each node summarizes its subtree as | The question answered |
|---|---|---|---|
| **21** Trie | one **symbol** of the key | the set of keys with this prefix | is this key/prefix present? longest prefix? |
| **22** Segment tree | one **bit of the index range** | an **associative aggregate** (sum, min, …) | aggregate over [*l*, *r*] |
| **22** Fenwick tree | one **set bit** of the index | an aggregate over a bit-aligned block | prefix aggregate |
| **23** Interval tree | one comparison of a **low endpoint** | the **maximum high endpoint** | which intervals overlap? |
| **24** Heap | — (the answer is at the root) | the **minimum** of the subtree | what is the extreme? |
| **25** KD / quad / R-tree | one **coordinate or cell** | a **bounding region** | what is near / overlapping? |
| **26** Suffix tree | one **symbol of the pattern** | the set of **positions** below | where does this substring occur? |
| **27** Merkle tree | one **bit of the block index** | a **cryptographic hash** | is this block authentic? |
| **28** Decision tree | one **feature test** | a **prediction** for this region | what is the label? |

And Volumes 1–3 belong in the same table:

| Volumes 1–3 | one **key comparison** | the **range of keys** below | where is key *k*? what is in [*l*, *r*]? |

> **The search trees of Volumes 1–3 were the special case in which the summary happens to be "the
> range of keys below me".** That summary is so natural that it is invisible, which is why the
> general pattern is easy to miss until you have seen eight other choices of summary.

## 29.2 The recipe, precisely

From §23.2, now with nine instances behind it:

> **Augmentation.** Store at each node *x* a value *f*(*x*) summarizing *x*'s subtree, such that:
>
> **(a) Composability** — *f*(*x*) is computable in **O(1)** from *x*'s own data plus *f* of its
> children.
>
> **(b) Usefulness** — *f*(*x*) either answers the query outright, or lets you **discard *x*'s
> entire subtree** without descending into it.

Condition (a) is what makes augmentation survive **rebalancing**: a rotation (Volume 2 §9.7) changes
the subtree membership of only O(1) nodes, so *f* can be repaired in O(1). **Therefore any composable
summary can be bolted onto any of Volume 2's balanced trees or Volume 3's B-trees at no asymptotic
cost.** That is why the Linux kernel derives an interval tree from its existing red-black tree in a
few dozen lines (§23.6).

Condition (b) has two distinct modes, and separating them is worth doing:

**Exact pruning** — the summary *proves* the subtree contains no answer. Interval trees
(`max_hi < q_lo`), R-trees (MBR misses the query), Merkle diffing (hashes match, subtree is
identical), KD-tree NN search (splitting plane farther than the current best).

**Approximation** — the summary *stands in for* the subtree, which contains answers you have decided
not to look at. Barnes–Hut (a distant cell becomes a point mass), level-of-detail rendering, and —
arguably — a decision tree leaf, whose stored prediction replaces every training point that fell
there.

Two uses of one mechanism. The first is about *correctness with less work*; the second is about
*deliberately accepting error to buy work*.

### And when the recipe does not apply

Summaries that are **not** computable from children cannot be maintained under rotation, and
augmentation simply does not work for them: the median of a subtree, the second-largest gap between
consecutive elements, "the most frequent value". If you find yourself wanting one of these, you need
a different structure or a periodic rebuild — and knowing the condition tells you immediately which
situation you are in.

## 29.3 Four lessons that generalize beyond trees

**1. Volume 1 §1.7's tension is a law, not an anecdote.** It appeared three times in this volume,
and always with the same diagnosis and the same fix:

| Appearance | Per-element form | Global form | The fix |
|---|---|---|---|
| Volume 1 §1.7 | linked list: O(1) update, no random access | sorted array: O(1) lookup, O(*n*) update | **the tree** |
| §22.1 | plain array: O(1) update, O(*n*) query | prefix sums: O(1) query, O(*n*) update | **segment / Fenwick tree** |
| §27.2 | *n* hashes: O(1) verify, O(*n*) trust | one hash: O(1) trust, O(*n*) verify | **Merkle tree** |

> **Whenever you find that per-element storage makes queries expensive and global storage makes
> updates expensive, the answer is a hierarchy of aggregates, and the cost becomes O(log *n*) for
> both.** That is not a fact about trees; it is a fact about the shape of the trade-off, and trees
> are just the standard way to instantiate it.

**2. Weakening an invariant can be the design, not a concession.** Chapter 24's heap deliberately
knows less than a BST — nothing about sibling order — and is rewarded with control over its own
shape, hence Volume 1 §6.3's implicit array layout, hence 8 bytes per element and the best cache
behaviour in the book. **The right question about an invariant is not "is it strong?" but "is it
exactly as strong as the queries require?"** Anything stronger is information you are paying to
maintain and not using.

**3. A lower bound is a bound *for a model*, and models can be changed.** Volume 2 §3.5 gave
log₂ *n* comparisons as a hard floor. Chapter 21's tries achieve O(|key|) *independent of n* — not
by beating the bound but by not being comparison-based, extracting log₂ σ bits per step instead of
1. Radix sort escapes Ω(*n* log *n*) the same way. **When a bound blocks you, the productive
question is what the model assumes and whether you can stop paying for that assumption.**

**4. Dimensionality and adversarial structure defeat hierarchical partitioning, and it is honest to
say so.** Twice in this volume the modern answer turned out not to be a tree:

- **High-dimensional nearest neighbour** (§25.5) — HNSW *graphs* and quantization beat KD-trees,
  because in high dimensions a region tells you almost nothing about distance, and partitioning is
  built entirely on the assumption that it does.
- **Substring search at genome scale** (§26.6) — the FM-index, a compressed self-index, beat suffix
  trees and suffix arrays by extracting the same information more cheaply and discarding the
  structure.

Both are instances of a principle Volume 3 §19.4 stated and §26.6 pushed to its limit: **an invariant
is information, and information you can derive is information you do not have to store.** The
progression suffix trie → suffix tree → suffix array → FM-index is four consecutive applications of
that idea, each throwing away structure that turned out to be re-derivable.

---

# Volume 4 Retrospective

**1. The volume changed the question, not the device.** Volumes 2 and 3 both asked "where is key
*k*?" and answered "a balanced ordered tree", differing only in fanout. Volume 4's nine chapters ask
nine different questions, and several are not lookups at all.

**2. Tries escape the comparison bound by not being comparison-based (Ch 21).** The path *is* the
key, so search costs O(|key|) independent of *n*, prefixes are shared structurally, and **longest
prefix match** — which no ordered index can express — becomes the natural operation. The price is
node overhead, which is why radix compression, bitmap nodes, and ART's four adaptive node types all
exist; every one of them is Volume 3's fanout lesson applied to a non-comparison structure.

**3. Segment trees are Volume 1 §1.7 solved again, and Fenwick trees are Volume 3 §19.4 applied to
it (Ch 22).** Point update versus range query is the same O(1)/O(*n*) impossibility, fixed the same
way. And the Fenwick tree discards **half** the segment tree by exploiting invertibility — an
invariant traded for space. The segment tree works for any **monoid**, which is what makes it a
general machine rather than a sum structure; and lazy propagation is Volume 3's
defer-and-batch principle at the smallest scale.

**4. Interval trees introduce augmentation, and the O(1)-from-children condition is why it is
compatible with balancing (Ch 23).** One extra number per node — `max_hi` — converts a
two-dimensional search into a single-path descent, with a three-line proof that only one direction
can hold an answer. The Linux kernel's `rb_subtree_last` field is literally this.

**5. The heap's weak invariant is the point (Ch 24).** Knowing nothing about sibling order means the
data cannot dictate the shape, so the structure dictates it — completeness — which unlocks Volume 1
§6.3's implicit array layout and its 8 bytes per element. **Volume 2 was the bill for letting the
data choose the shape.** And *d*-ary heaps reproduce Volume 3's fanout trade exactly, for the third
time in the book.

**6. Two dimensions have no proximity-preserving order, and no linearization fixes it (Ch 25).** The
strip argument gives 1/ε overwork in 2-D and 1/ε² in 3-D; space-filling curves bound but cannot
eliminate the distortion, which is the seam problem. So you partition space instead — at a data point
(KD), at the cell centre (quadtree), or by bounding boxes on disk (R-tree). And the R-tree shows what
losing the total order costs: **a B-tree's split point is forced (Volume 3 §18.3) while an R-tree's is
a heuristic optimization**, which is why every R-tree variant is an attack on overlap.

**7. Suffix structures index every position, via one observation (Ch 26).** Every substring is a
prefix of a suffix — so put all *n* suffixes in a compressed trie and substring search becomes
prefix search at O(|*P*|). The progression from there is the volume's cleanest demonstration of
information-versus-storage: suffix trie (O(*n*²)) → suffix tree (O(*n*) nodes) → suffix array (*n*
integers) → FM-index (smaller than the text, and replaces it).

**8. A Merkle tree is an augmented tree whose summary is a hash (Ch 27).** One hash committing to
everything, O(log *n*) proofs, and O(*k* log *n*) difference-finding — which is git's fast `status`,
Cassandra's replica repair, and rsync. The security subtleties that textbook diagrams omit — domain
separation, padding, structural ambiguity — are where the real CVEs live.

**9. Decision trees invert the correctness criterion (Ch 28).** Structurally they are KD-trees over
feature space with predictions at the leaves; philosophically they are the one structure in this
book where **perfectly representing your input means you have failed.** Overfitting has no analogue
in the other 27 chapters, and the ensembles that fix it exploit the same weakness from opposite
directions: bagging averages away variance, boosting sequentially corrects bias.

**10. It was one recipe throughout (Ch 29).** Store at each node a summary of its subtree,
composable in O(1) from the children, that either answers the query or lets you discard the subtree.
Volumes 1–3 were the special case where the summary is "the range of keys below me".

## The threads left dangling

Volume 3 ended by naming two things it had assumed and never justified, and Volume 4 has assumed
them too — every structure here has been described as if one thread were touching it, and as if
writes always completed.

Both of those are Volume 5, and by now the debt has accumulated:

- Volume 3 §18.6 (why preemptive splitting exists), §18.9 (why real B-trees refuse to merge), §19.6
  (why backward scans need retries), §20.2 (why B\*-trees died) all turned on concurrency and all
  deferred the argument. The claim that **content must only ever move rightward** so a stale reader
  can recover has now been asserted five times and never proved.
- Volume 3 §17.6 mentioned torn pages; §20.3 counted full-page log images without explaining what
  they repair. A split touches three pages, and no device writes three pages atomically.
- Volume 2 §12.6 said splay trees are unusable with concurrent readers and pointed here. Volume 1
  §3.2 promised that *deliberate* structural sharing — the DAG that git and Chapter 27 rely on —
  would be treated properly. Volume 2 §13.7 noted that skip lists are popular partly because
  randomization makes concurrency easier, and left it there.

---

# Volume 4 is complete

**File: `volume-4-specialized-trees.md`** — ready.

## What Volume 5 will cover: CONCURRENCY, CRASH SAFETY, AND PRODUCTION ENGINEERING

Every structure in Volumes 1–4 was described as a single-threaded object whose writes always
complete. Volume 5 removes both assumptions, and the accumulated deferrals come due.

- **The general problem.** Multiple readers and writers on one shared tree. Derived from the failure
  cases: a whole-tree lock kills parallelism; fine-grained locks risk deadlock and inconsistent
  reads mid-split; and **every operation touches the root**, so any scheme that holds a lock there
  serializes the entire structure.
- **Lock coupling / crabbing** as the general technique, then the **Lehman & Yao** high-concurrency
  B-tree algorithm in full: **right-links**, the **high key**, and exactly how a reader recovers
  when it lands on a page that split underneath it mid-traversal — with the proof of why content
  moving only rightward is load-bearing, and why that single invariant is what forbids merging
  (Volume 3 §18.9), kills B\*-trees (§20.2), and makes backward scans asymmetric (§19.6).
- **Crash safety.** What corruption actually looks like when a split is interrupted mid-write — both
  the multi-page problem and the **torn page** problem, which are different and need different
  fixes. Write-ahead logging as the general solution, **full-page writes** as the answer to torn
  pages specifically, and a walk through one real implementation (PostgreSQL's `nbtree`).
- **Write amplification and maintenance.** Why trees only grow without cleanup; free space maps,
  page and node reuse, deferred deletion; and the derivation of the cost/benefit trade between doing
  cleanup **online** and doing it **offline** in a background vacuum or compaction process.
- **Lock-free and persistent (immutable) trees** — the functional-programming angle. **Structural
  sharing**, why immutable trees are a natural fit for concurrent and versioned systems, and the
  case studies: Clojure's HAMTs (Volume 4 §21.6's bitmap nodes, revisited), git's object DAG
  (Volume 4 §27.6), and database MVCC.

Say **continue** when you would like me to start Volume 5.

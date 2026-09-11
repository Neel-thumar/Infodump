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


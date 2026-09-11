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


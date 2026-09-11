# Chapter 2 — Where Hierarchies Came From

Before we build the vocabulary, it is worth knowing that trees were not invented for computers.
They arrived in computing as an import, from mathematics and before that from the much older
business of drawing pictures of how things are organized. Knowing that history is useful for two
reasons: it explains some odd terminology, and it shows that hierarchical thinking is what humans
reach for when a structure has *containment* or *derivation* in it — which turns out to be most
structures.

## 2.1 Before computers: the diagram came first

The oldest tree-shaped diagrams in the Western tradition are classificatory. The **arbor
porphyriana** — Porphyry's tree — is a hierarchical arrangement of Aristotle's categories,
descending by successive division: substance divides into corporeal and incorporeal, corporeal
into animate and inanimate, and so on down to the individual.

> **Confidence: moderate on attribution, low on the diagram itself.** Porphyry wrote the
> *Isagoge* around 270 AD, and it describes the successive-division scheme in prose. Whether
> Porphyry drew it as a diagram is unclear; the tree *drawings* that survive are from later
> commentators and medieval manuscripts, with Boethius's Latin translation (~6th century) being
> the usual channel. Treat "Porphyry drew the first tree diagram" as a convenient simplification
> rather than an established fact.

Two other medieval families are worth knowing because they are the direct ancestors of the words
we use:

- **Genealogical trees** — the *arbor consanguinitatis*, drawn to determine degrees of kinship for
  marriage and inheritance law. This is where "parent", "child", "sibling", "ancestor", and
  "descendant" come from. They are not metaphors we invented for computing; they are the original
  terms, and we borrowed the whole vocabulary intact.
- **Trees of division in law and logic** — used to lay out how a rule subdivides into cases.

Notice that all of these are drawn with the root at the **top**, growing downward, and so are
ours. The "tree" is upside down, which everyone notices once and then never thinks about again.
Real trees branch upward; classification diagrams branch downward because we read downward.

## 2.2 The mathematics: 1847 and 1857

Trees became mathematical objects in the mid-nineteenth century, in graph theory.

**Gustav Kirchhoff, 1847.** In his work on electrical networks — the source of Kirchhoff's
circuit laws — he analyzed current flow by decomposing a network into a spanning tree plus the
remaining edges, which gives you exactly the independent loops you need. This is generally cited
as the earliest substantive mathematical use of tree structures. *(Confidence: high on the date
and the work; the framing as "first use of trees" is Knuth's, in TAOCP Vol 1 §2.3.4.)*

**Arthur Cayley, 1857.** Cayley published "On the theory of the analytical forms called trees",
and it is where the **name** enters mathematics. His motivation was combinatorial enumeration —
counting structures — arising from work on differential operators, and the same machinery was
later applied to counting chemical isomers, which is why trees show up early in mathematical
chemistry. Cayley's formula, that there are *n*^(n−2) distinct labeled trees on *n* vertices,
came later (1889).

> **Why this matters for us.** Cayley's trees are *unrooted*: just connected acyclic graphs. The
> notion of picking one node as the **root** and orienting everything relative to it is an
> addition — and it is the addition that makes trees useful for computing, because computation
> needs a place to start. Almost every tree in this book is a rooted, *ordered* tree (the
> children have a definite left-to-right sequence), which is a considerably more specific object
> than what Cayley was counting. Keep that distinction; it will matter when we count things in
> Chapter 3.

## 2.3 The 1950s: trees enter computing, three times over

Hierarchical structures did not arrive in computing at one moment. Several independent needs
produced them in the same decade.

**1952 — Huffman coding.** David Huffman, as a graduate student at MIT, produced an optimal
prefix-free code as a term-paper solution to a problem posed by Robert Fano. The construction
repeatedly merges the two least-frequent symbols, and the object built is a **binary tree** whose
leaves are symbols and whose root-to-leaf paths are codewords. *(Confidence: high on the paper
and year; the "he did it to avoid the final exam" version of the story is widely told and
plausibly embellished.)* This is one of the earliest cases where the *tree itself* is the answer
rather than a bookkeeping device.

**~1955–1956 — list structure and IPL.** As covered in §1.5, Newell, Shaw, and Simon needed to
manipulate symbolic expressions of unpredictable shape. Once you have nodes with pointers, nested
list structures are trees whether or not you call them that.

**1958–1960 — LISP.** John McCarthy's LISP made this explicit and inescapable. A LISP
S-expression built from `cons` cells is *exactly* a binary tree: each cell has two pointers
(`car` and `cdr`), and a nested expression is a tree of them. And critically, **LISP programs are
themselves S-expressions**, so the program is a tree, which is why LISP could manipulate code as
data. Every compiler's abstract syntax tree is a descendant of this idea.

> **Confidence: high.** McCarthy's "Recursive Functions of Symbolic Expressions and Their
> Computation by Machine, Part I" was published in *CACM* in April 1960, with the work dating from
> 1958 onward at MIT.

There is also a strong case that trees show up implicitly even earlier, in the structure of
merge sorting: von Neumann is generally credited with the first written sorting program, a merge
sort for the EDVAC around 1945, and the merge pattern is a tree. But calling that "using a tree
data structure" is a retrospective reading rather than something the author would have recognized.
*(Confidence: moderate on the von Neumann attribution, low on the interpretation.)*

## 2.4 The binary search tree: invented several times, quietly

Here is a fact that surprises people: nobody clearly "invented" the binary search tree. It appears
to have been discovered independently by multiple people around 1958–1962, and it was apparently
considered obvious enough that several discoverers did not think it worth writing up promptly.

Knuth, in *TAOCP* Volume 3 §6.2.2, credits independent discovery to at least:

| Attribution | Publication | Year |
|---|---|---|
| P. F. Windley | *The Computer Journal* | 1960 |
| A. D. Booth and A. J. T. Colin | *Information and Control* | 1960 |
| Thomas N. Hibbard | *Journal of the ACM* | 1962 |

> **Confidence: moderate-to-high on the list, moderate on the details.** These attributions come
> from Knuth's historical notes, which are the standard source. Knuth also indicates the method
> was in use somewhat earlier than its publications, and there are scattered claims of use in the
> mid-1950s that I have not been able to verify. Treat "independently discovered around
> 1958–1962, first published 1960" as the honest summary. Hibbard's 1962 paper is separately
> notable for the deletion algorithm, which is why "Hibbard deletion" is still the name for the
> standard BST delete — we will meet it in Volume 2.

The **balanced** tree is a different story, with clear authorship, because balancing is the part
that is genuinely non-obvious: Adelson-Velsky and Landis, 1962. That is Volume 2's subject and I
will leave it there.

## 2.5 Hierarchy as a *user-facing* idea: file systems and databases

Two developments in the mid-1960s made hierarchy something ordinary people interacted with, and
both are worth knowing because their design decisions are still with you every day.

**Multics and the directory tree, ~1965.** Early systems mostly gave each user a flat namespace
of files. Multics introduced a hierarchical directory structure in which directories can contain
directories without limit, with pathnames naming a route from a root. The relevant paper is
usually cited as Daley and Neumann, "A general-purpose file system for secondary storage", *AFIPS
Fall Joint Computer Conference*, 1965. Unix inherited this, and every path you have ever typed is
a root-to-node path in a tree. *(Confidence: high.)*

Note the problem being solved, because it is a recurring one: a flat namespace forces every name
to be globally unique, which does not scale socially. Hierarchy makes names **locally** unique
and disambiguates by path. That is a *human* scaling property rather than an algorithmic one, and
it is why hierarchy keeps reappearing in things like DNS, Java package names, and URL paths.

**IBM IMS and the hierarchical database model, ~1966–1968.** IMS was developed for inventory
management on the Apollo program, and its data model is explicitly hierarchical: records are
arranged in parent-child segments, and you navigate by traversing. It is one of the oldest pieces
of software still in production use.

> **Confidence: moderate on dates and participants.** Development beginning around 1966 with
> involvement from North American Rockwell and Caterpillar Tractor, in production around 1968,
> is the commonly given account. Specific dates vary between sources.

The hierarchical model is instructive mostly as a **cautionary tale**, and it is the one place in
this chapter where the lesson is negative. Real-world data is frequently not a tree — a part
belongs to many assemblies, an employee sits on many projects — and forcing it into a single
parent-child hierarchy means either duplicating data or building awkward workarounds. Codd's
relational model (1970) was in significant part a reaction to exactly this rigidity.

**This is the most important caveat in Volume 1: trees are a superb structure for organizing
*access* to data, and frequently a poor structure for *modeling* data.** Relational databases
abandoned the hierarchical data model and kept trees for the indexes — B-trees underneath, tables
on top. That split is not a compromise; it is the right answer, and understanding why will make
Volume 3 much easier.

## 2.6 Why the 1950s and 60s, and not earlier?

Because the economics changed, in three specific ways:

1. **Memory became addressable and reusable at fine grain.** Pointers require the ability to
   store and dereference an address as data. On plugboard or fixed-program machines the question
   does not arise. Stored-program machines make links expressible.

2. **Data outgrew memory.** Once collections are larger than what you can scan, Θ(n) search stops
   being acceptable and the pressure to build an index becomes real. Chapter 1's arithmetic is
   only urgent at scale.

3. **Problems arrived that are *natively* hierarchical.** Symbolic mathematics, parsing,
   classification, file organization. For these, a tree is not an optimization — it is the shape
   of the data, and any flat representation is an encoding of a tree.

Reason 3 is the one that gets underweighted. About half the structures in this book are trees
because a tree is *fast*; the other half are trees because the problem was a tree all along and
someone finally noticed. Volume 4 is largely the second kind.

## 2.7 Timeline

| Approx. date | Development | Who | Confidence |
|---|---|---|---|
| ~270 AD | Successive-division classification (*arbor porphyriana*) | Porphyry; diagrams likely later | Low on the diagram |
| Medieval | Consanguinity trees → our kinship vocabulary | Various | High on the vocabulary |
| 1847 | Spanning trees in electrical network analysis | Gustav Kirchhoff | High |
| 1857 | The name "tree"; enumeration of trees | Arthur Cayley | High |
| 1889 | Cayley's formula, *n*^(n−2) labeled trees | Arthur Cayley | High |
| ~1945 | Merge sort's implicit merge tree | von Neumann (attributed) | Moderate |
| 1952 | Huffman coding — the tree *is* the answer | David Huffman | High |
| ~1955–56 | Linked list technique, IPL | Newell, Shaw, Simon | High |
| 1958–60 | LISP: programs as trees, `cons` cells | John McCarthy | High |
| ~1958–62 | Binary search trees, independently | Windley; Booth & Colin; Hibbard | Moderate |
| 1962 | AVL trees — the first self-balancing BST | Adelson-Velsky, Landis | High |
| ~1965 | Hierarchical file system | Multics (Daley, Neumann) | High |
| ~1966–68 | Hierarchical database model | IBM IMS | Moderate |
| 1970 | Relational model — a reaction to hierarchy's rigidity | E. F. Codd | High |
| 1972 | B-trees — trees meet the disk | Bayer, McCreight | High |
| 1978 | Red-black trees (as symmetric binary B-trees, 1972→1978) | Bayer; Guibas, Sedgewick | Moderate |

The last three rows are Volumes 2 and 3. We now have the history; next we need the language.

---


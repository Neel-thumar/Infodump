# Trees: A Complete Guide to the Data Structure, From First Principles to Production Systems

## Volume 1 — Foundations

---

### A note on how this book works

Every data structure in this book exists because something else failed. Not failed in an
abstract, asymptotic, chalkboard sense — failed for someone, on real hardware, on a real
deadline, in a way that cost money or correctness or both. The structure was the repair.

So the order of explanation in this book is always the same: **the failure first, the repair
second.** You will not meet a mechanism before you have felt the problem that forced it into
existence. This is slower than the usual approach, which is to define the structure, list its
operations, state its complexities, and move on. It is slower because it is doing something
harder: it is trying to leave you able to *derive* the structure rather than recall it. If you
understand exactly which failure a red-black tree is a response to, you do not need to memorize
its five invariants — you can reconstruct most of them, and you can recognize the next problem
in that family when you meet it in your own work.

Volume 1 has no trees in it for a while. That is deliberate. We are going to spend the first
chapter establishing, with actual arithmetic, that flat structures cannot do what we need, and
that this is not a matter of engineering effort but of a genuine impossibility. Only once that
wall is real will we go looking for a door.

**On historical claims.** The history of computing before roughly 1970 is patchy. Ideas were
often invented several times in different places, published late or not at all, or circulated as
internal memoranda that no longer exist. Where a fact is well documented I state it plainly.
Where it is contested, approximate, or where I am reasoning from secondary sources, I flag it
explicitly like this:

> **Confidence: moderate.** Widely repeated in secondary literature, but I have not verified
> the primary source, and dates in this area are often off by a year or two.

I would rather leave you with a calibrated sense of what is known than with invented precision.
Invented precision is worse than admitted ignorance, because you cannot correct for it.

---

# Chapter 1 — The Tyranny of Flat Space

## 1.1 Three operations, one collection

Almost everything a program does with a collection of data reduces to three operations:

| Operation | Question it answers |
|---|---|
| **Search** | Is `x` in the collection? Where? What is associated with it? |
| **Insert** | Add `x` to the collection. |
| **Delete** | Remove `x` from the collection. |

There is a fourth that we will treat as first-class because it turns out to drive an enormous
number of real design decisions:

| Operation | Question it answers |
|---|---|
| **Enumerate in order** | Give me everything, sorted. Or: give me everything between `a` and `b`. |

A structure that is fast at all four would end this book at Chapter 1. The rest of the book
exists because no structure is fast at all four, and the interesting work is in choosing which
one to sacrifice — and in inventing structures whose sacrifice is smaller than the obvious ones.

We will now work through the flat structures — the ones with no hierarchy, where data sits in a
line — and derive their actual costs. Not the costs from a cheat sheet. The costs from counting.

## 1.2 The unsorted array

The simplest possible collection: a contiguous block of memory, elements packed end to end, plus
a count of how many are in use.

```
index:    0     1     2     3     4     5     6     7
        ┌─────┬─────┬─────┬─────┬─────┬─────┬─────┬─────┐
        │ 41  │ 17  │ 93  │  8  │ 55  │ 62  │     │     │
        └─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┘
                                          count = 6, capacity = 8
```

### Search: Θ(n)

There is no information in the arrangement, so there is nothing to exploit. You look at every
element until you find it or run out.

Let us count precisely, because the constants matter later. Assume the target is present and
equally likely to be at any of the *n* positions. The number of comparisons is 1 if it is at
index 0, 2 if at index 1, and so on:

$$
E[\text{comparisons}] = \frac{1}{n}\sum_{i=1}^{n} i = \frac{1}{n}\cdot\frac{n(n+1)}{2} = \frac{n+1}{2}
$$

So a successful search costs about **n/2** comparisons on average, and *n* in the worst case. An
**unsuccessful** search always costs exactly *n* — you cannot stop early, because the element you
want could be the last one you check. That asymmetry is worth remembering: for unsorted data,
proving absence is always maximally expensive.

For n = 1,000,000 that is 500,000 comparisons for a hit and 1,000,000 for a miss. On a modern
CPU doing a simple integer comparison per element with good prefetching, call it 0.3–1
nanoseconds per element: **0.3–1 millisecond per lookup.** If your service does 10,000 lookups
per second, you need 3–10 seconds of CPU time per second of wall clock. You need a different
structure, and no amount of optimization inside this one will save you, because the problem is
Θ(n) and n is growing.

### Insert: Θ(1) at the end — but read the fine print

Appending is genuinely cheap: write to `array[count]`, increment `count`. Two memory operations.

Inserting *at a specific position* is not cheap, because contiguity is load-bearing. To insert at
index *i*, everything from *i* onward must move up one slot:

```
Insert 30 at index 2:

before:  │ 41 │ 17 │ 93 │  8 │ 55 │ 62 │    │
                      └────┴────┴────┴────┘  shift 4 elements right
after:   │ 41 │ 17 │ 30 │ 93 │  8 │ 55 │ 62 │
```

The cost is *n − i* element moves. Averaged over a uniformly random insertion position, that is
**n/2** moves.

### Delete: Θ(n), with one important exception

Deleting at index *i* leaves a hole that must be closed, so everything after it shifts down:
*n − i − 1* moves, averaging n/2 again.

The exception: if you do not care about order, you can overwrite the deleted slot with the *last*
element and decrement the count. That is Θ(1). This trick — often called swap-remove — is
extremely common in game engines and simulation code, and it is worth noticing *why* it works:
it works precisely because we gave up the one thing (order) that made the structure more than a
bag. Every optimization in this book has that shape. Something is being traded.

### Space: the best of any structure here

*n* elements of size *s*, plus unused capacity. No per-element overhead at all. This matters more
than people expect, and we will return to it in §1.6.

## 1.3 The dynamic array, and an honest amortized analysis

Real arrays run out of room. The standard fix — used by C++ `std::vector`, Java `ArrayList`,
Python `list`, Go slices, Rust `Vec` — is to allocate a larger block, copy everything across,
and free the old one. The question is how much larger.

Suppose we grow by a **constant amount** *c* every time. Over *n* insertions we resize *n/c*
times, and resize number *k* copies *kc* elements. Total copying:

$$
\sum_{k=1}^{n/c} kc = c \cdot \frac{(n/c)(n/c + 1)}{2} \approx \frac{n^2}{2c}
$$

That is **Θ(n²) total** — Θ(n) amortized per insertion. Growing by a constant amount is a
catastrophe, and it is a mistake real code has made.

Now suppose we **multiply** the capacity by a factor *g* > 1. Capacities go 1, *g*, *g*², …, up to
final capacity *C* ≈ *n*. A resize from capacity *c* to *gc* copies *c* elements, so total copying
is the sum of all the previous capacities:

$$
\frac{C}{g} + \frac{C}{g^2} + \frac{C}{g^3} + \cdots = \frac{C/g}{1 - 1/g} = \frac{C}{g-1}
$$

For *g* = 2 this is *C* ≈ *n* total copies. Add the *n* writes for the elements themselves and *n*
insertions cost about **2n memory writes — amortized 2 per insertion, i.e. Θ(1).**

The growth factor is a real trade-off, not a detail:

| Growth factor *g* | Total copies for *n* inserts | Amortized writes/insert | Worst-case wasted space |
|---|---|---|---|
| 1.125 | 8*n* | 9 | 11% |
| 1.5 | 2*n* | 3 | 33% |
| 2 | *n* | 2 | 50% |
| 4 | *n*/3 | 1.33 | 75% |

Larger *g* means less copying and more wasted memory. This is why implementations disagree:
`std::vector` in libstdc++ uses 2, Java's `ArrayList` uses 1.5, and CPython's list uses a growth
pattern close to 1.125 for small sizes. None of them is wrong; they are tuned for different
priorities.

> **A note on "amortized".** Amortized Θ(1) means the *average* over a sequence is constant. It
> does not mean any individual operation is fast. The insertion that triggers a resize of a
> 1-million-element array copies a million elements — a single operation taking milliseconds.
> For a batch job this is invisible. For a system with a 99.9th-percentile latency budget it is a
> visible, periodic spike, and it is one of the reasons latency-sensitive systems sometimes
> prefer structures with worse averages and better worst cases. Amortized analysis answers
> "how much total work?", not "will any single request be slow?" — and sometimes the second
> question is the one that gets you paged at 3am.

## 1.4 The sorted array: a taste of what we want, and why we cannot keep it

Now sort the array. Suddenly the arrangement carries information, and we can exploit it.

```
index:    0     1     2     3     4     5     6
        ┌─────┬─────┬─────┬─────┬─────┬─────┬─────┐
        │  8  │ 17  │ 41  │ 55  │ 62  │ 78  │ 93  │
        └─────┴─────┴─────┴─────┴─────┴─────┴─────┘
```

### Search: Θ(log n), and here is the derivation

Binary search. Probe the middle. If the target is smaller, the entire right half is eliminated
without being examined; if larger, the left half is. Recurse on what remains.

The recurrence is *T*(*n*) = *T*(*n*/2) + 1, with *T*(1) = 1. Each step halves the candidate
range, so after *k* probes the range has size *n*/2^*k*. We are done when that reaches 1:

$$
\frac{n}{2^k} = 1 \implies k = \log_2 n
$$

More precisely, the worst case is ⌊log₂ n⌋ + 1 probes. The magnitudes are worth internalizing
because they recur throughout this book:

| *n* | Worst-case probes |
|---|---|
| 10 | 4 |
| 1,000 | 10 |
| 1,000,000 | 20 |
| 1,000,000,000 | 30 |
| 10¹² | 40 |

**A thousandfold increase in data costs ten more probes.** This is the first appearance of the
single most important quantitative fact in this entire book: logarithms are absurdly, almost
unreasonably slow-growing, and any structure that converts a linear cost into a logarithmic one
has changed what is possible rather than merely made something faster.

Worked example — search for 62 in the array above:

```
Step 1: lo=0, hi=6, mid=3 → array[3] = 55.  62 > 55, so search right.  lo=4
Step 2: lo=4, hi=6, mid=5 → array[5] = 78.  62 < 78, so search left.   hi=4
Step 3: lo=4, hi=4, mid=4 → array[4] = 62.  Found, 3 probes.
```

Note that we never looked at 8, 17, 41, or 93. Four of seven elements were dismissed without
examination. That dismissal — *eliminating regions of the search space on the basis of a single
comparison* — is the entire idea we will be chasing for the rest of the book. Hold onto it.

### Enumerate in order: Θ(1) per element, and perfectly sequential

Free. Walk the array. Range queries are just as good: binary search for the start, then walk
until you exceed the end. And crucially the memory access pattern is sequential, which as we will
see in §1.6 is worth far more than its asymptotic description suggests.

### Insert: Θ(n), and this is what kills it

To insert while preserving sortedness, the element must go in its correct position, and
everything after it must shift. Finding the position is Θ(log n) — cheap. Making room is Θ(n).

**Let us put real numbers on this**, because "Θ(n)" understates how bad it is in a way that
matters. Take an array of 10 million 32-bit integers — 40 MB. Insert into a random position:
on average 5 million elements must move, which is 20 MB of `memmove`. A good implementation
achieves something like 10 GB/s for a large sequential move:

$$
\frac{20\ \text{MB}}{10\ \text{GB/s}} = 2\ \text{ms}
$$

**Two milliseconds per insertion.** That is a ceiling of roughly 500 insertions per second, on
hardware capable of billions of operations per second, for a data structure holding 40 MB. And it
gets linearly worse as the collection grows. A sorted array is not a data structure you can
maintain; it is a data structure you can *build once* and then only read.

That last observation is not a throwaway. It is a real and heavily used design: build a sorted
array in one pass, never modify it, and rebuild from scratch when the data changes enough to
matter. This is exactly what a **sorted string table (SSTable)** is, and it is the foundation of
the LSM-tree family we will meet in Volume 3. The way to make a sorted array work is to stop
inserting into it. Remember that when we get there.

### Delete: Θ(n) for the same reason

Closing the hole is the same shift. There is a mitigation — tombstones, marking a slot dead
without moving anything — which converts deletion to Θ(1) at the cost of the array growing
monotonically and searches having to skip dead entries. This is also, and not coincidentally,
exactly what LSM-trees do, and what PostgreSQL's B-trees do with dead index entries (Volume 5).
Deferred cleanup is one of the great recurring themes of production data structures: the cheapest
way to do work is to promise to do it later, and then do it in bulk.

## 1.5 The linked list

If contiguity is the problem — and in §1.4 it clearly was — then the obvious move is to abandon
contiguity. Give every element its own independently allocated node, and connect nodes with
pointers.

```
 head
  │
  ▼
┌──────┬───┐   ┌──────┬───┐   ┌──────┬───┐   ┌──────┬───┐
│  41  │ ●─┼──►│  17  │ ●─┼──►│  93  │ ●─┼──►│   8  │ ∅ │
└──────┴───┘   └──────┴───┘   └──────┴───┘   └──────┴───┘
 0x7f2a...      0x7f0c...      0x7f31...      0x7f18...
   ↑ note: addresses are unrelated to each other
```

> **Historical note — confidence: high.** The linked list as a deliberate programming technique
> is generally credited to Allen Newell, Cliff Shaw, and Herbert Simon, in the family of
> languages they built at RAND Corporation and Carnegie Institute of Technology from around
> 1955–1956 — the **Information Processing Language (IPL)** family — used for the Logic Theorist,
> one of the earliest AI programs. The motivating problem is instructive: they were manipulating
> *symbolic expressions of unpredictable size and shape*, where you cannot know in advance how
> much room anything needs. Contiguous storage is hostile to that; linked storage is built for
> it. Knuth discusses the history in *TAOCP* Volume 1 §2.6 and credits IPL as the origin of
> linked-list technique in programming, while noting that the underlying idea appeared in
> various forms earlier.

### Insert and delete: Θ(1) — with a large asterisk

Given a pointer to the right place, splicing a node in or out is a fixed number of pointer
writes, regardless of *n*. Nothing shifts. This is a genuine and important win, and it is the
first structural hint of the escape route we are looking for: **when position is encoded in
links rather than in addresses, rearrangement becomes local.** Write that sentence on something.
It is the seed of every tree in this book.

The asterisk: you almost never *have* the pointer. You have a value. And getting from a value to
a pointer requires a search.

### Search: Θ(n), and — this is the crucial part — you cannot fix it with binary search

The obvious thought is: the list is sorted, so binary search it. This does not work, and *why* it
does not work is the most important negative result in this chapter.

Binary search needs to jump to the middle of the remaining range in constant time. In an array,
element *i* lives at `base + i·s`, so "jump to the middle" is one multiply and one add — Θ(1).
In a linked list, the only way to reach the middle is to follow pointers from wherever you are,
one at a time. Finding the midpoint of *n* nodes costs *n*/2 pointer hops.

So let us actually try it. Let *T*(*n*) be the cost of "binary searching" a linked list:

$$
T(n) = \underbrace{\frac{n}{2}}_{\text{walk to midpoint}} + \; T(n/2)
$$

Expanding:

$$
T(n) = \frac{n}{2} + \frac{n}{4} + \frac{n}{8} + \cdots = n\left(\frac{1}{2}+\frac{1}{4}+\frac{1}{8}+\cdots\right) = n
$$

**Θ(n).** Exactly as bad as scanning the whole list from the front. The cleverness bought
literally nothing. Binary search is not an algorithm you can apply to sorted data in general — it
is an algorithm that requires **sorted data plus constant-time random access**, and the linked
list threw away the second half of that pair in order to get cheap insertion.

This is the central impasse of the chapter, and it deserves to be stated as sharply as possible:

> **The array has random access but pays Θ(n) to rearrange.
> The linked list rearranges in Θ(1) but has no random access.
> Each structure gives up exactly what the other needs to make binary search work.**

### Enumerate in order: Θ(n), but slowly

Asymptotically the same as an array. In practice, dramatically worse — see next section.

### Space: considerably worse than it looks

A singly linked node holding an 8-byte payload needs 8 bytes of payload plus an 8-byte pointer
= 16 bytes. But that is not what it costs. Each node is a separate heap allocation, and general
purpose allocators add a header and round up to an alignment boundary. Under glibc `malloc` on
x86-64 the minimum usable chunk is 32 bytes (a chunk header plus 16-byte alignment). So:

| Structure | Payload | Actual bytes/element | Overhead |
|---|---|---|---|
| Array (`int64_t`) | 8 | 8 (+ ≤2× capacity slack) | ~0–100% |
| Singly linked list | 8 | ~32 | **300%** |
| Doubly linked list | 8 | ~40 | **400%** |

A doubly linked list of 8-byte integers spends about 80% of its memory on bookkeeping. For an
in-memory index over hundreds of millions of entries, that is the difference between fitting in
RAM and not.

## 1.6 Where the time actually goes: the part asymptotics hide

So far we have counted operations. Modern hardware does not charge by the operation; it charges
by the **cache miss**, and the two are not proportional. This section is here because if you carry
only asymptotic reasoning into real systems work, you will make confidently wrong decisions —
and because the same effect, magnified a thousandfold, is the entire subject of Volume 3.

The CPU never fetches a single byte from memory. It fetches a **cache line** — 64 bytes on
essentially all current x86-64 and ARM64 hardware. Approximate latencies:

| Level | Latency | In "CPU cycles at 3 GHz" |
|---|---|---|
| L1 cache | ~1 ns | ~4 |
| L2 cache | ~4 ns | ~12 |
| L3 cache | ~15 ns | ~45 |
| Main memory (DRAM) | ~80 ns | **~240** |

Now traverse 1,000,000 `int64` values:

**As an array.** 8 bytes each, 8 per cache line, so 125,000 cache lines for 8 MB of data. The
accesses are sequential and perfectly predictable, so the hardware prefetcher fetches lines
before they are requested. Effective cost approaches memory *bandwidth* rather than memory
*latency*: at ~10 GB/s, roughly **1 millisecond**, and the per-element cost is a fraction of a
nanosecond.

**As a linked list whose nodes were allocated at scattered addresses.** Each node is on its own
cache line (or two). The address of the next node is not known until the current node has been
loaded, so the prefetcher cannot help — this is a **pointer-chasing dependency chain**, and every
hop is a full latency stall. One million nodes × ~80 ns ≈ **80 milliseconds.**

**Same Θ(n). Same element count. Roughly 80× difference in wall-clock time.**

Two consequences that matter for the rest of this book:

1. **Linear scans of contiguous memory are much cheaper than their asymptotic description
   suggests.** For small *n*, a linear scan of an array beats a "better" structure with pointer
   indirection. The crossover is often surprisingly high — hundreds of elements. This is why
   real implementations of sophisticated structures stop being sophisticated near the leaves and
   just scan a small array.

2. **Locality is a first-class design goal, not an implementation detail.** A structure that
   groups related data into contiguous blocks and minimizes pointer hops will beat one that does
   not, even at identical asymptotics. Volume 3 is what happens when you take this observation
   seriously and the gap is not 80× but 100,000×. Volume 6 is what happens when you notice that
   the cache hierarchy recreates the disk problem in miniature and that the same fixes apply.

## 1.7 The impossibility, stated plainly

Here is everything from this chapter in one table. Sorted array assumes order must be maintained;
list assumes you must find the position by value.

| | Unsorted array | Sorted array | Linked list (sorted) |
|---|---|---|---|
| **Search** | Θ(n) | **Θ(log n)** | Θ(n) |
| **Insert** | **Θ(1)** append | Θ(n) | Θ(n) find + Θ(1) splice = Θ(n) |
| **Delete** | Θ(n), or Θ(1) unordered | Θ(n) | Θ(n) |
| **Enumerate in order** | Θ(n log n) — must sort | **Θ(n), sequential** | Θ(n), pointer-chasing |
| **Space overhead** | **~0%** | **~0%** | 300–400% |
| **Locality** | **Excellent** | **Excellent** | Poor |

Every column has at least one Θ(n) in a row you care about. And this is not a failure of
imagination — there is a real reason for it, and naming the reason tells us where to look next:

**In a flat structure, an element's position *is* its identity in the ordering.** In a sorted
array, "element 62 is the fifth smallest" is expressed by 62 living at index 4. That is a
beautiful encoding — it costs zero extra bytes and gives Θ(1) random access — but it means that
inserting a new smallest element changes the ordering-identity of *every other element*, and
since identity is position, every element must physically move.

You can have order encoded in position (array: fast to read, expensive to change), or order
encoded in links (list: cheap to change, unusable for search). Flat structures offer no third
option, because a flat structure has only one dimension to encode things in.

## 1.8 The escape: what binary search was secretly doing

Let us look at binary search again, but this time draw its *shape* rather than trace its steps.

Take the sorted array of 1 through 15. Binary search always probes index 7 first (value 8). If it
goes left, it probes index 3 (value 4); if right, index 11 (value 12). And so on. Draw every
probe the algorithm could ever make, with each probe's two possible successors below it:

```
                              ┌────┐
                              │ 8  │            ← always the first probe
                              └─┬──┘
                    ┌───────────┴───────────┐
                 ┌──▼─┐                   ┌──▼─┐
                 │ 4  │                   │ 12 │
                 └─┬──┘                   └─┬──┘
             ┌─────┴─────┐             ┌─────┴─────┐
          ┌──▼─┐      ┌──▼─┐        ┌──▼─┐      ┌──▼─┐
          │ 2  │      │ 6  │        │ 10 │      │ 14 │
          └─┬──┘      └─┬──┘        └─┬──┘      └─┬──┘
          ┌─┴─┐       ┌─┴─┐         ┌─┴─┐       ┌─┴─┐
        ┌─▼┐ ┌▼─┐   ┌─▼┐ ┌▼─┐     ┌─▼┐ ┌▼─┐   ┌─▼┐ ┌▼─┐
        │1 │ │3 │   │5 │ │7 │     │9 │ │11│   │13│ │15│
        └──┘ └──┘   └──┘ └──┘     └──┘ └──┘   └──┘ └──┘
```

Look at what that is.

It contains every element exactly once. Everything to the left of any node is smaller than it;
everything to the right is larger. Its depth is log₂(15+1) = 4 levels, matching binary search's
probe count exactly. **This picture is a binary search tree**, and we did not design it — it fell
out of drawing the control flow of binary search on a sorted array.

That is the key realization of this chapter, so let me state it directly:

> **A binary search tree is not a clever new invention. It is binary search's decision structure,
> extracted from the algorithm and made into a data structure.**

Which raises the question that ends this chapter: if the tree was implicitly there all along,
what do we gain by materializing it?

In the array, the edges of that tree are not stored. They are *recomputed on every search* from
index arithmetic — `mid = (lo + hi) / 2`. That is why the array is so space-efficient, and it is
exactly why insertion is Θ(n): the tree's shape is a function of the indices, so changing which
elements exist changes every element's role in the tree, and the only way to express that is to
move data.

If we instead **store the edges explicitly as pointers**, then:

- Search still costs one comparison per level, and still eliminates half the remaining candidates
  per comparison — because the shape still encodes the same decisions. **Θ(log n) search, kept.**
- But inserting a new element no longer requires anyone to move. Walk down to where it belongs
  and set a pointer. **Θ(1) structural change, gained** — the linked list's superpower.
- And ordered enumeration is still available, by walking the tree in the right order (Chapter 4).

We are buying our way out of §1.7's impossibility with **space**: two pointers per element, the
thing the linked list also paid, and for the same underlying reason. Order now lives in links, so
rearrangement is local. But unlike the linked list, there are *two* links per node and they
encode a *decision*, which restores the ability to eliminate half the search space per step.

That is the whole idea. Everything else in this book is consequence, refinement, and repair.

And there is a large, obvious hole in the argument. Notice that the beautiful shape above depended
on the probes being *midpoints*. Nothing about "walk down and set a pointer" guarantees that the
resulting shape stays balanced. If the shape degrades — if the tree becomes a long thin chain —
then "one comparison per level" stops being log₂ *n* levels and becomes *n* levels, and we have
built an expensive linked list.

That failure is real, it is not rare, and it is triggered by the most ordinary input imaginable.
It is the opening subject of Volume 2.

## 1.9 A brief acknowledgement of the road not taken

Trees are not the only escape from §1.7. The other one is worth naming so you know it exists:
keep the linked list, but give nodes **multiple** forward pointers of varying lengths, so that
some pointers skip far ahead and let you approximate the jumps binary search needs. Choose the
pointer heights randomly and you get a **skip list** (William Pugh, 1989 — confidence: high),
with expected Θ(log n) search and much simpler concurrent implementations than balanced trees,
which is why it appears in Redis's sorted sets and in LevelDB's in-memory write buffer.

It is a genuinely different lineage and mostly outside this book's scope, but note the family
resemblance: it too works by *adding links that let you eliminate large regions in one step*.
That is the deep pattern. Trees are one way to arrange those links; skip lists are another.

---

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

# Chapter 5 — Recursion, the Stack, and Getting Rid of Both

## 5.1 Why recursion fits trees so unreasonably well

Recall Definition B from §3.3:

> A tree is either empty, **or** a node together with a sequence of trees.

That definition is a two-case disjunction, and the second case contains the thing being defined.
So any function over trees writes itself:

```
def f(tree):
    if tree is empty:
        return <base case>              # case 1 of the definition
    else:
        return combine(tree.value,      # case 2 of the definition
                       f(tree.left),
                       f(tree.right))
```

The code's shape is the definition's shape. This is not a happy accident — it is what
**structural recursion** means, and it has a real consequence beyond convenience: because the
recursion mirrors the data's construction, a proof by induction on the tree's structure maps
one-to-one onto the function's cases. If your base case is right and your recursive case is right
*assuming the recursive calls are right*, the function is correct. You get correctness proofs
almost for free.

Contrast an array: there is no structural reason a loop over indices is the right shape, and
proving a loop correct requires inventing an invariant that holds at every iteration — a genuinely
creative step. Tree recursion needs no invented invariant. The structure supplies it.

Here is the height function, three lines, obviously correct:

```
def height(n):
    if n is None: return -1                              # empty tree: -1 (see §3.4)
    return 1 + max(height(n.left), height(n.right))
```

And notice: the `-1` convention from §3.4 is exactly what makes this work with **no special case
for leaves**. A leaf's children are both empty, so it computes 1 + max(−1, −1) = 0. If you had
chosen height(empty) = 0, a leaf would compute 1, and you would need an extra branch. The
convention was not arbitrary; it was chosen to make the recursion clean.

## 5.2 The call stack is an implicit stack

Recursion feels like it uses no data structure. It uses a big one — you just did not write it.

Every function call pushes a **stack frame** onto the call stack. On x86-64 a frame for a small
tree function contains roughly:

| Contents | Typical size |
|---|---|
| Return address | 8 bytes |
| Saved frame pointer (`rbp`) | 8 bytes |
| Saved callee-saved registers in use | 8–32 bytes |
| Local variables (`node`, temporaries) | 8–24 bytes |
| Alignment padding to 16 bytes | 0–8 bytes |
| **Total, optimized build** | **~32–48 bytes** |
| **Total, debug build (no inlining, extra spills)** | **~64–128 bytes** |

When you call `height(node.left)`, the machine pushes a frame recording *where to come back to*
and *what `node` was*. That is precisely the information an explicit stack-based traversal must
store by hand. **Recursion is not an alternative to using a stack; it is a syntax for using the
hardware's stack.**

Watch it happen. In-order traversal of the BST from §4.6, showing the call stack at each moment:

```
call in(50)                       stack: [50]
  call in(30)                     stack: [50, 30]
    call in(20)                   stack: [50, 30, 20]
      call in(10)                 stack: [50, 30, 20, 10]
        call in(∅) → return       stack: [50, 30, 20, 10]
        VISIT 10
        call in(∅) → return
      return                      stack: [50, 30, 20]
      VISIT 20
      call in(∅) → return
    return                        stack: [50, 30]
    VISIT 30
    call in(40)                   stack: [50, 30, 40]
      VISIT 40
    return                        stack: [50, 30]
  return                          stack: [50]
  VISIT 50
  call in(70)                     stack: [50, 70]
    call in(60) → VISIT 60        stack: [50, 70, 60]
    return                        stack: [50, 70]
    VISIT 70
    call in(80) → VISIT 80        stack: [50, 70, 80]
  return
return                            stack: []

Output: 10, 20, 30, 40, 50, 60, 70, 80        Peak depth: 4
```

Compare that against the explicit-stack trace in §5.3 below. They contain the same values in the
same order at the same times, because they are the same algorithm.

**Peak stack depth = height of the tree + 1.** That is the number to keep in your head, because
it is the one that turns into a crash.

## 5.3 The same traversals, with the stack made explicit

### Pre-order, iteratively — easy

```
def preorder(root):
    if root is None: return
    stack = [root]
    while stack:
        n = stack.pop()
        visit(n)
        if n.right: stack.push(n.right)   # push right FIRST
        if n.left:  stack.push(n.left)    # so left is popped first
```

The push order is inverted because a stack is LIFO. Trace on the §4.6 BST:

```
[50]           pop 50, visit 50, push 70, push 30
[70, 30]       pop 30, visit 30, push 40, push 20
[70, 40, 20]   pop 20, visit 20, push 10
[70, 40, 10]   pop 10, visit 10
[70, 40]       pop 40, visit 40
[70]           pop 70, visit 70, push 80, push 60
[80, 60]       pop 60, visit 60
[80]           pop 80, visit 80
[]             done

Output: 50, 30, 20, 10, 40, 70, 60, 80    ✔ matches §4.6
```

### In-order, iteratively — the left-spine pattern

```
def inorder(root):
    stack, cur = [], root
    while cur or stack:
        while cur:                  # descend the left spine, remembering the way back
            stack.push(cur)
            cur = cur.left
        cur = stack.pop()           # deepest unvisited node
        visit(cur)
        cur = cur.right             # then handle its right subtree
```

Trace:

```
descend 50→30→20→10   stack: [50,30,20,10]   cur: ∅
pop 10, VISIT 10, cur = 10.right = ∅
pop 20, VISIT 20, cur = ∅
pop 30, VISIT 30, cur = 40 → descend: stack [50,40]
pop 40, VISIT 40, cur = ∅
pop 50, VISIT 50, cur = 70 → descend 70→60: stack [70,60]
pop 60, VISIT 60, cur = ∅
pop 70, VISIT 70, cur = 80 → descend: stack [80]
pop 80, VISIT 80, cur = ∅
stack empty → done

Output: 10, 20, 30, 40, 50, 60, 70, 80    ✔
```

Compare with the §5.2 call-stack trace. Identical contents at identical moments. The explicit
version simply stores `cur` instead of a return address, because we know statically what the
"return" does.

### Post-order, iteratively — annoyingly harder, and the reason is interesting

Post-order needs to know, when it pops a node, whether it has already processed that node's
*right* subtree. Pre-order does not need this (nothing happens after the children) and in-order
needs only a weaker version of it. So post-order requires extra state.

**Method 1 — two stacks, and a genuinely elegant trick:**

```
def postorder(root):
    if root is None: return
    stack, out = [root], []
    while stack:
        n = stack.pop()
        out.push(n)                        # collect in (Node, Right, Left) order
        if n.left:  stack.push(n.left)
        if n.right: stack.push(n.right)
    while out: visit(out.pop())            # reverse it
```

Why this works: the first loop produces the *reverse* pre-order **N, R, L**. Reverse that sequence
and you get **L, R, N** — which is exactly post-order. On the §4.6 BST:

```
First loop produces:  50, 70, 80, 60, 30, 40, 20, 10
Reversed:             10, 20, 40, 30, 60, 80, 70, 50    ✔ matches §4.6
```

Cost: Θ(*n*) auxiliary space for `out`, which is worse than the Θ(height) of the recursive
version. That is the price of the trick.

**Method 2 — one stack plus a "last visited" pointer:**

```
def postorder(root):
    stack, last, cur = [], None, root
    while cur or stack:
        while cur:
            stack.push(cur)
            cur = cur.left
        peek = stack.top()
        if peek.right and last is not peek.right:
            cur = peek.right             # right subtree not yet done → go do it
        else:
            visit(peek); last = stack.pop()

    # `last` is what distinguishes "coming down" from "coming back up"
```

Θ(height) space, and much fiddlier. **That `last` variable is exactly the piece of information
the call stack was tracking for you implicitly** — namely, which of the two recursive calls we
had returned from. Writing it out by hand is a good way to appreciate what the hardware stack was
doing on your behalf.

### Level-order — needs a queue, and nothing else will do

Covered in §4.5. The point bears repeating because it is the cleanest structural insight in these
two chapters: swap the stack for a queue and depth-first becomes breadth-first, with no other
change. And you cannot get a queue for free from recursion, which is why level-order has no
natural recursive form.

## 5.4 What the stack actually costs — with real numbers and real crash sizes

Stack depth equals tree height, and stacks are small and fixed. Default main-thread stack sizes:

| Platform | Default stack | Frames at ~48 B | Frames at ~96 B (debug) |
|---|---|---|---|
| Linux (`ulimit -s` 8192) | 8 MB | ~175,000 | ~87,000 |
| macOS main thread | 8 MB | ~175,000 | ~87,000 |
| macOS secondary thread | 512 KB | ~11,000 | ~5,500 |
| Windows (default) | 1 MB | ~22,000 | ~11,000 |
| Typical goroutine (grows) | 8 KB → 1 GB | — | — |

Now combine with §3.5's height bounds:

| Tree | *n* | Height | Recursion safe? |
|---|---|---|---|
| Balanced binary | 10⁶ | ~20 | Yes, trivially |
| Balanced binary | 10¹² | ~40 | Yes, trivially |
| Degenerate (sorted insertion) | 10⁵ | 10⁵ | **Borderline — crashes on Windows/threads** |
| Degenerate | 10⁶ | 10⁶ | **Stack overflow everywhere** |

> **This is a real production failure mode, not a hypothetical.** A recursive tree function that
> works perfectly in testing on balanced data will segfault on an unbalanced tree, and the
> unbalancing trigger is *sorted input* (§3.6) — the most ordinary input there is. The crash is a
> stack overflow, which on many platforms does not raise a catchable exception; it just kills the
> process, often with a useless core dump because the stack is the thing that got destroyed.
>
> Two defences: **(a) guarantee the tree is balanced**, which is Volume 2 and is the real answer;
> **(b) use an explicit stack on the heap**, which can grow to gigabytes and fails gracefully with
> an allocation error you can handle. Production parsers, serializers, and JSON/XML readers
> routinely do (b) precisely because their input is attacker-controlled and a deeply nested
> document is a trivially cheap denial-of-service otherwise.

### A note on tail calls

Recursion is sometimes eliminable by the compiler when the recursive call is the *last* thing the
function does. Tree traversals are only partly amenable:

```
def preorder(n):
    if n is None: return
    visit(n)
    preorder(n.left)      # NOT a tail call — work follows
    preorder(n.right)     # IS a tail call — nothing follows
```

A compiler doing tail-call optimization can turn the second call into a jump, so pre-order on a
**right**-degenerate tree uses O(1) stack. But the *left* call has work after it and cannot be
eliminated, so a left-degenerate tree still consumes O(*n*) frames. In-order and post-order have
work after both calls in the relevant positions and are worse still.

The standard hand-optimization is to recurse on the *smaller* subtree and loop on the larger,
which bounds stack depth at O(log *n*) **regardless of the tree's shape**:

```
def inorder_bounded(n):
    while n:
        if size(n.left) <= size(n.right):
            inorder_bounded(n.left)      # recurse on the smaller side
            visit(n)
            n = n.right                  # iterate on the larger side
        else:
            ...symmetric...
```

Each recursive call is on a subtree at most half the size, so depth ≤ log₂ *n*. This requires
subtree sizes to be available, which not every tree stores — but the technique is worth knowing
because the same "recurse small, loop large" idea shows up in quicksort for exactly the same
reason.

## 5.5 Morris traversal: in-order in O(1) space, by temporarily lying

Can you traverse in-order with **no** stack at all — no recursion, no auxiliary array, constant
extra memory? Yes, and the trick is one of the most delightful in the subject.

> **History — confidence: high on Morris, moderate on the details.** The idea of using otherwise
> unused child pointers to store traversal information is **threading**, introduced by Alan Perlis
> and Charles Thornton, "Symbol manipulation by threaded lists", *CACM* 1960. Perlis and Thornton
> threaded the tree *permanently*. Joseph M. Morris's contribution ("Traversing binary trees
> simply and cheaply", *Information Processing Letters*, 1979) was to thread and *unthread* on
> the fly, so the tree is unmodified when the traversal finishes.

**The observation.** In-order traversal's hard part is: after finishing a left subtree, how do you
get back to the parent? A stack exists solely to answer that. But look at the left subtree's
**rightmost** node — its in-order *predecessor* of the parent. That node has a null right pointer,
by definition of being rightmost. **That null pointer is free storage, and it is sitting in
exactly the place we will be standing when we need to know where to go next.** So: point it at
the parent, use it, then set it back to null.

```
def morris_inorder(root):
    cur = root
    while cur:
        if cur.left is None:
            visit(cur)
            cur = cur.right           # either a real edge or a thread we installed
        else:
            pred = cur.left
            while pred.right and pred.right is not cur:
                pred = pred.right     # find the rightmost node of the left subtree
            if pred.right is None:
                pred.right = cur      # THREAD: remember the way back
                cur = cur.left
            else:
                pred.right = None     # UNTHREAD: restore the tree
                visit(cur)
                cur = cur.right
```

Worked trace on a three-node tree:

```
        ┌───┐
        │ 2 │
        └─┬─┘
      ┌───┴───┐
   ┌──▼┐    ┌─▼─┐
   │ 1 │    │ 3 │
   └───┘    └───┘

cur=2: has left. pred = 1 (rightmost of left subtree). 1.right is null
       → thread 1.right = 2.  cur = 1.

        ┌───┐
        │ 2 │◄──────┐
        └─┬─┘       │ thread
      ┌───┴───┐     │
   ┌──▼┐    ┌─▼─┐   │
   │ 1 ├────┼───┼───┘
   └───┘    │ 3 │
            └───┘

cur=1: no left → VISIT 1.  cur = 1.right = 2 (following the thread back up)
cur=2: has left. pred = 1. 1.right IS cur → unthread (1.right = null),
       VISIT 2, cur = 2.right = 3
cur=3: no left → VISIT 3. cur = null. Done. Tree is exactly as it started.

Output: 1, 2, 3    ✔    Extra space used: one pointer variable.
```

**Cost analysis.** Time is still Θ(*n*), though with a worse constant: each edge is traversed at
most three times (once descending, once while searching for a predecessor, once following the
thread), so roughly 3× the pointer dereferences of the recursive version. Space is **Θ(1)** — one
variable, no stack, no recursion, no heap allocation. It cannot overflow, at any tree height.

**And now the caveat that determines whether you can ever use it**, which is the real lesson:

> Morris traversal **mutates the tree during traversal.** For a window of time, `1.right` points
> at `2`, which is a structurally false statement about the tree.
>
> Consequences: it is **not usable on a read-only tree** (a `const` structure, a memory-mapped
> file, data in a read-only page). It is **not thread-safe in any form** — a concurrent reader
> observing the threaded state sees a cycle and may loop forever. It is **not
> interrupt/exception-safe** — if the traversal aborts halfway, the tree is left permanently
> corrupted with dangling threads. And it is invisible to most correctness checkers, which will
> see a valid tree before and after and never observe the lie in between.

So Morris is the right tool in a narrow slot: single-threaded, exclusive access, exact-ordered
traversal of a possibly-very-deep tree with hard memory limits. Embedded systems and some
garbage collectors use exactly this class of trick (pointer-reversal marking in GC is a close
relative). Everywhere else, use a stack.

I include it because it teaches something general: **space can very often be bought with
mutation, and the price you pay is not time but *safety properties* — reentrancy,
thread-safety, const-correctness, and crash-consistency.** Volume 5 is largely about what happens
when you make that trade in a system where other people are reading concurrently, and the answer
is that it goes very badly unless you are extremely careful.

## 5.6 Choosing

| Situation | Use |
|---|---|
| Balanced tree, height provably O(log *n*) | **Recursion.** Clearest code, negligible stack cost. |
| Shape not guaranteed; input possibly adversarial | **Explicit stack on the heap.** Grows, fails gracefully. |
| Parsing untrusted/attacker-supplied nested input | **Explicit stack, plus a depth limit.** Deep nesting is a DoS vector. |
| Need level-order | **Explicit queue.** No recursive option. |
| Hard O(1) memory limit, exclusive access, mutable tree | **Morris.** With eyes open. |
| Read-only or shared/concurrent tree | **Never Morris.** Stack or recursion. |
| Very wide, shallow tree, memory-constrained | **Depth-first** — O(height) beats O(width) here |
| Very deep, narrow tree, memory-constrained | **Breadth-first** — O(width) beats O(height) here |

---

# Chapter 6 — Putting Trees in Real Memory

Everything so far has treated a tree as a mathematical object with edges. Edges are not a thing
hardware has. Chapter 6 is about the gap between the abstraction and the machine — and the gap
turns out to be where most of the real performance lives.

## 6.1 Pointer-based nodes: the byte-level accounting

The default representation:

```c
struct Node {
    int64_t  key;      /*  8 bytes */
    Node    *left;     /*  8 bytes */
    Node    *right;    /*  8 bytes */
};                     /* 24 bytes, and that is before the allocator gets involved */
```

Add a parent pointer (needed for iterative traversal without a stack, for successor/predecessor
queries, and for most rebalancing implementations) and it is 32 bytes. Add a balance factor or
color bit for Volume 2's trees and, thanks to alignment, it is usually still 32 — the flag fits in
padding, which is a small free lunch worth knowing about.

Then the allocator. Each node is a separate `malloc`, and general-purpose allocators add a header
and round up:

| Node contents | Struct size | Actual heap footprint (glibc) | Overhead vs. 8-byte payload |
|---|---|---|---|
| key + 2 children | 24 | 32 | 300% |
| key + 2 children + parent | 32 | 48 | 500% |
| key + 2 children + parent + color | 40 | 48 | 500% |

So a red-black tree of a million `int64` keys occupies roughly **48 MB** to store **8 MB** of
keys. That ratio — you pay 4–6× your data size — is the standing cost of pointer-based trees, and
it is why §6.3 and §6.4 exist.

## 6.2 Where the time goes, and a subtle result about arrays

A tree search visits one node per level. Each node is at an address you cannot know until you
have loaded its parent. That is the **pointer-chasing dependency chain** from §1.6, and it means
every level is a potential full-latency cache miss with no prefetching possible.

For a balanced tree of 10⁶ nodes (height ~20), scattered in memory:

```
20 levels × ~80 ns (DRAM latency)  ≈  1.6 µs per lookup
```

Now compare **binary search over a sorted array** of the same million elements. Also ~20 probes.
Naively, the same 1.6 µs. But it is meaningfully better, for a reason that is easy to miss:

**Binary search's first probes are always the same addresses.** Every single search starts at
index 500,000, then goes to 250,000 or 750,000, then one of four addresses, and so on. The top
~10 levels of the implicit tree touch only ~1,000 distinct cache lines — about 64 KB — which
comfortably fits in L2. Those levels are effectively *free after the first few searches*. Only
the last ~10 probes, which spread across the whole 8 MB array, actually miss.

```
Binary search over 10⁶ sorted int64:
   probes 1–10  : ≤1024 distinct addresses, ~64 KB working set → L1/L2 hits, ~1–4 ns each
   probes 11–20 : spread over 8 MB → DRAM misses, ~80 ns each
   total ≈ 10×3 + 10×80 ≈ 830 ns

Pointer tree, 10⁶ nodes, nodes scattered by the allocator:
   every level  : unpredictable address → DRAM miss, ~80 ns
   total ≈ 20×80 ≈ 1600 ns
```

**The array is roughly 2× faster despite doing identical work asymptotically**, purely because its
hot nodes share addresses across queries and its cold nodes are the minority.

Two lessons, and they set up the rest of the book:

1. **A structure's memory layout can be worth a factor of two or more at identical asymptotics.**
   Volume 6's cache-aware and cache-oblivious trees are entirely about reclaiming this.
2. **The top of a search tree is hot and tiny; the bottom is cold and huge.** This is a completely
   general fact about search trees, and it is why Volume 3's B-trees are so effective: the upper
   levels of a B-tree are small enough to stay permanently cached, so a four-level tree costs
   about one real I/O rather than four. That observation is the whole ballgame for databases, and
   it is visible already, here, in an in-memory setting.

## 6.3 The implicit (array) representation, and its exact failure mode

There is a way to store a binary tree with **no pointers at all.** Put the nodes in an array in
level-order and compute the edges arithmetically. With 0-based indexing:

$$
\text{left}(i) = 2i+1 \qquad \text{right}(i) = 2i+2 \qquad \text{parent}(i) = \left\lfloor \frac{i-1}{2} \right\rfloor
$$

```
              0:50
            /      \
        1:30        2:70
        /    \      /    \
    3:20   4:40  5:60   6:80
    /
 7:10

array:  [ 50, 30, 70, 20, 40, 60, 80, 10 ]
index:     0   1   2   3   4   5   6   7
```

Check: left(1) = 3 → 20 ✔; right(1) = 4 → 40 ✔; parent(6) = ⌊5/2⌋ = 2 → 70 ✔.

**Why the formula works.** In level-order, depth *d* occupies indices 2^*d* − 1 through
2^(*d*+1) − 2 — that is 2^*d* slots, matching Fact 2 in §3.5. Node *i*'s position within its
level is *i* − (2^*d* − 1), and its children occupy twice that offset within the next level,
which starts at 2^(*d*+1) − 1. Grinding through the algebra gives 2*i* + 1. The formula is just
Fact 2 in index form.

**The advantages are substantial:**

| | Pointer-based | Implicit array |
|---|---|---|
| Bytes per node (int64 key) | 32–48 | **8** |
| Pointer dereferences to reach a child | 1 (cache miss) | **0** (arithmetic) |
| Locality of the top levels | Poor (scattered) | **Excellent** (indices 0–14 are one cache line region) |
| Allocations | *n* | **1** |
| Can be `memcpy`'d, mmapped, sent over a socket | No | **Yes** |

That last row is not a small thing. An implicit tree is **position-independent** — it contains no
addresses, so it can be written to a file, memory-mapped, or shipped to another process and used
directly with no fix-up whatsoever. §6.6 explains why that matters enormously on disk.

**And now the failure mode, which is total.** The array must have a slot for every *possible*
position up to the tree's height, whether occupied or not. So the array size is determined by
**height, not node count**: 2^(*h*+1) − 1 slots.

For a degenerate tree — the sorted-insertion case from §3.6 — height is *n* − 1:

| *n* nodes, degenerate | Required array slots | Memory (8 B/slot) |
|---|---|---|
| 10 | 1,023 | 8 KB |
| 20 | 1,048,575 | 8 MB |
| 30 | ~1.07 × 10⁹ | **8.6 GB** |
| 64 | ~1.8 × 10¹⁹ | **exceeds addressable memory** |

**Thirty nodes inserted in sorted order would require 8.6 gigabytes.** The implicit
representation does not degrade gracefully; it explodes.

> **The rule this gives you, which is exactly why binary heaps look the way they do:**
> The implicit array representation is only viable for trees whose shape is **structurally
> guaranteed complete** — every level full except possibly the last, filled left to right.
>
> A **binary heap** is defined that way *on purpose*, and that is not a coincidence: the heap
> gives up the BST ordering invariant (which would force shape to follow the data) in exchange
> for a shape invariant it controls, and the reward is the zero-overhead array representation.
> A BST cannot do this, because in a BST the data determines the shape. Volume 4 develops this
> trade properly; note now that it is a trade, and that the array layout is the payment received.

## 6.4 Arena allocation and indices-instead-of-pointers

There is a middle path that captures much of the array representation's benefit without requiring
a complete tree. Allocate all nodes from one contiguous **arena** (a large array or memory pool),
and let "pointers" be 32-bit **indices into the arena** rather than 64-bit machine addresses:

```c
typedef uint32_t NodeRef;              /* index into arena; 0xFFFFFFFF = null */

struct Node {
    int64_t key;                       /* 8 */
    NodeRef left, right;               /* 4 + 4 */
};                                     /* 16 bytes — half of the pointer version */

struct Arena { Node *nodes; uint32_t count, capacity; };
```

What this buys:

- **Node size halves** (16 vs 32 bytes) → **twice as many nodes per cache line**, so ~4 nodes per
  64-byte line instead of 2. Fewer misses for the same traversal.
- **One allocation instead of *n***, eliminating per-node allocator overhead entirely.
- **Locality by construction**: nodes created around the same time sit adjacent, and since tree
  nodes are usually created in bulk or in related batches, they tend to be traversed together.
- **Position independence returns.** No absolute addresses, so the arena can be serialized,
  mmapped, or relocated wholesale.
- **Bulk free** is a single deallocation.

The costs: a 4-byte index caps you at ~4 billion nodes (fine); freeing individual nodes requires
maintaining your own free list; and you lose the type-safety and debugger friendliness of real
pointers, since every dereference becomes `arena.nodes[ref]`.

This pattern is pervasive in performance-sensitive code — game engines, compilers (the Rust
compiler's arena-allocated ASTs, LLVM's bump allocators), and essentially every database's
in-memory structures. It is worth recognizing as a standard technique rather than a trick: **it is
the systematic way to get array-representation locality on a tree whose shape you cannot
control.**

## 6.5 Trees with arbitrary numbers of children

Everything so far assumed binary. For a general tree — a file system, a DOM, a JSON document —
you need something else, and there are two main options with a genuinely interesting trade.

### Option A: a child array (or vector) per node

```c
struct Node {
    Value    value;
    Node   **children;      /* pointer to an array of child pointers */
    uint32_t n_children, capacity;
};
```

**Good:** O(1) access to the *i*-th child; children contiguous, so iterating them is
cache-friendly. **Bad:** a second allocation per node; dynamic-array growth cost when children are
added (§1.3 all over again, one level down); and wasted capacity slack per node.

Best when: the number of children is known at construction or changes rarely, and you need
indexed access. DOM nodes and parsed ASTs usually use this.

### Option B: first-child / next-sibling

Give every node exactly **two** pointers — but reinterpret what they mean:

```c
struct Node {
    Value  value;
    Node  *first_child;      /* the leftmost child */
    Node  *next_sibling;     /* the next child of MY parent */
};
```

The general tree on the left is stored as the binary structure on the right:

```
      GENERAL TREE                    STORED AS (first-child ↓, next-sibling →)

            A                              A
         /  |  \                           ↓
        B   C   D                          B ────► C ────► D
       / \      |                          ↓               ↓
      E   F     G                          E ──► F         G
         / \                                     ↓
        H   I                                    H ──► I
```

Fixed two pointers per node, no arrays, no allocation per child, and unlimited arity. Accessing
the *i*-th child costs O(*i*) hops rather than O(1) — usually irrelevant, since most code iterates
all children anyway.

> **This is Knuth's "natural correspondence" between forests and binary trees, and it is a
> genuine bijection** (*TAOCP* Vol 1 §2.3.2). Every ordered forest maps to exactly one binary
> tree and back. Which has a striking consequence: **any theorem about binary trees is secretly a
> theorem about general trees.** All the counting results, all the traversal machinery, all the
> representation techniques carry across. This is why a book about trees can spend most of
> Volume 2 on binary trees without loss of generality.

One wrinkle worth noticing: pre-order on the general tree corresponds to pre-order on the binary
encoding, but **post-order does not** map to post-order — it maps to in-order. If you use this
representation, verify which traversal you are actually getting.

## 6.6 Crossing to disk: when a pointer costs 100,000× more

Everything in §6.1–6.5 assumed nodes live in RAM. Change that assumption and every conclusion
changes with it. This section is deliberately short, because it is Volume 3's entire subject — but
you should see the shape of it now.

**A pointer is an address in an address space.** In RAM, dereferencing one costs ~1–80 ns. If your
tree lives on disk, a "pointer" is a **block number**, and dereferencing it means asking the
storage device for that block:

| Where the child lives | Cost to dereference one pointer | Relative to L1 |
|---|---|---|
| L1 cache | ~1 ns | 1× |
| DRAM | ~80 ns | 80× |
| NVMe SSD | ~20,000–100,000 ns | ~10⁵× |
| Spinning disk | ~8,000,000 ns | ~10⁷× |
| Network storage | ~500,000–5,000,000 ns | ~10⁶× |

A binary tree over a billion keys has height ~30 (§3.5). On a spinning disk that is
30 × 8 ms = **240 milliseconds per lookup.** The structure that was excellent in RAM is unusable.

Three consequences follow, and each is a chapter of Volume 3:

1. **The cost unit becomes the block, not the comparison.** You cannot read 24 bytes from a disk;
   you read a 4 KB or 8 KB block whether you want to or not. So a 24-byte node wastes 99.4% of
   the transfer, and the objective function changes from "minimize comparisons" to **"minimize
   the number of blocks touched."**

2. **Therefore: make a node exactly one block.** If a block is 8 KB and an entry is 20 bytes, a
   node holds ~400 children instead of 2. Height drops from log₂(*n*) to log₄₀₀(*n*) — from 30 to
   4 for a billion keys. Combined with §6.2's observation that the top of a tree stays cached,
   the real cost is **one or two device reads.** That is a B-tree, and that single change is worth
   five orders of magnitude.

3. **Pointers must stop being addresses.** A memory address is meaningless after a restart or in
   another process, so on-disk trees store **block numbers or offsets relative to a base**, not
   absolute addresses. Converting between the two on load and store is called **pointer
   swizzling**, and it is a real source of complexity in systems that do it. Notice that §6.3's
   implicit array and §6.4's arena-with-indices representations are *already* position-independent
   and need no swizzling at all — which is exactly why those techniques show up so often in
   on-disk and memory-mapped formats. The trick you learned for cache locality turns out to be
   the trick you need for persistence.

## 6.7 Serialization: which traversals uniquely determine a tree?

This ties Chapter 4 to Chapter 6, and it is a genuinely useful piece of knowledge with a
surprising negative result in it.

To write a tree to a file or send it over a network you must flatten it to a sequence, and later
rebuild the original **exactly**. Which sequences suffice?

### Pre-order with explicit null markers — YES, and it is the practical choice

From §4.3, the BST serializes to:

```
50 30 20 10 # # # 40 # # 70 60 # # 80 # #
```

Reconstruction consumes the stream left to right with no lookahead:

```
def deserialize(stream):
    tok = stream.next()
    if tok == "#": return None
    n = Node(tok)
    n.left  = deserialize(stream)     # consumes exactly its own subtree
    n.right = deserialize(stream)
    return n
```

Unique, single-pass, works for any binary tree including ones with duplicate values. Cost:
*n* + 1 null markers for *n* nodes — roughly 2× the tokens. Level-order with null markers works
equally well and is what most "serialize a binary tree" interview answers use.

### Pre-order alone, no markers — NO

`50 30 20 10 40 70 60 80` is consistent with many different trees. Without markers you cannot tell
where a subtree ends.

**Exception, and it is a nice one: for a BST, pre-order alone IS sufficient.** The ordering
invariant supplies the missing information — after the root 50, every following value less than 50
belongs to the left subtree and the first value greater than 50 begins the right subtree. So a BST
can be serialized in *n* tokens with no markers at all. The structure is recoverable because the
*constraint* encodes it. This is a small, elegant instance of a big idea: **invariants are
information, and information you can derive is information you do not have to store.** Volume 4's
succinct data structures push that idea to its limit.

### In-order alone — NO, and worse than pre-order

In-order gives you `10 20 30 40 50 60 70 80`, which is just the sorted order and says nothing
about shape. Every one of the (2n choose n)/(n+1) possible binary tree shapes on those 8 values
produces this same in-order sequence for *some* assignment. In-order alone is maximally
uninformative about structure.

### Pre-order + in-order — YES (for distinct values)

Pre-order's first element is the root. Find it in the in-order sequence: everything to its left is
the left subtree, everything to its right is the right subtree, and the sizes tell you where to
split the pre-order. Recurse.

Worked, on the §4.6 BST:

```
pre = [50, 30, 20, 10, 40, 70, 60, 80]
in  = [10, 20, 30, 40, 50, 60, 70, 80]

Root = pre[0] = 50.  Find 50 in `in` → index 4.
  left  subtree: in[0..3] = [10,20,30,40]  (4 nodes) → pre[1..4] = [30,20,10,40]
  right subtree: in[5..7] = [60,70,80]     (3 nodes) → pre[5..7] = [70,60,80]

Recurse left:  pre=[30,20,10,40], in=[10,20,30,40]
  Root = 30, at in-index 2 → left = [10,20] / [20,10] ; right = [40] / [40]
    Recurse: pre=[20,10], in=[10,20] → root 20, left=[10], right=[]
      Recurse: root 10, leaf.
    Recurse: root 40, leaf.
Recurse right: pre=[70,60,80], in=[60,70,80]
  Root = 70 → left=[60], right=[80]

Reconstructed tree matches the original exactly. ✔
```

**Post-order + in-order — YES**, by the same argument (post-order's *last* element is the root).

### Pre-order + post-order — NO. Here is the counterexample

This one surprises people, and the counterexample is as small as counterexamples get:

```
        Tree 1              Tree 2
          A                   A
         /                     \
        B                       B

  pre:  A, B             pre:  A, B          ← identical
  post: B, A             post: B, A          ← identical
```

Two structurally different trees, identical pre-order **and** identical post-order. So the pair
cannot distinguish them.

**Why it fails, stated generally:** pre-order and post-order both tell you about a node's position
relative to *all* of its descendants, but neither says anything about the boundary *between* its
two children. In-order is the only one of the three that reports that boundary — it is
literally the visit that happens *between* the subtrees (§4.1). So in-order carries information
the other two do not, and no amount of pre- and post-order makes up for it.

The exception, predictably: if the tree is **full** (every node has 0 or 2 children), then
pre+post *is* sufficient, because the ambiguous case — a node with exactly one child, where you
cannot tell left from right — has been excluded by construction.

### Summary

| Given | Uniquely determines the tree? | Notes |
|---|---|---|
| Pre-order + null markers | **Yes** | Single-pass rebuild; the practical default |
| Level-order + null markers | **Yes** | Also single-pass |
| Pre-order alone | No | **Yes** for a BST — the invariant supplies the shape |
| In-order alone | No | Says nothing about shape |
| Post-order alone | No | **Yes** for a BST |
| Pre-order + in-order | **Yes** | Requires distinct values |
| Post-order + in-order | **Yes** | Requires distinct values |
| Pre-order + post-order | **No** | Counterexample above; **yes** if the tree is full |

## 6.8 Choosing a representation

| Situation | Representation |
|---|---|
| General-purpose in-memory BST/map | Pointer-based nodes |
| Shape guaranteed complete (heap, tournament tree) | **Implicit array** — 8 bytes/node, no pointers |
| Many nodes, performance-critical, shape uncontrolled | **Arena + 32-bit indices** — half the size, one allocation |
| Must be written to disk or memory-mapped | Anything **position-independent**: implicit array, or arena with offsets |
| Nodes live on disk / across a network | **One node = one block.** High fanout. This is Volume 3. |
| Arbitrary arity, indexed child access needed | Child array per node |
| Arbitrary arity, iteration only, memory-tight | **First-child / next-sibling** — 2 pointers, unlimited arity |
| Sending a tree over the wire | Pre-order **with null markers** (or pre+in for distinct keys) |
| Read-only, memory is the binding constraint | Succinct/implicit encodings — Volume 6 |

---

# Volume 1 Retrospective

Six chapters, and the whole argument is short enough to state in one page. If you can reconstruct
this argument, you have Volume 1.

**1. Flat structures face a real impossibility, not an engineering shortfall (Ch. 1).** In a flat
structure an element's *position is its identity in the ordering*. That encoding is free and gives
O(1) random access, but it means changing the ordering means physically moving data. Arrays get
O(log *n*) search and pay O(*n*) to modify. Linked lists modify in O(1) and lose random access,
which destroys binary search — provably, since T(*n*) = *n*/2 + T(*n*/2) = Θ(*n*). Each structure
discards precisely what the other needs.

**2. Trees are binary search's control flow, made into data (Ch. 1 §1.8).** Draw the probes binary
search could make on a sorted array and you have drawn a balanced BST. In the array those edges
are recomputed by index arithmetic, which is why insertion costs O(*n*). Store the edges as
pointers and you keep the halving behaviour while making structural change local. The price is
two pointers per node. That is the entire trade, and it is the seed of every structure in the
remaining five volumes.

**3. Hierarchy arrived in computing from mathematics and from bookkeeping (Ch. 2).** Kirchhoff
1847, Cayley 1857 for the mathematics and the name; Huffman 1952, IPL ~1956, LISP 1958–60 for the
computing; BSTs independently discovered ~1958–62 by people who mostly did not think it worth
writing up. And one durable warning from IBM's IMS: **trees are excellent for organizing access
to data and frequently poor for modeling data.** Relational databases kept the trees and threw out
the hierarchy.

**4. One parent is the load-bearing constraint (Ch. 3).** Unique root-to-node paths, *n*−1 edges,
safe recursive deallocation, and recursion without visited-sets all follow from it. Allow two
parents and you have a DAG, and every one of those properties fails. Meanwhile the self-similarity
of subtrees — cut anywhere and you get a smaller tree — is what makes recursion the natural idiom.

**5. Shape, not size, determines cost (Ch. 3 §3.6).** A tree of *n* nodes has height anywhere from
⌈log₂(*n*+1)⌉−1 to *n*−1, and nothing in the definition constrains which. So everything built so
far is *potential* performance. The trigger for the bad case is sorted input, which is not exotic;
it is what data usually looks like.

**6. Traversal order is determined by dependency direction, never by taste (Ch. 4).** Information
flowing up from the leaves is post-order — and choosing otherwise gives you use-after-free when
you free a tree. Enablement flowing down from the root is pre-order. Ordering among siblings is
in-order. Distance from the root is level-order. Pre-, in-, and post-order are the same Euler tour
recorded at the first, second, and third encounter with each node; level-order is a different walk
whose only distinction from depth-first is a queue in place of a stack.

**7. Recursion is a syntax for using the hardware stack, and the stack is small (Ch. 5).** Peak
depth equals tree height, so an unbalanced tree over a million nodes overflows an 8 MB stack and
kills the process. Explicit heap stacks fail gracefully; Morris traversal reaches O(1) space by
temporarily corrupting the tree, and pays for it in every safety property that matters —
thread-safety, const-correctness, crash-consistency.

**8. Layout is worth as much as asymptotics (Ch. 6).** A pointer node costs 32–48 bytes to hold 8
bytes of key. Binary search over an array beats a pointer tree of identical height by ~2× because
its hot addresses repeat and stay cached. The implicit array representation eliminates pointers
entirely but requires guaranteed-complete shape — 30 nodes inserted in sorted order would need 8.6
GB — which is exactly why binary heaps are defined to be complete and BSTs cannot be. And the top
of any search tree is hot and tiny while the bottom is cold and huge, an observation that becomes
worth five orders of magnitude the moment the tree lives on disk.

## The two threads left dangling

Volume 1 leaves two questions open, deliberately, and they are the next two volumes.

**Shape is unconstrained, and ordinary input destroys it.** We know the failure: insert sorted data
into a BST and you build a linked list with extra pointers, height *n*, search Θ(*n*), and a
guaranteed stack overflow on any recursive traversal. We have not fixed it. Fixing it means
inventing structures that *guarantee* height O(log *n*) no matter what order the data arrives in,
and doing so cheaply enough that the guarantee is worth its cost. There are several very different
philosophies for how to do this, and the differences between them are exactly why your language's
standard library made the specific choice it made.

**Everything so far assumed RAM.** Once nodes live on disk, dereferencing a pointer costs ~10⁵
times more than a cache hit, and a binary tree over a billion keys needs 240 ms per lookup. The
entire cost model inverts, and the structure that wins looks nothing like a binary tree.

---

# Volume 1 is complete

**File: `volume-1-foundations.md`** — ready.

## What Volume 2 will cover: THE BINARY TREE FAMILY

Volume 2 picks up the first dangling thread — unconstrained shape — and follows it through every
serious answer anyone has proposed:

- **Binary trees, formally**: full, complete, perfect, balanced, degenerate, and why these five
  words are worth pinning down precisely rather than using loosely.
- **Binary search trees**: the ordering invariant stated exactly, and the derivation of why it
  gives Θ(log *n*) *when the shape cooperates*.
- **The balance catastrophe, performed step by step**: I will insert sorted data into a BST one
  value at a time and show the structure degrading into a linked list, then derive the Θ(*n*)
  worst case and connect it back to Chapter 5's stack overflow.
- **AVL trees (Adelson-Velsky and Landis, 1962)**: the historical context of Soviet computer
  science, the balance-factor invariant, all four rotation cases derived from first principles
  with worked examples, and why *strict* balance makes writes expensive.
- **Red-black trees**: why AVL was not enough for write-heavy workloads, the five invariants and
  where each comes from, worked insertion and deletion, and why this became the default almost
  everywhere — with an actual walk through one real code path (the Linux CFS scheduler's
  `rb_insert_color`, or `std::map`, or Java's `TreeMap`).
- **Splay trees**: the self-adjusting philosophy, amortized analysis, why "recently accessed moves
  to the root" is powerful for skewed access patterns, and where that actually pays off.
- **Treaps**: probabilistic balance via random priorities, why randomization defeats adversarial
  input without needing rebalancing logic, and where they are used in practice.
- **Closing comparison table**: every tree in the volume across insert/search/delete complexity,
  memory overhead, rotation cost, and best-fit use case.

Say **continue** when you would like me to start Volume 2.

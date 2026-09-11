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


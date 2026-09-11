# Where To Go Next

Not a bibliography — a short list of things that would each repay the time.

**For the history.** **Knuth, *The Art of Computer Programming*, Volume 1 §2.3 and Volume 3
§6.2.** Most of this book's historical claims trace to Knuth's notes, and his citations are the
primary record for the 1950s and 60s. Also **Comer, "The Ubiquitous B-Tree"** (*ACM Computing
Surveys*, 1979) — a survey written seven years after the B-tree paper whose title was already true.

**For Volumes 2 and 4's algorithms.** **CLRS** for the standard treatment, and **Sedgewick &
Wayne, *Algorithms*** for red-black trees in particular, since Sedgewick co-invented them.

**For Volumes 3 and 5 — and this is the strongest recommendation in the list.** **Goetz Graefe,
"Modern B-Tree Techniques"** (2011) and **"A survey of B-tree locking techniques"** (*ACM TODS*,
2010). These are the definitive engineering references for everything in Volumes 3 and 5, and the
latch/lock distinction of Volume 5 §30.2 is his framing. Also: **the PostgreSQL `nbtree` README**,
which is a genuine design document rather than API docs, is unusually candid about trade-offs, and is
free.

**For a modern practical treatment.** **Alex Petrov, *Database Internals*** (2019) covers Volumes 3
and 5 with current engineering detail.

**For Volume 5 §34.** **Chris Okasaki, *Purely Functional Data Structures*** (1998) — the standard
text on persistent structures, and where amortization-under-immutability is worked out properly.

**For Volume 5 §30–31.** **Herlihy & Shavit, *The Art of Multiprocessor Programming*** — the right
book for latches, memory models, and lock-free reasoning.

**For Chapter 37.** The cache-oblivious papers of **Frigo, Leiserson, Prokop & Ramachandran**
(1999) and **Bender, Demaine & Farach-Colton** (2000), plus **Khuong & Morin, "Array Layouts for
Comparison-Based Searching"** (2017) for the measurements.

**For §39.5 and §40.9.** **Gonzalo Navarro, *Compact Data Structures*** (2016).

---


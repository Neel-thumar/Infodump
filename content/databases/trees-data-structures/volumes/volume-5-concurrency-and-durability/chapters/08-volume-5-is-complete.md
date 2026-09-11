# Volume 5 is complete

**File: `volume-5-concurrency-and-durability.md`** — ready.

## What Volume 6 will cover: SYNTHESIS, REAL-WORLD MAP, AND OPEN FRONTIERS

The final volume does not introduce a new problem. It argues that there was only ever one.

- **One lens for the whole book.** Every design choice in Volumes 1–5 traces back to two questions:
  **where does the data live** — register, cache, RAM, disk, network — and **what operation is
  expensive there**. I will walk back through all five volumes and show the pattern explicitly:
  Volume 1's pointer-chasing, Volume 2's four balance philosophies, Volume 3's fanout, Volume 4's
  choice of summary, Volume 5's coordination costs. The claim is that they are five instances of one
  question, and that you could have derived most of the book from it.
- **Cache-oblivious and cache-aware trees.** How the CPU cache hierarchy recreates Volume 3's
  disk problem at a smaller scale — a point this book has now made four times in passing (Volume 1
  §6.2, Volume 3 §18.2, Volume 4 §21.6, Volume 4 §24.5) — and how tree design is adapting again:
  van Emde Boas layout, Eytzinger/BFS layout, B-trees tuned to cache lines, and the cache-oblivious
  model that gets the right answer without knowing the parameters.
- **A comprehensive reference table**: tree type → the problem it solves → real production systems
  using it today. Covering at minimum the Linux kernel scheduler and memory management,
  filesystems (ext4, Btrfs, NTFS, APFS), relational database indexes (PostgreSQL, MySQL, Oracle),
  LSM/NoSQL engines, DNS, compilers and parsers, git's object model, the browser DOM, network
  routing tables, autocomplete and search, game-engine spatial partitioning, and ML models.
- **Open problems and frontier research**: distributed trees at massive scale, formally verified
  tree algorithms, and hardware-accelerated tree operations — including the observation from Volume
  4 §25.5 that GPUs now contain silicon dedicated to traversing one.
- **A closing curiosity section**: the strangest tree-adjacent structures worth knowing exist —
  van Emde Boas trees, finger trees, zippers, tango trees — brief and playful, as an invitation
  rather than a syllabus.

Say **continue** when you would like me to start Volume 6, the final one.

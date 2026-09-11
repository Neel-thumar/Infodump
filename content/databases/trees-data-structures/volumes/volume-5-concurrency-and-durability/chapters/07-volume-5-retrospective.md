# Volume 5 Retrospective

**1. The concurrency failure is a wrong answer, not a crash (§30.1).** A reader that read a downlink
before a split and follows it afterwards reports that a present key does not exist — silently,
non-deterministically, under load. Everything in Chapter 31 defends against that one interleaving.

**2. The modern binding cost is cache coherence on the latch word, not exclusive contention on the
root (§30.4).** With fanout 500 a root split happens once in four billion insertions, so exclusive
root access is genuinely rare. The real problem is that **acquiring even a shared latch is an atomic
write to shared memory**, so throughput on any single latch caps at roughly one acquisition per
coherence round trip — around 14 million per second — *regardless of core count*, and degrades as
cores are added. **Readers that must announce themselves do not scale**, and that reframing drives
§31.9, §34.3 and §34.9.

**3. Two additions to a page buy latch-free descent (§31.2–31.4).** A right-link and a high key. A
reader compares its key to the high key; if it exceeds it, the keys moved right, so follow the link
and repeat. One latch at a time, no ancestor latches, no restarts.

**4. And the theorem behind it is one line (§31.5).** *A stale downlink always points at or to the
left of the correct page, never to the right — so under-approximations are recoverable by moving
right.* That is the load-bearing sentence of the volume, and it holds because splits move content
only rightward and install the right-link before releasing the latch.

**5. Four separate engineering mysteries were one theorem (§31.6).** No merging, no B\*-trees,
asymmetric backward scans, and root splits needing no special case — all corollaries of "content
moves only rightward". They are not four decisions; they are one invariant seen from four angles.
Volume 3 asserted each of them and pointed here.

**6. Crash safety is two problems, and WAL solves only one (§32.1, §32.6).** Multi-page atomicity is
solved by logging. **Torn pages are not**, because a delta record needs the page to be parseable and
its LSN to be trustworthy — and a torn page can have a **new LSN with old contents**, so redo skips
the record that would have fixed it and *reports success*. Full-page writes exist because you cannot
patch a page that is lying to you about how current it is.

**7. Recovery should never modify the tree (§32.9).** Splitting the split into two log records
deliberately leaves an "incomplete split" state reachable after a crash — which §31.5 proves is
correct for readers — so recovery only ever replays images and deltas, and structural repair is done
later by whoever passes by. This removed a class of recovery bugs and is what makes hot-standby
replay of index changes tractable.

**8. Copy-on-write is closer to WAL than the framing suggests (§32.11).** WAL writes one page plus a
log record, but full-page writes make the first touch cost roughly two pages' worth. CoW writes *h* ≈
4 pages and needs no log at all — and throws in snapshots, MVCC and instant recovery. A factor of
two, not ten. **That is why databases chose WAL and filesystems chose CoW: different weightings, not
different levels of sophistication.**

**9. Cleanup is layered because cost and coverage are inversely related (§33.3).** Opportunistic
layers are nearly free and only see what traffic visits; the background sweep sees everything and must
scan everything. Systems run all of them for complementary coverage — and the bottom layer is
**mandatory**, because §33.4's row-pointer reuse means a missed index entry produces a live,
visible, wrong row.

**10. The bloat equation is *r* × *T* (§33.7).** Deferring cleanup lowers total work and smooths
latency, and pays for both in space proportional to the cleanup interval — plus the operational risk
that the cleaner is load-bearing infrastructure whose failure mode is unbounded growth.

**11. Immutability copies a logarithm, not the data (§34.2).** Path copying creates log_*f*(*n*)
nodes — twenty for a million-element binary tree, four at fanout 32, and 0.002% of the structure.
And it rewards fanout for an entirely different reason than Volume 3 did, which is why persistent
maps are 32-way tries and why §34.9's kernel structure is a B-tree.

**12. Immutability solves the read-path problem completely, and charges for it in space and write
throughput (§34.3, §34.4).** Zero latches, zero shared writes, freely-held snapshots. The cost is
reclamation — and naive reference counting reintroduces the exact cache-line contention it
eliminated, so the working answers all have readers announcing themselves **once per operation in a
thread-local slot**, or (RCU) not at all.

**13. MVCC is immutability with a hand-written garbage collector (§34.8).** Row versions are
immutable, a snapshot is a root pointer, and the vacuum process is the collector — which makes the
"long transaction stops all reclamation" pathology the oldest problem in GC: a live reference
prevents collection. Volume 1 §3.2's DAG warning, Volume 4 §27.6's git object model, and §33.7's
horizon pathology are the same phenomenon in three costumes.

**14. Concurrency-friendliness is mostly about whether a structure has an operation that transiently
breaks its own invariants (§31.10, §34.9).** Skip lists have no rebalancing; B-trees have no
rotations. Both are consequently easy to make safe for lockless readers. Red-black trees rotate, and
a lockless reader can observe a state that is not a tree. **The absence of a rebalancing operation is
the concurrency feature** — which is a strange and useful thing to know when choosing a structure.

---


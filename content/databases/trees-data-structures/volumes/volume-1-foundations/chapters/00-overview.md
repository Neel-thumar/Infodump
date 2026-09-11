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


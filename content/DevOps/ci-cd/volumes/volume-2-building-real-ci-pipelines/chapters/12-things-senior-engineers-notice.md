## Things senior engineers notice

1. **Artifacts are the spine of the delivery chain, not a convenience.** The artifact produced here is what gets deployed in Volume 3. Everything downstream inherits its identity.
2. **Cache is an optimisation that must be allowed to fail.** Any pipeline that *requires* a cache hit is broken and doesn't know it yet.
3. **`allow_failure: true` converts a quality gate into decoration.** Use it deliberately or not at all.
4. **Retrying failures is a way of lying about reliability.** Retry infrastructure classes only.
5. **The critical path is the pipeline's real duration.** Sum-of-jobs is a vanity metric.
6. **Masked ≠ secure.** Protection scoping is the control; masking only stops accidental printing.
7. **Test *reports* matter more than test *logs*.** The MR widget that names three newly failing tests changes reviewer behaviour; a 3000-line log does not.
8. **Pipeline config is code and rots like code.** Duplication, dead jobs, and unexplained flags need refactoring and review just as much as application code.

---


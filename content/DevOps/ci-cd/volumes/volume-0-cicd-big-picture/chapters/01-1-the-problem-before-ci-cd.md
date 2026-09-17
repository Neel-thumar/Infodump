## 1. The problem before CI/CD

Think about a team of six developers working on one application.

Each developer works on their own branch for two or three weeks. Everyone's code works — on their own laptop. Then comes integration day.

```text
Developer A branch  ──┐
Developer B branch  ──┤
Developer C branch  ──┼──►  merge everything  ──►  ???
Developer D branch  ──┤
Developer E branch  ──┤
Developer F branch  ──┘
```

What actually happens on integration day:

- Two people changed the same function in incompatible ways.
- One person upgraded a library; another person's code depends on the old behaviour.
- The build breaks and nobody knows which of the six changes caused it.
- Someone says the famous sentence: **"It works on my machine."**

This has a name in the industry: **integration hell**. The pain is not caused by any single change. It is caused by the *size of the batch* and the *delay* before anyone found out.

### Then comes release day

Once the code somehow merges, the release itself is manual:

```text
Senior developer opens a terminal
        ↓
Runs the build commands from memory (or from a Word document)
        ↓
Copies files to the server over SFTP
        ↓
Restarts the service
        ↓
Hopes
```

Problems with this:

- **Not repeatable.** A different person, a different day, a different result.
- **Not auditable.** Nobody knows exactly what is running in production, or who put it there.
- **Not reversible.** If the release is bad, "rollback" means rebuilding the old version from memory — if the old source can even be identified.
- **Not scalable.** This works for 5 developers and one release a month. It collapses at 50 developers and 10 releases a day.
- **Single point of knowledge.** One person knows the process. They go on leave. The company stops shipping.

> The core insight: **manual delivery does not fail because people are careless. It fails because humans cannot execute a 40-step process identically, every time, under time pressure.**

---


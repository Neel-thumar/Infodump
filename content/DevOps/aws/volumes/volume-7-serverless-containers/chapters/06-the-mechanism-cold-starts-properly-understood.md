## THE MECHANISM: Cold Starts, Properly Understood

"Cold start" gets used as one word for five distinct things. Separating them tells you which ones you can fix.

### The phases

**1. Download the code.** Lambda fetches your deployment package or container image. Proportional to size. A 250 MB package costs more here than a 5 MB one.

**2. Start the microVM.** Firecracker boots. ~125 ms. **Not yours to optimize.**

**3. Start the runtime.** Node, Python, the JVM, .NET. This varies enormously by language.

**4. Run your initialization code** — everything outside the handler function. Imports, dependency injection, SDK client construction, database connection setup, config loading. **This is where the real variance lives.**

**5. Run the handler.** The actual invocation.

Phases 1–4 are the cold start. Phase 5 happens every time.

### Why some cold starts are a hundred times worse

A minimal Python or Node function: roughly **100–300 ms**.

A Java or .NET function with a heavy dependency-injection framework, dozens of libraries, classpath scanning at startup: **2 to 10 seconds**, sometimes worse.

That's not a small difference in degree. It's the difference between "users don't notice" and "the request times out."

The dominant factor is almost always **phase 4** — your own initialization — not the runtime itself. A JVM function with lean initialization starts far faster than a Python function that imports a large scientific stack and constructs six SDK clients at module level.

### What actually helps

**Move work into initialization — deliberately.** Code outside the handler runs once per execution environment and is *reused* across invocations. Create your database connection and SDK clients there, not inside the handler. This makes cold starts slightly slower and every warm invocation much faster.

**Shrink the deployment package.** Bundle only what you use. Tree-shaking, layers for shared dependencies, and not shipping the entire AWS SDK when you use one client.

**Provisioned Concurrency** (2019) keeps a set number of environments pre-initialized and warm. It eliminates cold starts for that many concurrent executions — and it costs money whether or not they're used, which partly undoes the serverless economics. Correct for latency-critical paths, wasteful everywhere else.

**SnapStart** (introduced for Java in 2022, later extended to other runtimes) takes a Firecracker snapshot *after* initialization completes and restores from it. Initialization effectively happens once, at publish time, rather than on every cold start. For JVM workloads this can cut cold starts by an order of magnitude at no extra charge.

It comes with a genuine correctness caveat: **anything captured in the snapshot is shared by every restored environment.** A random seed, a generated unique ID, or an open connection created during init is now identical across all of them. Java's CRaC hooks exist to let you re-randomize and reconnect on restore. If you use SnapStart, you have to think about this.

**Don't chase it if you don't need it.** For an asynchronous, event-driven workload where nothing is waiting on a response, a 400 ms cold start is irrelevant. Cold start optimization matters on synchronous, user-facing paths and almost nowhere else.

---


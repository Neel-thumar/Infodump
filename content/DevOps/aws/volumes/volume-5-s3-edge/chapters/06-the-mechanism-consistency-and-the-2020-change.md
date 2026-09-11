## THE MECHANISM: Consistency, and the 2020 Change

### What it used to be

For its first fourteen years, S3 offered **eventual consistency** for overwrites and deletes.

Concretely: you PUT a new version of an object, get a 200 back, immediately GET it — and could receive the *old* version. Not an error. Stale data, silently.

New objects had read-after-write consistency, with a nasty caveat: if you'd issued a HEAD or GET on a key *before* the object existed (getting a 404), that negative result could be cached, and subsequent reads might keep returning 404 after the object was written.

### Why it worked that way

Strong consistency in a distributed system requires coordination, and coordination costs latency and creates a dependency between replicas. S3's whole design is about minimizing coordination. Eventual consistency was the price of the scale.

### What people built around it

Entire product categories existed to paper over this.

Most notably: big data processing on S3. Hadoop, Spark, and Hive jobs write output files and then list the directory to find them. With eventual consistency, a listing could miss files that had just been written, and a job would silently process incomplete data. Not fail — *silently produce a wrong answer*.

The workaround was an external consistency layer — a separate database tracking which files should exist, consulted alongside the listing. AWS shipped one called S3Guard, built on DynamoDB. You ran a whole extra database to make your file listings trustworthy.

### December 2020

AWS announced **strong read-after-write consistency for all S3 operations**. Every GET, LIST, and HEAD after a successful PUT or DELETE returns the latest state.

No price change. No performance penalty. No opt-in. It simply became true everywhere.

This is one of the more impressive engineering deliveries in AWS's history — retrofitting strong consistency onto an exabyte-scale system without changing its cost or latency characteristics. Its immediate effect was to render an entire category of workaround tooling obsolete.

**Watch for stale advice.** Blog posts, books, and Stack Overflow answers written before 2021 will tell you to design around eventual consistency in S3. That advice is now wrong, and following it costs you complexity for nothing.

---


## Interview questions

**Q: Compare rolling, blue/green, and canary.**
Rolling replaces instances gradually — zero downtime, no extra infrastructure, but two versions coexist and rollback is also gradual. Blue/green runs two full environments and switches traffic at once — near-instant rollback by switching back, at the cost of double infrastructure and with shared database state as the limiting factor. Canary sends a small share of traffic to the new version and increases it while watching metrics — smallest blast radius and real production signal, but it requires traffic splitting and per-version observability to be meaningful.

**Q: How do you design rollback?**
Make artifacts immutable and identified by commit SHA or digest so a previous version can be redeployed exactly; retain those images rather than expiring them; record which version is deployed where, using environment history and a version endpoint; keep database changes backward-compatible using expand/contract so the previous release still runs against current schema; provide an explicit, verified rollback job; and exercise the whole path regularly so you know it works and how long it takes.

**Q: Your deployment job passed but the application is down. What went wrong in the pipeline design?**
The pipeline is only checking that the deploy command exited zero, which says nothing about application health. It needs a verification step that independently confirms readiness with a bounded wait, asserts that the version now serving matches the commit that was deployed, and runs smoke tests on critical paths — failing the pipeline and triggering rollback if any of those fail.

**Q: How do you handle a database migration in a zero-downtime deployment?**
Use expand/contract. First deploy an additive change that both old and new code tolerate, then deploy code that uses the new shape, and only remove the old shape in a later release once nothing depends on it. This keeps every individual release reversible, because at no point does the previous version become incompatible with the current schema.

**Q: Roll back or roll forward?**
Default to rolling back: the previous version is known to work, recovery is fast, and it stops user impact immediately, leaving diagnosis to happen calmly afterwards. Roll forward when rollback is genuinely blocked — typically by an irreversible data change — or when the fix is trivial, well understood, and verifiable. Writing new code under incident pressure is the riskiest option available.

**Q: What makes a good health check?**
It distinguishes liveness from readiness, and readiness genuinely reflects the ability to serve — dependencies reachable, migrations applied, startup complete. It must be able to fail. A check that always returns 200 is actively harmful, because deployment automation, load balancers, and orchestrators all treat it as truth.

---


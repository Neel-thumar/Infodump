## Things senior engineers notice

1. **Deployment strategy is a database decision as much as a traffic decision.** The strategy is bounded by what your schema allows.
2. **Rollback is a property you build in advance, not an action you take later.** By the time you need it, its feasibility is already decided.
3. **Time-to-recover matters more than deployment success rate.** Failures are inevitable; how long they last is the part you control.
4. **An unverified health check is worse than no health check** — it converts uncertainty into false confidence and spreads it to every automated decision downstream.
5. **The version-assertion check catches a whole class of "impossible" bugs**, because deploying the wrong thing successfully is common and invisible.
6. **Blue/green's fast rollback stops at the database.** Flipping the router doesn't unflip a migration.
7. **Feature flags turn releases into configuration changes**, which is the fastest rollback mechanism that exists — and a new kind of debt.
8. **A rollback path exercised quarterly is worth more than three documented ones that were never run.**
9. **Practised recovery is a capability, not a document.** The number you can quote from a real drill is the only honest answer to "how fast can you recover?".

---


## The Question This Volume Answers

Every volume so far has been about building. This one is about two questions you only ask after something goes wrong:

**"What happened?"** and **"How do we not be down?"**

They look unrelated. They aren't. Both come down to a single uncomfortable truth: **the capabilities you need during a failure must be built before the failure, because during the failure you can't build anything.**

You saw this three times already without me naming it:

- **February 2017** (Volume 5) — AWS couldn't update its status page because the status page ran on the service that was down.
- **December 2021** (Volume 1) — AWS's own monitoring was inside the blast radius of the congestion it was trying to diagnose.
- **April 2011** (Volume 4) — Multi-AZ failover behaved differently during the correlated failure it existed for than during the isolated failures it had been tested against.

That's the theme. Four things to take away:

1. **Metrics, logs, and traces are different tools with wildly different costs**, and treating them as interchangeable is expensive.
2. **CloudTrail's most important setting is off by default.**
3. **RTO and RPO are engineering inputs, not aspirations** — you derive architecture from them, not the other way around.
4. **Static stability** — surviving failure without needing the control plane — is the idea that ties this whole guide together.

---


## Things Senior Engineers Notice

1. **502 and 504 are diagnostically different, and conflating them wastes time.** 502 means "couldn't connect" — check if the backend is running. 504 means "connected but too slow" — check backend performance, not backend availability.

2. **`nginx -t` passing doesn't mean the site works.** It validates syntax, not runtime correctness (files existing, backends reachable, certificates valid). Always follow up with an actual request test after reload.

3. **The error log usually already contains the answer.** Most nginx troubleshooting sessions could be shortened significantly by reading the error log first, carefully, before jumping to hypotheses.

4. **Certificate expiry is a self-inflicted outage that's entirely preventable.** Every production TLS setup needs automated renewal and expiry monitoring. If you're manually tracking certificate expiry dates, you will eventually miss one.

5. **A load spike revealing `worker_connections are not enough` is not really an nginx problem — it's a capacity planning gap.** The fix isn't just "increase the number." It's understanding your expected peak load and configuring for it deliberately, with margin.

6. **Passive health checks mean some requests will always hit a backend right as it dies.** This is a fundamental limitation of open-source nginx, not a misconfiguration. Combine it with `proxy_next_upstream` and, where possible, orchestration-level health checks to minimize the impact.

7. **A "successful" reload can still leave stale behavior briefly.** Old workers serving old config continue handling their existing connections during the drain period. If you're debugging "why is the old behavior still happening right after I reloaded," check whether you're hitting a connection handled by a draining old worker.

8. **Rolling deploys via `down` in the upstream block are simple and effective but manual.** For frequent deploys, this manual toggle-and-reload pattern gets replaced by orchestration tools (Kubernetes, load balancer target groups) that automate the same principle.

9. **Config drift between servers is a silent risk in any multi-server setup.** If you're not using configuration management, two nginx servers behind a load balancer can quietly diverge, causing inconsistent behavior depending on which server handles a request. Version control and automated deployment prevent this.

10. **The debugging mindset matters more than memorized fixes.** New, unfamiliar nginx failures happen. The person who systematically checks "config loaded → location matched → nginx vs backend → network vs client → resource limits → logs" will solve novel problems faster than someone who only knows fixes for problems they've seen before.

---


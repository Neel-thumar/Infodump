## Things senior engineers notice

1. **CI's value comes from batch size, not from the tool.** Daily integration with a weak pipeline beats a beautiful pipeline on three-week branches.
2. **Feedback speed is a correctness feature.** A 40-minute pipeline gets ignored, worked around, and eventually disabled. Slow pipelines decay into unused pipelines.
3. **The delivery system is production infrastructure.** If the pipeline is down, you cannot ship a fix during an incident. Treat its availability accordingly.
4. **"It works on my machine" is a reproducibility bug, not a personality flaw.** The fix is pinned dependencies and defined build environments, not blame.
5. **Continuous Deployment is a consequence of test and monitoring maturity, not a goal to chase directly.** Removing the approval button from a team that cannot detect failures automatically just removes the last safety net.
6. **Most CI/CD failures happen outside application code** — credentials, runners, registries, network, environment drift. Beginners debug their code first. Seniors identify the layer first.

---


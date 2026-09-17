## Interview questions

**Q: What is CI/CD?**
The practice of automating the path from a code change to a verified, deployable, and releasable version of the software — so that integration happens frequently in small batches and releasing is repeatable rather than manual.

**Q: What problem does CI solve?**
Late, large-batch integration. When many developers merge weeks of work at once, failures are hard to attribute and expensive to fix. CI shrinks the batch and verifies every change automatically, so failures are small, immediate, and traceable to one change.

**Q: Continuous Delivery vs Continuous Deployment?**
Both keep the main branch always deployable. Delivery stops at an approved-and-ready artifact with a human deciding when it goes to production. Deployment removes that human step and releases automatically once checks pass. Deployment requires much stronger automated testing, monitoring, and rollback.

**Q: Does a passing pipeline mean the release is safe?**
No. It means every check that was written passed. Gaps in test coverage, missing verification after deployment, configuration that differs by environment, and runtime dependencies are all invisible to a green pipeline.

**Q: Why should CI/CD configuration live in the repository?**
Because it is reviewable, versioned, and reproducible. The pipeline that built a commit can be recovered from history, changes to it go through code review, and there is an audit trail of who changed the delivery process and when.

---


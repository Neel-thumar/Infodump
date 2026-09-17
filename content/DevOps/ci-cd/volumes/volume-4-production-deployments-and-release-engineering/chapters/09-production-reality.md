## Production reality

- **Deployment frequency and rollback ability reinforce each other.** Small, frequent releases are easier to verify and safer to reverse; large rare releases are the opposite of both.
- **The approval button is often a formality.** Give the approver something real: what changed, staging verification results, and the rollback plan.
- **Deployment windows exist for a reason in some organisations** — regulated change control, business-critical hours. Automation fits inside them; it doesn't abolish them.
- **Feature flags decouple deploy from release.** Ship code dark, enable it separately. Then "rollback" can mean flipping a flag in seconds, without a deployment at all. Flags have their own cost — they accumulate and must be cleaned up.
- **The deploy script is the most safety-critical code in the repository** and is usually the least reviewed and least tested. Fix that imbalance.

---


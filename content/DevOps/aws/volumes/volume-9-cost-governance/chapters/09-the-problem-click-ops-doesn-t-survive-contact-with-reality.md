## THE PROBLEM: Click-Ops Doesn't Survive Contact With Reality

Everything you've built in this guide, you built by hand. That's correct for learning and catastrophic for production.

**Why manual infrastructure fails:**

**It isn't reproducible.** "Rebuild this in eu-west-1" becomes an archaeology project. Volume 8's backup-and-restore strategy requires provisioning infrastructure in another Region during a disaster — if that infrastructure only exists as a memory of clicking, you don't have a DR plan.

**There's no review.** A code change gets a pull request. A console change gets nothing. The most consequential changes in your system are the least reviewed.

**There's no history.** CloudTrail tells you *that* a security group changed. It doesn't tell you why, or what the intended state was.

**Environments drift.** Staging and production start identical and diverge invisibly, one urgent fix at a time, until "it worked in staging" stops meaning anything.

**Knowledge leaves.** The person who built it knows why that parameter is set that way. Then they get a new job.

---


## 1. Deployment is a moment of risk, not a command

Running `deploy.sh` is trivial. The engineering question is:

> **While the new version is replacing the old one, what do users experience — and if the new version is broken, how many of them find out?**

Every deployment strategy is an answer to those two questions, trading cost and complexity against blast radius.

```text
                 users affected if the release is bad
                 ───────────────────────────────────►
Recreate         ████████████████████████  everyone, plus downtime
Rolling          ████████████░░░░░░░░░░░░  a growing share during rollout
Blue/Green       ████████████████████████  everyone — but for a very short time
Canary           ██░░░░░░░░░░░░░░░░░░░░░░  a small, chosen slice
                 ───────────────────────────────────►
                 cost and complexity increase downward
```

---


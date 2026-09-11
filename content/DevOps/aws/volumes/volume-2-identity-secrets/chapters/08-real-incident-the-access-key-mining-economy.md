## REAL INCIDENT: The Access Key Mining Economy

The second incident is not one event. It's a continuous, industrialized business.

### The mechanism

Someone commits `~/.aws/credentials`, or hardcodes a key in a config file, or bakes one into a Docker image layer, and pushes it to GitHub.

Within seconds — not hours — automated scanners find it. This is a well-documented phenomenon: researchers have planted honeypot keys and measured detection times in the **single-digit minutes, sometimes seconds**.

What the scanners do next is almost always the same: launch the largest GPU instances the account's limits allow, in every Region they can reach, and mine cryptocurrency. Compute converted directly to money, billed to you.

The victim finds out when the bill arrives. Amounts in the tens of thousands of dollars are routine; there are credible public accounts of six-figure weekends.

### Why this is the perfect illustration of the structural flaw

A long-lived access key has three properties that together are fatal:

- **It doesn't expire.** A key leaked in 2019 works in 2026 unless someone noticed.
- **It's a bearer token.** Whoever holds it *is* you. No second factor, no device binding, no source restriction unless you added one.
- **It's plaintext.** It goes in files, environment variables, CI configuration, and shell history.

Contrast with a role: credentials that live an hour, are never written to disk, and are bound to a session with conditions attached.

### What AWS does about it

AWS scans public repositories for exposed keys and, on finding one, applies a quarantine policy that blocks the most damaging actions — and emails you loudly. GitHub also partners with providers on secret scanning and can block pushes containing recognized credential formats.

Do not treat any of this as a safety net. It's a backstop that sometimes works, and the mining bots are often faster.

### The practical rules

- **Prefer roles to keys, always.** On EC2, ECS, EKS, Lambda: use a role. There is no excuse.
- **For CI/CD, use OIDC federation.** GitHub Actions, GitLab CI, and others can exchange a short-lived identity token for AWS credentials via `AssumeRoleWithWebIdentity`. No stored key at all. This is the single highest-value change most teams can make.
- **If you must have a key, condition it.** Source IP, MFA required, expiry enforced by policy.
- **Rotate and audit.** IAM's credential report tells you every key's age and last use.
- **Use git hooks or a scanner** so a secret can't be committed in the first place.

---


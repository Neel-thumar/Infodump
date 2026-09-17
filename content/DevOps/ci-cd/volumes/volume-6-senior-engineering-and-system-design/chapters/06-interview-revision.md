## Interview revision

### Fundamentals
- What is CI? *Frequent integration plus automatic verification — the batch size matters as much as the automation.*
- What is CD? *Keeping main always deployable; Delivery stops at a human approval, Deployment doesn't.*
- What's a pipeline / stage / job / runner?
- What's an artifact, and how does it differ from cache?
- Why does pipeline config belong in the repository?

### Practical
- Write a pipeline that builds, tests, and publishes a report.
- How do jobs pass data between each other?
- How do you store and scope secrets?
- How do you build and push a container image from CI, and what are the security tradeoffs?
- How do `rules:` and `workflow:` differ?
- What does `needs:` change?

### Troubleshooting
- A job is stuck pending — what do you check, in what order?
- Tests pass locally and fail in CI — why?
- An artifact disappeared — five things to check.
- Auth works on main but fails on feature branches.
- The pipeline takes 40 minutes.
- Same commit, different results.

### Production
- Design CI/CD for 100 developers.
- How do you secure runners?
- How do you reduce pipeline duration, in priority order?
- How do you design rollback?
- How do you deploy to production safely?

### Scenario-based

**"Production is broken after a release. Walk me through the next 15 minutes."**
Confirm the symptom and its scope. Identify the currently deployed version from environment history. Decide roll back or roll forward — default to rolling back. Run the rollback job with the last known-good SHA. Verify readiness and that the version endpoint reports the expected SHA. Communicate. Only then diagnose the original failure, and afterwards ask why verification didn't catch it before users did.

**"A developer says the pipeline is flaky and asks for automatic retries."**
Push back, with reasoning rather than refusal. Retries hide the failure and make green meaningless, which costs far more than the inconvenience. Identify whether it's one test or random jobs, quarantine the offender so the team isn't blocked, and fix or delete it. Retry only infrastructure failure classes.

**"Your build runner was compromised. What's the blast radius?"**
Everything that runner could reach: source code, any credentials in its environment, registry write access — meaning attacker-controlled artifacts entering the trusted promotion path. Response: revoke and rotate every credential it had access to, audit artifacts built during the window, rebuild and republish from a clean fleet. This is precisely why production credentials live only on a separate restricted runner.

**"Two teams need different pipeline behaviour but share a template."**
Parameterise the component rather than forking it, keep both teams on pinned versions so neither is broken by the other's needs, and if the requirements genuinely diverge, split into two components with a deprecation path. Forking silently is how you end up with 40 inconsistent pipelines again.

**"The team wants to move from manual approval to continuous deployment."**
It's an outcome of maturity, not a switch. Prerequisites: automated tests you trust, verification after deploy, monitoring that detects failure faster than users report it, a proven rollback with a known recovery time, and small frequent changes. Meet those and removing the button is safe. Remove it first and you've deleted your last safety net.

### System design questions
- CI/CD for 40 microservices, 4 environments, 300 developers, audit requirements.
- Migrate 200 projects from Jenkins to GitLab CI without stopping delivery.
- Reduce median pipeline time from 35 to 10 minutes across an organisation.
- Design secrets management for a company that currently stores static cloud keys in CI variables.
- Design CI/CD for a regulated environment with change windows and mandatory approvals.

---


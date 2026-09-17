## 2. What CI/CD actually solves

CI/CD is the practice of turning that manual, undocumented, memory-based process into an **automated, versioned, repeatable workflow that runs the same way every time.**

Two separate problems, two separate answers:

| Problem | Answer |
|---|---|
| Changes integrate late, in large batches, and break in ways nobody can trace | **Continuous Integration (CI)** |
| Releasing is manual, slow, risky, and hard to reverse | **Continuous Delivery / Deployment (CD)** |

### Continuous Integration — the real definition

Most people say CI means "run tests on every push". That is the *mechanism*, not the *goal*.

**CI means: every developer integrates their work into the shared main branch frequently — at least daily — and every integration is automatically verified.**

Two halves, and both matter:

1. **Integrate frequently** (small batches, short-lived branches)
2. **Verify automatically** (build + test on every change)

If you run tests on every push but developers still sit on branches for three weeks, you have automation — you do not have continuous integration. You have automated integration hell.

Why small batches work:

```text
Large batch:  50 changes  →  build fails  →  which of the 50?  →  hours of bisecting

Small batch:   1 change   →  build fails  →  it's that change   →  fixed in minutes
```

The value of CI is **fast, trustworthy feedback that points at a specific change.**

### Continuous Delivery vs Continuous Deployment

These two are constantly confused, including in interviews. The difference is exactly one thing: **a human approval step.**

| | Continuous Delivery | Continuous Deployment |
|---|---|---|
| After tests pass, the build is… | ready to deploy at any moment | deployed automatically |
| Human approval before production | **Yes** — someone clicks the button | **No** — no button exists |
| Pipeline ends at | a deployable, approved-and-waiting artifact | production |
| Typical for | banks, government, regulated systems, anything with change windows | SaaS products, high-maturity teams, strong monitoring |

```text
CONTINUOUS DELIVERY
commit → build → test → staging → [HUMAN APPROVES] → production

CONTINUOUS DEPLOYMENT
commit → build → test → staging → production
```

Continuous Deployment is not "better". It is a choice that requires very strong automated testing, monitoring, and rollback. A team that deploys automatically without those things is not mature — it is exposed.

Both share the same non-negotiable requirement: **the main branch must always be in a deployable state.** That is what "continuous" is really protecting.

---


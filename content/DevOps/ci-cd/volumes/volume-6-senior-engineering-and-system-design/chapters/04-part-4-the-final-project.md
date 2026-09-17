## Part 4 — The Final Project

What you built, end to end:

```text
1  Developer opens a Merge Request
2  Pipeline: lint (needs: []), build, unit tests with JUnit report,
   secret detection, SAST, dependency scanning
3  Test report widget shows newly failing tests in the MR
4  "Pipelines must succeed" blocks the merge on red
5  Merge to main
6  Image built once, tagged $CI_COMMIT_SHA, pushed to the Container Registry
7  Container scanning on the built image
8  Deploy to TEST (same image) → verify
9  Deploy to STAGING (same image) → verify
10 Manual approval gate on a protected environment
11 Deploy to PRODUCTION via the restricted deployment runner — same image
12 Verification: readiness wait, version assertion, smoke tests
13 Release recorded, tying version → commit → image → deployment
14 Rollback job available, tested, with a known recovery time
```

### How to present it in an interview

Don't list features. Tell it as a chain of problems and solutions:

> "The pipeline builds the image exactly once and tags it with the commit SHA, then promotes that identical image through test, staging and production. I did it that way because rebuilding per environment means the artifact you tested isn't the one you released — dependencies and base images move between builds. Tagging by SHA is also what makes rollback possible: rolling back is just deploying a previous known-good image, which I've actually run and timed rather than only documented. The production job runs on a separate restricted runner, because the build runners execute code from any merge request and must not have production credentials."

Four things happened in that paragraph: a decision, its reasoning, the failure it prevents, and evidence you actually did it. That's the shape to aim for.

### Questions an interviewer will probe

- "What's the slowest part, and what would you do about it?" — know your critical path.
- "How do you know production is healthy after deploy?" — readiness, version assertion, smoke tests.
- "What happens if the deploy runner is compromised?" — blast radius, credential scope, what you'd rotate.
- "Show me the rollback." — the job, the SHA, the measured recovery time.
- "What would you change with three more months?" — have a real answer: artifact signing, canary for the busiest path, distributed cache, migration automation.

---


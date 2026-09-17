## 3. The complete delivery lifecycle

This is the central diagram of the entire guide. Every concept in every volume attaches somewhere on this line.

```text
Developer
    ↓
Git Repository
    ↓
Pipeline Trigger
    ↓
GitLab CI/CD
    ↓
Runner
    ↓
Checkout Source
    ↓
Build
    ↓
Test
    ↓
Security Checks
    ↓
Package / Container Image
    ↓
Artifact / Container Registry
    ↓
Deployment
    ↓
Environment
    ↓
Verification
    ↓
Monitoring
    ↓
Success / Rollback
```

Walk it once in plain words:

1. **Developer** writes code and pushes it.
2. **Git repository** receives the commit — this is the single source of truth.
3. **Pipeline trigger** — GitLab notices the commit and decides a pipeline should run.
4. **GitLab CI/CD** reads the pipeline definition and works out which jobs to create.
5. **Runner** — an actual machine or container picks up a job. *GitLab does not run your code; runners do.* Remember this.
6. **Checkout** — the runner gets a clean copy of the source.
7. **Build** — source code becomes something executable.
8. **Test** — automated checks decide whether this change is acceptable.
9. **Security checks** — dependencies, source, and images are scanned.
10. **Package** — the verified output is wrapped into a deployable unit (a container image, a jar, a zip).
11. **Registry** — that unit is stored somewhere permanent and versioned.
12. **Deployment** — the stored unit is delivered to a target.
13. **Environment** — the target itself: test, staging, production.
14. **Verification** — did the deployed application actually come up healthy?
15. **Monitoring** — is it still healthy ten minutes later?
16. **Success or rollback** — keep it, or return to the last known-good version.

A shorter version you should be able to recite from memory:

```text
Code → Commit → Pipeline → Runner → Build → Test → Artifact → Deploy → Verify → Release
```

### Two things people get wrong about this diagram

**It does not end at "deploy".** Verification and monitoring are part of delivery. A deployment job that finished successfully tells you the *deployment* worked, not that the *application* works. Those are different claims, and Volume 4 spends real time on the gap between them.

**Rollback is not an emergency improvisation.** It is a designed path in the diagram, tested in advance. If you have never actually run your rollback, you don't have one.

---


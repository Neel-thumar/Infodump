## Part 2 — Production Architecture

### 5. The full picture

```text
                        Developer
                            │
                            ▼
                    GitLab Repository
                            │
                    ┌───────┴────────┐
                    ▼                ▼
             Merge Request      Default branch
                    │                │
                    ▼                │
        ┌───────────────────────┐    │
        │  CI PIPELINE          │    │
        │  lint · build · test  │    │
        │  secret · SAST · deps │    │
        └───────────┬───────────┘    │
                    │                │
          BUILD/TEST RUNNER FLEET    │
          (untrusted code, no prod   │
           credentials, ephemeral)   │
                    │                │
                    └────────┬───────┘
                             ▼
                   Build image ONCE
                   tag = commit SHA
                             │
                             ▼
                  Container Registry ◄── container scanning
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
            TEST         STAGING       PRODUCTION
              │              │              ▲
           verify         verify            │
                             │      [ manual approval ]
                             └──────────────┘
                                            │
                                  DEPLOYMENT RUNNER
                                  (protected branches only,
                                   prod credentials, restricted)
                                            │
                                            ▼
                                     Verification
                                  readiness · version
                                  assertion · smoke tests
                                            │
                                  ┌─────────┴─────────┐
                                  ▼                   ▼
                              Monitoring          Rollback
                                                (known-good SHA)
```

Why each component exists, in one line each:

| Component | Exists because |
|---|---|
| Merge request pipeline | Feedback must arrive before merge, not after |
| Build/test runner fleet | Untrusted code must execute somewhere with no path to production |
| Build once, SHA-tagged | The thing tested must be the thing deployed, and be identifiable later |
| Container registry | Artifacts need immutable, versioned, retrievable storage |
| Scanning | Vulnerabilities are cheaper to fix before release than after |
| Environments | Risk staging, configuration separation, and a record of what's where |
| Manual approval | Continuous Delivery's human decision point |
| Deployment runner | Production credentials must never sit where untrusted code runs |
| Verification | A deploy job's exit code says nothing about application health |
| Rollback | Failures are inevitable; recovery time is the variable you control |
| Monitoring | Some failures only appear after the pipeline has finished |

---


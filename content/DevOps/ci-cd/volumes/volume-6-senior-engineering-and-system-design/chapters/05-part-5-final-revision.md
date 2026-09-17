## Part 5 — Final Revision

### Complete CI/CD mental model

```text
Code → Commit → Pipeline → Runner → Build → Test → Artifact → Deploy → Verify → Release
                                                                            │
                                                              Monitor → Rollback if needed
```

```text
Pipeline
  ├── Stage
  │     ├── Job ── executed by a Runner in an isolated workspace
  │     └── Job
  └── Stage
        └── Job
```

### What you must remember

1. **Jobs don't share a filesystem.** Artifacts pass data forward; cache only speeds things up.
2. **Exit codes decide pass/fail**, not log text.
3. **Build once, promote many.** The thing tested must be the thing deployed.
4. **Deploy by immutable reference** (commit SHA or digest), never `:latest`.
5. **Masking prevents accidents; scoping prevents attacks.**
6. **A runner that reaches production must never run untrusted code.**
7. **A deploy job's success is a claim about your script, not your application.**
8. **Rollback is designed in advance and proven by execution.**
9. **Schema changes are the real constraint on rollback** — expand/contract.
10. **Identify the failure layer before investigating it.**

### Production checklist

- [ ] `workflow:rules` prevents duplicate pipelines
- [ ] "Pipelines must succeed" enforced on merge requests
- [ ] Protected branches on `main` and release branches
- [ ] Build happens once; the same artifact promotes across environments
- [ ] Images tagged by commit SHA; deployment by SHA or digest
- [ ] Registry cleanup policy retains deployed and released images
- [ ] Artifact `expire_in` set everywhere; test reports use `when: always`
- [ ] Every environment declared, with history visible
- [ ] Protected environments restrict who can deploy to production
- [ ] Verification step after every deployment
- [ ] Rollback job exists, is tested, and its recovery time is known
- [ ] Releases recorded with traceability to commit and artifact
- [ ] Every job has a `timeout`; `retry` limited to infrastructure failure classes
- [ ] `interruptible: true` cancels superseded pipelines
- [ ] Pipeline duration, queue time and failure rate are monitored

### Security checklist

- [ ] No secrets in Git, ever — and any that were there are rotated, not just deleted
- [ ] Deployment credentials: protected + masked + environment-scoped
- [ ] Short-lived credentials (OIDC/federation) preferred over stored static keys
- [ ] Build/test runners have no production credentials or network path
- [ ] Deployment runner restricted by tag, protected branches only
- [ ] Ephemeral, isolated executors; no shared shell runners for untrusted code
- [ ] No privileged containers unless genuinely unavoidable
- [ ] Fork/MR pipelines cannot access protected variables
- [ ] `.gitlab-ci.yml` changes require review (CODEOWNERS)
- [ ] Included templates and components pinned to versions
- [ ] Secret detection, SAST, dependency and container scanning enabled
- [ ] A defined policy for what blocks a release, and a named triage owner
- [ ] Scheduled rebuilds so base-image CVEs are caught without source changes
- [ ] Images run as non-root, built multi-stage

### Troubleshooting checklist

```text
Read the first 10 log lines   → which runner, executor, image
Identify the layer            → Git · trigger · config · runner · environment ·
                                dependencies · build · test · artifact · registry ·
                                credentials · deployment · application · infrastructure
State what you know / don't know
Decide what evidence distinguishes the candidates
Collect exactly that evidence
Read the full error, not the first "error" you see
Change one thing at a time
Verify the fix, then prevent recurrence
```

Quick signatures worth memorising:

| Symptom | Most likely |
|---|---|
| Job pending forever | Tag mismatch or no available runner |
| Works locally, fails in CI | Environment, missing files, or unpinned dependencies |
| Artifact missing downstream | Wrong path, earlier stage, or `needs:` restriction |
| Auth fails on branches, works on main | Protected variable, unprotected branch |
| Same commit, inconsistent results | Flaky test, shared state, or runner drift |
| Deploy green, app down | No verification; possibly wrong image deployed |
| Rollback fails | Image expired, or schema no longer compatible |

### Senior engineer checklist

- [ ] I can state the cost of every optimisation I've added
- [ ] I know my pipeline's critical path, not just its total duration
- [ ] I know who can deploy to production and with what credentials
- [ ] I have measured recovery time, not estimated it
- [ ] Nothing in my pipeline hides a failure (`|| true`, blanket `retry`, unowned `allow_failure`)
- [ ] Someone owns this pipeline by name
- [ ] The scanning findings have a triage owner and a blocking policy
- [ ] I could explain every line of the YAML to a new joiner

### Common mistakes, consolidated

Cache used to pass build output · `node_modules` cached directly · missing `when: always` on test reports · blanket `retry` hiding flaky tests · unprotected deployment variables · `:latest` in production · rebuilding per environment · treating a green deploy job as a healthy app · health endpoints that always return 200 · irreversible migrations shipped with app changes · documented-but-never-run rollback · registry cleanup deleting the rollback target · one runner fleet for everything · scanning with nobody triaging · unpinned shared includes · optimising jobs off the critical path · a 300-line YAML nobody dares touch.

---


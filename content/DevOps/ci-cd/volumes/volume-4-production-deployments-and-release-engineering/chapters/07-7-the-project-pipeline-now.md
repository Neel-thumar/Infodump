## 7. The project pipeline now

```text
Merge Request → build, test, lint
       ↓
main → image built, tagged by commit SHA, pushed
       ↓
deploy TEST → verify
       ↓
deploy STAGING → verify
       ↓
[ manual approval — production ]
       ↓
deploy PRODUCTION (restricted runner, protected environment)
       ↓
verify: readiness + version assertion + smoke tests
       ↓
healthy?  ── no ──►  rollback-production (manual, verified)
   │
  yes → release recorded
```

---


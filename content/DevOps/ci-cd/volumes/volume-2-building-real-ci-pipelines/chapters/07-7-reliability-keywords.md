## 7. Reliability keywords

```yaml
integration-tests:
  stage: test
  timeout: 15 minutes
  retry:
    max: 2
    when:
      - runner_system_failure
      - stuck_or_timeout_failure
  script:
    - npm run test:integration
```

- **`timeout:`** — bound every job. Without it, a hung job holds a runner until the project-level timeout (often an hour), blocking everyone else.
- **`retry:`** — retry only on **infrastructure** failure classes, as above.

> **Never write a blanket `retry: 2`.** That retries genuinely failing tests until they happen to pass. You have not fixed flakiness; you have hidden it, and made your pipeline lie. Retrying a runner crash is engineering. Retrying an assertion failure is denial.

---


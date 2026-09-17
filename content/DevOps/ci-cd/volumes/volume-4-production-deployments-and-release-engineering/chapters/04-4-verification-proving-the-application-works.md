## 4. Verification: proving the application works

Here is the gap stated plainly:

```text
Deploy job exit code 0  =  "my deploy command ran without error"
Application healthy     =  something INDEPENDENT checked and confirmed
```

These are different claims. A pipeline that only makes the first one is not finished.

### Health endpoints

Your application should expose:

- **Liveness** — is the process alive? (restart if not)
- **Readiness** — can it serve traffic *right now*? Dependencies reachable, migrations applied, caches warm.

Readiness is what deployment cares about, and it must be honest. An endpoint that returns 200 unconditionally is worse than none, because it manufactures false confidence throughout the system.

### A verification job

```yaml
verify-production:
  stage: verify
  image: curlimages/curl:latest
  needs: ["deploy-production"]
  environment:
    name: production
    action: verify
  script:
    - |
      echo "Waiting for the application to become ready..."
      for i in $(seq 1 30); do
        if curl -fsS "https://app.example.com/health/ready" > /dev/null; then
          echo "Ready after ${i} attempts."
          break
        fi
        if [ "$i" -eq 30 ]; then
          echo "Application did not become ready in time."
          exit 1
        fi
        sleep 10
      done
    - |
      DEPLOYED=$(curl -fsS "https://app.example.com/version" | tr -d '"')
      echo "Reported version: ${DEPLOYED}"
      if [ "$DEPLOYED" != "$CI_COMMIT_SHA" ]; then
        echo "Wrong version live. Expected ${CI_COMMIT_SHA}."
        exit 1
      fi
    - ./smoke-tests.sh https://app.example.com
  rules:
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH
```

Three checks, three different lies caught:

1. **Readiness with a bounded wait** — catches a container that never starts. Bounded, so a broken deploy fails in five minutes instead of hanging the pipeline.
2. **Version assertion** — catches the deployment that "succeeded" while the old image kept running. This one bug has caused more confused debugging sessions than almost anything else: the deploy is green, the fix isn't live, and everyone stares at the code.
3. **Smoke tests** — a handful of critical paths: can a user log in, can the main page load, does a core API return sane data. Small and fast. This is not your test suite; it is a pulse check.

> **A deployment stage without verification is an opinion. With verification, it's evidence.**

---


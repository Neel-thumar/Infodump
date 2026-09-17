## 7. The project pipeline so far

```yaml
stages:
  - build
  - test
  - package
  - deploy
```

```text
Merge Request
    ↓
build + test + lint          (Volume 2)
    ↓
main branch
    ↓
build image → push to registry (tagged with commit SHA)
    ↓
deploy to TEST environment
    ↓
deploy to STAGING
    ↓
[ manual approval ]
    ↓
deploy to PRODUCTION  (same image, restricted runner)
```

### Observe

- **Deploy → Container Registry**: your image, tagged by commit SHA.
- **Operate → Environments**: test, staging, production, each showing its current deployment and commit.
- The production job sitting in a **blocked** state with a play button.
- Check the deployed image tag on two environments — they should be **identical**. If they differ, something is rebuilding, and you have lost the guarantee.

---


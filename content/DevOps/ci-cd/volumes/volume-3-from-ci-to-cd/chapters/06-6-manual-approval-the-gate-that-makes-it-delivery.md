## 6. Manual approval — the gate that makes it Delivery

From Volume 0: Continuous Delivery keeps everything deployable and puts a human at the final step.

```yaml
deploy-staging:
  stage: deploy
  environment:
    name: staging
    url: https://staging.example.com
  script:
    - ./deploy.sh staging "$CI_REGISTRY_IMAGE:$CI_COMMIT_SHA"
  rules:
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH

deploy-production:
  stage: deploy
  environment:
    name: production
    url: https://app.example.com
  needs: ["deploy-staging"]
  script:
    - ./deploy.sh production "$CI_REGISTRY_IMAGE:$CI_COMMIT_SHA"
  rules:
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH
      when: manual
  tags:
    - production-deploy
```

Every piece is load-bearing:

- **`when: manual`** — the job exists and waits; a person clicks. No `allow_failure: true`, because this gate *should* hold the pipeline.
- **`needs: ["deploy-staging"]`** — you cannot reach production without having gone through staging.
- **Same `$CI_COMMIT_SHA` as staging** — promotion, not rebuild. This is the whole point of the volume.
- **`tags: production-deploy`** — only the restricted runner holding production credentials executes this.

Remove `when: manual` and you have Continuous Deployment. That one line is the entire difference — but only remove it once Volume 4's verification and rollback are in place.

---


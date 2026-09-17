## 5. Rules — deciding when jobs run

Without conditions, every job runs on every pipeline. That is wasteful and often wrong: you do not want to deploy from a feature branch.

`rules:` evaluates conditions in order, top to bottom, and the **first match wins**.

```yaml
deploy-test:
  stage: deploy
  script:
    - ./deploy.sh
  rules:
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH
      when: on_success
    - when: never
```

Common building blocks:

```yaml
# Only on merge requests
rules:
  - if: $CI_PIPELINE_SOURCE == "merge_request_event"

# Only on the default branch
rules:
  - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH

# Only when a tag is pushed
rules:
  - if: $CI_COMMIT_TAG

# Only when relevant files changed
rules:
  - changes:
      - src/**/*
      - package-lock.json

# Manual, and not required for the pipeline to succeed
rules:
  - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH
    when: manual
    allow_failure: true
```

`when:` values: `on_success` (default), `always`, `never`, `manual`, `delayed`.

Two traps:

- **`when: manual` without `allow_failure: true`** *blocks* the pipeline until someone clicks. That is correct for a deployment gate, and wrong for an optional utility job. Decide which one you mean.
- **`changes:` is unreliable on some pipeline sources** (for example when there is no clear previous commit to compare against, such as a brand-new branch or a scheduled run). Don't use it as a safety control — use it as an optimisation.

> `only:` / `except:` is the older syntax you will find in existing projects and old tutorials. It still works, but it is not where new features go, and it cannot express what `rules:` can. Write new pipelines with `rules:`. Recognise `only:` when you inherit it.

### Merge request pipelines

The workflow you actually want: **run CI on the merge request, against the proposed change**.

```yaml
workflow:
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH
    - if: $CI_COMMIT_TAG
    - when: never
```

`workflow:` controls whether a **pipeline is created at all**. The rules above mean: create pipelines for merge requests, for the default branch, and for tags — and for nothing else. This single block eliminates the duplicate-pipeline problem, where a branch push and its MR each trigger a full pipeline and you pay twice for the same commit.

Then enforce it: **Settings → Merge requests → "Pipelines must succeed"**. Now CI is not advisory. A red pipeline blocks the merge. That is the moment CI starts actually protecting the main branch.

---


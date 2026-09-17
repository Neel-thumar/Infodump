## 5. Environments

An environment is **a deployment destination with an identity**.

```text
Development  →  Test  →  Staging  →  Production
```

Why they exist as separate things:

- **Risk staging.** Each step exposes the change to more realistic conditions before real users.
- **Different configuration** — database URLs, feature flags, credentials, scale.
- **Different permissions.** Anyone may deploy to test; very few to production.
- **Traceability.** Which version is on which environment, right now?

The engineering principle underneath:

> **Environments differ by configuration, never by artifact.**

If your staging build differs from production because someone "just rebuilt it with the fix", you no longer have a staging environment — you have a second, lightly tested production.

### Environments in GitLab

```yaml
deploy-test:
  stage: deploy
  image: alpine:3
  environment:
    name: test
    url: https://test.example.com
  script:
    - ./deploy.sh test "$CI_REGISTRY_IMAGE:$CI_COMMIT_SHA"
  rules:
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH
```

Declaring `environment:` gives you, under **Operate → Environments**:

- Which deployment is current, and which commit it came from
- Full deployment history per environment
- A link to the running application
- A re-deploy / rollback control based on that history

This is not decoration. It is the record that answers "what is running in production and who put it there" — the question that manual deployment could never answer.

### Environment-specific configuration

Two mechanisms, used together:

**Scoped variables.** In **Settings → CI/CD → Variables**, a variable can be limited to an environment scope. `DATABASE_URL` scoped to `test` and a different `DATABASE_URL` scoped to `production` — the job gets the right one based on its `environment: name`.

**Protected environments.** Under **Settings → CI/CD → Protected environments**, restrict which users or roles can deploy to `production`. Combined with protected variables, this closes the loop:

```text
production credentials
    → stored as protected variables
    → available only on protected branches
    → used only by jobs targeting a protected environment
    → deployable only by authorised users
    → executed only by a specific, restricted runner (tags)
```

Each layer alone is weak. Together they are a real control.

---


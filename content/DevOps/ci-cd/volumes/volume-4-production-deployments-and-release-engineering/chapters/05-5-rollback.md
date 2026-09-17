## 5. Rollback

### The four requirements

Rollback is not a command. It is a property of your system, and it requires all four of these:

1. **The previous artifact still exists** — immutable image, still in the registry, not expired by a cleanup policy.
2. **You know exactly which version was previously deployed** — the GitLab environment history gives you this.
3. **The previous version still works against current state** — database, config, and external contracts. The hardest one.
4. **The rollback path has been executed before** — recently, on purpose.

Skip any one and you don't have rollback. You have a plan to improvise during an outage.

### An explicit rollback job

GitLab's environment page can re-deploy a previous deployment. That's useful, but an explicit job is better: it's reviewable, it can include verification, and it works when you need to roll back to a specific version rather than "the previous one".

```yaml
rollback-production:
  stage: deploy
  environment:
    name: production
    action: start
  variables:
    ROLLBACK_SHA: ""          # set when running the job manually
  script:
    - |
      if [ -z "$ROLLBACK_SHA" ]; then
        echo "Set ROLLBACK_SHA to the commit SHA you want live."
        exit 1
      fi
    - ./deploy.sh production "$CI_REGISTRY_IMAGE:$ROLLBACK_SHA"
    - ./verify.sh https://app.example.com "$ROLLBACK_SHA"
  rules:
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH
      when: manual
  tags:
    - production-deploy
```

Notice: rollback is **just a deployment of a known-good image**. That is only possible because Volume 3 tagged images immutably by commit SHA. If you had deployed `:latest`, this job could not be written.

Also notice it verifies. A rollback that isn't verified is another unverified deployment, performed under stress.

### Roll back or roll forward?

| | Roll back | Roll forward |
|---|---|---|
| What | Redeploy the previous known-good version | Deploy a fix |
| Speed | Minutes, if prepared | However long writing and testing a fix takes |
| Risk | Low — that version was running | Unknown — untested code written under pressure |
| Blocked by | Irreversible schema/data changes | Nothing, but it's slower |

**Default to rolling back.** Stop the bleeding, then diagnose calmly. Teams that default to rolling forward end up debugging production while users suffer, because "the fix is nearly ready" is always true and never quite true.

### Actually exercise it

Do this now, on the project, before you need it:

1. Deploy a version. Record its SHA.
2. Deploy a deliberately broken version (a typo in the startup command works fine).
3. **Watch the verification job fail.** Confirm it caught the problem rather than passing anyway.
4. Run the rollback job with the recorded SHA.
5. Confirm the application is healthy and `/version` reports the old SHA.
6. **Time it.** From "we noticed" to "we recovered".

That number is your recovery time. If you have never measured it, you do not know it — and that is what the exercise is for. Most teams discover something surprising here: a missing permission, an expired image, a rollback job nobody could run because it was tagged for a runner they lacked access to. Better to find it on a Tuesday afternoon.

---


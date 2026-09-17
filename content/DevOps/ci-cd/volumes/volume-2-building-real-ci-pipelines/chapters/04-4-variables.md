## 4. Variables

Variables are how you avoid hardcoding, and how secrets enter a pipeline without entering Git.

### Where they come from

| Source | Defined in | Use for |
|---|---|---|
| Predefined | GitLab, automatically | Commit SHA, branch, project paths, registry address |
| In `.gitlab-ci.yml` | `variables:` | Non-secret config: app name, build flags, versions |
| Project/Group settings | **Settings → CI/CD → Variables** | **Secrets**: tokens, passwords, keys |
| Manual run | Pipeline run form | One-off overrides |

Predefined ones you will use constantly:

| Variable | Meaning |
|---|---|
| `CI_COMMIT_SHA` | Full commit hash — the only truly unique build identity |
| `CI_COMMIT_SHORT_SHA` | Short form, good for tags |
| `CI_COMMIT_REF_NAME` | Branch or tag name |
| `CI_PROJECT_DIR` | Working directory on the runner |
| `CI_PIPELINE_ID` / `CI_JOB_ID` | Run identifiers |
| `CI_DEFAULT_BRANCH` | `main`, without hardcoding it |
| `CI_REGISTRY`, `CI_REGISTRY_IMAGE` | Container registry address and image path (Volume 3) |

### Secrets: the two flags that matter

When you add a variable in project settings:

- **Masked** — GitLab replaces the value with `[MASKED]` in job logs. Requires the value to meet certain format rules (single line, minimum length, limited character set); values that don't qualify silently stay unmasked, so verify.
- **Protected** — the variable is only available to jobs running on **protected branches or protected tags**.

Why "protected" is the important one:

```text
Someone forks your project, or pushes a branch, and adds this to .gitlab-ci.yml:

  script:
    - echo $PROD_DEPLOY_TOKEN | base64      # masking won't catch this

If PROD_DEPLOY_TOKEN is NOT protected, that pipeline has your production credential.
If it IS protected, the variable simply does not exist in that job.
```

Read that twice. **Masking is a convenience to prevent accidental printing. Protection is the actual security control.** Anyone who can run a pipeline can run arbitrary commands with access to every unprotected variable.

Rules to follow from now on:

1. Never commit a secret to Git — history is forever, and removing it requires rewriting history everywhere.
2. Every deployment credential: **protected + masked**.
3. Protect the branches that matter (`main`, release branches) in **Settings → Repository → Protected branches**.
4. Assume anything a job can read, a job can exfiltrate.

---


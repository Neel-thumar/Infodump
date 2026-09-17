## 4. The GitLab Container Registry

Every GitLab project can have a registry, and GitLab provides the variables to use it:

| Variable | What it is |
|---|---|
| `CI_REGISTRY` | Registry hostname |
| `CI_REGISTRY_IMAGE` | This project's image path |
| `CI_REGISTRY_USER` / `CI_REGISTRY_PASSWORD` | Short-lived credentials, valid only for the life of the job |

Those credentials are injected automatically — **you do not create a personal token for this, and you must never hardcode one.** They expire when the job ends, which is exactly the property you want from a CI credential. For pulling images in *other* projects, `CI_JOB_TOKEN` is the mechanism, with access controlled by project settings.

### Tagging: the part that determines whether you can roll back

A tag is a **mutable label**. `:latest` today and `:latest` tomorrow can be entirely different images. A digest (`sha256:…`) is **immutable** and identifies exact content.

This leads to the rule:

> **Never deploy `:latest` to anything you care about.**

With `:latest` you cannot answer "what is running in production?", cannot reproduce a bug, and cannot roll back — because the previous `:latest` has no name any more.

A workable scheme, tagging the same image several ways:

```yaml
  script:
    - docker build -t "$CI_REGISTRY_IMAGE:$CI_COMMIT_SHA" .
    - docker push "$CI_REGISTRY_IMAGE:$CI_COMMIT_SHA"
    # human-friendly aliases pointing at the same image
    - docker tag "$CI_REGISTRY_IMAGE:$CI_COMMIT_SHA" "$CI_REGISTRY_IMAGE:$CI_COMMIT_REF_SLUG"
    - docker push "$CI_REGISTRY_IMAGE:$CI_COMMIT_REF_SLUG"
```

| Tag | Mutable? | Use for |
|---|---|---|
| `$CI_COMMIT_SHA` | No, in practice | **Deployment.** Exact, traceable to one commit |
| `v1.4.2` (semantic, from `$CI_COMMIT_TAG`) | Should be frozen | Releases, humans talking about versions |
| `$CI_COMMIT_REF_SLUG` (branch) | Yes | Convenience, testing a branch |
| `latest` | Yes | Local experiments only |

Deploy by commit SHA or digest. Use friendly tags for conversation, not for deployment.

### Registry hygiene

Images are large and accumulate fast. Configure **cleanup policies** on the project registry to expire untagged and old branch images, while keeping release tags. Teams that skip this eventually get an urgent storage bill and delete things in a panic.

---


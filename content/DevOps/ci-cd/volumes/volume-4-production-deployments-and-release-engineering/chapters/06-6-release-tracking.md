## 6. Release tracking

Deployments are technical events. **Releases** are what humans and auditors talk about.

```yaml
create-release:
  stage: release
  image: registry.gitlab.com/gitlab-org/release-cli:latest
  rules:
    - if: $CI_COMMIT_TAG
  script:
    - echo "Creating release $CI_COMMIT_TAG"
  release:
    tag_name: "$CI_COMMIT_TAG"
    description: "Release $CI_COMMIT_TAG from commit $CI_COMMIT_SHA"
```

What this buys you, under **Deploy → Releases**: a permanent record tying a version name to a commit, an image, and a time; a changelog between releases; and an answer to "what changed between v1.4.1 and v1.4.2?" during an incident, at 3 a.m., when nobody's memory is reliable.

Traceability chain worth being able to draw:

```text
Release v1.4.2
    → commit abc123
        → pipeline #5821
            → image registry/app:abc123 (digest sha256:…)
                → deployed to production on 12 Sept, 14:22, by <user>
```

Every link is recorded automatically if you've built the pipeline as described. That chain is the difference between an engineering organisation and a group of people who deploy things.

---


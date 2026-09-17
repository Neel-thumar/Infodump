## 8. Reusable configuration

Copy-pasted YAML rots. Three mechanisms, in increasing order of scope:

**Hidden jobs + `extends:`** — within one file:

```yaml
.node-job:
  image: node:22
  before_script:
    - npm ci --prefer-offline

unit-tests:
  extends: .node-job
  stage: test
  script:
    - npm test
```

A job name starting with `.` is a template — never executed, only inherited.

**YAML anchors** — `&name` / `*name`, older and less readable. You will see them; prefer `extends:`.

**`include:`** — pull configuration from other files or projects:

```yaml
include:
  - local: '/ci/build.yml'
  - project: 'platform/ci-templates'
    ref: v2.3.0
    file: '/templates/security.yml'
```

Note the pinned `ref:`. Including a shared template from a moving branch means someone else's change can alter your pipeline without a commit in your repository. Pin it.

GitLab also has **CI/CD Components** — versioned, parameterised pipeline units published in a catalog, intended as the modern way to share pipeline logic across an organisation. For a single project, `extends:` is enough. For a platform team standardising 50 repositories, components are what you should be reading about.

---


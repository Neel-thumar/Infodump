## 5. Why GitLab CI/CD for this guide

CI/CD is the discipline. GitLab CI/CD is one implementation of it. This guide sticks to one tool on purpose — switching between Jenkins, GitHub Actions and CircleCI teaches you syntax trivia instead of engineering.

Reasons GitLab works well as the teaching tool:

- **Repository, CI, registry, environments, and security scanning live in one product.** You can follow a commit all the way to a deployed environment without wiring five services together.
- **Pipeline configuration is a file in the repository** (`.gitlab-ci.yml`), reviewed like any other code.
- **The runner model is explicit.** You are forced to understand who executes your job, which is exactly the mental model that transfers to every other tool.
- It is widely used in enterprise and government environments, including self-hosted setups.

Where other tools appear in this guide, it is only for comparison, never for implementation.

### What transfers, and what doesn't

| Concept (transfers everywhere) | GitLab implementation (GitLab-specific) |
|---|---|
| Pipeline | Pipeline defined in `.gitlab-ci.yml` |
| Stage / job | `stages:` and job keys |
| Executor / agent / worker | GitLab Runner and its executors |
| Secrets management | CI/CD variables, protected and masked |
| Build output storage | `artifacts:`, GitLab Container Registry |
| Deployment target tracking | `environment:` |
| Conditional execution | `rules:` |
| Approval gate | `when: manual` on a protected environment |

Learn the left column. The right column is how you express it this week, in this tool.

---


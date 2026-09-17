## 4. `.gitlab-ci.yml` — starting small

The pipeline definition lives at the repository root in a file named `.gitlab-ci.yml`. GitLab reads it from the commit being tested — which means the pipeline that ran for an old commit is recoverable, because the definition is versioned with the code.

### The smallest useful pipeline

```yaml
test:
  script:
    - echo "Running tests"
```

That is a valid pipeline. One job called `test`, one command. No stages declared — GitLab puts it in a default stage.

### Adding structure

```yaml
stages:
  - build
  - test

compile:
  stage: build
  script:
    - echo "Compiling the application"

unit-tests:
  stage: test
  script:
    - echo "Running unit tests"
```

Read it as English: there are two stages in this order; `compile` belongs to build; `unit-tests` belongs to test, so it runs after compile succeeds.

### YAML rules you actually need

YAML is indentation-sensitive and unforgiving. Four rules cover nearly every syntax error:

1. **Spaces only. Never tabs.** A tab is a hard error.
2. **Indentation shows nesting.** Two spaces per level, consistently.
3. **`key: value` needs the space after the colon.** `stage:test` is wrong; `stage: test` is right.
4. **`- ` makes a list item.** `script:` takes a list of commands, so each command gets its own `- ` line.

```yaml
job-name:          # top level: the job name
  stage: test      # 2 spaces: a property of the job
  script:          # 2 spaces: another property
    - command one  # 4 spaces + dash: list items
    - command two
```

Anything at the top level that isn't a reserved keyword (`stages`, `variables`, `default`, `include`, `workflow`) is treated as a job name.

**Validate before you push.** GitLab has a linter at **Build → Pipeline editor → Validate** in your project. Use it. Pushing a broken YAML to find out it is broken wastes a cycle and clutters history.

### A first real pipeline for the project

Create a GitLab project, add your application source, and add this:

```yaml
stages:
  - build
  - test

variables:
  APP_NAME: "demo-app"

compile:
  stage: build
  image: node:22
  script:
    - echo "Building $APP_NAME"
    - npm ci
    - npm run build

unit-tests:
  stage: test
  image: node:22
  script:
    - npm ci
    - npm test
```

*(If your application is .NET, Python, or Java, swap the image and the two commands. The structure is identical — that is the point.)*

Note something uncomfortable: `npm ci` runs twice, once per job, because **jobs do not share a filesystem**. That is wasteful, and fixing it properly is exactly what caching and artifacts are for in Volume 2. Feel the problem first; the solution will then make sense instead of being memorised.

---


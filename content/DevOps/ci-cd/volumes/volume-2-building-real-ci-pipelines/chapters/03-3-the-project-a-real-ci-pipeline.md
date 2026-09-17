## 3. The project: a real CI pipeline

Building it up piece by piece. This is the same project from Volume 1, now getting serious.

```yaml
stages:
  - build
  - test

default:
  image: node:22
  cache:
    key:
      files:
        - package-lock.json
    paths:
      - .npm/
    policy: pull

variables:
  npm_config_cache: "$CI_PROJECT_DIR/.npm"

install-and-build:
  stage: build
  cache:
    key:
      files:
        - package-lock.json
    paths:
      - .npm/
    policy: pull-push        # this job may WRITE the cache
  script:
    - npm ci --prefer-offline
    - npm run build
  artifacts:
    paths:
      - dist/
    expire_in: 1 week

unit-tests:
  stage: test
  script:
    - npm ci --prefer-offline
    - npm test -- --reporter=junit --outputFile=junit.xml
  artifacts:
    when: always
    reports:
      junit: junit.xml
    expire_in: 1 week

lint:
  stage: test
  script:
    - npm ci --prefer-offline
    - npm run lint
```

Read what each decision is doing:

- **`default:`** sets values inherited by every job — image and cache. Less repetition, one place to change.
- **`policy: pull`** on the default cache means most jobs only read the cache. Only the build job writes it. Multiple jobs writing the same cache key concurrently is a classic source of corrupted, racing caches.
- **`npm_config_cache`** points the package manager's cache inside the project directory, because **cache paths must be inside the project workspace.** A cache path outside it is silently useless. (Every ecosystem has this: `MAVEN_OPTS -Dmaven.repo.local=...`, `PIP_CACHE_DIR`, `NUGET_PACKAGES`.)
- **`artifacts: reports: junit`** does something special — see below.
- **`when: always`** on the test artifacts: **collect the test report even when the job fails.** Without this you lose the report in exactly the situation where you need it. This single line saves more debugging time than most optimisations.

### Test reports

`artifacts:reports:junit` tells GitLab to parse the file, not just store it. The result:

- A **Tests** tab on the pipeline showing pass/fail counts and failure messages.
- In a **merge request**, a widget listing which tests newly failed compared to the target branch.

That second one is the real value. The reviewer sees "these 3 tests broke" instead of "the pipeline is red, go read 2000 lines of log". CI is about feedback quality, not just automation.

### Observe

Push this and check:

- Build job: `Uploading artifacts... dist/: found N matching files`
- Test job log: `Restoring cache` near the start, and on the second run a cache hit that makes `npm ci` noticeably faster
- Pipeline page: a **Tests** tab
- Job page: a **Browse** / **Download** button for artifacts

---


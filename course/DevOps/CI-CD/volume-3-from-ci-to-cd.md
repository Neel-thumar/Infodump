# Volume 3 — From CI to CD

**Tool:** GitLab CI/CD

---

## Purpose of this volume

| Goal | What it means here |
|---|---|
| Learning goal | Understand why "build once, promote many" is the core of safe delivery |
| Practical goal | Containerise the app, push to the GitLab Container Registry, deploy to a test environment |
| Production goal | Image identity, tags vs digests, registry authentication, environment separation |
| Troubleshooting goal | Image push failures, registry auth, deployment jobs that succeed while the app is down |
| Interview goal | Explain image tagging strategy, environments, promotion, and manual gates |

You now have a pipeline that produces a tested artifact. This volume answers: **how does that artifact get somewhere it can actually run?**

---

## 1. The problem: the same code, built four times

A tempting design:

```text
Dev environment       →  build from source  →  deploy
Test environment      →  build from source  →  deploy
Staging environment   →  build from source  →  deploy
Production            →  build from source  →  deploy
```

It looks clean. It is dangerous, and here is exactly why.

Each build happens at a different moment. Between the test build and the production build:

- A dependency published a new patch version, and your resolver picked it up.
- A base image tag moved to new contents.
- A transient network failure changed what got installed.
- Someone pushed a commit.

So the thing you tested and the thing you released are **different binaries**. Every test you ran was evidence about an artifact that no longer exists.

```text
WRONG                                RIGHT

source → build → test                source → build → test
source → build → production                        ↓
         ^^^^^ different build            the SAME artifact → production
```

> **The thing you tested must be the thing you deploy.**

This is called **build once, promote many**:

```text
         ┌─────────────────────────────┐
source → │  BUILD (exactly once)       │ → artifact v1.4.2
         └─────────────────────────────┘
                     ↓
              stored in registry
                     ↓
        ┌────────────┼────────────┐
        ▼            ▼            ▼
      test       staging      production
     (same artifact, different configuration)
```

Everything after the build is **promotion**, not rebuilding. What differs between environments is **configuration**, injected at deploy time — never the artifact itself.

In factory terms: one production line, one inspected box, shipped to three shops. Not three lines making three different boxes and inspecting one of them.

---

## 2. Containers — only as much as CI/CD needs

This is not a Docker course. You need four ideas.

**A Dockerfile is a build recipe.** It states a base image, copies your application in, and defines how it starts.

**An image is the immutable result** — application, runtime, dependencies, and OS libraries frozen together. This is what solves "works on my machine": the environment travels with the code.

**A container is a running instance of an image.** One image, many containers.

**A registry stores images.** Build pushes, deploy pulls.

```text
Application
   ↓
Dockerfile
   ↓
Container Image        ← the artifact, immutable
   ↓
Container Registry     ← the warehouse
   ↓
Deployment             ← pull and run
```

A reasonable Dockerfile for the project, using a multi-stage build:

```dockerfile
# ---- build stage ----
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- runtime stage ----
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
USER node
EXPOSE 3000
CMD ["node", "dist/server.js"]
```

Two things worth noticing, because they are CI/CD concerns, not Docker trivia:

- **Multi-stage** means build tools stay out of the shipped image. Smaller image, faster pulls, smaller attack surface.
- **`USER node`** — do not run as root. A compromised container running as root is a much bigger problem.

---

## 3. Building images inside a pipeline

Here is the awkwardness: your CI job usually *is* a container. Building an image inside a container needs a solution.

### The approaches, honestly compared

| Approach | How | Security | Notes |
|---|---|---|---|
| **Docker-in-Docker (DinD)** | A Docker daemon runs as a service container beside your job | **Requires privileged mode** — effectively host-level access | Most widely documented; full Docker feature support |
| **Docker socket mount** | Job talks to the host's Docker daemon | Worse than it looks — the job can spawn privileged containers, so it also means host control | Avoid |
| **Rootless BuildKit** | Daemonless/rootless builder | Good | For new GitLab pipelines, rootless BuildKit is the current first option |
| **Buildah** | Red Hat's rootless image builder, OCI-compliant | Good | Familiar commands (`buildah bud`, `buildah push`, `buildah login`); works on shared Kubernetes runners |
| **Kaniko** | Builds in userspace, no daemon | Good | Google archived the original project in June 2025; it continues through the Chainguard fork maintained by its original creators, and GitLab publishes images built from that fork. Mainly relevant now for pipelines that already depend on it |

The security point that makes this a real engineering decision, not a style preference: DinD requires the container to run in privileged mode, which gives it elevated access to the host system. A privileged build container on a shared runner means anything built there can potentially reach the host and other jobs. On a shared Kubernetes runner, DinD is frequently not permitted at all.

**Learn with DinD because it is the most documented; choose rootless for anything real**, especially on shared infrastructure.

### DinD version

```yaml
build-image:
  stage: package
  image: docker:27-cli
  services:
    - docker:27-dind
  variables:
    DOCKER_TLS_CERTDIR: "/certs"
  script:
    - echo "$CI_REGISTRY_PASSWORD" | docker login -u "$CI_REGISTRY_USER" --password-stdin "$CI_REGISTRY"
    - docker build -t "$CI_REGISTRY_IMAGE:$CI_COMMIT_SHA" .
    - docker push "$CI_REGISTRY_IMAGE:$CI_COMMIT_SHA"
  rules:
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH
```

*(This requires runners configured to allow privileged mode. If your job fails with a Docker daemon connection error, that is usually why — it is a runner configuration issue, not your YAML.)*

### Buildah version — rootless, no privileged mode

```yaml
build-image:
  stage: package
  image:
    name: quay.io/buildah/stable
    entrypoint: [""]
  script:
    - buildah login -u "$CI_REGISTRY_USER" -p "$CI_REGISTRY_PASSWORD" "$CI_REGISTRY"
    - buildah bud -t "$CI_REGISTRY_IMAGE:$CI_COMMIT_SHA" .
    - buildah push "$CI_REGISTRY_IMAGE:$CI_COMMIT_SHA"
  rules:
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH
```

`entrypoint: [""]` clears the image's entrypoint so GitLab can run its own shell — a small detail that trips people up with tool images.

---

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

## 6. Manual approval — the gate that makes it Delivery

From Volume 0: Continuous Delivery keeps everything deployable and puts a human at the final step.

```yaml
deploy-staging:
  stage: deploy
  environment:
    name: staging
    url: https://staging.example.com
  script:
    - ./deploy.sh staging "$CI_REGISTRY_IMAGE:$CI_COMMIT_SHA"
  rules:
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH

deploy-production:
  stage: deploy
  environment:
    name: production
    url: https://app.example.com
  needs: ["deploy-staging"]
  script:
    - ./deploy.sh production "$CI_REGISTRY_IMAGE:$CI_COMMIT_SHA"
  rules:
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH
      when: manual
  tags:
    - production-deploy
```

Every piece is load-bearing:

- **`when: manual`** — the job exists and waits; a person clicks. No `allow_failure: true`, because this gate *should* hold the pipeline.
- **`needs: ["deploy-staging"]`** — you cannot reach production without having gone through staging.
- **Same `$CI_COMMIT_SHA` as staging** — promotion, not rebuild. This is the whole point of the volume.
- **`tags: production-deploy`** — only the restricted runner holding production credentials executes this.

Remove `when: manual` and you have Continuous Deployment. That one line is the entire difference — but only remove it once Volume 4's verification and rollback are in place.

---

## 7. The project pipeline so far

```yaml
stages:
  - build
  - test
  - package
  - deploy
```

```text
Merge Request
    ↓
build + test + lint          (Volume 2)
    ↓
main branch
    ↓
build image → push to registry (tagged with commit SHA)
    ↓
deploy to TEST environment
    ↓
deploy to STAGING
    ↓
[ manual approval ]
    ↓
deploy to PRODUCTION  (same image, restricted runner)
```

### Observe

- **Deploy → Container Registry**: your image, tagged by commit SHA.
- **Operate → Environments**: test, staging, production, each showing its current deployment and commit.
- The production job sitting in a **blocked** state with a play button.
- Check the deployed image tag on two environments — they should be **identical**. If they differ, something is rebuilding, and you have lost the guarantee.

---

## 8. Troubleshooting

### "Container image push fails"

**Layer:** Registry / credentials.

Read the error precisely — they mean different things:

| Error | Meaning | Fix |
|---|---|---|
| `unauthorized` / `authentication required` | Login didn't happen or didn't succeed | Check `docker login` ran and used the CI registry variables |
| `denied: requested access to the resource is denied` | Authenticated, but not allowed to write **this path** | The image name must be under `$CI_REGISTRY_IMAGE`; a custom path needs explicit permission |
| `name unknown` / `404` | Registry not enabled for the project | Enable the Container Registry in project settings |
| `Cannot connect to the Docker daemon` | No daemon — DinD service missing or privileged mode not allowed | Runner configuration, not YAML |
| `no space left on device` | Runner disk full | Runner maintenance / cleanup policies |

**First check:** does the log show a successful login line before the push?

### "Authentication works locally but fails in CI"

Your laptop has ambient credentials — a logged-in Docker config, an SSH agent, a cloud CLI profile, a kubeconfig. The runner has none of that. Only what you explicitly provide as variables exists.

Second cause, and it fools people for hours: **the variable is protected, and the branch is not.** The variable silently doesn't exist, and your script sends an empty password. Symptom: authentication fails on a feature branch and works on `main`.

Diagnostic that is safe:

```bash
- if [ -z "$MY_TOKEN" ]; then echo "MY_TOKEN is empty"; exit 1; fi
```

Never `echo $MY_TOKEN`. Check emptiness, not content.

### "Deployment job succeeded but the application is down"

The most important failure in this volume, and a preview of Volume 4.

The deploy job's success means **the deployment command exited 0**. It does not mean the application started, connected to its database, or can serve traffic.

```text
Deploy job: "I told the platform to run image X."     ✅ exit 0
Reality:    container crash-loops on a missing env var ❌ nobody asked
```

Investigate in this order:

1. **Is the right image actually running?** Compare the running image tag with `$CI_COMMIT_SHA` from the pipeline. Frequently the deploy targeted a stale tag.
2. **Did the container start, or is it restarting?** Container/platform status, not the pipeline.
3. **Application logs** at startup — missing configuration and failed dependency connections show up in the first seconds.
4. **Configuration difference** — an environment variable that exists in test and not in production is the classic cause.
5. **Dependencies** — database reachable from that environment? Network rules? Credentials for *that* environment?

**Prevention, and the bridge to Volume 4:** a deploy job that does not verify is not finished. Volume 4 adds a real verification step so "deployed" and "healthy" stop being two different facts nobody is checking.

---

## Production reality

- **Image size affects deployment speed.** A 1.2 GB image pulled onto twenty nodes is slow, and slow deploys make rollback slow — which matters most exactly when you're in trouble.
- **Base images need patching.** `node:22-alpine` gains CVEs over time. Rebuilding on a schedule is how you get security fixes into an artifact whose source code hasn't changed.
- **Registry storage is a real cost**, and cleanup policies are not optional at scale.
- **DinD's privileged requirement is why many organisations standardise on rootless builders.** On shared Kubernetes runners it's often simply unavailable.
- **Pinning base images matters.** `node:22-alpine` moves. For reproducibility, pin a specific version, and for strictness pin a digest.
- **The deploy script is production code.** It usually starts as `deploy.sh` written in an afternoon, and it ends up being the most safety-critical script in the repository.

---

## Common mistakes

- Rebuilding per environment and calling it a pipeline.
- Deploying `:latest`.
- Hardcoding registry credentials instead of using the job-scoped ones.
- Treating a successful deploy job as a healthy application.
- Building images with DinD on a shared runner without understanding what privileged mode grants.
- Shipping build tooling in the runtime image, and running it as root.
- Different `.env` handling per environment that quietly changes behaviour.
- No registry cleanup policy.

---

## Things senior engineers notice

1. **The image digest, not the tag, is the true identity of what is running.** Tags are names people chose; digests are what was actually deployed.
2. **Promotion is a policy decision expressed in the pipeline.** If the pipeline *can* rebuild between staging and production, someone eventually will, under pressure, at 2 a.m.
3. **The build job is the highest-value target in the whole system.** It has source access, registry write access, and produces the artifact everyone trusts. Compromise it and every downstream control is bypassed.
4. **A privileged build container on a shared runner is a shared-tenancy problem**, not just a checkbox.
5. **Environments are a record, not a folder.** Their value is answering "what is running, from which commit, deployed by whom" — which is the audit question.
6. **Manual approval is only meaningful if the approver has information.** A button clicked without knowing what changed or how staging behaved is theatre with an audit trail.
7. **Rollback capability is created here, not in Volume 4.** If you tag properly and promote immutable images, rollback is redeploying a known digest. If you deploy `:latest`, no amount of process will give you a rollback.
8. **Deploy jobs report their own success.** Until something independently checks the application, a green deployment stage is a statement about your script, not your service.

---

## Interview questions

**Q: What is "build once, promote many" and why does it matter?**
The artifact is built exactly once, stored in a registry, and then the identical artifact is promoted through test, staging, and production, with only configuration differing per environment. It matters because rebuilding per environment produces different binaries — dependencies, base images, and build-time conditions change — so the thing you tested is not the thing you released, and your test results no longer apply to what users are running.

**Q: How should container images be tagged in CI?**
Tag with something immutable and traceable — the commit SHA, or a semantic version for releases — and deploy by that. Friendly tags like branch names or `latest` are mutable aliases, fine for convenience but unsafe for deployment, because you can no longer determine what is running, reproduce a bug, or roll back to a specific previous build. Digests are the strongest identity.

**Q: How does a GitLab job authenticate to the container registry?**
GitLab injects `CI_REGISTRY`, `CI_REGISTRY_USER`, and `CI_REGISTRY_PASSWORD` into the job, valid only for that job's lifetime, and the job logs in with them. Nothing is hardcoded and nothing long-lived is stored. For cross-project access, `CI_JOB_TOKEN` is used with permissions controlled in project settings.

**Q: Why is Docker-in-Docker a security concern, and what are the alternatives?**
DinD requires the job container to run privileged, which effectively grants host-level access — a serious problem on shared runners, where another tenant's job or the host itself could be reached. Mounting the host Docker socket is no better, since the job can then spawn privileged containers. Rootless alternatives — BuildKit in rootless mode, Buildah, or Kaniko — build images without a privileged daemon, and are the appropriate choice on shared infrastructure.

**Q: What does an environment give you in GitLab?**
A named deployment target with history: which commit and artifact is currently deployed, every previous deployment, a link to the running system, and a place to attach controls — environment-scoped variables for configuration, and protected environments to restrict who may deploy. It turns deployment from an event into a tracked, auditable state.

**Q: How do you implement an approval gate before production?**
Define a production deployment job with `when: manual` so the pipeline creates it but waits for a person, make it depend on the staging deployment with `needs:`, target a protected environment so only authorised users can run it, scope production credentials to protected variables on protected branches, and route it to a restricted runner via tags. The job deploys the same image reference that was validated in staging.

---

## Volume 3 checklist

- [ ] My application builds into an image inside the pipeline
- [ ] The image is tagged with the commit SHA and pushed to the GitLab Container Registry
- [ ] Test, staging, and production deployments use the **same** image reference
- [ ] `Operate → Environments` shows what is deployed where
- [ ] Production credentials are protected variables on a protected environment
- [ ] A manual approval job gates production
- [ ] I can explain why `:latest` breaks rollback
- [ ] I understand that my deploy job's success proves nothing about the application

**Next:** Volume 4 — Production Deployments and Release Engineering. Deployment strategies, verification that actually checks the application, and a rollback you have genuinely executed.

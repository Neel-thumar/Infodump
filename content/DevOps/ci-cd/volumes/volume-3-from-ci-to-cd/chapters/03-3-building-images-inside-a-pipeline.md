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


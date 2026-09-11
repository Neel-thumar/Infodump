## Images: reducing what's there to attack

### Scan what you run

```bash
cd ~/compose-app
docker compose build > /dev/null 2>&1
docker scout quickview compose-app-api 2>/dev/null || echo "docker scout not available — see alternatives below"
docker scout cves compose-app-api 2>/dev/null | head -30
```

If `docker scout` isn't present, **Trivy** is the standard open alternative and runs as a container:

```bash
docker run --rm -v /var/run/docker.sock:/var/run/docker.sock \
  aquasec/trivy image --severity HIGH,CRITICAL python:3.12-slim | head -30
```

> Note the irony, and take it seriously: that command mounts the Docker socket, which you just learned is root-equivalent. It's a reasonable trade on your own laptop and a considered decision on a build server. Trivy can also scan a tarball from `docker save` with no socket access.

Compare base images to see what you're buying:

```bash
docker run --rm -v /var/run/docker.sock:/var/run/docker.sock aquasec/trivy image \
  --severity HIGH,CRITICAL --quiet debian:bookworm 2>/dev/null | tail -5
docker run --rm -v /var/run/docker.sock:/var/run/docker.sock aquasec/trivy image \
  --severity HIGH,CRITICAL --quiet alpine:3.20 2>/dev/null | tail -5
```

**Expect:** meaningfully different counts. The mechanism is simple — fewer packages means fewer CVEs, because most findings are in OS packages you never call.

### Minimal and distroless

Volume 2's table, now with the security argument attached:

| Base | Shell? | Package manager? | Attack surface |
| --- | --- | --- | --- |
| `debian:bookworm` | yes | yes | Full OS: curl, wget, apt, compilers available to an attacker |
| `*-slim` | yes | yes | Reduced, still a usable environment |
| `alpine` | yes (busybox) | yes (apk) | Small, still scriptable |
| `distroless` | **no** | **no** | Runtime + libs only. An attacker with RCE has no shell to spawn |
| `scratch` | no | no | Only your static binary |

The distroless argument is specific: most post-exploitation tooling assumes `/bin/sh`, `curl` to fetch stage two, and a package manager to install what's missing. Remove all three and a working RCE becomes substantially harder to turn into persistence. The cost is debugging, which you already solved in Volume 3 — attach a `netshoot` sidecar sharing the target's namespaces.

```bash
docker pull gcr.io/distroless/python3-debian12 2>/dev/null && \
  docker run --rm gcr.io/distroless/python3-debian12 -c "print('runs')" && \
  docker run --rm --entrypoint sh gcr.io/distroless/python3-debian12 -c "echo hi" 2>&1 | tail -1
```

**Expect:** Python works; there is no shell to run.

---


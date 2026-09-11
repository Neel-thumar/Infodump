## Podman and the daemonless alternatives

### The architectural objection

Look back at the stack diagram and ask what's uncomfortable about it.

**`dockerd` runs as root, all the time, and everything goes through it.** Consequences, all of which you've already met:

1. **The socket is root** (Volume 7). Access to `/var/run/docker.sock` is host root, which is why the `docker` group is root-equivalent.
2. **It's a single point of failure.** Historically, daemon problems affected every container on the host; the shim architecture fixed most of this, but the daemon still owns builds, networks, and the API.
3. **Containers aren't your children.** Run `docker run` from a shell script and the container is parented by a shim, not by your script. Normal process tools — `wait`, job control, systemd supervision — don't work naturally.
4. **A persistent root daemon is a standing attack surface** whether or not you're using it.

**Podman** (Red Hat) takes the other approach: **no daemon at all.** `podman run` forks and execs `conmon` and then the OCI runtime directly, in your user session. The container is a child of your process.

```bash
# Optional — installs Podman alongside Docker. They coexist fine.
# sudo apt install -y podman
# podman run --rm alpine echo "hello from podman"
# podman run --rm alpine id
```

What that architecture buys:

- **Rootless by default.** Podman runs containers as your user via user namespaces (Volume 1's `unshare --user`). Container root maps to your unprivileged UID. A container escape lands as *you*, not as root.
- **No root daemon** to attack or to grant access to.
- **Normal process semantics.** Containers are children. `systemd --user` can supervise them directly, and `podman generate systemd` produces unit files.
- **CLI compatibility.** `alias docker=podman` genuinely works for most commands, because both drive OCI images and OCI runtimes.
- **Pods**, in the Kubernetes sense — groups of containers sharing a network namespace, exactly the primitive from Volume 5's exercise 5.5.

### The honest counter-case

This is where most write-ups turn into advocacy. The trade-offs are real:

- **Rootless networking is harder.** Without root you can't create veth pairs and manipulate the host bridge, so rootless Podman uses a userspace network stack (`slirp4netns`, or `pasta` more recently). It's slower, and some things behave differently. Privileged ports need configuration.
- **Rootless storage is slower** in some configurations, depending on which overlay mode is available to an unprivileged user.
- **The ecosystem assumes Docker.** Testcontainers, CI integrations, tutorials, and tooling target the Docker socket. Podman provides a compatible socket, which works well but is one more layer where behaviour can diverge.
- **Docker has rootless mode too.** It's less well known, but `dockerd-rootless-setuptool.sh` exists and addresses the same threat. The daemon model remains, but not as root.
- **Docker Desktop's developer experience** on macOS and Windows remains a genuine advantage for many teams.

**The honest summary:** for production Linux servers, especially where you want containers supervised by systemd and no root daemon, Podman's architecture is better on the merits. For local development in a Docker-shaped ecosystem, Docker is still the path of least resistance. They are not rivals so much as different points on a trade-off curve, and OCI standards mean you can move between them without changing your images.

### The rest of the family

| Tool | What it is | Why it exists |
| --- | --- | --- |
| **Buildah** | Builds OCI images without a daemon | Build in a container without mounting the socket (Volume 7's worst pattern) |
| **Skopeo** | Copies and inspects images between registries | Inspect a remote image without pulling it |
| **crun** | An OCI runtime in C, alternative to runc (Go) | Faster start, lower memory. Drop-in |
| **youki** | An OCI runtime in Rust | Same idea, different language |
| **gVisor** | Userspace kernel intercepting syscalls | Narrows the syscall surface from Volume 7's threat model |
| **Kata Containers** | A lightweight VM per container | Container API, VM boundary. The answer when you truly need both |
| **nerdctl** | Docker-compatible CLI for containerd | Docker UX, no dockerd |

`gVisor` and `Kata` are worth remembering specifically, because they're the honest answer to "I need to run untrusted code but I want the container workflow."

---


## The honest threat model

### The one-sentence version

**A container is a strong boundary against accident and a moderate boundary against attack. It is not a VM, and pretending otherwise is how people get hurt.**

### What containers genuinely protect against

| Threat | Protected? | Mechanism |
| --- | --- | --- |
| App A reads App B's files | **Yes** | Mount namespace — different filesystem views |
| App A kills App B's processes | **Yes** | PID namespace — B isn't in A's number space |
| App A eats all RAM and takes down the host | **Yes** | cgroups — a hard budget |
| App A binds a port App B needs | **Yes** | Network namespace — separate port spaces |
| Dependency hell between apps | **Yes** | Separate root filesystems |
| App A sniffs App B's traffic | **Mostly** | Separate network namespaces; a shared bridge weakens this |

That's a real list, and it's why containers were worth adopting. Most production incidents are accidents, and containers prevent a large class of them structurally.

### What containers do NOT protect against

| Threat | Protected? | Why not |
| --- | --- | --- |
| **Kernel exploit** | **No** | One kernel, shared. A `CAP_SYS_ADMIN`-reachable kernel bug is reachable from every container |
| **Root in container = root on host** | **No, by default** | No user namespace by default (Volume 1). UID 0 inside is UID 0 to the kernel |
| **Docker socket access** | **Absolutely not** | Equivalent to root. Demonstrated below |
| **`--privileged` containers** | **No** | Deliberately disables nearly every boundary |
| **Malicious image content** | **No** | You ran it. That was the decision (Volume 2's `docker123321`) |
| **Application-level flaws** | **No** | SQL injection is SQL injection regardless of packaging |
| **Secrets in env vars or layers** | **No** | Visible to anyone with the image or `docker inspect` |
| **Side-channel attacks** | **Weakly** | Shared CPU caches, shared kernel structures |

The comparison from Volume 1, restated now that it matters: **a VM's guest-to-host interface is a narrow hypervisor boundary. A container's is the entire Linux syscall surface** — hundreds of calls plus `ioctl`s, `/proc`, `/sys`, and filesystem semantics, implemented in millions of lines of privileged C. More interface means more bugs. That is the whole argument, and it is correct.

### Prove the socket claim right now

Do this once. It changes how you think about `docker run`.

```bash
docker run --rm -v /:/host:ro alpine cat /host/etc/shadow | head -3
```

**Expect:** the contents of your host's shadow file, from inside a container, with a one-line command.

Nothing was exploited. No vulnerability was used. **The ability to run `docker run` is the ability to mount any part of the host filesystem into a container you control.** Which means:

- Membership in the `docker` group is **root-equivalent**. Not "close to root." Equivalent. Docker documents this.
- A container with `-v /var/run/docker.sock:/var/run/docker.sock` can start any other container, including one that mounts `/`. Every "let the container manage containers" pattern — CI runners, watchtower-style updaters, monitoring agents — carries this.
- If an attacker gets code execution in a container that has the socket mounted, they have the host. There is no second step.

```bash
docker run --rm -v /var/run/docker.sock:/var/run/docker.sock docker:cli version 2>/dev/null | head -6
```

**Expect:** a container successfully talking to your daemon.

If you take one rule from this volume: **never mount the Docker socket into a container unless you have accepted that the container is now root on the host.** Where you must, look at socket proxies that filter the API to a read-only subset.

---


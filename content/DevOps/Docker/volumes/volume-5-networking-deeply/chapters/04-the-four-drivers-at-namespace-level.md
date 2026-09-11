## The four drivers, at namespace level

| Driver | Network namespace | Connectivity mechanism |
| --- | --- | --- |
| `bridge` | **New**, private | veth pair into a bridge + NAT. The default |
| `host` | **None — shares the host's** | No isolation at all; container binds host interfaces directly |
| `none` | **New**, empty | Only `lo`. No veth, no route |
| `overlay` | **New**, private | VXLAN tunnels between hosts (Swarm/orchestration) |

Prove the `host` case is literally namespace sharing, using Volume 1's inode comparison:

```bash
readlink /proc/self/ns/net
docker run --rm --network host alpine readlink /proc/self/ns/net
docker run --rm alpine readlink /proc/self/ns/net
```

**Expect:** the first two print the **same inode**; the third differs. `--network host` is not "a faster network mode." It is *the absence of a network namespace*, which is why there's no NAT overhead, no port mapping, and no isolation. A container on `--network host` binding port 80 is binding your host's port 80.

And `none`:

```bash
docker run --rm --network none alpine sh -c 'ip addr; ip route; ping -c1 -W1 8.8.8.8 2>&1 | tail -1'
```

Genuinely useful for batch jobs that process local data and have no business touching a network — an isolation win that costs nothing.

---


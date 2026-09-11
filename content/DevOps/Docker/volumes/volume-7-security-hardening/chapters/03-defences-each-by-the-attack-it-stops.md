## Defences, each by the attack it stops

Every hardening flag below is introduced by a specific thing it prevents. Skip the ones that don't apply to your threat model — but know what you're skipping.

### Attack: a web shell writes a backdoor into the app directory

**Defence: `--read-only` plus tmpfs for what must be writable.**

```bash
docker run --rm --read-only --tmpfs /tmp:rw,noexec,nosuid --tmpfs /run alpine sh -c '
  touch /tmp/scratch && echo "tmp: writable"
  touch /usr/bin/backdoor 2>&1 || echo "root fs: immutable"
  cp /bin/busybox /tmp/x && chmod +x /tmp/x && /tmp/x true 2>&1 || echo "tmp: noexec enforced"
'
```

**Expect:** `/tmp` writable, root filesystem refused, and execution from `/tmp` blocked by `noexec`.

That combination defeats a large fraction of real post-exploitation tooling, which assumes it can drop a file somewhere and run it. Cheap, and it forces you to know what your app actually writes — which is useful information anyway.

### Attack: an RCE in a root-running service becomes host root

**Defence: run as a non-root user.**

```bash
docker run --rm alpine id
docker run --rm -u 10001:10001 alpine id
```

Better in the image (Volume 2), so it's not something an operator must remember:

```dockerfile
RUN useradd --create-home --uid 10001 appuser
USER appuser
```

Then enforce it at runtime as well — defence in depth costs nothing here:

```yaml
    user: "10001:10001"
```

### Attack: a compromised process uses a privilege it never needed

**Defence: drop capabilities.**

Linux split root into ~40 **capabilities**. Docker grants a subset by default and drops the rest. Check what you get:

```bash
docker run --rm alpine sh -c 'apk add -q libcap; capsh --print 2>/dev/null | head -3'
```

Most applications need **none** of them:

```bash
docker run --rm --cap-drop ALL nginx:1.27 nginx -t 2>&1 | tail -2
docker run --rm --cap-drop ALL --cap-add NET_BIND_SERVICE nginx:1.27 nginx -t 2>&1 | tail -2
```

The ones worth knowing by name:

| Capability | Grants | Notes |
| --- | --- | --- |
| `CAP_SYS_ADMIN` | Mount, namespace ops, and a grab-bag of others | **The dangerous one.** Frequently called "the new root" — many escapes require it |
| `CAP_NET_RAW` | Raw sockets | Granted by default. Enables ARP/DNS spoofing against neighbours on the bridge |
| `CAP_NET_BIND_SERVICE` | Bind ports below 1024 | The legitimate reason people run web servers as root |
| `CAP_SETUID`/`CAP_SETGID` | Change UID/GID | Needed by servers that drop privileges themselves |
| `CAP_DAC_OVERRIDE` | Bypass file permission checks | Granted by default; rarely needed |

**The pattern: `--cap-drop ALL`, then add back only what breaks.** `CAP_NET_RAW` being on by default is worth a moment's thought — it means a compromised container can, by default, spoof traffic to its neighbours on the same Docker network.

### Attack: a SUID binary inside the container escalates privileges

**Defence: `--security-opt no-new-privileges`.**

```bash
docker run --rm --security-opt no-new-privileges -u 10001 alpine sh -c '
  ls -l /bin/busybox
  echo "no_new_privs prevents any SUID/setcap escalation from here"'
```

This sets the kernel's `no_new_privs` bit, which makes it impossible for the process or any child to gain privileges via `execve` — SUID bits and file capabilities simply stop working. It is a one-flag mitigation for an entire escalation class, and it breaks almost nothing. Turn it on everywhere.

### Attack: exploiting an obscure syscall to reach a kernel bug

**Defence: seccomp.**

Seccomp filters which syscalls a process may make. **Docker applies a default seccomp profile to every container**, blocking a set of syscalls (commonly cited as roughly 40–50) that no normal application needs but that have historically been useful for escapes.

```bash
docker info --format '{{json .SecurityOptions}}'
```

**Expect:** entries for `seccomp` (with the default profile), `apparmor` on Debian, and possibly `cgroupns`.

See it enforce something:

```bash
docker run --rm alpine sh -c 'mount -t tmpfs none /mnt 2>&1' || echo "blocked by default policy"
docker run --rm --cap-add SYS_ADMIN alpine sh -c 'mount -t tmpfs none /mnt && echo "mount succeeded with SYS_ADMIN"'
```

And observe what running *without* it looks like — note this is the wrong direction, shown so you recognize it in someone else's Compose file:

```bash
docker run --rm --security-opt seccomp=unconfined alpine sh -c 'echo "running with NO syscall filtering"'
```

Custom profiles are possible (`--security-opt seccomp=./profile.json`) and are how you'd lock a known workload down to the syscalls it actually uses. Tooling exists to record a profile from a running container. Worth it for high-value services; overkill for most.

> **Confidence: high** that Docker applies a default seccomp profile and that it blocks a meaningful set of syscalls. **Medium** on the exact count, which has changed across versions — check the current profile in Docker's docs rather than quoting a number.

### Attack: a container reads or writes host paths through `/proc` and `/sys`

**Defence: AppArmor (Debian/Ubuntu) or SELinux (RHEL family).**

Docker applies a `docker-default` AppArmor profile automatically on Debian. It restricts writes to `/proc` and `/sys` paths and blocks mount operations, independently of capabilities.

```bash
docker run -d --name aa --rm alpine sleep 60
PID=$(docker inspect -f '{{.State.Pid}}' aa)
sudo cat /proc/$PID/attr/current 2>/dev/null
docker stop aa
```

**Expect:** `docker-default (enforce)` or similar. Note the callback to Volume 1: **the default AppArmor profile did *not* block CVE-2019-5736**, while correctly-configured SELinux did. Neither is a complete answer; both are layers.

### Attack: everything at once — `--privileged`

**Defence: never use it, and know what it actually does.**

`--privileged` is not "a bit more access." It grants **all capabilities**, disables seccomp and AppArmor, and gives the container access to all host devices with `/sys` writable. It is approximately "run this as root on the host, with a different filesystem."

```bash
docker run --rm --privileged alpine sh -c 'ls /dev | head -20; echo "---"; cat /proc/self/status | grep CapEff'
docker run --rm alpine sh -c 'ls /dev; echo "---"; cat /proc/self/status | grep CapEff'
```

**Expect:** the privileged container sees your host's disks (`sda`, `nvme0n1`) and has a full capability mask; the normal one sees a handful of pseudo-devices and a restricted mask.

A privileged container can mount your host's root filesystem. It can load kernel modules. The well-documented **cgroup `release_agent` escape** (assigned **CVE-2022-0492**, affecting cgroups v1) worked by writing a host-path helper into a cgroup file — reachable when a container had `CAP_SYS_ADMIN` or ran privileged. **Confidence: medium-high** on the CVE identifier and the mechanism class; verify the current details before citing specifics.

If you need one device, pass one device: `--device /dev/ttyUSB0`. If you need one capability, add one capability. `--privileged` in a Compose file should be treated as a review blocker.

---


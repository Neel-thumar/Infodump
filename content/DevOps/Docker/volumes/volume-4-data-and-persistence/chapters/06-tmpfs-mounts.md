## tmpfs mounts

The third type, and the one people forget exists.

```bash
docker run --rm --tmpfs /scratch:size=64m alpine sh -c '
  findmnt -no TARGET,FSTYPE,OPTIONS /scratch
  dd if=/dev/zero of=/scratch/f bs=1M count=10 2>&1 | tail -1
  df -h /scratch
'
```

**Expect:** `/scratch` is `tmpfs`, sized at 64 MB, and writes to it are RAM-speed.

A tmpfs mount is **deliberately not persistent**. It exists for three real jobs:

- **Secrets at runtime.** A decrypted credential written to tmpfs never touches a disk, so it can't end up in an image layer, a volume backup, or a forensic disk image. Volume 7 builds on this.
- **Speed for scratch data.** Caches, sockets, PID files, temp files in a write-heavy pipeline. Recall from Volume 1 that overlay writes are expensive (copy-on-write copies whole files); tmpfs avoids that entirely.
- **Making `--read-only` usable.** A hardened container with an immutable root filesystem still needs somewhere to write `/tmp` and `/run`:

```bash
docker run --rm --read-only --tmpfs /tmp --tmpfs /run alpine sh -c '
  touch /tmp/ok && echo "tmp writable"
  touch /rootfile 2>&1 || echo "root filesystem is immutable"
'
```

**That two-flag combination is a genuinely strong hardening posture** and it costs nothing. Note the honest caveat: tmpfs uses your RAM, and without `size=` it can grow until it competes with everything else on the host. Pair it with the memory limits from Volume 3.

---


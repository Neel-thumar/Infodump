## The mechanism: it's all mounts

Here's the unifying idea, and it makes all three storage types fall out at once.

The container has its own **mount namespace** (Volume 1). Docker can put anything it likes into that namespace's mount tree at any path. So "persisting data" is just: **mount something from outside the container's lifecycle at the path where the application writes.** Writes to that path go to the mounted filesystem, not to the overlay's upper directory — the overlay isn't even involved, because a mount at `/var/lib/postgresql/data` shadows whatever the image had there.

The three options differ only in *what* gets mounted:

| Type | What's mounted | Lives where | Survives `docker rm` | Managed by |
| --- | --- | --- | --- | --- |
| **Volume** | A directory Docker created and tracks | `/var/lib/docker/volumes/<name>/_data` | **Yes** | Docker |
| **Bind mount** | Any path on your host | wherever you said | **Yes** (it's your host's) | You |
| **tmpfs mount** | A RAM-backed filesystem | memory only | **No — by design** | kernel |

Confirm it's really the mount namespace doing the work:

```bash
docker volume create demo-vol
docker run --rm -v demo-vol:/data -v /tmp:/hosttmp --tmpfs /scratch alpine \
  sh -c 'findmnt -no TARGET,SOURCE,FSTYPE /data /hosttmp /scratch'
```

**Expect:** three entries. `/data` and `/hosttmp` show as mounts from your host filesystem (with the source path visible), `/scratch` shows as `tmpfs`. The container's own root is `overlay`; these three paths are not.

There is no "volume subsystem" doing anything magical. It's `mount` inside a namespace.

---


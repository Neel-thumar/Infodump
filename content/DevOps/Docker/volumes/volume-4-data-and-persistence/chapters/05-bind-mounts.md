## Bind mounts

### What they are

A bind mount maps a **host path** into the container. No Docker management, no volume namespace — the kernel's `mount --bind`, inside the container's mount namespace.

```bash
cd ~/docker-app
docker run -d --name dev --rm -p 8000:8000 \
  -v ~/docker-app:/app \
  -e GREETING="live reload" \
  myapp:v2
curl -s localhost:8000
```

Now edit the source on your host and watch the container see it:

```bash
docker exec dev cat /app/app.py | head -3
echo "# edited from the host at $(date)" >> ~/docker-app/app.py
docker exec dev tail -1 /app/app.py
docker stop dev
```

**Expect:** the change is visible instantly inside the container. That's the entire value proposition — **development**. Your editor on the host, the runtime in the container, no rebuild between them.

### The `-v` footgun

```bash
docker run --rm -v /home/$USER/typoed-path:/data alpine ls -la /data
ls -la ~/typoed-path
```

**Expect:** no error, and **a new empty directory created on your host** (owned by root). `-v` silently creates missing host paths. Your app then starts with an empty config directory and fails in a confusing way somewhere else entirely.

`--mount` refuses:

```bash
docker run --rm --mount type=bind,source=/home/$USER/another-typo,target=/data alpine ls /data
```

**Expect:** an error saying the bind source path does not exist. That is the correct behaviour, and it is why `--mount` is worth the extra typing in anything automated.

```bash
sudo rmdir ~/typoed-path
```

### The permissions problem

The single most common bind-mount frustration, and it follows directly from Volume 1: **there is no user namespace by default, so UIDs mean the same thing inside and outside.**

```bash
docker run --rm -v ~/docker-app:/app alpine sh -c 'id; ls -la /app | head -3'
docker run --rm -u 10001 -v ~/docker-app:/app alpine sh -c 'touch /app/newfile 2>&1 || echo "permission denied"'
```

The container's user is UID 10001. Your files are owned by your UID (probably 1000). The kernel compares numbers; it knows nothing about "the container's user." Files created by a root container on a bind mount end up **owned by root on your host**, which is how people end up needing `sudo` to delete files their own `npm install` created.

Options, in rough order of preference:

- `-u $(id -u):$(id -g)` — run the container as you. Simple, works, occasionally breaks images expecting to be root.
- Build the image with a user whose UID matches yours (`--build-arg UID=$(id -u)`).
- Use a **named volume** instead, and copy data in and out. Sidesteps the problem entirely, which is why volumes are the production answer and bind mounts are the development answer.
- Enable user namespaces (`userns-remap`). Correct, and has knock-on effects; Volume 7.

### Read-only, and mount propagation

```bash
docker run --rm -v ~/docker-app:/app:ro alpine sh -c 'touch /app/x 2>&1 || echo "read-only as intended"'
```

The `:ro` suffix is cheap and worth it for any bind mount the container has no business writing to — config files, certificates, source code in a production image.

And a callback to Volume 1's note on **mount propagation**: bind mounts have propagation modes (`rprivate` by default, plus `shared`, `slave`). If you bind-mount a host directory and later mount a new filesystem *underneath* it on the host, the container won't see it unless propagation is `shared` or `rslave`. This matters for anything mounting network storage or block devices at runtime, and it's the cause of a small family of otherwise baffling "the directory is empty inside the container" reports.

---


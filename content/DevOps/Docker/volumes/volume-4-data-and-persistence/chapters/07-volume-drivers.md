## Volume drivers

`docker volume create` has a `--driver` flag, defaulting to `local`. The driver is the plugin that decides what a volume actually *is*.

```bash
docker info --format '{{json .Plugins.Volume}}'
```

**Expect:** `["local"]` on a default install.

The `local` driver is more capable than its name suggests — it can pass arbitrary mount options through to the kernel, which means NFS works with no plugin at all:

```bash
# Illustrative — needs a real NFS server, don't run as-is
docker volume create --driver local \
  --opt type=nfs \
  --opt o=addr=192.168.1.50,rw,nfsvers=4 \
  --opt device=:/exports/appdata \
  nfsdata
```

You can also create a volume backed by tmpfs, or by a specific host path (which is a bind mount wearing a volume's clothes, useful when you want a stable *name* for a host path):

```bash
docker volume create --driver local \
  --opt type=none --opt o=bind --opt device=/srv/appdata \
  appdata
docker volume inspect appdata
docker volume rm appdata
```

Third-party drivers exist for cloud block storage, distributed filesystems, and so on. The honest scoping: **volume plugins are largely a pre-Kubernetes answer to a problem Kubernetes now solves with CSI** (the Container Storage Interface). For single-host Docker, `local` plus your own backup strategy covers the overwhelming majority of real use. Know the flag exists; don't go shopping for plugins you don't need. **Confidence: high** on the mechanism, **medium** on the ecosystem's current shape — worth checking whether specific drivers are still maintained before adopting one.

---


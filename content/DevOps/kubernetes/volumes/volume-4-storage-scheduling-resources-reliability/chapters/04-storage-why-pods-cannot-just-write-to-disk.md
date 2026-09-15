## Storage: Why Pods Cannot Just Write to Disk

A container's own filesystem dies with the container. Restart it — even the *same* Pod restarting a crashed container — and anything written locally is gone. For a stateless web server this is fine. For a database, it is fatal.

### Volumes vs PersistentVolumes — the distinction that confuses everyone

Kubernetes has two different things called "volume", and mixing them up causes real mistakes.

**A `volume` in a Pod spec** is just storage attached to a Pod's lifetime. Some volume types are genuinely temporary:

```yaml
volumes:
  - name: cache
    emptyDir: {}          # exists only as long as the Pod does
```

`emptyDir` is useful for scratch space or sharing files between containers *in the same Pod* — but it disappears when the Pod is deleted, not just when it restarts oddly. Never store anything you cannot afford to lose in `emptyDir`.

**A `PersistentVolume` (PV)** is storage that outlives any single Pod, and even outlives the Deployment that used it. This is what a database needs.

### The chain: Pod → PVC → PV → StorageClass

```text
Pod
 ↓  "I need 10Gi of storage"
PersistentVolumeClaim (PVC)
 ↓  matched against
StorageClass
 ↓  which tells the CSI driver
 ↓  to create real storage and produce a
PersistentVolume (PV)
```

Read this carefully, because the direction of the relationship is the whole point:

* A **PVC** is a request: "I need 10Gi, read-write by one Pod at a time."
* A **PV** is the actual storage that satisfies that request — could be a cloud disk, an NFS share, anything.
* A **StorageClass** describes *how* to make a PV automatically when a PVC asks for one.

You almost never create a PV by hand in a cloud environment. You create a PVC, and **dynamic provisioning** creates the PV for you.

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: data
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 5Gi
  storageClassName: standard
```

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: db
spec:
  containers:
    - name: postgres
      image: postgres:16
      env:
        - name: POSTGRES_PASSWORD
          value: demo
      volumeMounts:
        - name: data
          mountPath: /var/lib/postgresql/data
  volumes:
    - name: data
      persistentVolumeClaim:
        claimName: data
```

The Pod never mentions the PV. It only mentions the PVC — the request, not the storage itself. This indirection is deliberate: the same PVC-referencing manifest works whether the underlying disk is an AWS EBS volume, an Azure disk, or a local test volume, because the StorageClass is what changes between environments.

### Access modes

| Mode | Meaning |
|---|---|
| `ReadWriteOnce` (RWO) | One node can mount it read-write — the common case, including most cloud block storage |
| `ReadOnlyMany` (ROX) | Many nodes, read-only |
| `ReadWriteMany` (RWX) | Many nodes, read-write — needs storage that supports it (NFS-style), not plain cloud block storage |

A very common early mistake: expecting to scale a Deployment using a single RWO PVC to multiple replicas. It will not work — only one Pod can mount it read-write at a time, and the others will sit stuck.

### CSI, briefly

**CSI (Container Storage Interface)** is the standard Kubernetes uses to talk to storage systems, the same pattern as CRI for runtimes and CNI for networking. Kubernetes does not know how to talk to any specific storage backend; a CSI driver — provided by your cloud provider or storage vendor — does the actual provisioning, attaching and mounting. This is **ecosystem tooling**, not Kubernetes core, even though PV/PVC/StorageClass are core objects.

```bash
kubectl get storageclass
kubectl get pvc
kubectl get pv
kubectl describe pvc data
```

`kubectl describe pvc` is your first stop when a Pod is stuck waiting on storage — it shows whether the claim is `Bound`, `Pending`, and why.


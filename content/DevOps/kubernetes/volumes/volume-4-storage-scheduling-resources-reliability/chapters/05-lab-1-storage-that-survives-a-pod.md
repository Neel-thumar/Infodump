## LAB 1 — Storage That Survives a Pod

### Goal

Prove that data outlives the Pod, and see the PVC/PV binding directly.

### Setup

`kind` has a default StorageClass out of the box, so dynamic provisioning works locally without extra setup.

```bash
kubectl create namespace storage-lab
kubectl config set-context --current --namespace=storage-lab
kubectl get storageclass
```

### Commands

```bash
kubectl apply -f - <<'EOF'
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: data
spec:
  accessModes: ["ReadWriteOnce"]
  resources:
    requests:
      storage: 1Gi
---
apiVersion: v1
kind: Pod
metadata:
  name: writer
spec:
  containers:
    - name: box
      image: busybox:1.36
      command: ["sh", "-c", "echo hello > /data/note.txt && sleep 3600"]
      volumeMounts:
        - name: data
          mountPath: /data
  volumes:
    - name: data
      persistentVolumeClaim:
        claimName: data
EOF

kubectl get pvc
kubectl get pv
kubectl exec writer -- cat /data/note.txt
```

Now delete the Pod entirely and recreate it pointing at the same PVC:

```bash
kubectl delete pod writer
kubectl apply -f - <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: reader
spec:
  containers:
    - name: box
      image: busybox:1.36
      command: ["sh", "-c", "sleep 3600"]
      volumeMounts:
        - name: data
          mountPath: /data
  volumes:
    - name: data
      persistentVolumeClaim:
        claimName: data
EOF
kubectl exec reader -- cat /data/note.txt
```

### Expected result

`hello` appears both times, from two completely different Pods, because both mounted the same PVC.

### What to observe

`kubectl get pv` shows the PV that was automatically created for your PVC, and its status stays `Bound` through the whole exercise. The Pod is disposable. The claim and its underlying volume are not.

### Why this matters

This is the difference between a stateless web tier and a database tier, demonstrated directly rather than described.

### Cleanup

```bash
kubectl delete pod reader
kubectl delete pvc data
```

Deleting the PVC will delete the PV too, if the StorageClass's reclaim policy is `Delete` — the default for dynamic provisioning. Check with `kubectl get storageclass -o yaml` if you need to know for certain before deleting anything real.


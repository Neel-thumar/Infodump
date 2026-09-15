## LAB 2 — See Scheduling and Limits Enforced

### Goal

Watch a Pod get rejected by filtering, then watch a memory limit get enforced.

### Commands

```bash
kubectl taint nodes --all dedicated=special:NoSchedule
kubectl run test --image=nginx:1.27
kubectl get pods
kubectl describe pod test | tail -10
```

### Expected result

The Pod stays `Pending`. The events show something like `1 node(s) had untolerated taint {dedicated: special}`.

Now fix it:

```bash
kubectl run test2 --image=nginx:1.27 --overrides='{"spec":{"tolerations":[{"key":"dedicated","operator":"Equal","value":"special","effect":"NoSchedule"}]}}'
kubectl get pods
```

### What to observe

The scheduler told you *exactly* which filter failed. This is the message to read first on every `Pending` Pod, before assuming anything more complicated.

Now the memory limit:

```bash
kubectl run hog --image=polinux/stress --limits=memory=50Mi -- stress --vm 1 --vm-bytes 150M --timeout 30s
sleep 5
kubectl describe pod hog | grep -A3 "Last State"
```

### Expected result

`Last State: Terminated`, `Reason: OOMKilled`.

### Why this matters

You have now caused, on purpose, in a safe lab, the exact failure most engineers meet for the first time in a 2 AM production incident. Recognising `OOMKilled` immediately, instead of treating it as a mystery, is worth a great deal.

### Cleanup

```bash
kubectl delete pod test test2 hog --ignore-not-found
kubectl taint nodes --all dedicated=special:NoSchedule-
```

That trailing `-` on the taint command removes it. ⚠️ Confirm this on a real cluster before untainting nodes you do not own — taints are often there deliberately.


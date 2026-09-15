## Troubleshooting With the Architecture

Do not memorise fixes. Ask: **which component was supposed to act next?**

| Symptom | Which component | First command |
|---|---|---|
| `kubectl` hangs or times out | API server or your kubeconfig | `kubectl cluster-info` |
| Pod stays `Pending` | Scheduler — could not find a suitable node | `kubectl describe pod <name>` |
| Pod stuck `ContainerCreating` | kubelet, network plugin or volume mount | `kubectl describe pod <name>` |
| `ImagePullBackOff` | kubelet could not fetch the image | `kubectl describe pod <name>` |
| `CrashLoopBackOff` | Container starts then exits — application problem | `kubectl logs <pod> --previous` |
| Deployment creates endless Pods | Selector and template labels do not match | `kubectl get deployment -o yaml` |
| Node shows `NotReady` | kubelet stopped reporting | `kubectl describe node <name>` |

The pattern: **`describe` tells you what Kubernetes tried to do. `logs` tells you what your application did.** Use them in that order.


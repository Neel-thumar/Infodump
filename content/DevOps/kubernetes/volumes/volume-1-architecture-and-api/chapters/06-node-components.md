## Node Components

### kubelet

The agent on every node. It watches the API server for Pods assigned to *its* node, then makes them real: pulls images, asks the runtime to start containers, mounts volumes, runs health checks, and reports status back.

Important: **the kubelet is not told what to do. It looks for work.** Nobody pushes instructions to it.

### kube-proxy

Makes Services work on that node by programming network rules in the Linux kernel (using iptables, IPVS or nftables depending on the mode and Kubernetes version). We cover this properly in Volume 3.

### Container runtime

The software that actually creates containers — normally **containerd**, sometimes **CRI-O**. Kubernetes talks to it through a standard interface called **CRI** (Container Runtime Interface).

Note for 2026: Docker is no longer used as a runtime by Kubernetes. Support for it was removed in Kubernetes 1.24. Images built with `docker build` still work perfectly — the image format is standard. Docker is a build tool here, not a runtime.


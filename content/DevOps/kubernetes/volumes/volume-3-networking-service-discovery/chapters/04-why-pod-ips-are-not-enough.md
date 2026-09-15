## Why Pod IPs Are Not Enough

Recall from Volume 2: every Pod gets its own IP. Good — but three problems remain.

**1. Pod IPs are temporary.** Delete a Pod, get a new one, get a new IP. Anything that saved the old IP is now wrong.

**2. There is no single address for "the app".** A Deployment with 5 replicas has 5 different IPs. Which one does a client use?

**3. Pod IPs usually are not reachable from outside the cluster** without extra networking setup.

You need something stable in front of a changing set of Pods. That is a **Service**.

In the apartment analogy: Pods are rooms, and rooms get reassigned constantly. A **Service is the reception desk** — one fixed address. You call reception; reception knows which rooms currently have the right tenants.


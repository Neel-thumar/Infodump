## Why GitOps Exists (The Problem We Are Solving)

Before GitOps, we used a **Push-based** model. 
A developer merged code, a CI server (like Jenkins or GitHub Actions) built a container image, and then that same CI server ran `kubectl apply` to push the changes into Kubernetes.

This caused major problems:
1. **Security:** The CI server needed admin credentials to production Kubernetes. If Jenkins was hacked, production was hacked.
2. **Drift:** If a senior engineer manually edited a deployment using `kubectl edit` to fix a fire, Jenkins had no idea. The cluster and Git were now out of sync.
3. **No Continuous Checking:** Jenkins only ran when code was pushed. It fired a deployment and went to sleep. If something broke in the cluster the next day, Jenkins didn't care.

GitOps introduces a **Pull-based** model. 
The CI server only builds the image and updates Git. Inside the Kubernetes cluster, a tool like Argo CD is running. It reaches *out* to Git, pulls the configuration, and applies it. It checks continuously, forever.

---


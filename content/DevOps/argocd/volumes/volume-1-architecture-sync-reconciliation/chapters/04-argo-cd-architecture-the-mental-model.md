## Argo CD Architecture: The Mental Model

Argo CD is not a single magic binary. It is a collection of microservices running inside your Kubernetes cluster. As a DevOps engineer, you must understand the three most important components:

**1. The Repository Server (The Reader)**
This component's only job is to talk to Git. It clones your Git repository, caches the files, and generates the final Kubernetes manifests. If GitHub goes down, or your repository credentials expire, the Repository Server is the component that will log the error.

**2. The Application Controller (The Inspector)**
This is the brain. It constantly compares two things:
* The **Desired State** (provided by the Repository Server).
* The **Actual State** (which it reads directly from the Kubernetes API).
When it detects a difference (drift), it marks the Application as `OutOfSync`. If auto-sync is enabled, it pushes the correct manifests to the Kubernetes API.

**3. The Redis Cache**
Argo CD uses Redis to cache Git repositories and Kubernetes resources. This is why Argo CD is so fast. It does not clone your entire Git repository every second. 

**The Flow:**
Git Repository -> Repository Server -> Application Controller -> Kubernetes API

---


## The Complete GitOps Mental Model

If you take only one thing away from this guide, it should be this complete mental model of how modern delivery works.

**1. The Trigger (CI Phase - Upstream)**
A developer pushes code. A CI tool (GitHub Actions) runs tests, builds a Docker image, pushes it to an Image Registry, and commits the new image tag to the GitOps repository. *Argo CD is not involved here.*

**2. The Source of Truth (The Blueprint)**
The GitOps repository now holds the exact, approved Desired State for the application, organized by environment directories (e.g., `overlays/staging` and `overlays/production`), utilizing Helm or Kustomize.

**3. The Read (Repository Server)**
Argo CD's Repository Server polls the Git repository, clones it, and executes the templating engine (`kustomize build` or `helm template`). It holds the generated raw YAML in memory.

**4. The Comparison (Application Controller)**
The Application Controller looks at the generated YAML (Desired State) and looks at the remote Kubernetes API (Actual State/The Building). It detects differences (Drift). 

**5. The Sync (Reconciliation)**
Because Auto-Sync is on, the controller issues API calls to the Kubernetes cluster to create, update, or prune resources until the cluster exactly matches Git. 

**6. The Verification (Health Assessment)**
Argo CD watches the resources in the cluster. It waits for Pods to become `Running` and Services to become active. It marks the Application as `Healthy`. 

**7. The Loop (Continuous Maintenance)**
Argo CD does not sleep. It continuously monitors the cluster. If a human manually alters a resource, Argo CD detects the drift, triggers Self-Heal, and instantly reverts the cluster back to the Git baseline.

---


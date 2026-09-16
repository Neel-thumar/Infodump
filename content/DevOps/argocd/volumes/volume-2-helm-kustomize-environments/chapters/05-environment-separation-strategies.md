## Environment Separation Strategies

How do we separate Staging and Production in GitOps? There are two common patterns:

1. **Branch-based (Legacy/Discouraged):** `main` branch is production, `staging` branch is staging. You promote by merging branches. *Problem: Branches drift permanently, and resolving merge conflicts on YAML is painful.*
2. **Directory-based (Modern/Recommended):** A single branch (`main`) contains different folders for different environments (e.g., `overlays/staging` and `overlays/production`). You promote by updating the image tag or values in the production folder and committing. 

We will use the **Directory-based** approach with **Kustomize**, as it is built directly into `kubectl` and Argo CD natively understands it.

---


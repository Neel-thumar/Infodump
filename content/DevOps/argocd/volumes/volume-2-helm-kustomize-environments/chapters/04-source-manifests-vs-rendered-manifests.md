## Source Manifests vs. Rendered Manifests

To use Argo CD effectively with templating tools, you must understand how the **Repository Server** works.

When Argo CD pulls your Git repository, it does not send your Helm charts or Kustomize files directly to Kubernetes. Kubernetes does not understand Helm or Kustomize. Kubernetes only understands raw YAML.

**The Rendering Pipeline:**
1. **Source Manifests:** The files in your Git repository (Helm `values.yaml`, charts, Kustomize `kustomization.yaml`, patches). 
2. **Rendering:** The Argo CD Repository Server executes `helm template` or `kustomize build` in memory.
3. **Rendered Manifests:** The final, raw Kubernetes YAML output.
4. **Reconciliation:** The Application Controller compares the Rendered Manifests against the Actual State in the cluster.

If your Helm chart has a syntax error, the pipeline breaks at step 2. The Application Controller will report a `Manifest rendering error` and the sync will fail.

---


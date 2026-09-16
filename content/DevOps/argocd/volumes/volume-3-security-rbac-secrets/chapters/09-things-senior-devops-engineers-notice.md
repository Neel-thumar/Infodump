## Things Senior DevOps Engineers Notice

1. **The Argo CD Service Account Blast Radius:** When installed, Argo CD's application-controller uses a Service Account with `cluster-admin` privileges. In highly secure environments, senior engineers strip these rights and give Argo CD explicit RBAC roles per namespace, enforcing true least privilege at the Kubernetes API level.
2. **RBAC Drift:** If you manage Argo CD's RBAC ConfigMap manually through `kubectl`, it will drift. Senior engineers use an Argo CD Application to manage Argo CD's own configuration (The App of Apps pattern).
3. **Secret Rotation:** When using External Secrets, if a database admin rotates the password in AWS Secrets Manager, the External Secrets Operator will detect it (based on `refreshInterval`) and update the Kubernetes Secret. However, the Pods using that secret will not automatically restart to pick up the new value unless you use a tool like Reloader.

---


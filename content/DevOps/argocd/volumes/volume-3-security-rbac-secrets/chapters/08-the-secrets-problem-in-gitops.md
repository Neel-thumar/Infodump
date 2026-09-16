## The Secrets Problem in GitOps

If Git is the single source of truth, where do we put our database password?
**NEVER put plaintext secrets in Git.**
**NEVER put base64-encoded Kubernetes Secret YAMLs in Git.** (Base64 can be decoded by anyone in 1 second).

In GitOps, we use the **External Secrets** pattern. You do not store the *value* of the secret in Git; you store the *pointer* to the secret in Git.

**How it works in practice:**

1. A platform engineer manually saves the database password in a secure vault (e.g., AWS Secrets Manager, Azure Key Vault, or HashiCorp Vault). Let's call it `db-password-prod`.
2. You install a tool like **External Secrets Operator (ESO)** into your Kubernetes cluster.
3. In your GitOps repository, instead of writing a Kubernetes `Secret` YAML, you write an `ExternalSecret` Custom Resource:

```yaml
# This goes into Git. It is safe because there are no real passwords here.
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: webapp-db-secret
spec:
  refreshInterval: "1h"
  secretStoreRef:
    name: aws-secrets-manager
    kind: ClusterSecretStore
  target:
    name: real-k8s-secret-for-webapp
  data:
  - secretKey: password
    remoteRef:
      key: db-password-prod

```

4. Argo CD reads Git and syncs this `ExternalSecret` to the cluster.
5. The ESO controller inside the cluster sees the `ExternalSecret`, talks to AWS (using an IAM role), fetches the real password, and generates the standard Kubernetes `Secret` containing the base64 value.
6. Your Pod mounts the standard Kubernetes `Secret`.

This is beautiful engineering: The GitOps workflow is preserved, Argo CD still manages the deployment declaratively, but the sensitive material is perfectly safe.

*(Alternative: Tools like **Sealed Secrets** or **SOPS** encrypt the secret value into ciphertext using a public key. The ciphertext is committed to Git. A controller inside the cluster decrypts it using a private key. This is also valid, but ESO is generally preferred in enterprise cloud environments).*

#### Cleanup

Leave the AppProject and Applications running. We will use them in Volume 4 when we introduce a second Kubernetes cluster.

---


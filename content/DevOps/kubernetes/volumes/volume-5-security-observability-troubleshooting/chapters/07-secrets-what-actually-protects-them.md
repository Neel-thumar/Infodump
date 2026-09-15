## Secrets — What Actually Protects Them

Volume 2 already said this once, but it belongs here properly, because it is a security topic, not a configuration topic.

**Base64 is encoding, not encryption.** Anyone with read access to a Secret object can decode it in one command. The things that actually provide protection:

| Layer | What it does |
|---|---|
| RBAC | Controls who can `get` Secret objects at all — your primary defence |
| Encryption at rest | Encrypts Secret data inside etcd itself; must be explicitly configured on self-managed clusters, and is on by default for most managed offerings |
| Not committing to Git | Entirely your own discipline; a Secret manifest with real values in a repo is a Secret already leaked |
| External secret managers | Vault, AWS Secrets Manager, etc., synced into the cluster by a controller — ecosystem tooling, not core Kubernetes |

```bash
kubectl get secret db-creds -o jsonpath='{.data.password}' | base64 -d
```

Run that once against a Secret you have access to. Seeing how trivial it is tends to permanently change how casually people treat RBAC around Secrets.


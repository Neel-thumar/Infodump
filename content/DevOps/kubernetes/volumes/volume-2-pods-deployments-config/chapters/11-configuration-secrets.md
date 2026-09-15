## Configuration: Secrets

A **Secret** is the same idea for sensitive data — passwords, tokens, TLS certificates. The locked document cabinet.

```bash
kubectl create secret generic db-creds \
  --from-literal=username=appuser \
  --from-literal=password='S3cur3!'
```

Use it the same way:

```yaml
env:
  - name: DB_PASSWORD
    valueFrom:
      secretKeyRef:
        name: db-creds
        key: password
```

### The truth about Secrets

This is important and frequently misunderstood.

**Secrets are only base64-encoded, not encrypted.** Base64 is not security — anyone can decode it:

```bash
kubectl get secret db-creds -o jsonpath='{.data.password}' | base64 -d
```

What actually protects a Secret:

| Protection | Status |
|---|---|
| Base64 encoding | Not protection at all |
| RBAC — who can read Secrets | **Your main defence**, covered in Volume 5 |
| Encryption at rest in etcd | Must be configured; not on by default in self-managed clusters |
| Not committing them to Git | Your responsibility |

Practical rules:

* Prefer mounting Secrets as files over environment variables — environment variables leak into logs, crash dumps and `docker inspect`-style output
* Never put a Secret manifest in Git with real values
* In production, teams commonly use an external secret manager (Vault, AWS Secrets Manager, Azure Key Vault) with a controller that syncs into Kubernetes Secrets — that is **ecosystem tooling**, not core Kubernetes


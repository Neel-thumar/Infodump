## TLS Termination — HTTPS at the Front Door

### What Is TLS Termination?

TLS (Transport Layer Security, the successor to SSL) encrypts the connection between the client and the server. **TLS termination** means nginx handles the encryption — it decrypts incoming HTTPS requests and sends plain HTTP to the backend.

```text
Client ──HTTPS (encrypted)──> nginx ──HTTP (plain)──> Backend
```

Back to the analogy: the receptionist at the front desk checks the visitor's ID and handles the security protocol. Once inside the building, the visitor moves around without showing ID at every door. The back-office staff trust that the front desk already verified the visitor.

### Why Terminate TLS at nginx?

| Reason | Explanation |
|---|---|
| Centralised certificate management | One place to install and renew certificates, not every backend |
| Backend simplicity | Backends don't need TLS libraries, certificate files, or renewal logic |
| Performance | nginx handles TLS handshakes efficiently; backends focus on application logic |
| Consistent HTTPS for all backends | Even backends written in different languages/frameworks get HTTPS for free |

### The Tradeoff: Plaintext Internal Traffic

Between nginx and the backend, traffic is unencrypted. On a trusted internal network (same machine, same private network, same Kubernetes cluster), this is generally acceptable and standard practice. If the internal network is untrusted (traffic crosses public networks, shared infrastructure), you should encrypt the internal leg too — either with TLS to the backend or with a network-level solution like a VPN or service mesh mTLS.

For our lab and most single-machine or same-network deployments, plaintext between nginx and the backend is fine.

---


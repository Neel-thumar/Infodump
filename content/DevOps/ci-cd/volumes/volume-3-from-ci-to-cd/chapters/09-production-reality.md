## Production reality

- **Image size affects deployment speed.** A 1.2 GB image pulled onto twenty nodes is slow, and slow deploys make rollback slow — which matters most exactly when you're in trouble.
- **Base images need patching.** `node:22-alpine` gains CVEs over time. Rebuilding on a schedule is how you get security fixes into an artifact whose source code hasn't changed.
- **Registry storage is a real cost**, and cleanup policies are not optional at scale.
- **DinD's privileged requirement is why many organisations standardise on rootless builders.** On shared Kubernetes runners it's often simply unavailable.
- **Pinning base images matters.** `node:22-alpine` moves. For reproducibility, pin a specific version, and for strictness pin a digest.
- **The deploy script is production code.** It usually starts as `deploy.sh` written in an afternoon, and it ends up being the most safety-critical script in the repository.

---


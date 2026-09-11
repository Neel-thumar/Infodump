## Where We Go Next

**Volume 7 — Compute Without Instances: Lambda, ECR, ECS, EKS.**

You've now provisioned instances and databases. Next: the models that try to make provisioning disappear.

Lambda first — the event-driven execution model, Firecracker microVMs and why they were a genuine breakthrough for AWS's own economics, what actually causes cold starts and why some are a hundred times worse than others, concurrency limits and how they become an outage, and the VPC-attached ENI problem that made Lambda-in-a-VPC nearly unusable until AWS re-engineered it in 2019.

Then containers: image layers and registries, task definitions, Fargate versus EC2 capacity, and an honest accounting of which parts of "AWS containers" are AWS's own work (ECS, its scheduler) and which are CNCF projects AWS operates on your behalf (Kubernetes, via EKS). Marketing blurs this constantly; your architecture decisions shouldn't. Plus IRSA and Pod Identity, which take Volume 2's role machinery down to the pod level.

Two incidents: the **recursive Lambda trigger** — a function writing to the event source that invokes it, producing a five-figure bill overnight — and **Log4Shell** as a test of whether anyone actually knew what was inside their images.

---

*Volume 6 complete. Say **continue** when you're ready for Volume 7.*

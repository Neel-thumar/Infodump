## The Open Container Initiative

### The problem standardization solved

Picture 2014. Docker has exploded. Everyone is packaging software as Docker images. And a strategic problem is becoming obvious to everyone who isn't Docker Inc.:

**The image format is whatever Docker says it is. The runtime behaviour is whatever Docker implements. There is no specification — only a codebase owned by one venture-backed startup.**

That's a lot of industry-critical infrastructure resting on one company's roadmap and continued existence. CoreOS made the objection concrete in December 2014 by announcing a competing runtime (rkt) and a competing image format (appc), arguing that the container ecosystem needed a standard rather than a vendor.

A format war would have been bad for everyone, including Docker. What happened instead is more interesting.

### What the OCI is

In **June 2015**, at DockerCon, the **Open Container Initiative** was announced under the Linux Foundation, with broad industry backing — Docker, CoreOS, Google, AWS, Microsoft, Red Hat, IBM and others. Docker donated its container execution code (**libcontainer**, the thing that had replaced LXC in Docker 0.9) as the seed for **runc**, the OCI reference runtime implementation.

The OCI maintains three specifications:

| Specification | Defines | Answers |
| --- | --- | --- |
| **Runtime Spec** | The on-disk bundle (a root filesystem + `config.json`) and the lifecycle operations a runtime must support | "Given a filesystem and config, how do I run it?" |
| **Image Spec** | Manifest, config, and layer formats — the things you untarred in Volume 2 | "What is an image, exactly?" |
| **Distribution Spec** | The registry HTTP API — push, pull, discovery | "How do images move between machines?" |

> **Confidence: high** on the OCI's June 2015 founding at DockerCon under the Linux Foundation, and on runc originating from Docker's libcontainer. **Medium** on the exact release dates of each spec version — the Runtime and Image specs reached 1.0 in 2017 and Distribution somewhat later; check the OCI's own repositories for precise dates.

### Why it mattered more than it sounds

Standardizing had one consequence above all others: **it decoupled "Docker the company" from "containers the standard."**

Concretely, this is why you can build an image with Docker, push it to a registry written by Amazon, pull it on a machine running containerd, and execute it with crun — with nobody having coordinated. It's why Podman can run your Dockerfiles. It's why Kubernetes could later drop its Docker-specific code without breaking a single image.

And it's the reason this guide's material is durable. Everything you learned about layers, manifests, and digests is an open specification, not a vendor's implementation detail.

**Note the terminology precision this earns you.** "Docker image" is colloquial; the accurate term is **OCI image**. Docker builds them; it doesn't own them.

---


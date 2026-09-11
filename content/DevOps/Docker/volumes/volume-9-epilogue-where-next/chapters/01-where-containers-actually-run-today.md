## Where containers actually run today

A grounding note before the numbers: **all of this is the most perishable material in the guide.** Volumes 1 through 5 described kernel mechanisms that have been stable for a decade and will still be accurate in 2035. This section will be stale within eighteen months. Treat the figures as a snapshot with a date on it, and re-verify against primary sources before quoting them anywhere that matters.

### The current picture

From the CNCF's Annual Cloud Native Survey for 2025, published January 2026:

- **82% of container users run Kubernetes in production**, up from 66% in the 2023 edition.
- **56% of organizations run most or all of their production applications in containers** — up from 41% in 2023 — while container *pilots* shrank from 11% to 6%.
- **66% of organizations are running generative AI workloads on Kubernetes**, which is why CNCF's own framing calls Kubernetes the operating system for AI.
- Among the most mature adopters, **79% run stateful workloads in containers in production** — the "containers are only for stateless apps" era is over.
- The average organization surveyed runs in the low thousands of containers.

> **Confidence: high** on the figures as reported; **medium** on how far they generalize. This is a self-selected survey of organizations already in the CNCF orbit. It describes committed cloud-native shops, not the median business. Enormous amounts of software still run on VMs and hand-configured servers, and much of it should.

### The four places containers live

**1. Cloud infrastructure.** Every major provider sells managed Kubernetes (EKS, GKE, AKS) and container-native compute where you hand over an image and receive a running service (Cloud Run, Fargate, Container Apps). Note what that second category means: **the OCI image has become a unit of deployment in its own right** — you can now target platforms where you never touch a container runtime at all, and your Volume 2 knowledge is still exactly what's required.

**2. CI/CD.** Almost certainly the highest-volume container use by count. Every GitHub Actions job, GitLab CI job, and Jenkins agent that specifies a `container:` is a fresh container, run for minutes, discarded. Nobody counts these. The reason it works is Volume 1's: milliseconds to start, megabytes to store.

**3. Local development.** Docker Desktop, Compose, devcontainers, Testcontainers — the "it works on my machine" problem from Volume 0, solved by making the machine part of the artifact.

**4. Edge and embedded.** The interesting frontier, and the one where the assumptions break. A container runtime on a device with 512 MB of RAM is a different proposition, which is why the layer-shedding from Volume 8 matters there: k3s instead of full Kubernetes, containerd instead of Docker, and interest in lighter runtimes generally.

### What's changing at the edges

**WebAssembly** is the most-discussed potential successor, and deserves an honest scoping rather than either dismissal or hype. The pitch is real: Wasm modules start in microseconds rather than milliseconds, run in a sandbox that doesn't depend on the shared-kernel trust model from Volume 7, and are genuinely portable across architectures. Server-side Wasm with WASI is being adopted in serverless and edge contexts, sometimes invisibly to the people using it.

The honest status: **it is not a container replacement today.** CNCF's own 2025 data showed roughly 65% of respondents reporting no WebAssembly experience at all and only about 5% reporting full deployment. The ecosystem — language support, libraries, debugging, the component model — is years behind. It is a complement in specific niches, and a thing worth watching rather than a thing to bet a migration on. **Confidence: medium-high** on the adoption figures, **low** on any prediction about where this lands.

**Sandboxed runtimes** — gVisor, Kata — are the pragmatic answer to Volume 7's honest limitation, and are already how several clouds run untrusted tenant workloads.

**eBPF** is the quieter and arguably bigger story: programmable kernel-level observability and networking, which underpins Cilium and much of modern container networking and security tooling. If you enjoyed Volume 5, this is where that thread continues.

---


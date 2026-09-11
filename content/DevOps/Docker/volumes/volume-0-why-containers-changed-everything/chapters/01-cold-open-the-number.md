## Cold open: the number

In January 2026 the Cloud Native Computing Foundation published its annual survey. Among organizations that use containers at all, **82% now run Kubernetes in production** — up from 66% in the 2023 edition. The share of organizations running **most or all** of their production applications in containers rose from 41% in 2023 to **56% in 2025**. Container *pilots* — the "we're still evaluating this" category — shrank from 11% to 6%.

That last number is the interesting one. Pilots shrinking is not a sign of a technology stalling. It is a sign of a technology finishing. There is almost nobody left to convince.

> **Confidence: high** for the figures themselves (CNCF Annual Cloud Native Survey 2025, published January 2026). **Caveat you should internalize:** this is a self-selected survey of people already in the CNCF orbit. It tells you what committed cloud-native organizations do, not what the median business in the world does. There is still an enormous amount of software running on bare VMs and hand-configured servers, and there always will be. Treat "82%" as "82% of a population that already opted in," not "82% of computing."

Here is the fact that should actually surprise you, though, and it isn't a percentage.

The core mechanism that makes all of this work — the thing that isolates one container from another — is not a Docker invention, not a cloud invention, and not new. It is a set of Linux kernel features, most of which existed and shipped in mainline kernels *before* Docker was written. Docker's founders did not build the engine. They built the ignition key, the dashboard, and the fuel standard, and it turned out that was the entire problem.

Understanding exactly which parts are kernel, which are Docker, and which are an open standard is what separates people who *use* Docker from people who *know* Docker. That distinction is the spine of this whole guide.

---


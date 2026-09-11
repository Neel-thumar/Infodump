## Send-off

Here's the frame to carry into Volume 1.

You now know that the isolation primitives were sitting in mainline Linux for five years before Docker existed, unused by almost everyone, because they were too hard to hold correctly. You know that Docker's contribution was the layered image, the Dockerfile, the registry, and a one-line UX — that is, packaging and distribution, not kernel engineering. And in exercise 0.5 you built the 1979 version with your own hands and watched exactly where it leaks.

So the obvious next question, and the one Volume 1 answers in full:

**If a container is just a process, what specifically makes it feel like a machine — and where exactly does that illusion break?**

We'll take the namespaces one at a time and derive what each is for by first breaking the system without it. Then cgroups, from the noisy-neighbor problem that forced Google to write them. Then OverlayFS and what copy-on-write really means at the block level. Then the honest VM comparison, including the cases where you should still choose a VM. And we'll close on a well-documented real container escape — a CVE with a CVSS score and a patch — that exploited a specific gap in exactly the model we'll have just built.

Volume 1: **What a Container Actually Is (Not a VM).**

## What Docker actually invented

This is the part most tutorials blur, so let's be exact. Sort every claim about Docker into one of three columns.

| Docker did **not** invent | Docker **did** invent or popularize | Docker **standardized** (later, with others) |
| --- | --- | --- |
| Namespaces (Linux kernel) | The **image format as a stack of layers** — content-addressed, cacheable, diffable | The OCI **Image Specification** |
| cgroups (Google → Linux kernel) | The **Dockerfile** — a build as a readable, version-controlled, reproducible script | The OCI **Runtime Specification** |
| Union/copy-on-write filesystems (AUFS, later OverlayFS) | **Docker Hub / registries** — `docker push` and `docker pull`, a distribution network for environments | The OCI **Distribution Specification** |
| Process isolation as a concept (chroot, jails, Zones) | A **single-command UX**: `docker run nginx` and it just works | — |
| Running containers at scale (Google's Borg, years earlier) | The **ecosystem gravity** that made one format universal | — |

Two of those deserve emphasis.

**The layered image was the real technical contribution.** Not because layering is novel — union filesystems predate Docker by years — but because Docker made a layer a *first-class, addressable, shareable unit*. Your image is built on `python:3.11`, which is built on `debian:bookworm`. If a hundred images on your machine share that Debian base, it exists on disk once. When you push an updated image, you push only the layers that changed — often a few hundred kilobytes instead of a few hundred megabytes. That single design decision is why containers pull in seconds and start in milliseconds, and it's the subject of Volume 2.

**The registry was the real product contribution.** Golden VM images solved the correctness problem but had no distribution story — you SCPed multi-gigabyte files around, or you didn't share them at all. `docker push` / `docker pull`, with layer deduplication underneath, turned "the environment" into something you could share as easily as a git commit. LXC never had that. That absence is most of why LXC had five years of head start and lost.

Docker's genius was not engineering depth at the kernel level. It was correctly identifying that the hard problem had stopped being *isolation* and become *distribution and ergonomics* — and then solving that so well that a five-minute demo was enough.

---


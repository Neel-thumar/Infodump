## Where this leaves you, and what's next

You can state honestly what a container protects against and what it doesn't, without overselling either way. You demonstrated in one command that Docker API access is root access. You introduced each hardening control by the attack it stops, watched capabilities and `noexec` and `no_new_privs` block specific actions, recovered three kinds of secret from an image you built, and hardened a real application with a table of justifications rather than a list of settings copied from a blog post.

And you understand why the most successful container attacks in the wild exploited no vulnerability at all.

One thread has been quietly running under all seven volumes. You keep encountering names that aren't Docker. `runc` in Volume 1's CVE. `containerd.io` installed alongside the daemon in Volume 0. The **OCI** image format in Volume 2. Rootless alternatives, mentioned three times now and deferred each time.

**Volume 8: The Ecosystem and What Comes After Docker.**

What the Open Container Initiative is and what standardizing image, runtime, and distribution formats actually solved — the decoupling of "Docker the company" from "containers the standard." What Docker really delegates to containerd and runc, why that layered architecture exists, and the history of those donations to the CNCF. Podman and daemonless, rootless alternatives: the specific architectural problem they address, argued honestly rather than as advocacy. Kubernetes, scoped precisely — what orchestration solves that Compose cannot, framed as the next thing to learn rather than taught here. And we close on a genuinely underappreciated story: how Docker Inc. invented the defining infrastructure technology of its decade and still had to sell its enterprise business to Mirantis in 2019 — a case study in the gap between inventing a technology and capturing value from it, and one that is very often misremembered, so I'll be careful with the details.

Say "continue" when you're ready.

## The pain that existed before

Let me tell you the failure in its generic form, because you have almost certainly lived some version of it.

A developer builds a service on her laptop. Ubuntu 20.04, Python 3.8, a handful of pip packages, ImageMagick installed via apt because one code path resizes an uploaded avatar. It works. Tests pass. She pushes.

Staging runs CentOS. Python 3.6. ImageMagick is there but it's an older build compiled without a delegate for the image format the app happens to receive most often. The service starts fine, passes the health check, serves traffic — and silently fails on roughly one request in forty, the ones with that image format. Nobody notices for six days because the error is caught, logged at INFO, and returns a default avatar.

Production runs a third thing entirely, because production was built in 2017 and staging was rebuilt in 2021 and nobody reconciled them. Production has a different glibc. The app crashes on startup. At 2 a.m.

The developer, summoned, runs it locally. It works. She says the five words: **"It works on my machine."** And she is *telling the truth*. That is the maddening part. She is not being careless. The application is correct. The machine is the bug.

Now notice what the real problem is. It is not that the environments differ — of course they differ, they were built by different people at different times. The real problem is that **the environment was never part of the artifact.** The team shipped a `.py` file, or a `.jar`, or a binary, and then *separately and by hand* tried to reconstruct the world that binary needed on three different machines. The dependency graph of a running application does not stop at your package manifest. It includes the shared libraries, the system binaries, the locale data, the CA certificate bundle, the kernel's idea of what `/etc/resolv.conf` means, the timezone database, and about four hundred other things nobody writes down.

Every pre-container solution was an attempt to reconstruct that world reliably:

| Approach | What it actually did | Why it wasn't enough |
| --- | --- | --- |
| Documentation ("setup.md") | Humans re-execute steps | Drifts within days; humans skip steps |
| Configuration management (Puppet, Chef, Ansible) | Converge a machine toward a described state | Convergence is stateful; a machine with history ≠ a fresh machine. Same playbook, different outcomes |
| Golden VM images | Ship the whole machine as the artifact | Correct, but gigabytes; boots in minutes; one per app is wasteful |
| "Just use the same OS everywhere" | Standardize by decree | Survives contact with reality for about one procurement cycle |

The golden-image people had the right *idea*: make the environment part of the artifact. Their problem was purely one of cost. A VM image carries an entire operating system, a bootloader, and a kernel, and needs a hypervisor to emulate hardware for it. Shipping a 4 GB image and waiting 90 seconds for it to boot is an absurd price to pay for the privilege of knowing which glibc you have.

**The question containers answer:** can we get the guarantee of the golden image — the environment travels with the application — at roughly the cost of starting a process?

The answer is yes, and it took about thirty-four years to assemble.

---


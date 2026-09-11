## The question this volume answers

In Volume 0 you ran `sleep 300` inside a container and then found it in your host's process table, as an ordinary process with an ordinary PID. Nothing was emulated. Nothing booted.

So here is the question. If it's just a process, why does it *feel* like a machine? Log into a container and you get a hostname, a root filesystem, a process table starting at PID 1, an `eth0` with its own IP, and a `root` account. That is a convincing machine. And yet there is no machine.

The answer is that the Linux kernel will lie to a process on request. Not vaguely — specifically, per resource, per lie, each one a separate kernel feature with its own name and its own history. A container is a process for which the kernel has been asked to tell **seven or eight specific lies at once**, plus a hard budget on what it's allowed to consume, plus a clever filesystem trick so the whole thing costs nearly nothing to set up.

That's the volume. Lies (namespaces), budget (cgroups), filesystem trick (OverlayFS). Then an honest comparison with virtual machines, and a real CVE where the lies were told correctly and the escape happened anyway.

---


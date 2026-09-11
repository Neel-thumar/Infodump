## First, kill the VM metaphor

You have seen the diagram. Two stacks side by side: VMs have a fat "Guest OS" box per app, containers have a thin "Docker" box. The implied message is that a container is a VM that went on a diet.

This is not a simplification. It is the wrong category.

| | Virtual machine | Container |
| --- | --- | --- |
| What's virtualized | **Hardware** — CPU, memory, disks, NICs | **Kernel interfaces** — what a process can see and use |
| Kernel | Its own, booted from its own disk image | The host's. There is no second kernel |
| What starts it | A hypervisor emulating a machine and firmware | `clone()` / `execve()` — a process is forked |
| Boot | Real boot: firmware, bootloader, init, services | None. There is nothing to boot |
| Visible on host | One big process (e.g. `qemu`), the guest's processes hidden inside it | **Every container process, individually, in `ps`** |
| Isolation enforced by | Hardware virtualization (Intel VT-x / AMD-V) + hypervisor | Kernel code paths that filter what a process sees |
| Cost to start | Seconds to minutes | Milliseconds |
| Cost to store | Gigabytes (full OS + kernel) | Megabytes (just the userspace files you need, shared) |

Say this out loud once, because it's the sentence the rest of the volume unpacks:

> **A container is a normal Linux process that has been given a restricted and rearranged view of the system, and a budget.**

That's it. There is no container object in the kernel. Search the Linux source for a `struct container` and you won't find one. "Container" is a *userspace word* for a particular combination of kernel features. This is not pedantry — it's the thing that explains every container behaviour that surprises people, including the security ones.

---


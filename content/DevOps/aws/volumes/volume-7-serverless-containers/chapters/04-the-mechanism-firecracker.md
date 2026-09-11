## THE MECHANISM: Firecracker

At re:Invent in November 2018, AWS announced **Firecracker** and open-sourced it under Apache 2.0.

The insight: a VM is slow because it pretends to be a *computer*. But a function doesn't need a BIOS, a PCI bus, a floppy controller, a VGA adapter, or USB. It needs a CPU, some memory, a network interface, and a block device.

So Firecracker is a **virtual machine monitor with almost no device model**. Built on KVM, written in Rust, deliberately minimal:

- Boots a microVM in around **125 milliseconds**
- Roughly **5 MB of memory overhead** per microVM
- Thousands of microVMs per host
- A tiny attack surface — dramatically less code than a general-purpose hypervisor

**You get VM-grade isolation at container-grade speed and density.** The trade-off that had defined the industry stopped being a trade-off.

The design principle is worth stealing: *the general-purpose thing is slow because it's general-purpose. If you know your workload, remove everything it doesn't need.* This is the same move as Nitro in Volume 4 (strip the hypervisor to nothing by moving I/O to cards) and Aurora in Volume 6 (stop shipping pages, ship only the log).

Firecracker now underpins Lambda **and** Fargate. It's also used outside AWS — which is what open-sourcing it was for.

---


## THE MECHANISM: Nitro, and Why AWS Bought a Chip Company

In 2015, AWS acquired **Annapurna Labs**, an Israeli semiconductor company. At the time it looked like a curiosity. It turned out to be one of the most consequential infrastructure decisions of the last decade.

In November 2017, alongside the C5 instance family, AWS announced the **Nitro System**. The idea is simple to state and hard to build: **take everything the hypervisor was doing and move it off the main CPU onto dedicated hardware.**

### The three pieces

**Nitro cards.** Purpose-built PCIe devices that handle VPC networking, EBS storage, local NVMe storage, and instance monitoring. When your instance sends a packet, the VPC encapsulation from Volume 3 — the software-defined networking that makes your private network exist — happens *on a card*, not on a CPU you're paying for.

**The Nitro security chip.** Sits between the main board and every I/O path, and controls access to firmware and non-volatile storage. Firmware can only be updated through this chip. This closes off a nasty class of persistent attack: malware that survives instance termination by writing itself into a device's firmware.

**The Nitro hypervisor.** A minimal KVM-based hypervisor whose job has shrunk to almost nothing — memory and CPU allocation. It doesn't handle I/O, because the cards do. It's small enough that AWS describes it as providing performance essentially indistinguishable from bare metal.

### What this bought

- **Nearly all host resources go to the guest.** The offload work happens on hardware AWS doesn't have to sell.
- **Bare-metal instances became possible.** If virtualization is all in the cards, you can just... not run a hypervisor, and hand a customer the whole machine — which still gets VPC networking and EBS, because those are card functions.
- **Consistent performance.** Less software in the I/O path means less variance.
- **A far smaller trusted computing base.** Less privileged code, less attack surface.
- **Updates without customer downtime** in many cases, because the thing being updated isn't the thing running your workload.

### And then they built the CPUs too

Annapurna's other output was **Graviton** — AWS's own ARM-based server processors. Graviton (2018) was a limited first attempt; **Graviton2** (2019) was the one that mattered, delivering competitive performance at meaningfully better price-performance; Graviton3 and Graviton4 followed.

The strategic logic is worth noticing. AWS's largest input cost is hardware it buys from other companies. Designing its own processors — tuned for exactly the workloads it runs, with no features it doesn't need — attacks that cost directly.

For you, practically: **`m7g` is Graviton, `m7i` is Intel, `m7a` is AMD.** Graviton is typically cheaper for equivalent work. The catch is architecture: your binaries and container images must be built for ARM. For interpreted languages and anything you compile yourself, it's often a one-line change. For vendor binaries, it may be impossible.

*Accuracy note: the 2015 Annapurna acquisition and the 2017 Nitro/C5 announcement are firm. Graviton generation dates I'd treat as approximately right — verify against AWS's own pages if precision matters.*

---


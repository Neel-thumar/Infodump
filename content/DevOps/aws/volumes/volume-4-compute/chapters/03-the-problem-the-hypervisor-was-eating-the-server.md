## THE PROBLEM: The Hypervisor Was Eating the Server

Start with what virtualization actually costs.

To run multiple isolated guests on one physical host, something must sit between them and the hardware. When a guest wants to send a network packet, it can't just talk to the network card — the card is shared. When it writes to disk, the write has to be intercepted, translated, and routed to real storage.

Classically, that "something" is a hypervisor running on the host's own CPUs, consuming the host's own memory and the host's own I/O bandwidth. EC2 used **Xen** for its first decade.

The consequences were real and measurable:

- **You couldn't sell the whole machine.** A meaningful slice of CPU and RAM was reserved for the hypervisor and the management domain. A customer could never get 100% of a host.
- **I/O went through software.** Every packet and every block write took a detour through the hypervisor, adding latency and consuming CPU that customers were paying for.
- **Performance was noisy.** "Noisy neighbours" — a busy co-tenant driving hypervisor work — showed up as variance in *your* latency.
- **The trusted computing base was enormous.** A full hypervisor plus a management operating system is a lot of code with total authority over every guest. Every line of it is attack surface.
- **Updates meant reboots.** Patching the hypervisor meant scheduled customer downtime, at fleet scale.

For a business selling compute by the hour, every one of these is money or risk.

---


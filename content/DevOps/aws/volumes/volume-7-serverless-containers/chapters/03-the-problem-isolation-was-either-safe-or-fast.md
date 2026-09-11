## THE PROBLEM: Isolation Was Either Safe or Fast

Think about what AWS needs for a function service.

Thousands of customers, arbitrary code, running on shared hardware. Function A must not read function B's memory, see its network traffic, or escape to the host. And a function that hasn't run in an hour must start in *milliseconds*, because a user is waiting on an HTTP request.

### Containers: fast, insufficiently isolated

A container is a process with namespaces and cgroups applied. It starts in milliseconds because it's just a process.

But **it shares the host kernel.** The isolation boundary is the kernel's own security model — namespaces, seccomp, capabilities. That's a very large, very complex boundary, and kernel vulnerabilities that allow container escape appear regularly.

For your own workloads on your own hosts, that's usually acceptable. For **arbitrary code from anonymous customers with a credit card**, sharing a kernel is not a risk AWS can take.

### Virtual machines: isolated, too slow

A VM has its own kernel. The boundary is the hypervisor — a far smaller, more defensible surface.

But a conventional VM emulates a whole computer: BIOS, PCI bus, legacy devices, a full device model. Boot takes seconds, sometimes tens of seconds, and each VM carries hundreds of megabytes of overhead. You cannot run thousands per host, and you certainly can't start one inside a user's HTTP request.

### What Lambda did first

Early Lambda ran on EC2 instances, with containers providing per-function separation and **whole instances dedicated per customer** to get the security boundary.

That works and it's wasteful. A customer with one small function occupies capacity sized for a whole instance. Density is poor, and poor density in a service priced per millisecond is an economics problem.

---


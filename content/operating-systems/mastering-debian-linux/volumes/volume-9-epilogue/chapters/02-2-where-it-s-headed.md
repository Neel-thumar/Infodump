# 2. Where It's Headed

Four active directions. For each: what the actual engineering trade-off is, not just that it's new.

## Immutable and atomic distributions

**The idea.** The root filesystem is **read-only**, and the system is updated by swapping in a whole
new image atomically rather than by unpacking packages into `/usr`. Fedora Silverblue and CoreOS do
this with `rpm-ostree`; openSUSE MicroOS uses `transactional-update` over Btrfs snapshots; NixOS gets
somewhere similar by a completely different route.

**What you gain, and it's substantial:**

- **No half-applied upgrades.** The update either fully applies at the next boot or doesn't. Volume 4
  §21.3's `iU` half-installed state stops being possible.
- **Rollback is trivial** — reboot into the previous image.
- **No configuration drift.** Two machines that report the same image version *are* the same, which
  is not true of two Debian boxes with the same package list.

**What you give up — and this is the part that connects to what you just learned:**

> **You lose the model from Volume 4.** `apt install` into `/usr` is exactly the thing these systems
> forbid. Software instead goes into containers (Toolbx, Distrobox), Flatpaks, or "layered" packages
> that trigger a rebuild-and-reboot. Volume 4 §21.7's conffile negotiation — dpkg asking whether to
> keep your edit — is replaced by a much starker model where `/etc` is one of the few writable places
> and everything else is simply not yours.
>
> Volume 3 §16.6's `/usr/local` distinction stops being a convention and becomes the architecture.

**The honest trade:** this is excellent for fleets, kiosks, and servers where uniformity is the point.
It is more friction for a workstation where you install odd things. Debian itself is not immutable,
though derivatives and experiments exist.

> **Confidence: moderate** on the current state of Debian-specific immutable work, which has been
> moving.

## Containers and Kubernetes: Linux primitives, productized

You built a container by hand in Volume 8 §46.7 — five namespaces, a cgroup, `pivot_root`. Kubernetes
is what happens when someone wraps that in a scheduler.

**What Kubernetes actually adds:** a declarative desired-state model (you describe what should be
running; a control loop makes reality match), scheduling across machines, self-healing, rolling
deployments, service discovery, and a networking model.

**What it costs:** enormous operational complexity, and an abstraction that **leaks precisely when
you need it most.**

> **This is the career-relevant point in the whole section.** When a pod won't start, or two services
> can't reach each other, or a container is being OOM-killed, Kubernetes' own abstractions stop
> helping and you are debugging **namespaces (Volume 8 §46), cgroup memory limits (Volume 6 §36.5),
> iptables/nftables rules (Volume 8 §48), DNS resolution (Volume 5 §27), and a container's mount
> namespace (Volume 3 §17.4).**
>
> The difference between someone who can debug a Kubernetes cluster and someone who can only
> configure one is *exactly* the eight volumes you just read. That is not a motivational statement;
> it's the observable difference in how the two people behave at 3am.

**Where it's going:** the ecosystem has been consolidating rather than expanding — eBPF-based
networking and observability (Cilium, and eBPF generally) replacing iptables-based approaches,
WebAssembly as a lighter isolation unit for some workloads, and a general push toward managed control
planes so fewer people run the hard part themselves.

## Rust in the kernel

**The state of it.** Rust support merged in Linux 6.1, in December 2022. Real drivers followed: a
rewrite of Android's Binder, Apple GPU support in the Asahi Linux project, experimental NVMe and
Nvidia GPU work.

> **Confidence: high** on 6.1 and the December 2022 date; **moderate** on which drivers have landed
> in mainline by now, which has been moving fast.

**The argument for, and you have already read the evidence.** Two of this book's incidents —
**Baron Samedit** in `sudo` (Volume 2 §13) and **regreSSHion** in `sshd` (Volume 5 §31.3) — are
memory-corruption bugs in C, in two of the most heavily audited security-critical programs that
exist, found after a decade and four years respectively. Studies from Microsoft and the Chrome team
have put memory safety at roughly 70% of their serious security bugs.

> **Confidence: moderate-high** on the ~70% figure for those specific codebases; **moderate** on the
> equivalent number for the kernel, which is cited often and measured less rigorously.

The argument is not that C programmers are careless. **It's that the very best of them, under maximum
scrutiny, still produce this class of bug** — so the leverage is in the language, not the discipline.

**The argument against — and it's a maintenance argument, not a language argument:**

- **The kernel has no stable internal ABI** (Volume 8 §45.3's `vermagic` is the visible consequence).
  Refactoring a C interface is normal and routine. Now it also means fixing Rust bindings.
- **Who maintains those bindings?** If a subsystem maintainer doesn't write Rust, a Rust wrapper over
  their subsystem is a permanent obligation they didn't ask for and can't review.
- **Toolchain and architecture coverage.** Rust doesn't target every architecture the kernel does,
  and the build requirements grew.
- **Two languages means two communities** in every review thread.

There has also been genuine, public, occasionally bitter friction — including at least one prominent
contributor stepping back from the effort citing non-technical resistance.

> **Confidence: moderate** on the specifics of those disputes; they are recent, contested, and
> narrated differently depending on who's telling it. I'd read primary sources — LKML threads and the
> people's own statements — rather than commentary.

> **Notice the shape of this argument, because you've seen it before.** It is not really "is Rust
> good." It's **scope, coupling, and who carries the maintenance burden** — which is precisely the
> structure of Volume 6 §37's systemd dispute. The strongest objections in both cases are about
> governance and obligation, not about whether the technology works. That pattern recurs in this
> field constantly, and recognising it is more useful than having an opinion about Rust.

## Wayland and X11

**The history.** The X Window System dates to **1984** at MIT. `X.Org` is the current implementation
of a design that is forty years old. Wayland began around 2008.

**The actual engineering problem with X**, which is more specific than "it's old":

X was designed when the **server** did the drawing and the clients were network peers sending drawing
commands. Modern applications don't work that way — they render themselves on the GPU and hand over a
finished buffer. So the X server became largely a passthrough carrying an enormous amount of legacy
mechanism for a job it no longer does.

**And there's a concrete security consequence:**

> **X11 has essentially no isolation between clients. Any X client can read any other client's
> keystrokes and screen contents.** Not through a bug — by design, because in 1984 that was a
> feature. A keylogger on X is a short, unprivileged program.
>
> After Volume 2's permission model and Volume 8's namespaces and seccomp, that should feel jarring.
> It's the single strongest argument for the transition.

**Wayland's answer:** the compositor *is* the display server. Clients render into buffers and have no
access to each other. Isolation by default.

**What you lose, honestly:**

- **Network transparency.** `ssh -X` works because X was a network protocol from day one. Wayland
  replaces this with different tooling (pipewire-based remote desktop, waypipe), not a drop-in.
- **Forty years of tooling that assumed X's model** — screen capture, global hotkeys, automation like
  `xdotool`, and — importantly — **accessibility software**, which often needs exactly the
  cross-client access Wayland removes. Portals exist to restore these safely, and the gap has been
  closing, but "closing" is not "closed."
- **NVIDIA was rough for years**, materially improved by explicit sync support in more recent
  drivers.

**Where it stands:** Debian 12 defaults to Wayland for GNOME; several major distributions have
dropped their X11 sessions; X.Org's server is in maintenance rather than active development, and at
least one fork has been announced.

> **Confidence: moderate** on the most recent developments, which were in flux around my cutoff.
> Check the current state rather than trusting this paragraph.

---


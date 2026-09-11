# 1. Where Linux Actually Runs

## The places it dominates outright

**Supercomputing — a clean sweep.** All 500 systems on the TOP500 list run Linux, and have since
around 2017. Not "most." All of them. There is no competing operating system in high-performance
computing.

> **Verify:** `top500.org`, updated twice yearly.

**Servers and cloud.** Linux runs the large majority of public-facing web servers and cloud
workloads. Microsoft has stated publicly that Linux is the most common guest operating system on
Azure — which is worth pausing on, given that Azure is Microsoft's.

> **Verify carefully.** Netcraft, W3Techs and cloud-provider statements all measure different things
> and disagree substantially. "Large majority" is defensible; any specific percentage you see quoted
> should be traced to its methodology.

**Embedded systems.** Routers, TVs, set-top boxes, NAS boxes, cameras, industrial controllers, point
of sale, in-car infotainment. The rough rule is that **if a device has enough memory to run a
general-purpose OS and isn't a phone or a PC, it is probably running Linux** — usually built with
Yocto or Buildroot, or running OpenWrt.

This is the least visible and possibly the largest category. Nobody counts it well.

**Mobile — with an important asterisk.** Android's kernel is a Linux kernel, across roughly three
billion active devices.

> **The asterisk matters and is often glossed over.** Android is not GNU/Linux. It uses **Bionic**
> rather than glibc, has its own init rather than systemd, its own userland, and its own IPC
> (Binder). Almost everything in Volumes 1, 2, 4, 6 and 7 of this book is *different* on Android.
> What it shares is the kernel — Volume 8's material — and Google's Generic Kernel Image project has
> been working to reduce how far vendors fork even that.
>
> **Confidence: high** on the architecture; **moderate** on the three-billion figure, which comes
> from a Google announcement several years ago and is certainly higher now.

**And some specific places, because they're delightful.** NASA's Ingenuity helicopter flew on Mars
running Linux on a Snapdragon processor — the first time an aircraft powered by Linux flew on another
planet. SpaceX has said Falcon 9 and Dragon run Linux.

> **Confidence: high** on Ingenuity, which JPL discussed publicly at length; **moderate-high** on
> SpaceX, which comes from engineer AMAs rather than formal statements.

## The place it doesn't: your desk

Here is where I decline to inflate the numbers.

**Desktop Linux share is small.** Depending on whose survey and how ChromeOS is counted, it sits
somewhere in the low single-digit percentages — figures around 3–5% were being reported in the
mid-2020s, having crept up slowly over a decade. Steam's hardware survey, measuring gamers
specifically, has tended to land around 2%.

> **Time-sensitive; verify.** StatCounter and the Steam survey both publish monthly and both have
> known methodological quirks. ChromeOS is Linux-based but usually counted separately, which changes
> the answer considerably depending on what question you're asking.

The "year of the Linux desktop" has been imminent for about twenty-five years. It is a joke for a
reason.

**But two things genuinely changed recently**, and they're worth knowing about:

- **The Steam Deck runs Linux**, and Valve's Proton compatibility layer made a large fraction of the
  Windows game library work without developer effort. That moved gaming from "a reason you can't use
  Linux" to "mostly fine," which is a real shift in the last obstacle for a lot of people.
- **Hardware vendors ship it.** Dell, Lenovo and System76 sell laptops with Linux preinstalled and
  supported — meaning firmware and driver bugs have someone to report them to.

> **The honest summary:** Linux won essentially everywhere that a computer is infrastructure, and
> remains a minority on the one kind of computer people actually look at. Both facts are true
> simultaneously, and inflating the second doesn't help anybody.

---


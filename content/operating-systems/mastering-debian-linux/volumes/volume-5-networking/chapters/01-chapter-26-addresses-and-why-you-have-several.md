# Chapter 26 — Addresses, and Why You Have Several

## 26.1 The hook

> **Your laptop has at least three different addresses right now, at three different layers, and
> each layer is deliberately blind to the one below it.**
>
> **Why would anyone design it that way instead of just having *an address*?**

## 26.2 THE PROBLEM: nobody is in charge

Think about what the internet has to do. Any machine must be able to reach any other machine:

- over **any medium** — copper, fibre, wifi, 4G, satellite, carrier pigeon (RFC 1149, and yes it was
  actually implemented)
- across networks owned by **thousands of separate organisations** who don't coordinate
- with **no central registry** of who is connected right now
- while **new media get invented** that nobody anticipated

A single unified addressing scheme cannot survive that. An ethernet frame's addressing is a
property of ethernet; wifi has its own; a satellite link has its own. If applications had to know
about any of them, then inventing wifi would have required rewriting every program.

**The answer is layering**, and the rule that makes layering work is strict:

> **Each layer solves exactly one problem, and hides it completely from the layer above.**

## 26.3 THE MECHANISM: four layers, four kinds of address

| Layer | Answers | Address type | Scope |
|---|---|---|---|
| **Link** (L2) | "get this to the next machine on *this wire*" | **MAC address**, 48 bits | **one physical segment** |
| **Internet** (L3) | "get this across networks to a host anywhere" | **IP address**, 32 or 128 bits | **global** |
| **Transport** (L4) | "get this to the right *program* on that host" | **port number**, 16 bits | one host |
| **Application** | what the bytes mean | names, URLs | human |

> **A note on the seven-layer OSI model**, which you may have been taught: it's a reference model
> that the internet does not implement. The presentation and session layers don't exist as deployed
> things. What's actually running on your machine is the four or five layers above. **Confidence:
> high** — this is a well-established point, not a controversial one. When someone says "layer 7"
> they mean "application," and when they say "layer 2/3" they mean the rows above; the numbers
> survive as jargon.

Look at all of them at once:

```bash
ip -brief addr
ip -brief link
```

```
lo               UNKNOWN        127.0.0.1/8 ::1/128
enp0s31f6        DOWN
wlp2s0           UP             192.168.1.47/24 fe80::a1b2:c3d4:e5f6:7890/64
```

*(Describing rather than reporting — no `ip` on my test box.)* Three things in one line:

- **`192.168.1.47/24`** — an IPv4 address and its prefix length
- **`fe80::…/64`** — an IPv6 **link-local** address, which your machine generates automatically
- **`enp0s31f6`, `wlp2s0`** — interface names, which need their own explanation

### Debian's interface names are not `eth0`, and that's deliberate

```bash
ls /sys/class/net/
```

`enp0s31f6` decodes as: **e**thernet, **n**ame from **p**CI bus 0, **s**lot 31, **f**unction 6.
`wlp2s0` is **wl**an on PCI bus 2 slot 0.

> **THE PROBLEM this solves.** With two network cards, the kernel assigned `eth0` and `eth1` **in
> whatever order the drivers finished probing** — which depended on timing and could differ between
> boots. Your firewall rules referring to `eth0` might apply to the wrong card after a reboot.
>
> systemd/udev derives names from **physical topology** instead, so they're stable. **Confidence:
> high** on both the problem and the mechanism.

You can see the raw mapping and per-interface counters in the kernel's own tables:

```bash
head -4 /proc/net/dev
```

```
Inter-|   Receive                            |  Transmit
 face |bytes    packets errs drop fifo frame compressed multicast|bytes ...
    lo:       0       0    0    0    0     0          0        0     0 ...
  ifb0:       0       0    0    0    0     0          0        0     0 ...
```

*(Verified.)* That file is what `ip -s link` formats.

## 26.4 IPv4 addresses and the netmask, derived

An IPv4 address is **32 bits**, conventionally written as four decimal bytes. `192.168.1.47` is:

```
   192        168          1         47
   11000000 . 10101000 . 00000001 . 00101111
```

Now the question that makes the netmask make sense:

> **You want to send a packet to `93.184.216.34`. Do you put it on the wire addressed to that
> machine, or hand it to a router?**

You must decide, because those are physically different operations. If the destination is on your
local segment you can address the ethernet frame **directly to its MAC**. If it isn't, you address
the frame to **your router's MAC** and let it forward.

And the only information you have is the address. So:

> **Split the address into a *network* part and a *host* part. If the destination's network part
> matches yours, it's local. Otherwise, route it.**
>
> The **netmask** says where the split is:
>
> ```
>   mine:  192.168.1.47   /24  →  network = 192.168.1
>   dest:  192.168.1.99         →  network = 192.168.1   → SAME → local, use ARP
>   dest:  93.184.216.34        →  network = 93.184.216  → DIFFERENT → send to router
> ```
>
> The kernel computes `(dest & mask) == (mine & mask)`. **That single comparison is why netmasks
> exist.**

`/24` is CIDR notation: the first 24 bits are network.

| CIDR | Netmask | Host addresses | Typical use |
|---|---|---|---|
| `/8` | 255.0.0.0 | ~16.7 M | a whole `10.x.x.x` private range |
| `/16` | 255.255.0.0 | ~65 k | a large site |
| **`/24`** | **255.255.255.0** | **254** | **a home or small office LAN** |
| `/30` | 255.255.255.252 | **2** | a point-to-point link |
| `/32` | 255.255.255.255 | 1 | exactly one host |

Ranges worth recognising on sight:

| Range | Meaning |
|---|---|
| **`10.0.0.0/8`**, **`172.16.0.0/12`**, **`192.168.0.0/16`** | **private** (RFC 1918) — not routable on the internet |
| **`127.0.0.0/8`** | **loopback** — never leaves the machine. Note the whole `/8`, not just `127.0.0.1` |
| `169.254.0.0/16` | **link-local** — self-assigned when DHCP fails. Seeing one means "no DHCP" |
| `224.0.0.0/4` | multicast |
| `192.0.2.0/24`, `198.51.100.0/24`, `203.0.113.0/24` | **reserved for documentation** — safe to use in examples |

Try the loopback thing, which surprises people:

```bash
ping -c1 127.0.0.1
ping -c1 127.1.2.3        # also you
ping -c1 127.255.255.254  # still you
```

## 26.5 The routing table

```bash
ip route
```

```
default via 192.168.1.1 dev wlp2s0 proto dhcp metric 600
192.168.1.0/24 dev wlp2s0 proto kernel scope link src 192.168.1.47 metric 600
```

*(Describing.)* Two entries, and their order of preference is the whole algorithm:

- `192.168.1.0/24 dev wlp2s0 scope link` — **anything in this range is directly reachable**, no
  router involved
- `default via 192.168.1.1` — **everything else** goes to that address

**The rule is longest-prefix match**: the most *specific* matching route wins. `/24` beats `default`
(which is `0.0.0.0/0`, a prefix length of zero — the least specific route possible, which is exactly
why it's the fallback).

Read the kernel's own copy, which is what `ip route` formats:

```bash
cat /proc/net/route
```

```
Iface   Destination   Gateway   Flags  RefCnt  Use  Metric  Mask       MTU ...
eth0    00000000      010200C0  0003   0       0    0       00000000   0 ...
eth0    000200C0      00000000  0001   0       0    0       00FFFFFF   0 ...
```

*(Verified.)* Those are **little-endian hex**. Decode them:

```bash
python3 -c "
import struct, socket
def le(h): return socket.inet_ntoa(struct.pack('<L', int(h,16)))
for d,g,m in [('00000000','010200C0','00000000'),('000200C0','00000000','00FFFFFF')]:
    print(f'  dest={le(d):15} gw={le(g):15} mask={le(m)}')"
```

```
  dest=0.0.0.0         gw=192.0.2.1       mask=0.0.0.0
  dest=192.0.2.0       gw=0.0.0.0         mask=255.255.255.0
```

*(Verified.)* The default route via `192.0.2.1`, and the local `/24`. Same information `ip route`
shows, in the form the kernel keeps it.

### The single most useful networking command nobody knows

```bash
ip route get 1.1.1.1
ip route get 192.168.1.99
ip route get 127.0.0.1
```

**This asks the kernel to actually perform the routing decision and tell you the answer**, including
which interface and which source address it would use. It is the fastest way to answer "why isn't
this reaching that host" — before you start blaming firewalls, check what the kernel thinks it
should do.

## 26.6 ARP: the layer-3-to-layer-2 bridge

You've decided the destination is local. You have its **IP**. To build an ethernet frame you need
its **MAC**. Nothing you have gives you that.

> **ARP — Address Resolution Protocol.** Broadcast to the whole segment: *"who has 192.168.1.99?"*
> The machine that owns it replies with its MAC. Everyone caches the answer.

```bash
ip neigh
```

```
192.168.1.1 dev wlp2s0 lladdr 3c:37:86:1a:2b:3c REACHABLE
192.168.1.99 dev wlp2s0 lladdr 00:1a:2b:3c:4d:5e STALE
```

*(Describing.)* Or read the kernel table directly:

```bash
cat /proc/net/arp
```

**A MAC address's first three bytes are the manufacturer** — the Organizationally Unique Identifier:

```bash
ip link show | grep -o 'link/ether [0-9a-f:]*' | head
```

> **And a Debian-relevant privacy note:** because a MAC is a stable hardware identifier broadcast
> constantly, it can be used to track a laptop between wifi networks. NetworkManager on modern
> Debian can **randomise** the MAC used for scanning and for connections:
>
> ```bash
> nmcli -f 802-11-wireless.cloned-mac-address connection show <name> 2>/dev/null
> grep -rn 'cloned-mac\|mac-address' /etc/NetworkManager/ 2>/dev/null | head
> ```
>
> **Confidence: high** that this feature exists; **moderate** on whether it's enabled by default in
> your Debian version.

**ARP has no authentication whatsoever.** Any machine on the segment can answer "I have
192.168.1.1," and everyone will believe it — that's **ARP spoofing**, and it's why the classic
coffee-shop attack works and why §31 matters.

## 26.7 The Debian-specific bit: `ip` replaced `ifconfig`, and why

```bash
command -v ifconfig route netstat arp || echo "net-tools not installed — correct for modern Debian"
```

On a current Debian install, **none of those exist by default.** They come from the `net-tools`
package, which is no longer installed.

| Old (`net-tools`) | New (`iproute2`) |
|---|---|
| `ifconfig` | **`ip addr`**, `ip link` |
| `route -n` | **`ip route`** |
| `netstat -tlnp` | **`ss -tlnp`** |
| `arp -a` | **`ip neigh`** |
| `iptunnel`, `ipmaddr` | `ip tunnel`, `ip maddr` |

> **This is not fashion.** `net-tools` was effectively unmaintained for years and, more importantly,
> **could not express what the kernel could do**: multiple addresses per interface, policy routing,
> network namespaces (Volume 8), traffic control, and IPv6 done properly. `ifconfig` shows you a
> lossy summary of modern kernel state. `iproute2` talks to the kernel over **netlink**, the
> purpose-built interface, rather than parsing `/proc`.
>
> **Confidence: high** on the deprecation and the reasoning.

If you install `net-tools` out of habit, `ifconfig` will run — and will quietly fail to show you
secondary addresses.

### Which thing is configuring your network?

Debian has three mechanisms and which one you have depends on how you installed:

```bash
systemctl is-active NetworkManager systemd-networkd networking 2>/dev/null
ls /etc/network/interfaces /etc/network/interfaces.d/ 2>/dev/null
nmcli device status 2>/dev/null
```

| Manager | Config | Typical on |
|---|---|---|
| **NetworkManager** | `nmcli`, `/etc/NetworkManager/` | **desktop installs** |
| **`ifupdown`** | **`/etc/network/interfaces`** | **server/minimal installs** — the traditional Debian way |
| **systemd-networkd** | `/etc/systemd/network/*.network` | containers, some servers |

`/etc/network/interfaces` is genuinely Debian's own — it's not a systemd or upstream-kernel thing,
and it's why Debian server documentation looks different from Fedora's:

```bash
cat /etc/network/interfaces 2>/dev/null
```

---


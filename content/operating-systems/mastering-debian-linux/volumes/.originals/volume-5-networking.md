# Mastering Debian Linux: The Engineering, The History, The Incidents

## Volume 5 — Networking

---

### Where the first four volumes left off

Volume 4 downloaded packages from a server on the internet, verified cryptographic signatures on
them, and executed their maintainer scripts as root — and never explained a single byte of how any
of that reached your machine. It also left one thing hanging:

> Volume 4 §25: the 2008 OpenSSL bug meant every key generated on Debian for twenty months came
> from a space of ~32,768 possibilities. **Chapter 30 explains what an SSH key actually *is***, and
> why "32,768 possibilities" was fatal rather than merely bad.

Two more threads get picked up here:

| Thread | From | Resolved in |
|---|---|---|
| Sockets are the exception to "everything is a file" | Volume 3 §14.5 | §29.2 — what a socket *is* instead |
| A file descriptor is three levels deep, with an inode at the bottom | Volume 3 §18.2 | §29.5 — **sockets have inodes too**, and you can find them |

**Requirements.** Debian doesn't install all of these by default:

```bash
sudo apt install iproute2 dnsutils curl openssh-client
sudo apt install tcpdump          # optional; §TRY THIS #1 uses it, needs sudo to run
```

`iproute2` is almost certainly already present. `dnsutils` gives you `dig`.

**Verification note, and this volume needs a bigger one than usual.** The machine I tested on is a
minimised container with **no `ip`, `ss`, `dig`, `tcpdump` or `ssh-keygen`**. That turned out to be
useful rather than limiting: it forced me to verify things against **`/proc/net/*`**, which is the
raw kernel state those tools merely format — and reading it directly is more instructive. So:

- **Verified directly:** everything involving `/proc/net/*`, `/proc/sys/net/*`, `curl`, `openssl`,
  `getent`, and the Diffie–Hellman arithmetic in §30.5.
- **Not run by me, flagged where it appears:** the `ip`, `ss`, `dig` and `ssh-keygen` invocations.
  Their output formats are stable and well documented, but I'll mark where I'm describing rather
  than reporting.

---

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

# Chapter 27 — DNS: How Thirteen Addresses Serve the Whole Internet

## 27.1 The hook

> **There are thirteen root server addresses for the entire internet — `a.root-servers.net` through
> `m.root-servers.net`. Billions of devices. One name resolution per page load.**
>
> **How does that not melt?**

Two answers, and both are load-bearing: **delegation** and **caching**.

## 27.2 THE PROBLEM: it used to be one file

Before DNS, the mapping from names to addresses was a **single text file** — `HOSTS.TXT` — maintained
at SRI's Network Information Center. If you wanted a hostname, you emailed SRI. To get the current
list, you FTP'd the file.

> **Confidence: high** on `HOSTS.TXT` and SRI-NIC.

This worked while the network had hundreds of hosts and stopped working somewhere in the low
thousands, for reasons that are all structural:

- the file grew without bound, and **everyone downloaded all of it**
- every change required **one organisation** to act
- there was no way to delegate authority over part of the namespace
- and the whole thing had a single point of failure and a single bottleneck

**Paul Mockapetris** designed DNS in **1983** (RFCs 882 and 883, later superseded by 1034 and 1035).

> **Confidence: high** on Mockapetris and 1983.

**And the file is still on your machine**, first in the lookup order:

```bash
cat /etc/hosts
```

```
127.0.0.1	localhost
::1		localhost ip6-localhost ip6-loopback
127.0.1.1	mylaptop
```

That `127.0.1.1` line is a **Debian convention** — the machine's own hostname mapped to a loopback
address that isn't `127.0.0.1`, so that programs resolving the local hostname get an answer even
with no network at all.

> **Confidence: moderate-high** that the `127.0.1.1` convention is specifically Debian's; it's
> documented in Debian's manual and differs from other distributions.

## 27.3 THE MECHANISM: a delegated tree

DNS is a **tree**, read right to left, and every dot is a delegation boundary:

```
                              .  (root)
                              │  13 addresses, each ANYCAST to hundreds of servers
              ┌───────────────┼───────────────┐
             com.            org.            uk.          ← TLDs
              │               │               │
        ┌─────┴─────┐    ┌────┴────┐     ┌────┴────┐
     debian.       ...  debian.   ...   co.uk.    ...     ← domains
       │                  │
   www.debian.org.   ftp.debian.org.                      ← hosts
```

**The root servers do not know where `www.debian.org` is.** They know who is authoritative for
`org.`. The `org.` servers know who is authoritative for `debian.org.`. The `debian.org.` servers
know the answer. **Nobody has to know everything.**

Watch the entire walk happen:

```bash
dig +trace www.debian.org
```

*(Describing — no `dig` on my test box.)* You'll see four stages: root servers listing the `org.`
nameservers, `org.` listing `debian.org.`'s, `debian.org.` giving the final answer, and each step
labelled with which server replied.

**And caching is why this is affordable.** Every answer carries a **TTL**:

```bash
dig www.debian.org | grep -A2 'ANSWER SECTION'
dig www.debian.org +noall +answer
```

The number before `IN A` is the TTL in seconds. Your resolver caches for that long, so the root
servers are consulted only when nothing anywhere in the chain has a cached delegation — which, given
that TLD delegations have TTLs measured in days, is almost never.

> **Why exactly thirteen?** The original DNS response had to fit in a **512-byte UDP packet**, and
> thirteen name-and-address pairs was what fitted. The limit is historical, and each of the thirteen
> addresses is now **anycast** — hundreds of physical servers worldwide advertise the same IP, and
> your packet reaches the topologically nearest one.
>
> **Confidence: high** on both the 512-byte origin and the anycast deployment.

### Record types you'll actually meet

```bash
dig debian.org A
dig debian.org AAAA
dig debian.org MX
dig debian.org NS
dig debian.org TXT
dig -x 8.8.8.8            # reverse lookup — PTR
```

| Type | Maps to | Note |
|---|---|---|
| **A** | IPv4 address | |
| **AAAA** | IPv6 address | "quad-A", four times the size of A |
| **CNAME** | **another name** | an alias. Cannot coexist with other records at the same name |
| **MX** | mail servers, with priorities | |
| **NS** | the nameservers for a zone | **this is what delegation looks like** |
| **TXT** | arbitrary text | SPF, DKIM, domain-ownership proofs |
| **SOA** | zone metadata: serial, refresh, TTLs | |
| **PTR** | address → name | lives in the `in-addr.arpa` tree |
| **CAA** | which CAs may issue certificates for this name | |

## 27.4 The resolution path on *your* Debian machine

This is where it gets genuinely messy, and honesty is more useful than a clean diagram.

When a program calls `getaddrinfo()`, glibc consults the **Name Service Switch**:

```bash
grep '^hosts:' /etc/nsswitch.conf
```

```
hosts:          files dns
```

*(Verified.)* Read left to right — **these are tried in order**:

| Source | Means |
|---|---|
| **`files`** | **`/etc/hosts`** — checked first, always |
| `myhostname` | systemd's built-in answer for your own hostname |
| **`resolve`** | ask **systemd-resolved** over D-Bus |
| `mdns4_minimal` | multicast DNS (`.local` names) — from `libnss-mdns` |
| **`dns`** | classic DNS, using `/etc/resolv.conf` |
| `[!UNAVAIL=return]` | a control action: if that source was *available* but said no, **stop** |

**Then, if it gets to `dns`:**

```bash
ls -l /etc/resolv.conf
cat /etc/resolv.conf
```

```
-rw-r--r-- 1 root root 67 Sep 10 09:37 /etc/resolv.conf
nameserver 8.8.8.8
nameserver 8.8.4.4
options timeout:2 attempts:3
```

*(Verified on my test box.)* On **your** Debian machine, that file is one of four things, and which
one matters:

| `/etc/resolv.conf` is | Meaning |
|---|---|
| a **real file** with real nameservers | classic; NetworkManager or `ifupdown` wrote it directly |
| a symlink to `/run/resolvconf/resolv.conf` | the `resolvconf` package is arbitrating between sources |
| a symlink to `/run/systemd/resolve/stub-resolv.conf` | **systemd-resolved** is in charge; you'll see `nameserver 127.0.0.53` |
| a symlink to `/run/systemd/resolve/resolv.conf` | systemd-resolved, but handing you the upstream servers directly |

```bash
systemctl is-active systemd-resolved 2>/dev/null || echo "systemd-resolved not running"
resolvectl status 2>/dev/null | head -20
```

> **A real Debian/Ubuntu difference, flagged because it trips people up.** Ubuntu enables
> **systemd-resolved** by default, so `/etc/resolv.conf` there points at `127.0.0.53` — a local stub
> listener. **Debian has historically not enabled it by default**, using NetworkManager or
> `resolvconf` instead.
>
> **Confidence: moderate.** This has shifted across Debian releases and install types. Your own
> `systemctl is-active systemd-resolved` and `ls -l /etc/resolv.conf` are the authority — and if you
> follow Ubuntu-flavoured DNS advice on Debian, this is the mismatch that will confuse you.

If systemd-resolved *is* running, `127.0.0.53` is not a remote server — it's a **stub resolver
listening on loopback** that does caching, per-interface DNS, DNSSEC validation and optionally
DNS-over-TLS, and forwards upstream:

```bash
ss -ulnp | grep 53 2>/dev/null
resolvectl query debian.org 2>/dev/null
resolvectl statistics 2>/dev/null
```

## 27.5 `dig` versus `getent`: the distinction that explains a classic confusion

This is worth internalising because it saves an hour of confusion at some point:

```bash
echo "203.0.113.99  test-only.example" | sudo tee -a /etc/hosts

getent hosts test-only.example        # goes through NSS → sees /etc/hosts
dig +short test-only.example          # talks DNS directly → sees nothing

sudo sed -i '/test-only.example/d' /etc/hosts
```

| Tool | Path | Respects `/etc/hosts`? |
|---|---|---|
| **`getent hosts`** | the **NSS** stack — the same path every normal program uses | **yes** |
| **`dig`, `host`, `nslookup`** | **straight to a DNS server**, bypassing NSS entirely | **no** |
| `ping`, `curl`, your browser | NSS | yes |

> **So when `dig` says a name doesn't resolve but `curl` reaches it fine — or the reverse — you are
> looking at two different lookup mechanisms, not a broken one.** `getent hosts` is the right tool
> for "what will my *applications* see"; `dig` is the right tool for "what does DNS actually say."

## 27.6 THE INCIDENT: Kaminsky, 2008

> **Confidence: high** on the discoverer, the date, the mechanism, and the fix. This was a
> coordinated multi-vendor disclosure and is very well documented.

**Classic DNS has no authentication.** A response is accepted if it arrives at the right port,
matches the query, and carries the right **16-bit transaction ID**. That's the whole check.

So the attack has always been theoretically obvious: send the victim's resolver a forged reply
before the real one arrives, guessing the transaction ID. **16 bits is 65,536 possibilities**, which
is a lot to guess before the legitimate answer lands — and once the real answer is cached, you have
to wait out the TTL to try again. That made the attack impractical for two decades.

**In July 2008 Dan Kaminsky removed the impracticality**, and the insight was that you don't attack
the name you want:

```
   1. Ask the victim resolver for  aaaa1.bank.example  — a name that surely isn't cached
   2. The resolver must ask bank.example's nameservers → the race window opens
   3. Flood forged replies. Each says: "I don't know aaaa1, but here's the
      AUTHORITATIVE NAMESERVER for bank.example — and by the way its address is <attacker>"
                                        ↑
                                 THE ADDITIONAL RECORD
   4. Guess wrong? No problem. Try  aaaa2.bank.example.  Then aaaa3.
      There is NO TTL PENALTY, because you never cached anything.
   5. Land one guess and you have poisoned the nameserver record
      for the ENTIRE DOMAIN, not one hostname.
```

**Two changes turn an impractical attack into a minutes-long one:** unlimited retries with no
backoff, and a payoff that captures a whole zone rather than a single name.

**The fix was source port randomisation.** A resolver had traditionally used one fixed UDP source
port, so the attacker only had to guess the 16-bit transaction ID. Randomising the source port too
adds up to ~16 more bits of entropy, taking the guess from 2¹⁶ to roughly 2³².

Check your own resolver:

```bash
cat /proc/sys/net/ipv4/ip_local_port_range
```

```
32768	60999
```

*(Verified.)* That's ~28,000 possible source ports, so ~14.8 bits, multiplied by the 16-bit
transaction ID.

> **Note what the fix is *not*: it is not a fix.** It made guessing ~65,000 times harder. The
> underlying problem — that a DNS response carries no proof of authenticity — is unchanged, and
> that's what **DNSSEC** exists to address by signing records cryptographically.
>
> ```bash
> dig +dnssec debian.org | grep -E 'RRSIG|flags:'
> resolvectl query debian.org 2>/dev/null | grep -i authenticated
> ```
>
> DNSSEC deployment remains partial after fifteen years. The more widely deployed answers today are
> **DNS-over-TLS** (port 853) and **DNS-over-HTTPS** (port 443), which encrypt and authenticate the
> path to *your resolver* — a different guarantee from DNSSEC, which authenticates *the data* all
> the way from the zone owner. Both are useful; they are not substitutes for each other.

> **And the pattern, for the fifth time in this book.** Shellshock, Baron Samedit, ext4's silent
> write, Debian's weak keys, and now this: **something was assumed to provide a guarantee it never
> actually offered.** DNS's transaction ID was never authentication. It was a *collision-avoidance*
> mechanism being used as a security control, and it held only because nobody had found the trick
> that made the retries free.

---

# Chapter 28 — The Full Trace: One URL, Ten Steps

## 28.1 The hook

> **`curl https://www.debian.org/` returns in about a tenth of a second.**
>
> **In that tenth of a second: a name was resolved through a delegated global hierarchy, a routing
> decision was made, a hardware address was looked up, a three-packet handshake established a
> connection, an elliptic-curve key exchange agreed a secret with a machine you've never met, a
> certificate chain was validated against a trust store, and an HTTP request went out over the
> resulting encrypted channel.**
>
> **Let's watch every step.**

This chapter is one continuous trace. Every step has a command that shows you *that* step in
isolation, and §28.12 measures all of them at once.

## 28.2 Step 1 — Parse the URL

```
   https://www.debian.org/index.html
   └─┬─┘   └──────┬─────┘└────┬────┘
   scheme       host        path

   scheme https  →  default port 443, and TLS is required
```

`curl` does this in userspace, with no system calls. Nothing has happened on the network yet.

```bash
curl -v https://www.debian.org/ -o /dev/null 2>&1 | head -5
```

## 28.3 Step 2 — Resolve the name

Chapter 27, applied. The program calls `getaddrinfo()`, which walks the NSS stack:

```bash
grep '^hosts:' /etc/nsswitch.conf
getent hosts www.debian.org            # ← what your APPLICATIONS see
dig +short www.debian.org              # ← what DNS actually says
```

**Use `getent`, not `dig`, when you're debugging an application** (§27.5). If they disagree,
something in `/etc/hosts` or the NSS chain is intervening — and that's usually the bug.

`getaddrinfo()` may return **several** addresses, IPv4 and IPv6:

```bash
getent ahosts www.debian.org
```

The client tries them in a preference order, and modern clients use **Happy Eyeballs** (RFC 8305):
start the IPv6 connection, and if it hasn't completed within a short delay, race an IPv4 attempt.
That's why a broken IPv6 route usually produces *slow* rather than *failed* connections.

## 28.4 Step 3 — Make the routing decision

We have an address. Chapter 26's question: local, or router?

```bash
ip route get $(getent hosts www.debian.org | awk '{print $1; exit}')
```

```
151.101.0.204 via 192.168.1.1 dev wlp2s0 src 192.168.1.47 uid 1000
```

*(Describing.)* Read that as a complete decision: **via** the gateway, out **dev** this interface,
using **src** this source address. The kernel already computed
`(dest & mask) == (mine & mask)`, got false, and selected the default route.

> **This command is the first thing to run when something can't connect.** Before you suspect
> firewalls or DNS, confirm the kernel intends to send the packet where you think it does — and out
> of the interface you expect. On a machine with a VPN up, `ip route get` is how you find out
> whether traffic is actually going through it.

## 28.5 Step 4 — Find the gateway's MAC address

The packet's destination IP is the web server. The **ethernet frame's** destination MAC is your
router, because that's the next hop on this segment.

```bash
ip neigh show 192.168.1.1
cat /proc/net/arp
```

If the entry isn't cached, ARP broadcasts (§26.6) before anything else can happen. This is why the
very first connection after boot is sometimes a few milliseconds slower than the next one.

**And note the layering doing its job:** the IP header still says `151.101.0.204`. The ethernet
header says your router's MAC. Your router will strip the ethernet header, look at the IP header,
make its own routing decision, and build a *new* frame with a *different* MAC — and repeat, at every
hop. **The layer-2 addresses change at every hop; the layer-3 addresses don't change at all.**

```bash
traceroute -n www.debian.org 2>/dev/null | head -8     # sudo apt install traceroute
# or:
mtr -n -c 5 --report www.debian.org 2>/dev/null | head
```

Each line is one router that rewrote the frame and forwarded the packet.

## 28.6 Step 5 — The TCP three-way handshake

```
   CLIENT                                            SERVER
      │                                                 │
      │──── SYN         seq=x                     ────► │   "let's talk; my seq starts at x"
      │                                                 │
      │ ◄─── SYN,ACK    seq=y, ack=x+1            ─────│   "fine; mine starts at y, got yours"
      │                                                 │
      │──── ACK         ack=y+1                   ────► │   "got yours"
      │                                                 │
      │══════════ connection ESTABLISHED ══════════════ │
```

**Why three and not two?** Because *both* directions need a synchronised starting sequence number,
and each side must know the other received theirs. Two packets would leave the server unsure whether
its own sequence number arrived.

The handshake costs **one round trip** before any data moves. On a 20 ms link that's 20 ms you pay
before sending a single byte of request — which is exactly why HTTP keep-alive, connection pooling
and QUIC (which folds the handshake into the crypto handshake) exist.

Watch a connection in mid-handshake — you have to be quick, or catch a slow host:

```bash
ss -tan state syn-sent
ss -tan '( dport = :443 )' | head
```

Or observe the states over a real connection:

```bash
curl -s -o /dev/null https://www.debian.org/ &
for i in 1 2 3 4 5; do ss -tn state all '( dport = :443 )' 2>/dev/null | tail -2; sleep 0.05; done
wait
```

## 28.7 Step 6 — The TLS handshake

Now the interesting part. Two machines that have never communicated must agree on a secret key,
over a channel anyone can read, and the client must verify it's talking to the real
`www.debian.org` and not whoever intercepted the connection.

```bash
openssl s_client -connect www.debian.org:443 -servername www.debian.org -brief </dev/null
```

Real output *(verified, against `github.com`)*:

```
CONNECTION ESTABLISHED
Protocol version: TLSv1.3
Ciphersuite: TLS_AES_256_GCM_SHA384
Peer certificate: CN = github.com
Hash used: SHA256
Signature type: RSA-PSS
Verification: OK
Server Temp Key: X25519, 253 bits
DONE
```

Every line is a decision that was negotiated:

| Line | What was agreed |
|---|---|
| `Protocol version: TLSv1.3` | which TLS version — 1.3 needs **one** round trip, 1.2 needed two |
| `Ciphersuite: TLS_AES_256_GCM_SHA384` | the **symmetric** cipher used for the actual data, once a key exists |
| `Peer certificate: CN = github.com` | the identity the server claimed |
| `Signature type: RSA-PSS` | how the server **proved** it holds the certificate's private key |
| `Verification: OK` | the certificate chain validated against your local trust store |
| **`Server Temp Key: X25519, 253 bits`** | **the ephemeral key exchange** — §30.5 explains exactly what this is |

That last line is the one to notice. **X25519 is Diffie–Hellman on an elliptic curve**, and
"Temp"/ephemeral means the key pair is generated fresh for this one connection and thrown away.
That's **forward secrecy**: recording the traffic today and stealing the server's long-term private
key next year does not let you decrypt it, because the key that encrypted it never existed on disk.

**The `-servername` flag is SNI** — Server Name Indication. The client announces which hostname it
wants **before** the certificate is chosen, so one IP address can serve certificates for thousands
of sites. Note that in TLS 1.2 and 1.3 as normally deployed, **SNI is sent in the clear** — so a
network observer learns which site you visited even though the content is encrypted.

```bash
openssl s_client -connect www.debian.org:443 -servername www.debian.org </dev/null 2>/dev/null \
  | openssl x509 -noout -subject -issuer -dates -ext subjectAltName 2>/dev/null
```

And your trust store — the reason `Verification: OK` means anything — is a package:

```bash
dpkg -S /etc/ssl/certs/ca-certificates.crt
ls /usr/share/ca-certificates/mozilla/ | head
ls /usr/share/ca-certificates/mozilla/ | wc -l
```

> **That's a Debian-specific fact worth sitting with.** The set of certificate authorities your
> machine trusts arrives via **`apt`**, in the **`ca-certificates`** package, derived from Mozilla's
> trust store. Which means: your TLS trust decisions are governed by Debian's archive signing keys
> (Volume 4 §23.6), and `update-ca-certificates` is how you add or remove one:
>
> ```bash
> ls /usr/local/share/ca-certificates/     # where YOUR extra CAs go (Volume 3 §16.6 again)
> cat /etc/ca-certificates.conf | head -5
> ```

## 28.8 Step 7 — The HTTP request

Only now does anything resembling "the web" happen — and it goes inside the encrypted channel:

```bash
curl -v --http1.1 https://www.debian.org/ -o /dev/null 2>&1 | grep -E '^[<>]' | head -20
```

`>` lines are what curl sent, `<` lines what came back. In HTTP/1.1 it's plain text:

```
> GET / HTTP/1.1
> Host: www.debian.org
> User-Agent: curl/7.88.1
> Accept: */*
>
< HTTP/1.1 200 OK
< Content-Type: text/html
< Content-Length: 18453
```

**`Host:` is mandatory in HTTP/1.1** for the same reason SNI exists — one IP, many sites.

My verified trace negotiated **HTTP/2**, where the same information is sent as binary frames with
header compression rather than text:

```bash
curl -s -o /dev/null -w 'negotiated HTTP version: %{http_version}\n' https://www.debian.org/
```

HTTP/2 was selected during the TLS handshake via **ALPN** (Application-Layer Protocol Negotiation) —
so the protocol choice was made before any HTTP existed, inside step 6.

## 28.9 Steps 8–10 — Data, teardown, and the way back up

**The response travels back up the same stack, in reverse:**

```
   ethernet frame arrives at your NIC
        → kernel checks the destination MAC is yours
             → strips the ethernet header, looks at the IP header
                  → checks the destination IP is yours
                       → strips the IP header, looks at the TCP header
                            → matches the 4-TUPLE to a socket        ← §29.4
                                 → appends the bytes to that socket's receive buffer
                                      → wakes the process blocked in read()
                                           → TLS layer decrypts
                                                → curl writes to fd 1  ← Volume 3 §18
```

**Teardown** is four packets, not three, because TCP connections close in each direction
independently:

```
   FIN  ────►        "I'm done sending"
        ◄──── ACK
        ◄──── FIN    "so am I"
   ACK  ────►
   then the initiator sits in TIME_WAIT for ~60 s   ← §29.6
```

## 28.10 Now measure the whole thing

This is the chapter in one command, and it's the most useful diagnostic in the volume.

```bash
cat > /tmp/curl-format.txt <<'EOF'
   DNS lookup ........... %{time_namelookup}s\n
   TCP connected ........ %{time_connect}s\n
   TLS handshake done ... %{time_appconnect}s\n
   request sent ......... %{time_pretransfer}s\n
   first byte received .. %{time_starttransfer}s\n
   transfer complete .... %{time_total}s\n
   \n
   remote ............... %{remote_ip}:%{remote_port}\n
   HTTP version ......... %{http_version}\n
   response code ........ %{http_code}\n
   downloaded ........... %{size_download} bytes\n
EOF

curl -s -o /dev/null -w '@/tmp/curl-format.txt' https://www.debian.org/
```

Real output *(verified, against `github.com`)*:

```
   DNS lookup ........... 0.020574s
   TCP connected ........ 0.021259s
   TLS handshake done ... 0.057029s
   request sent ......... 0.057123s
   first byte received .. 0.103313s
   transfer complete .... 0.116468s

   remote ............... 140.82.113.4:443
   HTTP version ......... 2
   response code ........ 200
```

**Those are cumulative timestamps, so subtract to get each phase** — and this is where it becomes
diagnostic:

| Phase | Elapsed | Which step |
|---|---|---|
| DNS resolution | **20.6 ms** | §28.3 |
| TCP handshake | **0.7 ms** | §28.6 |
| **TLS handshake** | **35.7 ms** | §28.7 |
| request sent | 0.1 ms | §28.8 |
| **server processing + first byte** | **46.2 ms** | §28.9 |
| remaining transfer | 13.2 ms | |
| **total** | **116.5 ms** | |

*(All verified; the phase figures are my subtractions.)* Read what that tells you:

- **DNS was 18% of the total.** A cold cache is expensive; this is why resolvers cache aggressively
  and why a broken DNS server makes *everything* feel slow rather than failing outright.
- **TCP took 0.7 ms**, which means the round-trip time to that server is under a millisecond — a CDN
  edge node very close by. Compare that to TLS.
- **TLS cost 36 ms — thirty times the TCP handshake.** TLS 1.3 is one round trip, so most of that 36
  ms is *computation*: the X25519 key exchange, the signature verification, and walking the
  certificate chain to a trusted root.
- **Server processing was the single largest phase**, at 46 ms. No amount of network tuning fixes
  that.

> **This table is how you answer "why is it slow" without guessing.** Slow DNS, slow handshake, slow
> server and slow transfer are four different problems with four different owners, and one command
> tells you which one you have.

```bash
rm -f /tmp/curl-format.txt
```

---

# Chapter 29 — Sockets and Ports, at the Kernel Level

## 29.1 The hook

> **"The web server is listening on port 80."**
>
> **What *object* does that sentence describe? Where does it live, what is it made of, and how can
> ten thousand simultaneous connections all be "on port 80" without colliding?**

## 29.2 THE PROBLEM: Volume 3's exception, revisited

Volume 3 §14.5 listed sockets as the place where "everything is a file" breaks down: you cannot
`open("/some/tcp/connection")`. Here's why, and what replaced it.

A file has **a name and a location**. A network connection has neither — it has a *pair of
endpoints*, it doesn't exist until both sides agree, and it can't be reopened after it closes. The
`open()` model genuinely doesn't fit.

So Unix added a parallel creation API, and then **rejoined the file model immediately afterwards**:

```c
   fd = socket(AF_INET, SOCK_STREAM, 0);   /* ← NOT open(). Returns a FILE DESCRIPTOR. */
   bind(fd, &addr, len);                   /* claim a local address and port           */
   listen(fd, backlog);                    /* become PASSIVE; create the accept queue  */
   newfd = accept(fd, &peer, &len);        /* ← returns a NEW fd, one per connection   */

   read(newfd, ...);   write(newfd, ...);  /* ← ordinary file operations from here on  */
   close(newfd);
```

> **The compromise is precise: sockets need their own *creation* and *addressing* calls, and then
> behave as ordinary file descriptors for all I/O.** That's why `curl` can write to a socket and to
> a file with the same code, why you can `dup2()` a socket onto stdout, and why every Volume 3 §18
> redirection trick works on network connections.

## 29.3 Ports

A **port** is a 16-bit number — 0 to 65535 — that identifies *which program* on a host should receive
a segment. IP gets you to the machine; the port gets you to the process.

| Range | Name | Rule |
|---|---|---|
| **0–1023** | **well-known / privileged** | **binding requires root or `CAP_NET_BIND_SERVICE`** |
| 1024–49151 | registered | anyone may bind |
| **ephemeral** | client-side source ports | assigned automatically by the kernel |

Linux's ephemeral range is a tunable, not the IANA range:

```bash
cat /proc/sys/net/ipv4/ip_local_port_range
```

```
32768	60999
```

*(Verified.)* That's ~28,000 available source ports — the number Chapter 27's Kaminsky fix relies on
for its extra entropy, and the number that limits how many simultaneous outbound connections you can
make **to the same destination**.

### Why ports below 1024 are privileged

Verify it first:

```bash
python3 -c "
import socket
for p in (80, 8080):
    s = socket.socket()
    try:
        s.bind(('0.0.0.0', p)); print(f'  port {p}: bound OK')
    except PermissionError as e:
        print(f'  port {p}: {e}')
    s.close()"
```

```
  port 80: [Errno 13] Permission denied
  port 8080: bound OK
```

*(Verified as an unprivileged user.)*

> **THE PROBLEM it solved**, and it's Volume 2's world: on a shared timesharing machine, if any user
> could bind port 25, any user could impersonate the mail server. Reserving low ports for root meant
> **"port 25 on this host" was a claim about authority**, not just a number.
>
> **On a single-user laptop that reasoning is nearly obsolete**, and the restriction now mostly
> causes people to run web servers as root, which is worse. The modern answers are all better:

| Approach | How |
|---|---|
| **Capabilities** (Volume 2 §11.8) | `sudo setcap cap_net_bind_service=+ep /path/to/binary` |
| **systemd socket activation** | systemd binds the port as root, passes the **fd** to an unprivileged service |
| **Lower the threshold** | `sysctl net.ipv4.ip_unprivileged_port_start=80` |
| Reverse proxy | nginx on 80 as root-then-drop, app on 8080 |

```bash
getcap -r /usr/bin /usr/sbin 2>/dev/null
sysctl net.ipv4.ip_unprivileged_port_start 2>/dev/null
```

**systemd socket activation is the elegant one**, and it's a direct descendant of Volume 1 §2.6's
insight: the privileged process opens the descriptor, and the unprivileged one just inherits it
across `execve()`. Volume 6 covers it.

## 29.4 The answer to the hook: a listening socket is not a connected socket

This is the key idea of the chapter, and you can see it in the kernel's own table.

Start a listener and connect to it:

```bash
nc -l -p 12345 >/dev/null &
sleep 0.4
exec 3<>/dev/tcp/127.0.0.1/12345      # bash only — dash has no /dev/tcp
sleep 0.3
printf 'port 12345 = 0x%X\n' 12345
```

Now decode every socket on that port straight out of `/proc/net/tcp`:

```bash
python3 - <<'PY'
import struct, socket
states = {1:'ESTABLISHED', 2:'SYN_SENT', 3:'SYN_RECV', 6:'TIME_WAIT',
          8:'CLOSE_WAIT', 10:'LISTEN'}
def dec(x):
    a, p = x.split(':')
    return f"{socket.inet_ntoa(struct.pack('<L', int(a,16)))}:{int(p,16)}"
print(f"  {'SL':<4} {'LOCAL':<22} {'REMOTE':<22} STATE")
for line in open('/proc/net/tcp').readlines()[1:]:
    f = line.split()
    if '3039' in f[1].upper() or '3039' in f[2].upper():
        print(f"  {f[0]:<4} {dec(f[1]):<22} {dec(f[2]):<22} "
              f"{states.get(int(f[3],16), f[3])}  inode={f[9]}")
PY

exec 3<&-; kill %1
```

```
  SL   LOCAL                  REMOTE                 STATE
  0:   0.0.0.0:12345          0.0.0.0:0              LISTEN        inode=964
  3:   127.0.0.1:56434        127.0.0.1:12345        ESTABLISHED   inode=966
  4:   127.0.0.1:12345        127.0.0.1:56434        ESTABLISHED   inode=965
```

*(Verified.)* **Three separate socket objects, with three separate inodes.** Read them:

| Socket | Local | Remote | What it is |
|---|---|---|---|
| **964** | `0.0.0.0:12345` | `0.0.0.0:0` | **the listening socket** — a *two*-tuple. No remote end, and `0.0.0.0` means "any local address" |
| **966** | `127.0.0.1:56434` | `127.0.0.1:12345` | **the client end** — note the ephemeral source port from the range above |
| **965** | `127.0.0.1:12345` | `127.0.0.1:56434` | **the server end** — the same two endpoints, mirrored |

> **And that answers the hook.** A connection is identified by its **four-tuple** — (local address,
> local port, remote address, remote port). The *port* is shared by every connection to that service;
> the *four-tuple* is unique to each one.
>
> Ten thousand clients connecting to port 80 produce **ten thousand distinct four-tuples**, because
> each client contributes a different (address, ephemeral port) pair. The listening socket's job is
> only to sit in the accept queue producing new sockets. **It never carries data.**

The friendly version of the same information:

```bash
ss -tan '( sport = :12345 or dport = :12345 )'
ss -tlnp                 # what's LISTENING, with the owning process
ss -tanp | head
ss -s                    # summary counts by state
```

## 29.5 Sockets have inodes — closing Volume 3's loop

Notice the `inode=` column above. Volume 3 §15 said every file has an inode and §18 said a file
descriptor points at one. **A socket is not a file, but the kernel gives it an inode number
anyway** — and that number is how you connect a network connection to the process that owns it.

*(This whole sequence is verified.)*

```bash
nc -l -p 12345 >/dev/null &
NCPID=$!
sleep 0.4

# the socket's inode, from the kernel's network table
INO=$(grep -i ':3039' /proc/net/tcp | awk '{print $10}')
echo "socket inode from /proc/net/tcp: $INO"

# the same inode, in the process's file descriptor table
ls -l /proc/$NCPID/fd/ | grep socket

kill $NCPID
```

```
socket inode from /proc/net/tcp: 818
lrwx------ 1 you you 64 Sep 10 09:41 3 -> socket:[818]
```

**The same number, 818, in both places.** *(Verified.)*

> **That inode is the join key between the network stack and the process table**, and it is exactly
> what `ss -p` and `lsof -i` do for you: read `/proc/net/tcp` for the sockets, then scan every
> `/proc/*/fd/` for a matching `socket:[N]` symlink. There's no magic — it's a join over two `/proc`
> files, which is also why `ss -p` needs root to see other users' processes.

Do it yourself for every listening socket on your machine:

```bash
sudo ss -tlnp
# or the long way, which shows what ss is actually doing:
for ino in $(awk 'NR>1 && $4=="0A" {print $10}' /proc/net/tcp); do
  owner=$(sudo ls -l /proc/*/fd/ 2>/dev/null | grep -l "socket:\[$ino\]" 2>/dev/null)
  echo "inode $ino"
done | head
```

## 29.6 Socket states, and the two that matter operationally

```bash
ss -tan | awk 'NR>1 {print $1}' | sort | uniq -c | sort -rn
```

| State | Means |
|---|---|
| `LISTEN` | a passive socket waiting for connections |
| `ESTAB` | open and usable |
| `SYN-SENT` / `SYN-RECV` | mid-handshake |
| `FIN-WAIT-1` / `FIN-WAIT-2` | we closed, waiting for them |
| **`TIME-WAIT`** | **we closed, and we're waiting out the timer** |
| **`CLOSE-WAIT`** | **they closed, and *we* haven't called `close()`** |

**These last two look similar and mean opposite things.** This is the single most useful piece of
socket knowledge for debugging a service:

> **`TIME_WAIT` is normal and healthy.** After the side that initiated the close finishes the
> teardown, it keeps the four-tuple reserved for roughly 60 seconds (twice the maximum segment
> lifetime). Two reasons: to absorb any duplicate segments still wandering the network, and to be
> able to re-send the final ACK if it was lost. **A busy server with thousands of connections in
> `TIME_WAIT` is working correctly**, and "fixing" it by lowering the timer or enabling
> `tcp_tw_recycle` (long since removed from Linux for being unsafe behind NAT) is a classic
> self-inflicted wound.
>
> **`CLOSE_WAIT` is your bug.** It means the peer sent FIN, the kernel told your application, and
> your application **never called `close()`**. The socket and its file descriptor are leaked. A
> growing `CLOSE_WAIT` count is a file-descriptor leak that will eventually hit `ulimit -n` and
> start failing every new connection.

```bash
ss -tan state close-wait
ss -tan state time-wait | wc -l
ulimit -n                                 # your fd limit
cat /proc/sys/net/ipv4/tcp_fin_timeout
```

## 29.7 Unix domain sockets: back inside the filesystem

Not everything needs the network. For two processes on the same machine, a **Unix domain socket**
gives you the socket API with a filesystem path instead of an address and port:

```bash
head -5 /proc/net/unix
ss -xl | head -10
ls -l /run/systemd/private /var/run/docker.sock 2>/dev/null
```

```
Num       RefCount Protocol Flags    Type St Inode Path
000000000d5a83dc: 00000003 00000000 00000000 0001 03   678
```

*(Verified.)* And here is the consequence that matters:

> **Unix domain sockets have a path, so Volume 2's nine permission bits apply to them.** Access
> control is filesystem access control. Which is exactly why:
>
> ```bash
> ls -l /var/run/docker.sock 2>/dev/null
> getent group docker 2>/dev/null
> ```
>
> `/var/run/docker.sock` is typically mode `660 root:docker`. **Membership of the `docker` group is
> equivalent to root**, because anyone who can talk to that socket can ask the daemon to run a
> container mounting `/` with full privileges. That's not a Docker bug — it's the socket's
> permissions being the *entire* authentication mechanism, exactly as Volume 2 §14.3's
> `/dev/sda`-and-the-`disk`-group case.

They're also **faster** than looping back through TCP — no checksums, no headers, no protocol
processing — which is why databases, `systemd`, D-Bus and container runtimes all use them for local
communication.

---

# Chapter 30 — SSH: Cryptography You Can Actually Look At

## 30.1 The hook

> **Until roughly 1996, the normal way to log into a remote Unix machine sent your password across
> the network in plaintext.** Not hashed. Not obfuscated. The actual characters, in a packet anyone
> on the path could read.
>
> **Everyone knew.** It wasn't a bug or an oversight — it was the protocol working as designed, and
> it persisted for twenty-five years because there was no practical alternative.
>
> **This chapter is about what replaced it, and how it works underneath — because Volume 4 §25's
> "32,768 possible keys" only becomes genuinely frightening once you know what a key *is*.**

## 30.2 THE PROBLEM: telnet and the `r` commands

Two families of tool, both fatally flawed in different ways.

**`telnet`** — a raw TCP connection to port 23, carrying a character stream in both directions. Your
username, your password, every command, and every byte of output, in the clear. **Anyone on any
network segment the packets crossed could read all of it.**

**The Berkeley `r` commands** — `rsh`, `rlogin`, `rcp` — tried to fix the password problem by
removing the password:

```
   ~/.rhosts       or      /etc/hosts.equiv

   trusted-host.example  alice
```

That file means: *"if a connection arrives from `trusted-host.example` claiming to be `alice`, log
her in with no password."*

> **The authentication is the source IP address and a claimed username.** That's it. And an IP source
> address is a field in a packet header that the sender fills in. It is a *statement*, not a *proof*.

So the `r` commands were vulnerable to IP spoofing, to DNS poisoning (Chapter 27 — poison the reverse
lookup and you *become* the trusted host), and to ARP spoofing (§26.6) on the local segment. And
because trust was transitive across a cluster, **compromising one machine in a trust web gave you
all of them.**

Both families still exist as packages, and looking at them is instructive:

```bash
apt-cache show telnet 2>/dev/null | grep -E '^(Package|Description)' 
apt-cache search '^rsh-' 2>/dev/null
```

## 30.3 THE INCIDENT that caused SSH: Helsinki, 1995

> **Confidence: high** on Ylönen, the institution, the year, and sniffing as the motivation;
> **moderate** on the adoption figures.

In early 1995, a **password-sniffing attack** was discovered on the network at **Helsinki University
of Technology**. Someone had compromised a machine and was capturing credentials from the plaintext
traffic crossing it — precisely the attack §30.2 makes trivial.

**Tatu Ylönen**, a researcher there, wrote a replacement. He released **SSH version 1 in July 1995**,
as free software with source code available.

Adoption was extraordinarily fast — reportedly tens of thousands of users across dozens of countries
within months. And the reason it spread so fast is worth naming, because it's a lesson about
security adoption in general:

> **SSH was a drop-in replacement.** `ssh` where you typed `rsh`. `scp` where you typed `rcp`. Same
> arguments, same workflow, same muscle memory. Nobody had to change how they worked, and nobody had
> to be persuaded of anything.
>
> A cryptographically perfect tool requiring a new workflow would have been ignored. Chapter 31
> returns to this.

### SSH-1 → SSH-2 → OpenSSH

The history matters because it explains why your machine speaks "SSH-2" and refuses "SSH-1":

| Stage | What happened |
|---|---|
| **SSH-1**, 1995 | Ylönen's original. Worked, and had **real protocol flaws** — it used CRC-32 for integrity, which is an error-detecting code, not a cryptographic one. That enabled the *insertion attack* (Futoransky and Kargieman, 1998), and the CRC-32 compensation-attack detector added to mitigate it had its own remote-code-execution bug (CVE-2001-0144). |
| **SSH-2**, 1996–2006 | A ground-up redesign, standardised by the IETF (RFCs 4250–4254). Separate transport, authentication and connection layers; proper Diffie–Hellman key exchange; real MACs. **Not backward compatible, deliberately.** |
| **The licence fork**, 1999 | Ylönen founded SSH Communications Security and later releases became proprietary. **OpenBSD forked the last freely-licensed version** and produced **OpenSSH** — de Raadt, Friedl, Provos, Song and others. |

> **Confidence: high** on the SSH-2 redesign, the IETF standardisation and the OpenSSH fork from
> OpenBSD; **moderate** on the exact forked version number and the full early-developer list.

**SSH-1 support has been removed from OpenSSH entirely.** Check:

```bash
ssh -V
ssh -1 localhost 2>&1 | head -2       # "unknown option" — the protocol is gone
```

## 30.4 THE PROBLEM underneath: how do you agree a secret in public?

Encryption itself is the easy part. Symmetric ciphers — AES and friends — are fast, well understood,
and require **both parties to already share a key**.

Which is the entire difficulty:

> **You and a server you have never contacted need to agree on a shared secret key, by exchanging
> messages over a channel that an attacker is reading in full.**

That sounds impossible, and until 1976 essentially everyone assumed it was. Two separate
inventions solve two separate halves:

| Problem | Solution | What it gives you |
|---|---|---|
| agree a shared secret in public | **Diffie–Hellman key exchange** (1976) | **confidentiality** |
| prove you hold a private key without revealing it | **digital signatures** (RSA 1977, Ed25519 2011) | **authentication** |

SSH needs both, and uses them for different jobs. §30.5 and §30.6.

## 30.5 THE MECHANISM: Diffie–Hellman, with real numbers

The trick rests on a function that is **cheap forwards and expensive backwards**: modular
exponentiation. Computing `g^a mod p` is fast. Recovering `a` from `g^a mod p` is the **discrete
logarithm problem**, and for a large prime `p` nobody knows how to do it efficiently.

```
   PUBLIC, known to everyone including the attacker:  a large prime p, and a generator g

   ALICE                                                    BOB
   picks secret a                                           picks secret b
   computes A = g^a mod p
                        ──────  A  ──────►
                        ◄─────  B  ──────                   computes B = g^b mod p

   computes B^a mod p                                       computes A^b mod p
        = (g^b)^a = g^(ab)                                       = (g^a)^b = g^(ab)
                              ↓                     ↓
                        SAME SHARED SECRET, never transmitted
```

**The eavesdropper saw `p`, `g`, `A` and `B`** — and to get `g^(ab)` they need `a` or `b`, which
means solving the discrete logarithm.

Run it with numbers small enough to check by hand:

```bash
python3 -c "
p, g = 23, 5
a, b = 6, 15                      # the two secrets, never sent
A, B = pow(g,a,p), pow(g,b,p)     # what actually goes on the wire
print(f'  p={p}  g={g}   (public)')
print(f'  Alice secret a={a}  -> sends A = {g}^{a} mod {p} = {A}')
print(f'  Bob   secret b={b}  -> sends B = {g}^{b} mod {p} = {B}')
print(f'  Alice computes  B^a mod p = {B}^{a} mod {p} = {pow(B,a,p)}')
print(f'  Bob   computes  A^b mod p = {A}^{b} mod {p} = {pow(A,b,p)}')
print(f'  match: {pow(B,a,p) == pow(A,b,p)}')"
```

```
  p=23  g=5   (public)
  Alice secret a=6  -> sends A = 5^6 mod 23 = 8
  Bob   secret b=15 -> sends B = 5^15 mod 23 = 19
  Alice computes  B^a mod p = 19^6 mod 23 = 2
  Bob   computes  A^b mod p = 8^15 mod 23 = 2
  match: True
```

*(Verified.)* **The attacker saw 23, 5, 8 and 19. Both parties now hold 2.** With `p = 23` you could
brute-force `a` in a second. With a real prime you cannot:

```bash
python3 -c "
import secrets
# RFC 3526 group 14 — the actual 2048-bit prime SSH used for years
p = int('FFFFFFFFFFFFFFFFC90FDAA22168C234C4C6628B80DC1CD129024E088A67CC74'
        '020BBEA63B139B22514A08798E3404DDEF9519B3CD3A431B302B0A6DF25F1437'
        '4FE1356D6D51C245E485B576625E7EC6F44C42E9A637ED6B0BFF5CB6F406B7ED'
        'EE386BFB5A899FA5AE9F24117C4B1FE649286651ECE45B3DC2007CB8A163BF05'
        '98DA48361C55D39A69163FA8FD24CF5F83655D23DCA3AD961C62F356208552BB'
        '9ED529077096966D670C354E4ABC9804F1746C08CA18217C32905E462E36CE3B'
        'E39E772C180E86039B2783A2EC07A28FB5C55DF06F4C52C9DE2BCBF695581718'
        '3995497CEA956AE515D2261898FA051015728E5A8AACAA68FFFFFFFFFFFFFFFF',16)
g = 2
a, b = secrets.randbits(256), secrets.randbits(256)
A, B = pow(g,a,p), pow(g,b,p)
print(f'  prime size: {p.bit_length()} bits')
print(f'  shared secrets equal: {pow(B,a,p) == pow(A,b,p)}')
print(f'  secret (first 16 hex): {format(pow(B,a,p),\"x\")[:16]}...')"
```

```
  prime size: 2048 bits
  shared secrets equal: True
  secret (first 16 hex): d822777d50681174...
```

*(Verified.)* And now look back at §28.7's real handshake:

```
Server Temp Key: X25519, 253 bits
```

**X25519 is exactly this, on an elliptic curve instead of integers modulo a prime.** Same structure —
a hard one-way function, two secrets, one shared result — with much smaller keys for the same
security. Curve25519 is Daniel J. Bernstein's design.

> **"Temp" means ephemeral, and that's forward secrecy.** The key pair is generated for this one
> connection and destroyed afterwards. Record the encrypted traffic today, steal the server's
> long-term private key in five years, and you still cannot decrypt it — because the key that
> encrypted it was never stored anywhere.

**But Diffie–Hellman alone is not enough**, and this is important: it gives you a shared secret with
*whoever you actually talked to*. An attacker sitting in the middle can run DH with you *and*
separately with the server, and relay. **You need authentication as well**, which is §30.6 — and
it's why §30.8's host key check is not optional theatre.

## 30.6 How key-based authentication actually works

The common mental model — "the server encrypts a challenge with your public key and you decrypt it"
— is not what happens. The real mechanism is **signing**, and the difference matters.

```
   1. CLIENT →  "I'd like to authenticate as alice, using this public key: <blob>"

   2. SERVER →  looks in /home/alice/.ssh/authorized_keys
                is that key listed?   no  → reject
                                      yes → "go on then"

   3. CLIENT →  builds a message containing:
                   • the SESSION IDENTIFIER  (derived from the §30.5 key exchange
                     — unique to THIS connection)
                   • the username, the service name
                   • the public key and its algorithm
                SIGNS it with the PRIVATE key
                sends the signature

   4. SERVER →  verifies the signature using the PUBLIC key it already has
                valid → authenticated
```

Three properties fall out, and each one closes an attack:

| Property | Consequence |
|---|---|
| **The private key never leaves the client** | a compromised server learns nothing that lets it log in as you elsewhere |
| **The signature covers the session identifier** | it **cannot be replayed** on a different connection — a malicious server can't reuse it |
| The server needs only the public key | you can put your public key on machines you don't trust and lose nothing |

> **Now Volume 4 §25 becomes properly alarming.** An SSH key's entire security is that the private
> key is unguessable. If the private key came from a space of **32,768** possibilities, then:
>
> - an attacker generates **all 32,768** private keys for each (type, size, architecture)
> - and because **your public key is public by design**, matching your key to its private half is a
>   **table lookup**, not a search
>
> **That's why the 2008 bug was catastrophic rather than merely bad.** It didn't weaken the
> cryptography — the maths was untouched. It made the private key *enumerable*, which bypasses the
> cryptography entirely. And Debian's `openssh-server` package generates host keys automatically in
> its `postinst` (Volume 4 §21.6), so **every Debian server installed in that twenty-month window
> generated a weak host key without anyone touching a keyboard.**

## 30.7 Looking at a real key

```bash
ssh-keygen -t ed25519 -f /tmp/demokey -N '' -C 'volume 5 demo'
cat /tmp/demokey.pub
ssh-keygen -l -f /tmp/demokey.pub
```

*(Describing — no `ssh-keygen` on my test box. The wire format below **is** verified, by
construction.)*

```
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIK8f...truncated... volume 5 demo
256 SHA256:HxK9...  volume 5 demo (ED25519)
```

Three fields: algorithm, base64 blob, comment. **Decode the blob and the structure is visible:**

```bash
awk '{print $2}' /tmp/demokey.pub | base64 -d | xxd | head -4
```

The SSH wire format is dead simple — a 4-byte big-endian length, then that many bytes, repeated:

```bash
python3 - <<'PY'
import base64, struct, os
def s(b): return struct.pack('>I', len(b)) + b
blob = s(b'ssh-ed25519') + s(os.urandom(32))     # a real ed25519 pubkey is 32 bytes
print(f"  total blob: {len(blob)} bytes = 4 + 11 + 4 + 32")
print(f"  base64:     {len(base64.b64encode(blob))} chars")
off = 0
while off < len(blob):
    n = struct.unpack('>I', blob[off:off+4])[0]; off += 4
    f = blob[off:off+n]; off += n
    print(f"    {n:>3}-byte field: {f.decode() if n < 20 else f.hex()[:32]+'...'}")
PY
```

```
  total blob: 51 bytes = 4 + 11 + 4 + 32
  base64:     68 chars
     11-byte field: ssh-ed25519
     32-byte field: 810e8867ab7a25a2548cc8c24ab72da3...
```

*(Verified.)* **An entire Ed25519 public key is 32 bytes.** Compare a 4096-bit RSA key, which is
over 500 bytes of base64.

> **And here's a detail that falls straight out of the format: every Ed25519 SSH public key on Earth
> begins with the same 24 base64 characters — `AAAAC3NzaC1lZDI1NTE5AAAA`.** The first 18 bytes of the
> blob are the fixed length prefix, the literal string `ssh-ed25519`, and the start of the next
> length prefix — all constant. Only what follows is your key. *(Verified by construction.)*
>
> Which is why you can recognise a key type at a glance: `AAAAB3NzaC1yc2E` is RSA,
> `AAAAC3NzaC1lZDI1NTE5` is Ed25519.

**And the private key contains the public key**, so the `.pub` file is a convenience, not a backup:

```bash
ssh-keygen -y -f /tmp/demokey                    # derive the PUBLIC key from the PRIVATE one
diff <(ssh-keygen -y -f /tmp/demokey) <(cut -d' ' -f1,2 /tmp/demokey.pub) && echo "identical"
rm -f /tmp/demokey /tmp/demokey.pub
```

### Which key type to use

| Type | Basis | Verdict |
|---|---|---|
| **Ed25519** | Curve25519 (Bernstein) | **use this.** 32-byte keys, fast, deterministic signatures, no suspect parameters |
| RSA ≥ 3072 | integer factoring | fine; large keys, slower, still universally supported |
| ECDSA | NIST curves P-256/384/521 | works, but the curve parameters' provenance is distrusted by some cryptographers |
| **DSA** | | **removed from OpenSSH.** 1024-bit only, and catastrophically broken by any nonce reuse |

> **Confidence: high** that Ed25519 is the current recommendation and that DSA has been removed from
> OpenSSH.

```bash
ssh -Q key                    # key types your client supports
ssh -Q kex                    # key exchange algorithms
ssh -Q cipher                 # symmetric ciphers
```

## 30.8 Host keys, and the warning you shouldn't dismiss

§30.5 noted that Diffie–Hellman alone doesn't stop a machine-in-the-middle. **Host keys are what
does** — and the trust model is called **TOFU**: Trust On First Use.

```bash
ls -l /etc/ssh/ssh_host_*
sudo ssh-keygen -l -f /etc/ssh/ssh_host_ed25519_key.pub 2>/dev/null
cat ~/.ssh/known_hosts 2>/dev/null | head -3
```

The first time you connect, `ssh` asks:

```
The authenticity of host 'server (192.0.2.10)' can't be established.
ED25519 key fingerprint is SHA256:HxK9tR...
Are you sure you want to continue connecting (yes/no/[fingerprint])?
```

Say yes and the key goes into `~/.ssh/known_hosts`. From then on it's checked every time — and if it
changes:

```
@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
@    WARNING: REMOTE HOST IDENTIFICATION HAS CHANGED!     @
@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
IT IS POSSIBLE THAT SOMEONE IS DOING SOMETHING NASTY!
```

> **That warning means exactly one of two things**, and they are very different:
>
> 1. **The server was legitimately rebuilt or reinstalled**, generating new host keys. Common, and
>    boring.
> 2. **Someone is intercepting your connection**, presenting their own key so they can decrypt,
>    read and re-encrypt everything — including your password if you're using one.
>
> **You cannot tell which from the warning.** The correct response is to verify the fingerprint out
> of band — from the server's console, from your provisioning system, from a colleague — and *then*
> remove the old entry. Blindly running `ssh-keygen -R host` to make the warning go away is exactly
> the behaviour the warning exists to prevent.

**TOFU's weakness is the *first* connection**, which is unauthenticated. Three ways to close it:

```bash
ssh-keyscan -t ed25519 github.com 2>/dev/null      # fetch a key — still TOFU, just earlier
dig +short SSHFP github.com                         # host key fingerprint IN DNS (needs DNSSEC to mean anything)
grep -i 'cert-authority' ~/.ssh/known_hosts 2>/dev/null
```

**SSH certificates** are the proper fix at scale: a CA signs host keys, clients trust the CA once, and
new servers are trusted immediately with no prompt and no `known_hosts` churn. Same idea as TLS
(§28.7), applied to SSH.

## 30.9 The Debian specifics

```bash
dpkg -l openssh-server openssh-client 2>/dev/null | tail -3
systemctl is-active ssh sshd 2>/dev/null
```

**Debian does not install an SSH server by default** on a desktop install. Nothing is listening on
port 22 unless you asked for it — verify with §29.4's tooling:

```bash
ss -tlnp | grep ':22 ' || echo "nothing listening on 22"
```

If you do install it, three Debian choices are worth knowing:

**1. Host keys are generated by the package's `postinst`.**

```bash
ls -l /etc/ssh/ssh_host_*
sudo cat /var/lib/dpkg/info/openssh-server.postinst 2>/dev/null | grep -i -A3 keygen | head
```

That's Volume 4 §21.6's maintainer script, and it's the mechanism by which the 2008 OpenSSL bug
(§30.6) produced weak host keys on every affected installation automatically.

**2. `PermitRootLogin` is restricted.**

```bash
sudo grep -iE '^\s*PermitRootLogin' /etc/ssh/sshd_config /etc/ssh/sshd_config.d/* 2>/dev/null
sudo sshd -T 2>/dev/null | grep -i permitrootlogin
```

Debian ships **`prohibit-password`**, which allows root login by *key* but never by password. Combined
with Volume 2 §11.4's locked root account, remote root password login is doubly impossible.

> **`sshd -T` is the command to trust**, not the config file. It prints the **fully resolved**
> configuration including defaults and drop-ins, which is the only way to be sure what's actually in
> effect.

**3. Drop-in configuration.**

```bash
ls /etc/ssh/sshd_config.d/ 2>/dev/null
grep -i '^Include' /etc/ssh/sshd_config 2>/dev/null
```

Same pattern as Volume 4 §21's `/etc/sudoers.d` and `/etc/apt/sources.list.d` — put your changes in
a drop-in file and package upgrades will never fight you over `sshd_config`.

**And if you enable it, the three settings that matter most:**

```
PasswordAuthentication no        # keys only — closes brute-forcing entirely
PermitRootLogin no
KbdInteractiveAuthentication no  # also close the PAM-based password path
```

```bash
sudo sshd -t                     # SYNTAX CHECK before restarting — the visudo lesson again
sudo systemctl reload ssh
```

> **Test the config before restarting.** `sshd -t` is to `sshd_config` what `visudo` is to sudoers
> (Volume 2 §11.5) and `findmnt --verify` is to fstab (Volume 3 §17.5). A broken `sshd_config` on a
> remote machine with no console access is unrecoverable. **And keep your existing session open**
> while you test a new one.

---

# Chapter 31 — The Incident, in Three Acts

The story of SSH is unusually complete: a problem that was fatal, a fix that genuinely worked, and a
reminder that working perfectly at the protocol level doesn't make software correct.

## 31.1 Act I — 1988: trusted-host authentication was already broken

> **Confidence: high** on the event, the date and the mechanisms; **moderate** on the machine
> counts, which vary between sources.

On **2 November 1988**, **Robert Tappan Morris**, a Cornell graduate student, released a
self-propagating program onto the internet. The **Morris Worm** used three vectors:

| Vector | What it exploited |
|---|---|
| a `sendmail` DEBUG mode left enabled in shipped builds | a remote command interface |
| a `fingerd` buffer overflow via `gets()` | memory corruption |
| **`rsh` / `rexec` trust relationships plus weak passwords** | **§30.2's `.rhosts` model** |

That third vector is the one for this chapter. **The worm read `/etc/hosts.equiv` and `.rhosts`
files, learned which machines trusted the current one, and walked the trust graph.** No exploit
needed — it was using the authentication system exactly as designed.

It reached roughly **6,000 of the internet's ~60,000 machines** — about ten percent. The damage came
from a bug in the worm itself: its check for "am I already running here" had a deliberate
one-in-seven chance of ignoring the answer, so hosts got reinfected until they were unusable.

**Consequences:** **CERT/CC** was founded at Carnegie Mellon within weeks, and Morris became the
first person convicted under the US Computer Fraud and Abuse Act.

> **The lesson available in 1988 was that IP-address-plus-claimed-username is not authentication.**
> It took another seven years and Act II before anyone built the replacement.

## 31.2 Act II — 1994: the sniffing attacks

> **Confidence: moderate-high** on the CERT advisory and the general facts; **moderate** on the
> scale, which CERT described qualitatively rather than precisely.

In **February 1994**, CERT published advisory **CA-1994-01, "Ongoing Network Monitoring Attacks."**

Attackers had obtained root on machines at network-adjacent locations — universities and providers
carrying large volumes of transit traffic — and installed **packet sniffers**. Because `telnet`,
`rlogin` and `ftp` all send credentials in plaintext (§30.2), every login that crossed those hosts
was captured.

The advisory described the compromise as affecting a very large number of accounts, in the tens of
thousands or more.

**Three things made this qualitatively worse than a normal breach:**

1. **It was completely passive.** No exploit, no crash, no log entry. The attack was *reading*.
2. **The yield compounded.** Each captured credential gave access to another machine, from which to
   sniff more. Attackers moved outward from a few hosts to a large fraction of the academic internet.
3. **There was no defence available.** You could not tell users to stop using `telnet` — there was
   nothing else. The only advice CERT could give was "change all your passwords," which achieved
   nothing while the sniffers were still running.

**This is the environment Ylönen was in when he wrote SSH the following year** (§30.3). The Helsinki
incident was one instance of a global pattern.

### Act II's ending is unusually clean

Security stories in this book mostly end with mitigation. **This one ends with the problem being
solved and staying solved.**

Password sniffing on the wire — the attack that dominated network security for two decades — is
simply **not a thing any more** for SSH, and hasn't been for twenty-five years. Not "harder." Not
"mitigated." The encryption means there is nothing on the wire to capture, and the host key check
means there's nobody in the middle to capture it.

**Why it worked, when so many security improvements don't:**

| | |
|---|---|
| **Drop-in replacement** | `ssh` for `rsh`, `scp` for `rcp`. No workflow change, no persuasion needed |
| **Strictly better, not a trade-off** | you didn't give up anything to adopt it |
| **Free, with source** | it spread through the academic networks that were being attacked |
| **The alternative was indefensible** | there was no argument for plaintext once an option existed |

> **That combination is rare, and it's worth remembering when evaluating any security proposal:
> adoption is a property of the design, not of how right you are.**

## 31.3 Act III — 2024: and yet

> **Confidence: high** on the CVE, the date, Qualys, and the regression; **moderate** on exact
> Debian package versions.

On **1 July 2024**, the Qualys Research Team disclosed **CVE-2024-6387**, nicknamed
**"regreSSHion":** an **unauthenticated remote code execution as root** in OpenSSH's server.

**The mechanism** is about `LoginGraceTime` — the timer that disconnects a client which connects but
never authenticates. When it expires, `sshd` handles `SIGALRM`. And the handler called functions
that are **not async-signal-safe** — `syslog()`, which reaches `malloc()` and `free()`.

```
   A signal handler can fire at ANY instruction, including
   halfway through a heap operation in the main flow.

   If SIGALRM arrives at exactly the wrong moment, the handler's own
   malloc() re-enters a heap in an inconsistent state → corruption
   → and with enough precision, controlled corruption → code execution.
```

**And the name is the interesting part: this was a *regression*.** The identical bug had been
found and fixed in **2006** as CVE-2006-5051. It was **reintroduced in OpenSSH 8.5p1** (around
October 2020) when a directive guarding the vulnerable code was removed. It then sat there for
nearly four years.

| | |
|---|---|
| Affects | OpenSSH 8.5p1 – 9.7p1, on **glibc**-based Linux |
| Debian | **bookworm shipped 9.2p1 — affected**, fixed in a security update |
| Exploitation | **hard.** Qualys reported needing thousands of attempts and hours, and it depends on defeating ASLR |

```bash
ssh -V
dpkg -l openssh-server 2>/dev/null | tail -1
sudo sshd -T 2>/dev/null | grep -i logingracetime
```

### Why Act III belongs here

**Three honest points, and they're the ending the chapter needs:**

**1. Solving the protocol problem completely does not make the implementation correct.** SSH's
cryptography did its job perfectly. The bug was in signal handling — C, concurrency, and the heap.
The threat model that produced SSH is closed; the threat model that produces memory-safety bugs
never was.

**2. Fixed bugs come back.** A patch from 2006 was removed in 2020 by someone tidying up, and nobody
noticed for four years. **This is Volume 4 §25 in a different costume** — a change that looked
locally harmless, in security-critical code, with nobody reviewing it against the reason the code
existed. It is also the argument for regression tests that encode *why*, not just *what*.

**3. Compare Volume 2 §13's Baron Samedit.** `sudo`, ten years, unauthenticated local root, memory
corruption in C. `sshd`, four years, unauthenticated *remote* root, memory corruption in C. **Two of
the most-audited security-critical programs in existence, same failure class.** That is the strongest
practical argument for the memory-safe reimplementations now underway — not that C programmers are
careless, but that the very best of them, under the most scrutiny, still produce this.

> **And the pattern for the sixth time in this book.** Shellshock, Baron Samedit, ext4's silent
> write, Debian's weak keys, Kaminsky's DNS, and now regreSSHion: **something was assumed to
> guarantee a property it did not actually guarantee.** Here the assumption was that a signal handler
> could safely call `syslog()`. It cannot, it never could, and the code worked anyway for four years.

---

# TRY THIS ON YOUR MACHINE

Six things that make the network visible. **Everything marked verified was run while writing;** items
1 and 5 need tools my test box lacked and are marked accordingly. Nothing here changes your
configuration.

> **One flag:** item 1 uses `tcpdump`, which needs `sudo` and captures your own traffic. It's
> read-only and harmless, but you're looking at real packets — don't paste the output publicly
> without reading it.

---

## 1. Watch your own DNS query cross the wire

**Needs:** `sudo apt install tcpdump dnsutils`. *(Not run by me — no tcpdump on my test box.)*

```bash
# terminal 1 — start capturing
sudo tcpdump -n -i any -s0 'udp port 53' -c 6

# terminal 2 (or wait a moment then run this, then look back)
dig +short www.debian.org
```

**What you should see:** two packets per lookup — your query out, the answer back — with the query
name in plaintext, and the source port drawn from the ephemeral range.

**Why it's interesting:** you can read the domain you looked up, in the clear, and so can anyone
between you and your resolver. **Classic DNS is not encrypted and never was** — encryption of *page
content* by TLS says nothing about the *name*. Then compare:

```bash
sudo tcpdump -n -i any 'tcp port 853' -c 4 &     # DNS-over-TLS
resolvectl query www.debian.org 2>/dev/null      # if systemd-resolved with DoT is configured
```

Also notice the **ephemeral source port** changing on every query — that's Chapter 27's Kaminsky fix,
visible on the wire.

---

## 2. Measure every phase of one page load

**Needs:** `curl`. *(Verified.)*

```bash
cat > /tmp/cf.txt <<'EOF'
   DNS lookup ........... %{time_namelookup}s\n
   TCP connected ........ %{time_connect}s\n
   TLS handshake done ... %{time_appconnect}s\n
   first byte received .. %{time_starttransfer}s\n
   transfer complete .... %{time_total}s\n
   \n
   remote ............... %{remote_ip}:%{remote_port}\n
   HTTP version ......... %{http_version}\n
EOF

curl -s -o /dev/null -w '@/tmp/cf.txt' https://www.debian.org/
echo "--- and again, with DNS and TCP now warm ---"
curl -s -o /dev/null -w '@/tmp/cf.txt' https://www.debian.org/
rm -f /tmp/cf.txt
```

**What you should see:** cumulative timestamps. Subtract adjacent lines to get each phase. On my run
against `github.com`: DNS 20.6 ms, TCP 0.7 ms, **TLS 35.7 ms**, server 46.2 ms, transfer 13.2 ms,
total 116.5 ms.

**Why it's interesting:** it turns "the site is slow" into a diagnosis with an owner. **TLS cost
thirty times what TCP cost** — mostly computation, not round trips. And run it twice: the second run
shows DNS collapsing to near zero because your resolver cached it, which is Chapter 27's TTL doing
its job in front of you.

---

## 3. Find every listening socket, and the process behind each

**Needs:** `iproute2` (present by default). *(Kernel-table version verified.)*

```bash
echo "=== the friendly view ==="
sudo ss -tlnp

echo; echo "=== the raw kernel table it reads ==="
head -1 /proc/net/tcp
awk 'NR>1 && $4=="0A"' /proc/net/tcp

echo; echo "=== decoded by hand ==="
python3 - <<'PY'
import struct, socket
def dec(x):
    a,p = x.split(':')
    return f"{socket.inet_ntoa(struct.pack('<L',int(a,16)))}:{int(p,16)}"
for line in open('/proc/net/tcp').readlines()[1:]:
    f = line.split()
    if f[3] == '0A':
        print(f"  LISTEN on {dec(f[1]):<22} uid={f[7]:<6} inode={f[9]}")
PY
```

**What you should see:** the same sockets in both views. State `0A` is `LISTEN`; addresses are
little-endian hex; `0.0.0.0` means "any local address."

**Why it's interesting:** `ss` isn't doing anything you can't. It reads `/proc/net/tcp`, then scans
`/proc/*/fd/` for a matching `socket:[inode]` to name the process — which is why `ss -p` needs root
to see other users. **Anything listening on `0.0.0.0` is reachable from the network**; anything on
`127.0.0.1` is not. That distinction is the first thing to check when hardening a machine.

---

## 4. Watch a listening socket spawn a connected one

**Needs:** `nc` and **bash** (dash has no `/dev/tcp`). *(Verified.)*

```bash
nc -l -p 12345 >/dev/null &
sleep 0.4
exec 3<>/dev/tcp/127.0.0.1/12345
sleep 0.3
printf 'port 12345 = 0x%X\n\n' 12345

python3 - <<'PY'
import struct, socket
st = {1:'ESTABLISHED', 6:'TIME_WAIT', 8:'CLOSE_WAIT', 10:'LISTEN'}
def dec(x):
    a,p = x.split(':')
    return f"{socket.inet_ntoa(struct.pack('<L',int(a,16)))}:{int(p,16)}"
print(f"  {'LOCAL':<22} {'REMOTE':<22} STATE")
for line in open('/proc/net/tcp').readlines()[1:]:
    f = line.split()
    if '3039' in (f[1]+f[2]).upper():
        print(f"  {dec(f[1]):<22} {dec(f[2]):<22} "
              f"{st.get(int(f[3],16),f[3])}  inode={f[9]}")
PY

exec 3<&-; kill %1
```

**What you should see** *(this is my actual verified output)*:

```
  0.0.0.0:12345          0.0.0.0:0              LISTEN        inode=964
  127.0.0.1:56434        127.0.0.1:12345        ESTABLISHED   inode=966
  127.0.0.1:12345        127.0.0.1:56434        ESTABLISHED   inode=965
```

**Why it's interesting:** **three separate socket objects with three separate inodes.** The listening
socket has a *two*-tuple and never carries data; the two connected sockets have full *four*-tuples
and are mirror images. **This is why ten thousand clients can all be "on port 80"** — the port is
shared, the four-tuple is unique. And the client's source port (56434) came from the ephemeral range
in `/proc/sys/net/ipv4/ip_local_port_range`.

---

## 5. Take an SSH key apart

**Needs:** `openssh-client`. *(The wire-format decode is verified by construction; the `ssh-keygen`
calls are not — no `ssh-keygen` on my test box.)*

```bash
ssh-keygen -t ed25519 -f /tmp/demokey -N '' -C 'volume 5 demo'
cat /tmp/demokey.pub
ssh-keygen -l -f /tmp/demokey.pub

echo; echo "=== the public key is only 32 bytes of actual key ==="
awk '{print $2}' /tmp/demokey.pub | base64 -d | xxd

echo; echo "=== the private key CONTAINS the public key ==="
ssh-keygen -y -f /tmp/demokey
diff <(ssh-keygen -y -f /tmp/demokey) <(cut -d' ' -f1,2 /tmp/demokey.pub) \
  && echo "  identical — the .pub file is a convenience, not a backup"

echo; echo "=== compare against RSA ==="
ssh-keygen -t rsa -b 4096 -f /tmp/demorsa -N '' -q
echo "  ed25519 pubkey: $(wc -c < /tmp/demokey.pub) bytes"
echo "  rsa-4096 pubkey: $(wc -c < /tmp/demorsa.pub) bytes"

rm -f /tmp/demokey /tmp/demokey.pub /tmp/demorsa /tmp/demorsa.pub
```

**What you should see:** the base64 decodes to **51 bytes** — a 4-byte length, the string
`ssh-ed25519`, another 4-byte length, and **32 bytes of key.** And `ssh-keygen -y` reproduces the
public key exactly from the private one.

**Why it's interesting:** the whole of an Ed25519 public key is 32 bytes, versus ~700 for RSA-4096.
Because the format's first 18 bytes are constant, **every Ed25519 SSH key begins with the same 24
base64 characters, `AAAAC3NzaC1lZDI1NTE5AAAA`** — which is how you identify a key type at a glance.
And the private key containing the public one is why losing the `.pub` file costs you nothing.

---

## 6. Debian-specific: audit your network exposure

**Needs:** `sudo`. Nothing here changes anything.

```bash
echo "=== is anything listening on a network interface at all? ==="
sudo ss -tlnp | awk 'NR==1 || $4 !~ /^(127\.|\[::1\])/'

echo; echo "=== which resolver stack am I actually on? ==="
grep '^hosts:' /etc/nsswitch.conf
ls -l /etc/resolv.conf
systemctl is-active systemd-resolved 2>/dev/null || echo "  systemd-resolved: not running"
systemctl is-active NetworkManager systemd-networkd networking 2>/dev/null

echo; echo "=== net-tools should NOT be installed ==="
command -v ifconfig netstat route arp 2>/dev/null || echo "  correct — iproute2 only"

echo; echo "=== is an SSH server running, and how is it configured? ==="
dpkg -l openssh-server 2>/dev/null | tail -1
sudo sshd -T 2>/dev/null | grep -iE '^(permitrootlogin|passwordauthentication|port|logingracetime|pubkeyauthentication)'

echo; echo "=== my host keys, and when were they generated? ==="
sudo ls -l --time-style=long-iso /etc/ssh/ssh_host_*_key.pub 2>/dev/null
for k in /etc/ssh/ssh_host_*_key.pub; do [ -f "$k" ] && sudo ssh-keygen -l -f "$k"; done 2>/dev/null

echo; echo "=== whose certificate authorities do I trust, and who shipped them? ==="
ls /usr/share/ca-certificates/mozilla/ | wc -l
dpkg -S /etc/ssl/certs/ca-certificates.crt
ls /usr/local/share/ca-certificates/ 2>/dev/null
```

**What you should see:** on a fresh desktop install, probably **nothing listening on a non-loopback
address at all**, no `net-tools`, no `openssh-server`, and a `ca-certificates` package supplying
100-plus trusted CAs.

**Why it's interesting:** the first block is your entire network attack surface in one command. The
`sshd -T` output is the *resolved* configuration including defaults and drop-ins — the file alone
will lie to you. And the last block is a fact worth sitting with: **the set of certificate
authorities your machine trusts arrives via `apt`**, which means your TLS trust decisions ultimately
rest on Debian's archive signing keys (Volume 4 §23.6). Chains of trust go further down than people
expect.

---

# Volume 5 Retrospective

**1. Layering exists because nobody is in charge.** Four layers, four kinds of address, each blind to
the one below. Layer-2 addresses change at every hop; layer-3 addresses don't change at all. That's
why inventing wifi didn't require rewriting every program.

**2. The netmask exists to answer one question**: is this destination on my segment, or does it go to
a router? The kernel computes `(dest & mask) == (mine & mask)`, and **`ip route get <addr>` asks it
to show you the answer** — the most useful and least known networking command.

**3. Debian dropped `net-tools` for a reason, not for fashion.** `ifconfig` cannot express multiple
addresses per interface, policy routing, namespaces or IPv6 properly. `iproute2` talks netlink;
`ifconfig` shows you a lossy summary. And your interfaces are named `enp0s31f6` because `eth0`
assignment was nondeterministic across boots.

**4. Thirteen root servers work because of delegation plus caching.** The root doesn't know where
`www.debian.org` is — it knows who to ask. And the thirteen is a fossil of the 512-byte UDP limit,
each one now anycast to hundreds of machines.

**5. `dig` and `getent hosts` answer different questions.** `getent` walks the NSS stack and sees
`/etc/hosts`; `dig` talks DNS directly and doesn't. When they disagree, that's the bug — not a broken
resolver.

**6. Kaminsky didn't break DNS's crypto; DNS never had any.** The 16-bit transaction ID was
collision avoidance being used as a security control. What he found was how to make retries *free*,
by attacking names that were never cached and stealing the whole zone via the additional-records
section. Source port randomisation made guessing ~65,000 times harder and fixed nothing underneath.

**7. The full trace is measurable in one command**, and it turns "slow" into a diagnosis. On my run:
DNS 18% of the total, TCP under a millisecond, **TLS thirty times the TCP cost** — mostly
computation — and server processing the largest single phase.

**8. A listening socket is not a connected socket.** Verified in the kernel's own table: three
distinct socket objects with three distinct inodes, a two-tuple for the listener and mirrored
four-tuples for the pair. **The port is shared; the four-tuple is unique** — which is the entire
answer to how ten thousand connections coexist on port 80.

**9. Sockets have inodes, and that inode is the join key.** `/proc/net/tcp` gives you `inode=818`;
`/proc/PID/fd/3` gives you `socket:[818]`. That join is all `ss -p` and `lsof -i` are doing, and it
closes Volume 3's file-descriptor loop for the object Volume 3 said was the exception.

**10. `TIME_WAIT` is healthy; `CLOSE_WAIT` is your bug.** They look alike and mean opposite things.
Thousands of `TIME_WAIT` is a server working correctly. Growing `CLOSE_WAIT` is an application that
never called `close()`, leaking descriptors until `ulimit -n` stops it.

**11. Diffie–Hellman is checkable by hand, and X25519 is the same idea on a curve.** With `p=23`,
`g=5`, secrets 6 and 15, both sides reach 2 while the wire carried only 8 and 19. "Server Temp Key"
in a real handshake means ephemeral — which is forward secrecy, and it's why stealing a server key
next year doesn't decrypt today's traffic.

**12. SSH key auth is signing, not decryption** — over a blob containing the session identifier, so
it cannot be replayed. Which is why Volume 4 §25 was fatal: the maths was untouched, but a private
key drawn from 32,768 possibilities is *enumerable*, and since your public key is public by design,
matching it is a **table lookup**.

**13. Act II ended cleanly, and that's rare.** Password sniffing on the wire — the dominant network
attack for two decades — is simply not a thing any more. It worked because SSH was a **drop-in
replacement** that was strictly better and free with source. **Adoption is a property of the design,
not of how right you are.**

**14. And Act III is the honest ending.** regreSSHion (2024) was unauthenticated remote root in
`sshd`, from a bug fixed in 2006 and reintroduced in 2020. Alongside Volume 2's Baron Samedit,
that's two of the most-audited security programs in existence failing the same way: memory
corruption in C. Solving the protocol problem completely doesn't make the implementation correct.

---

# Volume 5 is ready

**File: `volume-5-networking.md`**

## What Volume 6 will cover: THE BOOT PROCESS, DEEPLY

Volume 5 kept referring forward to systemd — socket activation in §29.3, `systemd-resolved` in
§27.4, service management in §30.9 — without explaining what it is. Volume 6 does, and it starts
from the moment you press the power button.

- **Your own install, explained**: UEFI firmware → the ESP you found in Volume 3 §17.3 → GRUB →
  kernel → **initramfs** → `systemd` → login. Including *why* initramfs exists, which Volume 3
  §16.5 already used to explain the usr-merge without justifying.
- **LUKS**, and the chicken-and-egg problem at its heart: the tool that decrypts your disk has to
  live somewhere that isn't encrypted. What LUKS is doing at each stage, why the key derivation
  function matters, and why `/boot` is (or isn't) separate on your machine.
- **systemd**: what problem it was built to solve versus SysVinit — parallel startup, dependency
  ordering, socket activation (§29.3's elegant privilege trick), cgroup-based process tracking
  rather than PID files (Volume 2 §12.2's PID-reuse hazard, finally addressed), and why
  `journalctl` replaced text log files.
- **And the systemd controversy, covered honestly.** Volume 4 §20.5 mentioned the 2014 Technical
  Committee vote and the General Resolutions that followed, and promised the substance here. It's a
  genuinely interesting engineering *and* governance argument with real points on both sides, and
  it deserves better than either of the usual caricatures.
- **TRY THIS ON YOUR MACHINE** — including finding what's actually slowing your boot down, reading
  your own LUKS header, and watching the dependency graph systemd computed at startup.

Say **continue** when you'd like Volume 6.

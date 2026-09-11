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


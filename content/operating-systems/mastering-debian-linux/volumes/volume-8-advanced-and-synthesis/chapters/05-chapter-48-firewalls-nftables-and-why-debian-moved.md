# Chapter 48 — Firewalls: `nftables`, and Why Debian Moved

## 48.1 The hook

> **`iptables` worked for twenty years and everyone knows it. Debian's `iptables` command still
> exists and still accepts the same syntax.**
>
> **But it no longer talks to the same kernel code — and hasn't since Debian 10.**

## 48.2 The lineage

> **Confidence: moderate-high** on the sequence and the people; **moderate** on exact years.

| Era | Tool | Kernel |
|---|---|---|
| ~1996 | `ipfwadm` | Linux 2.0 — derived from BSD's `ipfw` |
| ~1999 | `ipchains` | Linux 2.2 — **Rusty Russell** |
| **~2000** | **`iptables` / netfilter** | Linux 2.4 — Russell again |
| **2014** | **`nftables`** | Linux 3.13 — **Pablo Neira Ayuso** |

**netfilter** is the kernel framework: a set of **hook points** in the network stack where packets
can be inspected. `iptables` and `nftables` are two different userspace-and-rule-engine designs
against the same hooks:

```
                     ┌───────────┐
   packet in ───────►│PREROUTING │──┬──► INPUT ──► local process
                     └───────────┘  │
                                    └──► FORWARD ──┐
                                                   ▼
   local process ──► OUTPUT ────────────────► POSTROUTING ───► packet out
```

Those five hook names are unchanged from `iptables` to `nftables` — the framework survived; the rule
engine was replaced.

## 48.3 THE PROBLEM: five things wrong with `iptables`

**1. Four tools, four duplicated kernel implementations.**

```
   iptables   → IPv4        ip6tables → IPv6
   arptables  → ARP         ebtables  → bridging
```

Each had **its own kernel code** performing substantially the same matching. A new feature had to be
written four times, and a rule for IPv4 and IPv6 had to be written twice — which is exactly how
firewalls end up accidentally open on IPv6.

**2. Rule updates were neither atomic nor cheap.** Adding one rule meant userspace **downloading the
entire table, modifying it, and uploading the whole thing back**. On a table with tens of thousands
of rules that is slow, and there's a window during which the ruleset is partially applied.

**3. Every new match type needed a kernel module.** Matching on some new packet field meant writing,
shipping and loading an `xt_*` kernel module. The extension surface grew without bound.

**4. No native sets.** Matching 1,000 addresses meant **1,000 rules, checked linearly, per packet**.
`ipset` existed as a bolt-on precisely because this was untenable.

**5. Inconsistent syntax** across the four tools, with matches whose behaviour differed subtly.

## 48.4 THE MECHANISM: what nftables changed

| Problem | nftables' answer |
|---|---|
| four tools | **one tool (`nft`), one subsystem**, with *families*: `ip`, `ip6`, **`inet`** (both at once), `arp`, `bridge`, `netdev` |
| non-atomic updates | **transactions** — a ruleset either applies completely or not at all |
| a module per match | **a bytecode VM in the kernel**, like BPF. New matches are new *bytecode*, not new kernel code |
| no sets | **native sets and maps**, with hash or interval lookup |
| inconsistent syntax | one grammar |

> **The bytecode VM is the architectural change.** `nft` compiles your rules into instructions for a
> small kernel virtual machine. Adding a match type becomes a userspace concern — which is why
> `nftables` gained features rapidly while `iptables` had stalled.

And the `inet` family is the practical one:

```
table inet filter { ... }     # ONE table covering IPv4 and IPv6
```

That alone removes the most common real-world firewall bug.

## 48.5 Debian's transition

> **Confidence: high.** Debian 10 (buster) switched the default `iptables` command to the
> **`iptables-nft`** backend — a compatibility layer accepting iptables syntax and programming
> nftables underneath.

```bash
iptables -V
update-alternatives --display iptables
ls -l /usr/sbin/iptables
```

```
iptables v1.8.9 (nf_tables)
```

**`(nf_tables)` versus `(legacy)`** is the tell. Your `iptables` commands work; they just produce
nftables rules. Which you can see:

```bash
sudo nft list ruleset
sudo iptables -L -n -v
```

> **A genuine trap that follows:** rules added via `iptables-nft` and rules added via `nft` live in
> the same kernel subsystem but **`iptables -L` will not show you native nft rules.** On a machine
> where both have been used, `iptables -L` shows an incomplete picture. **`nft list ruleset` is the
> authoritative view.** Always check that one before concluding a machine has no firewall.

Debian's shipped service loads a plain config file:

```bash
systemctl status nftables 2>/dev/null
cat /etc/nftables.conf 2>/dev/null
```

## 48.6 A rule you can verify — safely

> ⚠ **FLAGGED, as promised.** Firewall rules can lock you out of a machine, and a mistake on a
> remote host is unrecoverable without console access. **So the first demonstration below runs
> entirely inside a network namespace (§46.4), where the blast radius is exactly zero** — the
> ruleset lives in that namespace and vanishes when the shell exits.

### The safe version

```bash
sudo unshare --net bash -c '
    ip link set lo up
    nft add table inet demo
    nft add chain inet demo input "{ type filter hook input priority 0; policy accept; }"

    echo "--- before the rule ---"
    ping -c1 -W1 127.0.0.1 | tail -2

    nft add rule inet demo input ip daddr 127.0.0.1 icmp type echo-request counter drop

    echo "--- after the rule ---"
    ping -c1 -W1 127.0.0.1 | tail -2

    echo "--- the ruleset, with its counter ---"
    nft list ruleset
'
echo "host ruleset, untouched:"; sudo nft list ruleset | head -5
```

*(Describing — no `nft` on my test box. **The `unshare --net` isolation itself is verified**, §46.4.)*

You should see the ping succeed, then fail, and the rule's `counter` showing exactly one packet
dropped — and the host's ruleset unchanged, because the namespace had its own.

> **`counter` is the feature to remember.** Attach it to any rule and nftables tallies packets and
> bytes matching it. **The way to find out whether a rule is doing anything is to count**, rather
> than reasoning about ordering.

### The real version, with an undo plan

If you want a rule on the host, do it in a **separate table** so cleanup is scoped and cannot touch
anything else:

```bash
# 1. SAVE the current state first
sudo nft list ruleset > /tmp/ruleset-backup.nft

# 2. add an isolated table
sudo nft add table inet mytest
sudo nft add chain inet mytest output '{ type filter hook output priority 0; policy accept; }'
sudo nft add rule inet mytest output ip daddr 192.0.2.1 counter drop   # TEST-NET-1, routes nowhere

# 3. verify
ping -c1 -W1 192.0.2.1; echo "exit: $?"
sudo nft list table inet mytest

# 4. REMOVE — deletes only this table
sudo nft delete table inet mytest
sudo nft list ruleset
```

> **Three habits that make firewall work survivable:**
> 1. **Back up the ruleset before touching it.** `nft list ruleset > file`, restore with
>    `nft -f file`.
> 2. **Use your own table**, so `delete table` is a complete, scoped undo.
> 3. **On a remote machine, set a dead-man's switch first**, so a mistake heals itself:
>    ```bash
>    sudo systemd-run --on-active=5min --unit=fw-rollback \
>         nft -f /tmp/ruleset-backup.nft
>    ```
>    That's Volume 7 §42.8's transient timer used as an insurance policy. Cancel it with
>    `systemctl stop fw-rollback.timer` once you've confirmed you still have access.

A realistic host ruleset, for reference:

```
#!/usr/sbin/nft -f
flush ruleset

table inet filter {
    chain input {
        type filter hook input priority 0; policy drop;

        ct state established,related accept       # replies to things we started
        ct state invalid drop
        iif lo accept                             # loopback always
        ip protocol icmp accept                   # and icmpv6 for IPv6 — mandatory
        ip6 nexthdr icmpv6 accept
        tcp dport 22 ct state new limit rate 10/minute accept
        counter                                   # count what falls through to DROP
    }
    chain forward { type filter hook forward priority 0; policy drop; }
    chain output  { type filter hook output  priority 0; policy accept; }
}
```

> **`ct state established,related accept` as the first rule is what makes a default-drop policy
> usable at all** — it's connection tracking, and it's why you don't need a rule for every reply
> packet. And **never drop ICMPv6**: IPv6 depends on it for neighbour discovery and path MTU
> discovery, so a firewall that blocks it produces the worst kind of failure — intermittent and
> size-dependent.

And Debian's friendlier front-ends, both of which generate nftables underneath:

```bash
apt-cache show ufw firewalld 2>/dev/null | grep -E '^(Package|Description:)' | head -4
sudo ufw status verbose 2>/dev/null
```

## 48.7 Hardening that isn't a firewall

A firewall controls packets. Most of the useful hardening on a single-user laptop isn't about
packets at all, and this book has already covered nearly all of it:

```bash
echo "=== what is even listening? (Volume 5 §29.5) ==="
sudo ss -tlnp | awk 'NR==1 || $4 !~ /^(127\.|\[::1\])/'

echo "=== sysctl network hardening (Volume 2 §12.7's debt) ==="
sysctl net.ipv4.conf.all.rp_filter net.ipv4.tcp_syncookies \
       net.ipv4.conf.all.accept_redirects net.ipv4.ip_forward 2>/dev/null

echo "=== the symlink protections Volume 3 §19.7 said to CHECK ==="
sysctl fs.protected_symlinks fs.protected_hardlinks fs.protected_fifos 2>/dev/null

echo "=== kernel pointer exposure, and BPF ==="
sysctl kernel.kptr_restrict kernel.dmesg_restrict kernel.unprivileged_bpf_disabled 2>/dev/null

echo "=== mount options (Volume 3 §17.7) ==="
findmnt -no TARGET,OPTIONS /tmp /home /var 2>/dev/null | grep -E 'nosuid|noexec|nodev' \
  || echo "  none of /tmp /home /var use nosuid/noexec/nodev"

echo "=== AppArmor (Debian ships it enabled) ==="
sudo aa-status 2>/dev/null | head -5
```

Set them persistently the usual way — a drop-in, for the seventh time in this book:

```bash
sudo tee /etc/sysctl.d/99-local-hardening.conf >/dev/null <<'EOF'
net.ipv4.conf.all.accept_redirects = 0
net.ipv4.conf.all.send_redirects = 0
net.ipv4.tcp_syncookies = 1
fs.protected_symlinks = 1
fs.protected_hardlinks = 1
kernel.kptr_restrict = 1
EOF
sudo sysctl --system
```

> **On a laptop with nothing listening on a non-loopback address, a packet firewall protects against
> very little** — there is nothing for a packet to reach. The higher-value work is Volume 3 §17.7's
> mount options, Volume 2 §11.8's setuid inventory, Volume 5's "what's listening," Volume 6 §36.8's
> persistent journal, and keeping the machine patched. Volume 7's `sysnap` reports on most of it
> weekly.

---


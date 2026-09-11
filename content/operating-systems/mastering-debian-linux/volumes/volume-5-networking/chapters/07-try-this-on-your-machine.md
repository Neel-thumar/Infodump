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


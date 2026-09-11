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


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


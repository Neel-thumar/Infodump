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


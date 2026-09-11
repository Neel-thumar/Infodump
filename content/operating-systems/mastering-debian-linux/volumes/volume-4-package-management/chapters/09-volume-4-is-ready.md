# Volume 4 is ready

**File: `volume-4-package-management.md`**

## What Volume 5 will cover: NETWORKING

Volume 4 downloaded packages over the internet, verified signatures, and talked about
`security.debian.org` without ever explaining what any of that means at the wire level. Volume 5
starts from the beginning.

- **A full end-to-end trace**: what actually happens between typing a URL and seeing a page — DNS
  resolution (including what `systemd-resolved` and `/etc/nsswitch.conf` do on Debian), ARP, the TCP
  handshake, TLS, and the HTTP request. Built as **one continuous trace you can follow with real
  tools**, not a list of protocols.
- **`ip`, `ss`, `ping`, `curl`, `dig`** — inspecting your own machine's actual network state, and
  why `ifconfig` and `netstat` are deprecated on Debian in favour of the `iproute2` suite.
- **Sockets and ports at the kernel level** — what "listening on port 80" concretely *is*, building
  directly on Volume 3 §14's socket exception and Volume 3 §18's file descriptors. You'll find every
  listening socket on your machine and identify the process behind each one.
- **SSH**: the security-driven origin story (Tatu Ylönen and a 1995 password sniffing incident at
  Helsinki University of Technology), why it displaced telnet and rsh so completely, and key-based
  authentication explained **from the asymmetric cryptography underneath** rather than as a recipe.
  Volume 4 §25's weak keys will make a great deal more sense afterwards.
- **The incident**: a verified case where plaintext protocols or an SSH-specific flaw caused real
  harm — researched and checked rather than assumed, as with the OpenSSL story.
- **TRY THIS ON YOUR MACHINE** — including watching your own DNS queries on the wire, finding what's
  listening and why, and inspecting an SSH key's actual mathematical structure.

Say **continue** when you'd like Volume 5.

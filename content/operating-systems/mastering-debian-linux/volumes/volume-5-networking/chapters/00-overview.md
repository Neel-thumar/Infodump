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


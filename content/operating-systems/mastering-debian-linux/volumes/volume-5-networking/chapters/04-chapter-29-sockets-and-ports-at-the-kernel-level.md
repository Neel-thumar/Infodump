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


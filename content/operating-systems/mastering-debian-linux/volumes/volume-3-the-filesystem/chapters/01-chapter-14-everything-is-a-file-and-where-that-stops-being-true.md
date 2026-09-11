# Chapter 14 — "Everything Is a File," and Where That Stops Being True

## 14.1 The hook

> **`/dev/null` has permission bits. `/proc/1234/environ` has an owner. You can `cat` a keyboard and
> `>` into a hard disk.**
>
> **Why would an operating system deliberately make a keyboard look like a text file?**

## 14.2 THE PROBLEM: how many interfaces should a system have?

Imagine designing an OS in 1970. Programs need to interact with:

- documents on disk
- terminals
- tape drives
- printers
- other programs
- the system's own state

The obvious approach — the approach most systems of the era took — is a **separate API for each**.
Reading a file uses one set of calls, reading a terminal uses another, writing to tape uses a third.
Each is tuned to its device.

The cost only becomes visible when you try to compose things:

```
   Want to send a program's output to a printer instead of a file?
        → rewrite the program, against the printer API.

   Want to feed one program's output into another?
        → invent an inter-program communication API, and rewrite both.

   Want a program to read from a terminal instead of a file?
        → a third code path.
```

**Every combination of source and destination needs its own code, in every program.** With *n*
kinds of thing, you have *n²* problems.

## 14.3 THE MECHANISM: one namespace, one small set of calls

Unix's answer was to make **almost everything reachable through a single hierarchical namespace**,
manipulated by a handful of system calls:

```
    open()   read()   write()   close()   lseek()   stat()
```

If your program reads from a file descriptor and writes to a file descriptor, **it does not need to
know what is behind them.** The *n*² problem collapses.

Look at the range of things this covers. The type character in `ls -l` is the top four bits of
`st_mode` (Volume 2 §10.3), rendered:

```bash
for f in /etc/passwd /etc /bin /dev/null /dev/sda /run/systemd/private; do
  [ -e "$f" ] && stat -c '%A  %-22F %n' "$f"
done
```

```
-rw-r--r--  regular file           /etc/passwd
drwxr-xr-x  directory              /etc
lrwxrwxrwx  symbolic link          /bin
crw-rw-rw-  character special file /dev/null
brw-rw----  block special file     /dev/sda
srwxrwxrwx  socket                 /run/systemd/private
```

*(Verified; your exact set will differ.)*

| Char | Type | Example |
|---|---|---|
| `-` | regular file | `/etc/passwd` |
| `d` | directory | `/etc` |
| `l` | symbolic link | `/bin` — that's the usr-merge, §16.5 |
| `c` | **character device** — byte stream | `/dev/null`, `/dev/random`, your terminal |
| `b` | **block device** — addressable blocks | `/dev/sda`, `/dev/nvme0n1` |
| `p` | **named pipe (FIFO)** | §14.4 |
| `s` | **socket** | `/run/systemd/private` |

### The three things this buys you

**1. Composability — this is Volume 1 §1.4's pipes, explained.** Volume 1 claimed that adding pipes
in 1973 required changing *zero* existing programs. This is why: those programs already read fd 0
and wrote fd 1 without asking what was behind them. Pipes just put something new behind them.

```bash
wc -l < /etc/passwd            # fd 0 is a FILE
ls /etc | wc -l                # fd 0 is a PIPE
wc -l                          # fd 0 is your TERMINAL (Ctrl+D to end)
```

**Same program, three completely different kinds of thing, no conditional code.**

**2. The permission model applies to everything, for free.** Volume 2 spent a chapter deriving nine
bits for files. Those same nine bits govern who may read your microphone:

```bash
ls -l /dev/null /dev/sda /dev/snd/* 2>/dev/null | head -5
```

```
crw-rw-rw- 1 root root    1, 3 Sep 10 07:00 /dev/null
brw-rw---- 1 root disk    8, 0 Sep 10 07:00 /dev/sda
```

`/dev/null` is `666` — anyone may write to it. `/dev/sda` is `660 root:disk` — **which is why being
in the `disk` group is equivalent to being root**, since you could read and rewrite the raw
filesystem. Volume 2 §11.8's "audit your privilege surface" should have included `getent group disk`.

**3. Kernel state becomes shell-scriptable.** `/proc` and `/sys` are entire filesystems that are not
backed by any disk. Volume 2 §12.7 covered `/proc`; here's its sibling:

```bash
cat /sys/class/power_supply/BAT0/capacity 2>/dev/null   # battery %
cat /sys/class/net/*/operstate                           # link up/down
cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_governor 2>/dev/null
ls /sys/class/
```

No API, no library, no bindings. `cat`.

### The two numbers on a device file

Notice `1, 3` and `8, 0` where a file size would be. Those are the **major** and **minor** device
numbers:

```bash
stat -c '%n: major=%t minor=%T (hex)' /dev/null /dev/zero /dev/random
```

- **Major** selects the *driver* in the kernel.
- **Minor** selects *which device* that driver should handle.

The file in `/dev` contains no data at all. It's a **name in the filesystem carrying a pair of
numbers**, which is how a name in a directory becomes a route into a driver.

## 14.4 A file that is a pipe: FIFOs

Volume 1's `|` creates an anonymous pipe that only the shell's children can see. A **named pipe** is
the same kernel object with a name in the filesystem, so unrelated programs can meet at it.

```bash
cd /tmp
mkfifo mypipe
ls -l mypipe
```

```
prw-r--r-- 1 vishal vishal 0 Sep 10 07:20 mypipe
```

**Type `p`.** Size 0 — there is no storage. Use it:

```bash
cat < /tmp/mypipe &          # blocks, waiting for a writer
sleep 0.5
echo "hello through a filesystem object" > /tmp/mypipe
rm /tmp/mypipe
```

```
hello through a filesystem object
```

Two unrelated processes just communicated, using `cat` and `echo` — programs with no IPC code
whatsoever — because the meeting point had a filename.

## 14.5 Where the abstraction leaks, honestly

"Everything is a file" is a slogan, and slogans are lossy. Three genuine exceptions:

### Sockets are not really files

You cannot `open("/some/tcp/connection")`. Network sockets require their own calls — `socket()`,
`bind()`, `listen()`, `connect()`, `accept()` — and only *after* that do you get a descriptor you can
`read()` and `write()`. Even Unix-domain sockets, which *do* have a filesystem path, cannot be
usefully `open()`ed; the path is a rendezvous point, not a file.

```bash
ls -l /run/systemd/private          # type 's' — it has a name
cat /run/systemd/private            # ...but you can't just read it
```

Volume 5 covers why networking needed its own API.

### `ioctl()` is the admission that it leaks

Some operations simply cannot be expressed as reading or writing bytes. "Rewind this tape." "Set
this terminal to 9600 baud." "Eject." So Unix added `ioctl()` — *I/O control* — a catch-all:

```
    ioctl(fd, REQUEST_NUMBER, argument)
```

You already used it. Volume 1 §2.3's line-discipline demo:

```bash
strace -e trace=ioctl stty -a 2>&1 | grep -c ioctl
```

`stty` is a thin wrapper around `ioctl()` on your terminal. Every `ioctl` request number is a
device-specific escape from the uniform interface — which is why `ioctl` is often described as the
place where Unix's elegance goes to hide.

### Plan 9 shows how far it *could* have gone

The same Bell Labs group — Rob Pike, Ken Thompson and others — later built **Plan 9 from Bell Labs**,
which took the idea seriously: network connections, the window system, process control, and even the
graphics display were all file hierarchies you could `cat` and `echo` into. Unix never went that far.

> **Confidence: high** that Plan 9 exists, came from the same group, and radicalised this principle.
> Linux borrowed pieces back — `/proc`, `/sys`, and the `9p` protocol (used by some VMs and by WSL2)
> are all Plan 9 influence.

> **The honest summary:** "everything is a file" is not literally true and never was. What *is* true,
> and what matters, is that **the default assumption is that a thing should be reachable by name in
> one hierarchy and manipulated with `read` and `write`** — and you need a reason to deviate. That
> default is why `cat`, `grep` and `>` work on a range of objects their authors never imagined.

---


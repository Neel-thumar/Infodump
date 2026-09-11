# Chapter 12 — Processes, Signals, and `/proc`

## 12.1 The hook

> Volume 1 §2.8 ended with a number nobody explained: **killing a background job gave `$?` = 143.**
>
> **What is 143, and why is it 128 + 15?**

Answering that properly requires understanding what a process actually is to the kernel.

## 12.2 What a PID is

A **PID** is an integer the kernel assigns to a process. Not a handle, not a pointer — a number,
allocated sequentially and wrapped when it hits a ceiling:

```bash
cat /proc/sys/kernel/pid_max
echo $$
sleep 1 & echo "next PID allocated: $!"
```

```
32768
4021
next PID allocated: 4022
```

*(Verified.)* `32768` is the traditional default; 64-bit systems often raise it to 4194304. When the
counter wraps, the kernel skips PIDs still in use — **PIDs are reusable, and that's a real hazard.**
If you record a PID, wait, and later signal it, you may hit a completely different process. It's why
`kill` on a stale PID from a script is dangerous, and why systemd tracks services by **cgroup** rather
than by PID (Volume 6).

Two PIDs are special:

| PID | What |
|---|---|
| **1** | **`init`** — on Debian, **systemd**. Started by the kernel; parent of everything. |
| 0 | the scheduler/idle task. Not a real process; never appears in `/proc`. |

```bash
ps -p 1 -o pid,comm,args
ls -l /sbin/init
```

```
  PID COMMAND         COMMAND
    1 systemd         /sbin/init
lrwxrwxrwx 1 root root 20 ... /sbin/init -> /lib/systemd/systemd
```

PID 1 is genuinely special in the kernel: **signals with default actions are not delivered to it
unless it has installed a handler**, so you cannot accidentally `kill -9 1` your way to an instant
halt. It's also where orphans go (§12.5).

## 12.3 The process tree

Every process except PID 1 has a **parent** — the process that `fork()`ed it (Volume 1 §2.6). That
makes the whole system a tree.

```bash
pstree -p | head -25              # needs: sudo apt install psmisc
ps -ef --forest | head -25
```

Find your own ancestry:

```bash
pstree -s -p $$
```

```
systemd(1)───gnome-terminal-(2841)───bash(4021)───pstree(4530)
```

**That is your entire lineage**, and it's the fork/exec chain from Volume 1 made visible: systemd
forked and exec'd your terminal; your terminal forked and exec'd bash; bash forked and exec'd
`pstree`.

Walk it by hand through `/proc`, which is the same information the tools are reading:

```bash
pid=$$
while [ "$pid" -ne 1 ]; do
    printf '%6s  %s\n' "$pid" "$(cat /proc/$pid/comm)"
    pid=$(awk '/^PPid:/{print $2}' /proc/$pid/status)
done
printf '%6s  %s\n' 1 "$(cat /proc/1/comm)"
```

## 12.4 Signals

> **THE PROBLEM.** A process is running. You want to tell it something — stop, reload your config,
> quit cleanly, die now. It isn't reading from anywhere. How do you interrupt it?

A **signal** is an asynchronous notification delivered by the kernel. Each has a number, a name, and
a default action.

```bash
kill -l
```

```
 1) SIGHUP	 2) SIGINT	 3) SIGQUIT	 4) SIGILL	 5) SIGTRAP
 6) SIGABRT	 7) SIGBUS	 8) SIGFPE	 9) SIGKILL	10) SIGUSR1
11) SIGSEGV	12) SIGUSR2	13) SIGPIPE	14) SIGALRM	15) SIGTERM
16) SIGSTKFLT	17) SIGCHLD	18) SIGCONT	19) SIGSTOP	20) SIGTSTP
...
```

*(Verified.)* The ones that matter day to day:

| # | Name | Default action | Where you meet it |
|---|---|---|---|
| 1 | **SIGHUP** | terminate | terminal closed; **or, by convention, "reload your config"** |
| 2 | **SIGINT** | terminate | **Ctrl+C** (from the line discipline — Volume 1 §2.3) |
| 3 | SIGQUIT | terminate + core dump | Ctrl+\\ |
| 9 | **SIGKILL** | terminate | **cannot be caught, blocked, or ignored** |
| 11 | SIGSEGV | terminate + core | invalid memory access |
| 13 | **SIGPIPE** | terminate | **wrote to a pipe with no reader** — §12.4.1 |
| 15 | **SIGTERM** | terminate | **the polite default of `kill`** |
| 17 | SIGCHLD | ignored | a child changed state — how bash learns to reap (§12.5) |
| 18 | SIGCONT | continue | resume a stopped process (`fg`, `bg`) |
| 19 | **SIGSTOP** | stop | **cannot be caught, blocked, or ignored** |
| 20 | SIGTSTP | stop | **Ctrl+Z** |

> **SIGKILL and SIGSTOP are uncatchable by kernel guarantee.** Every other signal can be handled or
> ignored by the process. If SIGKILL could be caught, you could write a process nobody could ever
> stop — so the kernel reserves exactly two that always work. That's why `kill -9` is the last resort
> and why it's also *rude*: the process gets no chance to flush buffers, remove lock files, or close
> connections.

**And now 143.** When a process is killed by signal *N*, the shell reports `128 + N`:

```bash
sleep 300 & kill %1 ; wait %1 ; echo "SIGTERM  → $?"
sleep 300 & kill -9 %1 ; wait %1 ; echo "SIGKILL  → $?"
sleep 300 & kill -2 %1 ; wait %1 ; echo "SIGINT   → $?"
```

```
SIGTERM  → 143      (128 + 15)
SIGKILL  → 137      (128 +  9)
SIGINT   → 130      (128 +  2)
```

The reason for the offset is that the exit status is 8 bits (Volume 1 §2.8), and normal exit codes
occupy 0–127. Values ≥ 128 encode "didn't exit normally; here's the signal." Volume 1's loose end,
closed.

### 12.4.1 SIGPIPE, and why `yes | head` doesn't run forever

```bash
yes | head -1 > /dev/null
echo "${PIPESTATUS[@]}"
```

```
141 0
```

*(Verified.)* **141 = 128 + 13 = SIGPIPE.**

`yes` produces infinite output. `head -1` prints one line and exits, closing its end of the pipe.
`yes` writes again — into a pipe with no reader — and the kernel sends it **SIGPIPE**, whose default
action is to terminate.

> **This is how every pipeline in Unix knows when to stop.** `yes` contains no logic for it. Neither
> does `head`. The mechanism lives in the kernel, and it's why `find / | head -5` returns instantly
> instead of traversing your whole filesystem. Volume 1 §1.4 said adding pipes required no changes to
> existing programs; **this is part of why that was true.**

### Sending signals

```bash
sleep 300 &
kill %1              # SIGTERM to job 1 (bash job spec)
sleep 300 &
kill -TERM $!        # by PID
sleep 300 &
kill -s SIGKILL $!   # by name

pkill -f 'sleep 300' # by command-line pattern — careful with this
pgrep -a sleep       # what would pkill match?
```

**Always run `pgrep` before `pkill`.** The pattern matches more than you expect surprisingly often.

## 12.5 Zombies and orphans

Volume 1 §2.8 mentioned zombies in passing. Here they are.

> **THE PROBLEM.** A child exits. The parent wants its exit status. But the parent might not call
> `wait()` for another ten seconds. Where does the status live in the meantime?

The kernel keeps the process's **entry** — PID and exit status — while discarding everything else:
memory, file descriptors, all of it. That husk is a **zombie**.

Make one *(verified)*:

```bash
python3 -c '
import os, time
if os.fork():      # parent
    time.sleep(10) # ...deliberately does NOT wait()
else:              # child
    os._exit(0)    # exits immediately
' &
sleep 1
ps -eo pid,ppid,stat,cmd | awk 'NR==1 || $3 ~ /^Z/'
```

```
  PID  PPID STAT CMD
  483   481 Z    [python3] <defunct>
```

**State `Z`, and `<defunct>` in place of a command line** — because there's no memory left to hold
one.

Now the thing that makes zombies memorable:

```bash
kill -9 483      # substitute the PID you actually saw
ps -eo pid,stat,cmd | awk '$2 ~ /^Z/'
```

**Nothing happens. It's still there.** You cannot kill a zombie, because it is already dead — there
is nothing left to deliver a signal to. The only way to remove it is for the **parent** to call
`wait()`, or for the parent to die:

```bash
kill 481         # kill the PARENT (substitute your PPID)
sleep 1
ps -eo pid,stat,cmd | awk '$2 ~ /^Z/' ; echo "(gone)"
```

**Orphans** are the reverse case: the parent dies while the child lives. The child is **reparented to
PID 1** (or to the nearest ancestor registered as a *subreaper*, which is how systemd tracks service
processes). Since PID 1's job includes reaping, orphans always eventually get cleaned up.

```bash
bash -c 'sleep 30 & echo "child PID: $!"' 
sleep 1
# find that PID and look at its PPid — the bash that started it is gone
```

> **When zombies are a real problem:** a long-running daemon that forks children and never reaps them
> leaks PID table entries until the table is exhausted and no new process can start anywhere on the
> system. A handful of zombies in `ps` is harmless. Thousands means a broken parent — and the fix is
> to restart or fix **the parent**, never to try killing the zombies.

## 12.6 Job control, process groups, and why Ctrl+C kills the whole pipeline

> **You run `find / | grep foo | head`. You press Ctrl+C. All three die. But you only pressed one
> key, and the terminal is only connected to one of them. How?**

The kernel groups processes at two levels above the process itself:

| Level | What it is |
|---|---|
| **Process group (PGID)** | a set of related processes — **a shell pipeline is one process group** |
| **Session (SID)** | a set of process groups attached to one terminal, with one *session leader* |

The terminal has exactly one **foreground process group** at a time. When the line discipline
(Volume 1 §2.3) sees Ctrl+C, it sends SIGINT **to every process in that group** — which is the whole
pipeline.

See the structure:

```bash
sleep 300 | cat &
jobs -l
ps -o pid,ppid,pgid,sid,stat,comm --ppid $$
kill %1
```

```
[1]+  4610 Running                 sleep 300 | cat &
  PID  PPID  PGID   SID STAT COMMAND
 4610  4021  4610  4021 S    sleep
 4611  4021  4610  4021 S    cat
```

**Both members share PGID 4610**, distinct from the shell's, and both are in the shell's session. One
signal to the group hits both.

> **A note if you try this in a script or a non-interactive shell:** job control is off there, and
> everything shares the shell's process group. The separate PGID only appears in an **interactive**
> shell. *(I hit exactly this while verifying — the container's non-interactive bash showed one PGID
> for everything.)*

### The job control commands

```bash
sleep 300           # now press Ctrl+Z
jobs
bg %1               # resume it in the BACKGROUND (sends SIGCONT)
jobs -l
fg %1               # bring it to the FOREGROUND
                    # Ctrl+C to finish
```

| Action | Mechanism |
|---|---|
| `cmd &` | start in a background process group |
| **Ctrl+Z** | line discipline sends **SIGTSTP** to the foreground group |
| `bg` | sends **SIGCONT**; the group stays in the background |
| `fg` | sends SIGCONT **and** makes the group the terminal's foreground group |
| `jobs` | bash's own bookkeeping — not a kernel concept |
| `disown %1` | bash forgets the job, so it won't send SIGHUP at exit |

The `STAT` column decoder, which is worth knowing:

| Code | Meaning |
|---|---|
| `R` | running or runnable |
| `S` | interruptible sleep (waiting for something) |
| `D` | **uninterruptible sleep** — usually blocked on I/O; **`kill -9` won't work** |
| `T` | stopped (by SIGTSTP/SIGSTOP) |
| `Z` | zombie |
| `+` | in the **foreground** process group |
| `s` | session leader |
| `l` | multi-threaded |
| `<` / `N` | high / low priority |

`D` state is the one that surprises people: a process blocked in the kernel waiting on a dead NFS
mount or a failing disk **cannot be killed at all**, because signals are delivered on the way back to
userspace and it never gets there. That's not a bug; it's the price of not corrupting an in-flight
I/O operation.

### SIGHUP and `nohup`

When your terminal closes, the kernel sends **SIGHUP** to the session's foreground process group —
historically "the modem hung up." Default action: terminate. Which is why closing a terminal kills
what's running in it.

```bash
nohup sleep 300 &        # ignore SIGHUP; output goes to nohup.out
jobs -l
disown -h %1             # or: tell bash not to send HUP itself
rm -f nohup.out
```

For anything you actually want to survive, use `systemd-run --user`, `tmux`, or `screen` rather than
`nohup` — Volume 6 covers the first.

## 12.7 `/proc`, properly

You've been using it since Volume 1. Here's what it is: a **virtual filesystem** with no disk behind
it. Every read is a function call into the kernel that generates the answer on the spot.

```bash
mount | grep ' /proc '
ls -l /proc/$$/status        # size 0 — there is no file
wc -c < /proc/$$/status      # ...and yet it has content
```

```
proc on /proc type proc (rw,nosuid,nodev,noexec,relatime)
-r--r--r-- 1 vishal vishal 0 Sep 10 06:20 /proc/4021/status
1443
```

**Zero bytes, 1443 bytes of content.** That's the tell: `/proc` files are generated on read.

The per-process entries worth knowing:

```bash
sleep 300 & P=$!
ls /proc/$P/
```

| Entry | What it gives you |
|---|---|
| `status` | human-readable: state, PPid, **Uid/Gid** (§11.3), threads, memory, signal masks |
| `cmdline` | the full argv, **NUL-separated** |
| `environ` | the environment at exec time (Volume 1 §6.4) |
| `fd/` | **symlinks to every open file descriptor** |
| `cwd`, `exe`, `root` | magic symlinks to the working directory, the binary, the root |
| `limits` | every `ulimit`, soft and hard |
| `maps`, `smaps` | the memory map |
| `stat`, `io`, `sched` | machine-readable counters |
| `cgroup` | which cgroup it's in — Volume 8 |

```bash
grep -E '^(Name|State|PPid|Uid|Gid|Threads|VmRSS):' /proc/$P/status
tr '\0' ' ' < /proc/$P/cmdline; echo
head -5 /proc/$P/limits
ls -l /proc/$P/fd/
kill $P
```

And system-wide:

```bash
cat /proc/loadavg          # 1/5/15-min load, running/total procs, last PID
cat /proc/uptime           # seconds up, seconds idle (summed across CPUs)
head -5 /proc/meminfo
grep 'model name' /proc/cpuinfo | head -1
cat /proc/sys/kernel/hostname
```

`/proc/sys/` is different in kind — it is **writable**, and writing to it changes kernel behaviour
live. That's what `sysctl` is:

```bash
sysctl kernel.pid_max
cat /proc/sys/kernel/pid_max        # the same value, same source
```

Volume 8 comes back to this.

---


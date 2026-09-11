# Chapter 44 — The Syscall: Where Your Program Ends and the Kernel Begins

## 44.1 The hook

> **Volume 1 said the shell asks the kernel to run a program. Volume 3 said `open()` reaches the
> filesystem. Volume 5 said `bind()` claims a port.**
>
> **But your program and the kernel are in different privilege levels, with different memory
> protections. Your code *cannot* call a kernel function — the CPU will fault.**
>
> **So what actually happens when you write `open("/etc/passwd", O_RDONLY)`?**

## 44.2 THE PROBLEM: two privilege levels, one CPU

x86 CPUs have four privilege rings. Linux uses two:

| Ring | Runs | Can |
|---|---|---|
| **0** | **the kernel** | everything — all instructions, all memory, all I/O ports |
| 3 | **your programs** | ordinary arithmetic and memory access, within its own mapped pages |

Ring 3 code attempting a privileged instruction — or touching kernel memory — **faults**. That's not
a policy, it's the hardware.

Which produces a genuine problem:

```
   Your program needs the kernel to do something privileged on its behalf.
   It cannot CALL into the kernel (wrong ring, and the kernel's pages
   aren't even readable from ring 3).
   It cannot just DO the thing (privileged instruction → fault).
```

**The answer is a deliberate, controlled trap.** A single CPU instruction whose entire purpose is:
*switch to ring 0, jump to one fixed, kernel-chosen address, and let the kernel decide what was
asked for.*

> **That's a system call, and the design constraint is worth stating: the kernel must control the
> entry point.** If userspace could choose where in the kernel to jump, there would be no security
> boundary at all. So the hardware provides exactly one door, the kernel registers its address at
> boot, and everything goes through it.

## 44.3 THE MECHANISM

On x86-64 the instruction is literally called **`syscall`**:

```
   USERSPACE (ring 3)
      │
      │   rax = 1              ← the SYSCALL NUMBER (1 = write)
      │   rdi = 1              ← arg 1: file descriptor
      │   rsi = buffer address ← arg 2
      │   rdx = length         ← arg 3
      │   syscall              ← ONE INSTRUCTION. This is the boundary.
      │
      ▼  ─────────────── ring 3 → ring 0 ───────────────
      │
      │   CPU jumps to the address in the LSTAR MSR,
      │   which the kernel set at boot: entry_SYSCALL_64
      │
      │   kernel saves registers, switches to the kernel stack,
      │   validates rax against the table size,
      │   calls sys_call_table[rax]
      │
      │   ...does the work...
      │
      │   return value in rax
      │   sysretq
      ▼  ─────────────── ring 0 → ring 3 ───────────────
   USERSPACE resumes
```

The x86-64 calling convention:

| Register | Holds |
|---|---|
| **`rax`** | **the syscall number** (and, on return, the result) |
| `rdi`, `rsi`, `rdx`, `r10`, `r8`, `r9` | arguments 1–6 |

Note `r10` rather than `rcx` for the fourth argument — the `syscall` instruction clobbers `rcx` with
the return address, so the kernel ABI had to differ from the ordinary C function ABI at exactly that
one position. A small, permanent scar from the hardware.

## 44.4 The table, and every syscall this book has used

The numbers are a **stable ABI** — once assigned, never changed, because binaries compiled a decade
ago must keep working:

```bash
H=/usr/include/x86_64-linux-gnu/asm/unistd_64.h
grep -c '^#define __NR_' "$H"
grep '^#define __NR_' "$H" | head -8
```

```
373
#define __NR_read 0
#define __NR_write 1
#define __NR_open 2
#define __NR_close 3
#define __NR_stat 4
#define __NR_fstat 5
#define __NR_lstat 6
#define __NR_poll 7
```

*(Verified.)* **373 syscalls** — the entire interface between every program on your machine and the
kernel. Not thousands; a few hundred.

And here is the whole book, as numbers:

```bash
for s in read write open openat close execve fork clone wait4 pipe2 dup2 \
         socket bind listen accept4 mount unshare setns; do
  n=$(grep -E "^#define __NR_$s " "$H" | awk '{print $3}')
  [ -n "$n" ] && printf '  %-10s = %-4s\n' "$s" "$n"
done
```

```
  read       = 0        ← Volume 3 §18
  write      = 1        ← Volume 3 §18
  open       = 2        ← Volume 3 §14
  openat     = 257      ← what modern libc actually calls
  close      = 3
  execve     = 59       ← Volume 1 §2.7
  fork       = 57       ← Volume 1 §2.6
  clone      = 56       ← what fork() and threads BOTH become
  wait4      = 61       ← Volume 1 §2.8, Volume 2 §12.5
  pipe2      = 293      ← Volume 1 §1.4
  dup2       = 33       ← Volume 1 §2.6's redirection
  socket     = 41       ← Volume 5 §29.2
  bind       = 49       ← Volume 5 §29.3
  listen     = 50
  accept4    = 288
  mount      = 165      ← Volume 3 §17.4
  unshare    = 272      ← §46, and it's why containers exist
  setns      = 308      ← §46.7
```

*(All verified.)*

> **That table is the book.** Eight volumes of mechanism, and the entire userspace-to-kernel surface
> is 373 numbered entry points, of which perhaps fifty account for nearly everything you do.

## 44.5 Making one by hand

libc's `write()` is a *wrapper*. You can skip it *(verified — compiled and run)*:

```c
/* rawsys.c */
#include <unistd.h>
#include <sys/syscall.h>
#include <string.h>

int main(void) {
    const char *msg = "written via syscall(SYS_write, 1, ...) directly\n";
    syscall(SYS_write, 1, msg, strlen(msg));

    char buf[80];
    int n = snprintf(buf, sizeof buf, "SYS_write=%d SYS_getpid=%d pid=%ld\n",
                     SYS_write, SYS_getpid, syscall(SYS_getpid));
    syscall(SYS_write, 1, buf, n);
    return 0;
}
```

```bash
gcc -O0 -o /tmp/rawsys /tmp/rawsys.c && /tmp/rawsys
```

```
written via syscall(SYS_write, 1, ...) directly
SYS_write=1 SYS_getpid=39 pid=606
```

*(Verified.)* **No `printf`, no `write()`** — just the syscall number and the arguments.

> **One precision worth adding**, because `objdump` shows it: `syscall()` here is still a *libc
> function*, which then executes the `syscall` *instruction* inside glibc. The instruction is the
> boundary; the function is a thin wrapper around it that also translates the kernel's return
> convention into `errno`. Which brings us to:

### How errors come back

The kernel has no `errno`. It returns a **negative number** in `rax`:

```
   return value in rax:
     >= 0            success (the fd, the byte count, whatever)
     -1 .. -4095     THIS IS AN ERROR. The errno is the absolute value.
```

libc's wrapper checks that range, stores the absolute value in the thread-local `errno`, and returns
`-1` to you. That's the whole mechanism, and it's why `errno` is meaningless until a call has
actually failed.

```bash
grep -m5 -E '^#define\s+E[A-Z]+' /usr/include/asm-generic/errno-base.h
errno -l 2>/dev/null | head -5 || echo "(install moreutils for the errno tool)"
```

## 44.6 Catching a process mid-syscall

`/proc/PID/syscall` shows what a process is executing **right now** *(verified)*:

```bash
H=/usr/include/x86_64-linux-gnu/asm/unistd_64.h
sleep 30 & P=$!
sleep 0.3
echo "raw:     $(cat /proc/$P/syscall)"
NUM=$(awk '{print $1}' /proc/$P/syscall)
echo "decoded: #$NUM = $(grep -E "^#define __NR_\w+ $NUM$" "$H" | awk '{print $2}' | sed 's/__NR_//')"
kill $P
```

```
raw:     230 0x0 0x0 0x7ffce9679330 0x7ffce9679320 0x0 0x0 0x7ffce9679260 0x7f8b106eca7a
decoded: #230 = clock_nanosleep
```

*(Verified.)* **`sleep` is blocked inside `clock_nanosleep`**, and the remaining fields are its
arguments, the stack pointer and the instruction pointer.

Try it on things you met earlier in the book:

```bash
# a process blocked reading a terminal — Volume 1 §2.3
cat & sleep 0.3; cat /proc/$!/syscall | awk '{print "cat is in syscall #"$1}'; kill %1

# and the shell itself, blocked in wait4 — Volume 1 §2.8
cat /proc/$$/syscall
```

### What `strace` is doing

```bash
strace -c ls /etc >/dev/null
strace -f -e trace=openat,read,write ls /etc 2>&1 | head -20
```

*(Describing — no `strace` on my test box.)* `strace` uses **`ptrace(2)`**, the same mechanism
debuggers use: it asks the kernel to stop the target on every syscall entry and exit, reads the
registers, decodes them against the table from §44.4, and continues it.

> **Which is why `strace` is slow** — every syscall becomes several context switches. And why
> `strace -c` (a summary count) is often the right first command: it tells you *which* syscall
> dominates before you drown in the trace.

## 44.7 The vDSO — Volume 1's unexplained line

Volume 1 §2.7 ran `ldd /bin/ls` and the first line was:

```
	linux-vdso.so.1 (0x00007ffd...)
```

I never explained it. Here it is:

```bash
grep vdso /proc/self/maps
ls -l /lib/x86_64-linux-gnu/ | grep -i vdso || echo "  ...there is no such FILE"
```

> **`linux-vdso.so.1` is not a file on disk.** It is a **page of kernel code that the kernel maps
> into every process's address space** — a "virtual dynamic shared object."
>
> **Why:** some syscalls are enormously frequent and need no privilege to answer.
> `clock_gettime()` just reads a timestamp the kernel already maintains. Paying a full ring
> transition for that is absurd overhead. So the kernel publishes the data **and** the code to read
> it in a page userspace can execute directly.
>
> **A `clock_gettime()` via the vDSO never traps into the kernel at all.** It is a function call.

```bash
# these are the usual vDSO entries
grep -E 'clock_gettime|gettimeofday|getcpu|time' /proc/self/maps 2>/dev/null | head -2
```

That's why a program calling `gettimeofday()` in a tight loop shows almost no syscalls under
`strace` — there aren't any.

## 44.8 Filtering the boundary: seccomp

If all privilege flows through 373 numbered entry points, then **restricting which of them a process
may use is a very strong sandbox** — and much simpler than auditing the program.

That's **seccomp**, and it's the foundation of modern sandboxing:

```bash
grep -i seccomp /proc/self/status
grep -i seccomp /proc/1/status 2>/dev/null
```

```
Seccomp:	0
Seccomp_filters:	0
```

| Value | Means |
|---|---|
| 0 | unrestricted |
| 1 | strict mode — **only `read`, `write`, `_exit`, `sigreturn`** |
| **2** | **filter mode — a BPF program decides per-syscall** |

Find something sandboxed on your own machine:

```bash
for p in /proc/[0-9]*; do
  s=$(awk '/^Seccomp:/{print $2}' "$p/status" 2>/dev/null)
  [[ ${s:-0} -gt 0 ]] && echo "  $(cat $p/comm 2>/dev/null) — seccomp mode $s"
done | sort -u | head
```

Browser tabs, container runtimes, and systemd units with `SystemCallFilter=` will show mode 2.
Volume 7 §43.3 used `NoNewPrivileges=true`; its siblings are the seccomp knobs:

```bash
systemctl show systemd-resolved -p SystemCallFilter -p NoNewPrivileges 2>/dev/null
```

> **This is the conceptual payoff of the whole chapter.** Once you see that *everything* privileged
> goes through one narrow, enumerable interface, the security tools built on top stop being a
> grab-bag and become obvious: **seccomp filters the interface, capabilities subdivide what's behind
> it, and namespaces change what it returns.** §46 is the third of those.

---


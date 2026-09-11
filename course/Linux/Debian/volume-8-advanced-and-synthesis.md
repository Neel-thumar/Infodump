# Mastering Debian Linux: The Engineering, The History, The Incidents

## Volume 8 — Advanced Deep Dives, and the Synthesis

---

### The last volume

Seven volumes have said "the kernel does this" and "ask the kernel for that" without ever explaining
**how you ask**. That's where this one starts, and it's the right place — because once you can see
the boundary, containers stop being magic and become an obvious consequence of things you already
know.

Debts closing here:

| Debt | From | Closed in |
|---|---|---|
| `linux-vdso.so.1` appearing in `ldd` output, unexplained | 1 §2.7 | **§44.7** |
| "Volume 8 returns to bind mounts" | 3 §17.4 | **§46.5** |
| "cgroups are also what containers are built from" | 6 §36.5 | **§46.6** |
| Secure Boot forces module signing | 6 §32.6 | **§45.6** |
| `/var/run/docker.sock` membership ≡ root | 5 §29.7 | **§46.8** |
| "Volume 8 comes back to `sysctl`" | 2 §12.7 | **§48.6** |
| `nosuid`, `noexec`, `nodev` as hardening | 3 §17.7 | **§48.7** |

**Requirements.** Most of this reads rather than changes:

```bash
sudo apt install strace nftables util-linux manpages-dev
sudo apt install linux-headers-$(uname -r)     # only for §45.5 and §47
```

> **Verification note.** My test box is the Firecracker microVM from Volume 6 — **no `strace`, no
> `nft`, no `lsmod`, no loaded modules, and cgroup v1 rather than Debian's v2.** But it does have
> `gcc`, `unshare`, `nsenter`, `lsns` and the kernel headers, which means **§44's syscall material
> and all of §46's namespace demonstrations are verified and reported as real output.** Everything
> involving `strace`, `nft`, `modprobe` or kernel compilation is **described**, and marked.

---

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

# Chapter 45 — Kernel Modules

## 45.1 The hook

> **Volume 6 §34.2 said a Debian kernel has thousands of loadable modules and that this creates the
> chicken-and-egg problem initramfs solves.**
>
> **But what *is* a module? It's code that runs in ring 0, with no memory protection from the rest of
> the kernel, loaded at runtime from a file. How is that not insane?**

## 45.2 THE PROBLEM: one kernel, all hardware

Volume 6 §34.2 established that compiling every driver into the kernel is impossible for a
distribution — you'd ship hundreds of megabytes so each machine could use one percent.

The alternative is **runtime-loadable code**. But a loaded module is not a plugin in any comfortable
sense:

| | A userspace plugin | A kernel module |
|---|---|---|
| Privilege | ring 3, sandboxed | **ring 0 — full hardware access** |
| Memory protection from its host | yes | **none** |
| A bug causes | a crash of one process | **a kernel panic, or silent corruption** |
| Can it be sandboxed? | yes | **no** |

> **A kernel module is not isolated from the kernel. It *becomes* the kernel.** Which is why module
> loading is a privileged operation, why Secure Boot demands signatures (§45.6), and why "just
> install this driver" is a much bigger request than it sounds.

## 45.3 THE MECHANISM: what a `.ko` is

```bash
ls /lib/modules/$(uname -r)/
find /lib/modules/$(uname -r) -name '*.ko*' | wc -l
file "$(find /lib/modules/$(uname -r) -name 'ext4.ko*' | head -1)"
```

*(Describing — my microVM has no modules directory at all, which is itself informative: a kernel
built with everything it needs compiled in.)*

A `.ko` is an **ELF relocatable object** — the same format as a `.o` from your compiler, with extra
sections the kernel reads:

| Section | Contains |
|---|---|
| `.modinfo` | author, licence, description, **parameters**, dependencies, vermagic |
| `.gnu.linkonce.this_module` | the module struct: init and exit function pointers |
| `__ksymtab` / `__versions` | symbols it exports / symbol CRCs it expects |

```bash
modinfo ext4
modinfo ext4 | grep -E '^(filename|license|description|depends|vermagic)'
modinfo -p usbcore          # PARAMETERS this module accepts
```

> **`vermagic` is the safety interlock.** It records the exact kernel version, compiler and config
> the module was built against. Since a module links directly against kernel internals — with no
> stable ABI — loading one built for a different kernel would produce undefined behaviour in ring 0.
> The kernel refuses. **This is why a kernel upgrade requires rebuilding out-of-tree modules**, which
> §45.7's DKMS exists to automate.

## 45.4 Loading, and dependency resolution

```bash
lsmod | head -10
cat /proc/modules | head -3
```

`lsmod` is a formatter for `/proc/modules`. The columns are name, size, **use count**, and **who is
using it**:

```
Module                  Size  Used by
ext4                  970752  1
mbcache                16384  1 ext4
crc16                  16384  1 ext4
```

**A module with a non-zero use count cannot be unloaded.** That's the reference counting that keeps
you from removing the filesystem driver out from under a mounted filesystem.

| Command | Does |
|---|---|
| `insmod file.ko` | load **exactly this file**. No dependency resolution. Rarely correct. |
| **`modprobe name`** | **resolve dependencies, then load all of them in order** |
| `rmmod name` | unload |
| `modprobe -r name` | unload, plus now-unused dependencies |
| `depmod -a` | **rebuild the dependency database** |

The database `modprobe` consults:

```bash
head -3 /lib/modules/$(uname -r)/modules.dep
grep '^kernel/fs/ext4' /lib/modules/$(uname -r)/modules.dep
ls /lib/modules/$(uname -r)/modules.*
```

`modules.dep` maps each module to the modules it needs, and is regenerated by `depmod` whenever
modules change — which is why installing a kernel package runs `depmod` in its `postinst` (Volume 4
§21.6).

### Configuring modules — Debian's drop-in directories again

```bash
ls /etc/modprobe.d/ /etc/modules-load.d/ 2>/dev/null
cat /etc/modules 2>/dev/null
```

| Path | Purpose |
|---|---|
| **`/etc/modprobe.d/*.conf`** | `options`, `blacklist`, `install`, `alias` |
| **`/etc/modules-load.d/*.conf`** | modules to load **at boot** |
| `/etc/modules` | Debian's traditional equivalent of the above |

```bash
# a typical real example
cat /etc/modprobe.d/blacklist*.conf 2>/dev/null | grep -v '^#' | grep . | head
```

> **`blacklist` does not prevent loading.** It only stops *automatic* loading by alias — a
> direct `modprobe name` still works. To genuinely prevent it:
>
> ```
> install nouveau /bin/false
> ```
>
> That replaces the load action with a command that fails. A distinction that has cost people
> afternoons.

**Sixth appearance of the pattern:** `/etc/modprobe.d` joins `/etc/sudoers.d` (V2), `/etc/apt/sources.list.d`
(V4), `/etc/ssh/sshd_config.d` (V5), `/etc/grub.d` (V6), and `/etc/systemd/system/*.d` (V6).

## 45.5 Writing one

*(Describing — needs `linux-headers`, which my test box lacks.)*

```c
/* hello.c */
#include <linux/module.h>
#include <linux/kernel.h>
#include <linux/init.h>

MODULE_LICENSE("GPL");
MODULE_AUTHOR("You");
MODULE_DESCRIPTION("A minimal demonstration module");
MODULE_VERSION("0.1");

static char *who = "world";
module_param(who, charp, 0444);
MODULE_PARM_DESC(who, "who to greet");

static int __init hello_init(void) {
    pr_info("hello: loaded, greeting %s\n", who);
    return 0;
}

static void __exit hello_exit(void) {
    pr_info("hello: unloaded\n");
}

module_init(hello_init);
module_exit(hello_exit);
```

```make
# Makefile
obj-m += hello.o
all:
	make -C /lib/modules/$(shell uname -r)/build M=$(PWD) modules
clean:
	make -C /lib/modules/$(shell uname -r)/build M=$(PWD) clean
```

```bash
sudo apt install linux-headers-$(uname -r) build-essential
make
modinfo ./hello.ko
sudo insmod ./hello.ko who=Debian
dmesg | tail -2
sudo rmmod hello
dmesg | tail -2
```

> **`MODULE_LICENSE("GPL")` is not decoration.** The kernel checks it. Many internal symbols are
> exported as `EXPORT_SYMBOL_GPL`, and a module declaring a non-GPL licence **cannot link against
> them** — and loading a non-GPL module sets a **taint flag**:
>
> ```bash
> cat /proc/sys/kernel/tainted
> ```
>
> A non-zero value tells kernel developers the kernel has had proprietary or unsigned code in it, and
> most will decline to debug a tainted kernel. The bit meanings are in the kernel's
> `Documentation/admin-guide/tainted-kernels.rst`.

## 45.6 Module signing, and Volume 6's Secure Boot debt

Volume 6 §32.6 established that Secure Boot verifies the bootloader and kernel, and that the kernel
then enters **lockdown** mode. §45.2 explains why lockdown must cover modules:

> **If Secure Boot verifies the kernel but anyone can load arbitrary ring-0 code into it afterwards,
> Secure Boot has achieved nothing.** So under lockdown the kernel refuses unsigned modules.

```bash
mokutil --sb-state 2>/dev/null
cat /sys/kernel/security/lockdown 2>/dev/null
modinfo ext4 2>/dev/null | grep -iE 'sig_id|signer|sig_key'
dmesg | grep -i 'module verification\|lockdown' | head -5
```

Which is precisely why the NVIDIA driver is awkward on a Secure Boot machine, and why Volume 6
§32.6's `mmx64.efi` exists:

```
   1. generate your own key pair (a Machine Owner Key)
   2. mokutil --import  → enrol it, confirming at the FIRMWARE prompt on next boot
   3. sign your module with it
   4. the kernel now accepts it
```

```bash
ls /var/lib/shim-signed/mok/ 2>/dev/null
mokutil --list-enrolled 2>/dev/null | head
```

Debian's `dkms` (§45.7) can be configured to sign automatically with an enrolled MOK, which is what
makes out-of-tree drivers survive Secure Boot without manual work each kernel upgrade.

## 45.7 DKMS — the Debian answer to `vermagic`

§45.3 established that a module must be rebuilt for each kernel. Which means every kernel upgrade
would break your out-of-tree drivers — a genuinely miserable failure mode, since it appears *after*
a reboot, when the thing you need is the driver.

**DKMS** (Dynamic Kernel Module Support) automates it:

```bash
dpkg -l dkms 2>/dev/null | tail -1
dkms status
ls /usr/src/ | head
cat /usr/src/*/dkms.conf 2>/dev/null | head -12
```

A package shipping a DKMS module drops its **source** into `/usr/src/<name>-<version>/` with a
`dkms.conf`. Then a kernel-package hook (Volume 6 §34.6's `/etc/kernel/postinst.d/`) rebuilds it
against every newly-installed kernel, automatically, before you reboot.

```bash
ls /etc/kernel/postinst.d/
```

> **This is Volume 4's packaging discipline applied to a hard problem.** Rather than shipping a
> binary that breaks on every upgrade, ship the source plus a build recipe and let the package
> manager's hooks rebuild it. It's the same instinct as Debian's `/usr/local` rule (Volume 3 §16.6):
> put the thing where the system's own machinery can manage it.

---

# Chapter 46 — Containers, From Scratch

## 46.1 The hook

> **A Docker container is often described as "a lightweight VM." It is not a VM at all, and it isn't
> lightweight in the way that implies.**
>
> **A container is an ordinary Linux process. `ps` on the host shows it. It shares your kernel, your
> scheduler, your page cache. There is no hypervisor and no guest OS.**
>
> **So what makes it *feel* isolated? Three kernel features, all of which this book has already
> covered, and you can assemble them by hand in about five commands.**

## 46.2 THE PROBLEM: isolation without virtualisation

You want to run software such that it cannot see or disturb the rest of the machine. The heavyweight
answer is a virtual machine: a whole second kernel, its own memory, emulated hardware. Correct,
expensive, slow to start.

But look at what the isolation actually needs to cover, and each one turns out to be a *lookup the
kernel performs on the process's behalf*:

| The process asks | The kernel answers from |
|---|---|
| "what processes exist?" | the **PID** table |
| "what does `/` contain?" | the **mount** table |
| "what network interfaces are there?" | the **net** device list |
| "what's my hostname?" | the **UTS** struct |
| "who am I?" | the **credential** struct (Volume 2 §11.3) |

> **So: don't virtualise the hardware. Give the process a *different table*.**
>
> That's a **namespace**, and it is the entire trick.

## 46.3 The three ingredients

| Ingredient | Controls | Covered in |
|---|---|---|
| **Namespaces** | **what the process can SEE** | §46.4 — and Volume 3 §17.4's mounts |
| **cgroups** | **what it can USE** | Volume 6 §36.5 |
| **Capabilities / seccomp / LSM** | **what it can DO** | Volume 2 §11.8, §44.8 |

Docker did not invent any of these. It packaged them, added an image format and a registry, and made
the result usable — which was a genuine contribution, but a *packaging* one.

## 46.4 Namespaces, and the inode that proves it

Every process has one namespace of each type, and the kernel exposes them as magic symlinks:

```bash
ls -l /proc/self/ns/
```

```
cgroup -> cgroup:[4026531835]
ipc    -> ipc:[4026531839]
mnt    -> mnt:[4026531832]
net    -> net:[4026531833]
pid    -> pid:[4026531836]
time   -> time:[4026531834]
user   -> user:[4026531837]
uts    -> uts:[4026531838]
```

*(Verified.)* **Those numbers are inodes** (Volume 3 §15) in a special filesystem. Two processes are
in the same namespace **if and only if** these numbers match — which makes "is this process
contained?" a comparison rather than a mystery:

```bash
readlink /proc/self/ns/pid
readlink /proc/1/ns/pid
```

The eight types:

| Namespace | Isolates | Since |
|---|---|---|
| **`mnt`** | **the mount table** — its own `/` | 2002 |
| **`uts`** | hostname and domain name | 2006 |
| `ipc` | System V IPC, POSIX message queues | 2006 |
| **`pid`** | **the process ID number space** | 2008 |
| **`net`** | **interfaces, routes, ports, firewall rules** | 2009 |
| **`user`** | **UID/GID mappings — enables rootless containers** | 2013 |
| `cgroup` | the cgroup hierarchy root | 2016 |
| `time` | `CLOCK_MONOTONIC` and `CLOCK_BOOTTIME` offsets | 2020 |

> **Confidence: moderate** on the individual years; the ordering is right and the early-2000s to 2020
> span is correct.

### Watch them work — all verified

**PID namespace — you become PID 1:**

```bash
echo "outside: \$\$=$$  PID 1 is $(cat /proc/1/comm)"
unshare --pid --fork --mount-proc bash -c \
  'echo "inside:  \$\$=$$  PID 1 is $(cat /proc/1/comm)"; ps -eo pid,comm --no-headers'
```

```
outside: $$=499  PID 1 is process_api
inside:  $$=1    PID 1 is bash
          1 bash
          3 ps
```

*(Verified.)* **Three processes visible where the host has fifty.** Volume 2 §12.2 said PID 1 is
special — inside this namespace, *bash* is PID 1, inherits orphans, and is protected from signals it
hasn't handled.

The `--mount-proc` is doing real work: `/proc` is generated from the kernel's process table, so
without remounting it the new namespace would still show you the host's `/proc` and the illusion
would collapse immediately.

**And the inode changes, which is the proof:**

```bash
echo "outside: $(readlink /proc/self/ns/pid)"
unshare --pid --fork bash -c 'echo "inside:  $(readlink /proc/self/ns/pid)"'
```

```
outside: pid:[4026531836]
inside:  pid:[4026532209]
```

*(Verified.)* A different table.

**UTS namespace — your own hostname:**

```bash
echo "outside: $(hostname)"
unshare --uts bash -c 'hostname container-demo; echo "inside:  $(hostname)"'
echo "outside: $(hostname)   (unchanged)"
```

```
outside: vm
inside:  container-demo
outside: vm   (unchanged)
```

*(Verified.)* `hostname` is a privileged call that changed *a* hostname — just not the host's.

**Net namespace — your own network stack:**

```bash
echo "outside: $(awk 'NR>2{print $1}' /proc/net/dev | tr -d ':' | tr '\n' ' ')"
unshare --net bash -c 'echo "inside:  $(awk "NR>2{print \$1}" /proc/net/dev | tr -d ":" | tr "\n" " ")"'
```

```
outside: lo ifb0 ifb1 eth0
inside:  lo
```

*(Verified.)* **Its own interface list, routing table, port space and firewall rules.** Two processes
in different net namespaces can both bind port 80 with no conflict — Volume 5 §29.4's four-tuple
uniqueness, now scoped per namespace.

**Mount namespace — Volume 3's bind mounts, doing their real job:**

```bash
mkdir -p /tmp/nsdemo && echo "visible outside" > /tmp/nsdemo/file
unshare --mount bash -c 'mount -t tmpfs none /tmp/nsdemo; ls /tmp/nsdemo | wc -l'
echo "outside still sees: $(ls /tmp/nsdemo | wc -l) file(s)"
rm -rf /tmp/nsdemo
```

```
0
outside still sees: 1 file(s)
```

*(Verified.)* Volume 3 §17.4 showed mounting shadows a directory's contents. **In a mount namespace,
it shadows them *only for you*.**

**And list them all:**

```bash
lsns
lsns -t pid
sudo lsns -t net
```

```
        NS TYPE   NPROCS PID USER COMMAND
4026531832 mnt        50   2 root kthreadd
4026531833 net        51   2 root kthreadd
...
```

*(Verified.)* On a machine running containers, `lsns` shows one row per container per type — which
is the most honest view of "what containers are running" the system can give you.

## 46.5 The root filesystem: `pivot_root`, not `chroot`

A container needs its own `/`. The old tool is `chroot`, and it is **not** a security boundary — a
process with `CAP_SYS_CHROOT` can escape a chroot in about ten lines of C, a technique old enough to
have its own folklore.

The container-grade version is **`pivot_root`**, inside a mount namespace:

```
   1. unshare the MOUNT namespace         ← now my mount table is private
   2. mount --bind newroot newroot        ← Volume 3 §17.4: make it a mount point
   3. pivot_root newroot newroot/old
   4. umount -l /old                      ← DETACH the host's filesystem entirely
```

> **The difference that matters is step 4.** After `chroot`, the old root is still mounted and still
> reachable by a process that can get a file descriptor to it. After `pivot_root` plus `umount`,
> **the host filesystem is no longer in this namespace's mount table at all** — there is nothing to
> escape *to*.

And this is where Volume 3 §17.4's bind mounts earn their keep. A Docker `-v /data:/data` is exactly
a bind mount into the container's mount namespace:

```bash
findmnt -o TARGET,SOURCE,FSTYPE | grep -E '\[' | head -3
```

That bracket notation — `/dev/vda[/tmp/bindsrc]` — is what a bind mount looks like, verified back in
Volume 3.

## 46.6 cgroups — Volume 6's debt, in its other role

Volume 6 §36.5 introduced cgroups as systemd's answer to PID files. **The same mechanism is the
resource half of a container.**

```bash
stat -fc '%T' /sys/fs/cgroup
cat /proc/self/cgroup
ls /sys/fs/cgroup/ | head
```

| Output of `stat -fc %T` | Means |
|---|---|
| **`cgroup2fs`** | **cgroup v2 unified — Debian 11+ default** |
| `tmpfs` with `cpu/`, `memory/`, `blkio/` subdirs | cgroup v1 legacy |

*(My test box reports `tmpfs` — v1. Debian 12 should give you `cgroup2fs`.)*

Creating one by hand on cgroup v2:

```bash
sudo mkdir -p /sys/fs/cgroup/demo
echo "+memory +pids" | sudo tee /sys/fs/cgroup/cgroup.subtree_control >/dev/null
echo "100M" | sudo tee /sys/fs/cgroup/demo/memory.max
echo "20"   | sudo tee /sys/fs/cgroup/demo/pids.max
echo $$     | sudo tee /sys/fs/cgroup/demo/cgroup.procs     # move THIS SHELL in
cat /proc/self/cgroup
# ... run something ...
sudo rmdir /sys/fs/cgroup/demo
```

> **Note what that is: you configured a resource limit by `echo`ing into a file.** Volume 3 §14.3
> claimed "everything is a file" makes kernel state shell-scriptable. **cgroups are the most
> consequential example** — the entire container resource model is a directory tree you write numbers
> into.

`pids.max` deserves a mention: it is the fork-bomb defence. A cgroup that cannot exceed 20 processes
cannot exhaust the system's PID table no matter what runs inside it.

## 46.7 A container, by hand

Assemble the pieces *(the namespace parts are verified; the full sequence needs a root filesystem)*:

```bash
# 1. get a root filesystem — Debian's own tool
sudo apt install debootstrap
sudo debootstrap --variant=minbase bookworm /tmp/rootfs http://deb.debian.org/debian
sudo du -sh /tmp/rootfs

# 2. a cgroup to bound it
sudo mkdir -p /sys/fs/cgroup/handmade
echo "200M" | sudo tee /sys/fs/cgroup/handmade/memory.max >/dev/null
echo "50"   | sudo tee /sys/fs/cgroup/handmade/pids.max   >/dev/null

# 3. enter new namespaces, put ourselves in the cgroup, and pivot
sudo unshare --pid --fork --mount --uts --ipc --net --mount-proc \
     bash -c '
        echo $$ > /sys/fs/cgroup/handmade/cgroup.procs
        hostname handmade
        mount --bind /tmp/rootfs /tmp/rootfs
        mkdir -p /tmp/rootfs/old
        cd /tmp/rootfs
        pivot_root . old
        umount -l /old
        mount -t proc proc /proc
        exec /bin/bash
     '
```

Inside, verify you built a container:

```bash
hostname                     # handmade
ps -eo pid,comm              # just bash and ps — you are PID 1
ls /                         # Debian's filesystem, not the host's
cat /proc/net/dev            # only lo
cat /proc/self/cgroup        # /handmade
ls /home                     # empty — the host's /home is unreachable
```

Clean up:

```bash
sudo rmdir /sys/fs/cgroup/handmade
sudo rm -rf /tmp/rootfs
```

> **That is a container.** Five namespaces, one cgroup, a root filesystem, and `pivot_root`. No
> daemon, no image format, no registry, no Docker. Every piece is a kernel feature from an earlier
> volume.

## 46.8 So what does Docker actually add?

Quite a lot, and it's worth being precise rather than dismissive:

| Docker provides | Which is |
|---|---|
| **Image format** — layered, content-addressed | **overlayfs**, a union filesystem: a stack of read-only layers plus one writable top |
| **A registry** | HTTP + content-addressed blobs — Volume 5 |
| **Networking** | `veth` pairs bridging a net namespace to the host, plus NAT rules (§48) |
| **A build system** | `Dockerfile` → a sequence of layers |
| **Lifecycle management** | start, stop, restart policies, health checks |
| **Sane defaults** | a dropped capability set, a seccomp profile (§44.8), read-only mounts |

```bash
mount -t overlay 2>/dev/null | head -2
findmnt -t overlay 2>/dev/null | head -3
```

That last category is the underrated one. **A hand-built container like §46.7's runs as full root
with all capabilities.** Docker drops most of them by default and applies a seccomp filter blocking
dozens of syscalls. The isolation you get from `docker run` is meaningfully stronger than from
`unshare`, and it's because of §44.8's and Volume 2 §11.8's mechanisms, not the namespaces.

### And Volume 5's warning, now fully explained

Volume 5 §29.7 noted that `/var/run/docker.sock` is mode `660 root:docker`, and that **membership of
the `docker` group is equivalent to root.** Now you can see exactly why:

```bash
ls -l /var/run/docker.sock 2>/dev/null
getent group docker 2>/dev/null
```

> Anyone who can talk to that socket can ask the daemon to start a container **with `--privileged`,
> mounting the host's `/` — which is a bind mount (§46.5) into a namespace that has all capabilities
> and no seccomp filter.** From inside, the host filesystem is writable as root.
>
> **That is not a Docker vulnerability.** It is the socket's filesystem permissions being the entire
> authentication mechanism — Volume 2 §14.3's `disk` group all over again. Adding a user to `docker`
> is granting root, and should be considered exactly that.

Rootless alternatives exist and are worth knowing about — **Podman** in particular uses the **user
namespace** so that the container's "root" maps to your unprivileged UID on the host:

```bash
apt-cache show podman 2>/dev/null | grep -E '^(Package|Description)' | head -2
cat /proc/self/uid_map
```

---

# Chapter 47 — Compiling Your Own Kernel

## 47.1 The hook

> **Debian's kernel team maintains a kernel that boots on essentially all x86-64 hardware, receives
> security updates within hours of disclosure, and requires nothing from you.**
>
> **So the honest first question is not "how do I compile a kernel" but "why would I?"**

## 47.2 Why you probably shouldn't

| You lose | Which means |
|---|---|
| **Debian's security updates** | **you** now track kernel CVEs and rebuild. This is the big one. |
| Automatic DKMS rebuilds | §45.7's machinery is tied to Debian's kernel packages |
| Secure Boot | your kernel isn't signed by Debian's key (Volume 6 §32.6) |
| Tested configuration | Debian's config is exercised by millions of machines |

**Try these first, in order:**

```bash
# 1. a newer kernel from backports — Volume 4 §24.4
apt-cache policy linux-image-amd64 2>/dev/null
sudo apt install -t bookworm-backports linux-image-amd64

# 2. a different Debian kernel FLAVOUR
apt-cache search '^linux-image-.*-amd64$' 2>/dev/null | head

# 3. just the driver you need, via DKMS — §45.7
dkms status
```

**Legitimate reasons to build anyway:** a driver not in any Debian kernel; a config option Debian
doesn't enable; kernel development or debugging; a `PREEMPT_RT` real-time build; or — entirely
valid — because you want to understand it.

## 47.3 THE MECHANISM: the Debian way

*(Describing — I can't build a kernel in this environment.)*

The crucial point is that you should **not** run `make install`. Volume 4 taught that unpackaged
files in `/` are invisible to dpkg (§21.4) and Volume 3 §16.6 that `/usr/local` is the only place
that's yours. The kernel build system has a better answer:

```bash
sudo apt install build-essential libncurses-dev bison flex libssl-dev \
                 libelf-dev bc dwarves rsync kmod cpio

apt-get source linux            # needs deb-src (Volume 4 §24.6)
# or: git clone --depth 1 -b v6.6 https://git.kernel.org/pub/scm/linux/kernel/git/stable/linux.git

cd linux-*/
cp /boot/config-$(uname -r) .config      # START from Debian's working config
make olddefconfig                         # accept defaults for anything new

make -j"$(nproc)" bindeb-pkg              # ← produces .deb FILES
ls -lh ../linux-*.deb
```

> **`make bindeb-pkg` is the whole point.** It produces real Debian packages:
>
> ```
> linux-image-6.6.0_6.6.0-1_amd64.deb
> linux-headers-6.6.0_6.6.0-1_amd64.deb
> ```
>
> Install them with `dpkg -i` and **everything in Volume 4 and Volume 6 works normally**: dpkg tracks
> every file, the kernel hooks run `update-initramfs` and `update-grub` (Volume 6 §34.6), DKMS
> rebuilds your out-of-tree modules against it, and `apt purge` removes it cleanly.
>
> `make install` gives you none of that, and leaves you removing files by hand later.

```bash
sudo dpkg -i ../linux-image-*.deb ../linux-headers-*.deb
ls /boot/
grep -c menuentry /boot/grub/grub.cfg
# reboot, and pick the new kernel from the GRUB menu (Volume 6 §33.4)
uname -r
```

**Your old kernel is still installed and still in the GRUB menu.** That is your recovery path, and
it's why you never remove the working kernel until the new one has booted successfully.

## 47.4 Configuration, and the shortcut that saves an hour

```bash
make menuconfig         # ncurses interface; '/' searches
make nconfig
make xconfig
```

Options are `y` (built in), `m` (module), or `n`. The search function is essential — the config has
tens of thousands of entries.

**The shortcut worth knowing:**

```bash
make localmodconfig
```

> **`localmodconfig` reads `lsmod` and disables every module you are not currently using.** It can
> cut a build from an hour to under ten minutes and from several gigabytes to a few hundred
> megabytes.
>
> **The catch is in the name: *local*.** It configures for the hardware currently in use. Plug in a
> USB device whose driver was disabled and it won't work. Boot the result on different hardware and
> it may not boot at all. Perfect for a fixed machine; wrong for anything portable.

Practical expectations:

| Build | Rough time on a modern laptop | Disk |
|---|---|---|
| Debian's full config | **30–90 minutes** | **15–25 GB** |
| `localmodconfig` | 5–15 minutes | 2–4 GB |

```bash
nproc; df -h /home | tail -1
```

Use `make -j"$(nproc)"`, and expect the machine to be unusable for other work while it runs — which
is a good moment to remember Volume 6 §36.5's `CPUQuota=` if you'd rather it weren't.

## 47.5 Signing for Secure Boot

If Secure Boot is on, a self-built kernel won't boot until it's signed with an enrolled key — §45.6's
MOK process, applied to the kernel image rather than a module:

```bash
mokutil --sb-state
sbsign --key MOK.priv --cert MOK.pem --output vmlinuz-signed /boot/vmlinuz-6.6.0
```

Or disable Secure Boot in firmware, accepting what Volume 6 §32.6 said you're giving up.

---

# Chapter 48 — Firewalls: `nftables`, and Why Debian Moved

## 48.1 The hook

> **`iptables` worked for twenty years and everyone knows it. Debian's `iptables` command still
> exists and still accepts the same syntax.**
>
> **But it no longer talks to the same kernel code — and hasn't since Debian 10.**

## 48.2 The lineage

> **Confidence: moderate-high** on the sequence and the people; **moderate** on exact years.

| Era | Tool | Kernel |
|---|---|---|
| ~1996 | `ipfwadm` | Linux 2.0 — derived from BSD's `ipfw` |
| ~1999 | `ipchains` | Linux 2.2 — **Rusty Russell** |
| **~2000** | **`iptables` / netfilter** | Linux 2.4 — Russell again |
| **2014** | **`nftables`** | Linux 3.13 — **Pablo Neira Ayuso** |

**netfilter** is the kernel framework: a set of **hook points** in the network stack where packets
can be inspected. `iptables` and `nftables` are two different userspace-and-rule-engine designs
against the same hooks:

```
                     ┌───────────┐
   packet in ───────►│PREROUTING │──┬──► INPUT ──► local process
                     └───────────┘  │
                                    └──► FORWARD ──┐
                                                   ▼
   local process ──► OUTPUT ────────────────► POSTROUTING ───► packet out
```

Those five hook names are unchanged from `iptables` to `nftables` — the framework survived; the rule
engine was replaced.

## 48.3 THE PROBLEM: five things wrong with `iptables`

**1. Four tools, four duplicated kernel implementations.**

```
   iptables   → IPv4        ip6tables → IPv6
   arptables  → ARP         ebtables  → bridging
```

Each had **its own kernel code** performing substantially the same matching. A new feature had to be
written four times, and a rule for IPv4 and IPv6 had to be written twice — which is exactly how
firewalls end up accidentally open on IPv6.

**2. Rule updates were neither atomic nor cheap.** Adding one rule meant userspace **downloading the
entire table, modifying it, and uploading the whole thing back**. On a table with tens of thousands
of rules that is slow, and there's a window during which the ruleset is partially applied.

**3. Every new match type needed a kernel module.** Matching on some new packet field meant writing,
shipping and loading an `xt_*` kernel module. The extension surface grew without bound.

**4. No native sets.** Matching 1,000 addresses meant **1,000 rules, checked linearly, per packet**.
`ipset` existed as a bolt-on precisely because this was untenable.

**5. Inconsistent syntax** across the four tools, with matches whose behaviour differed subtly.

## 48.4 THE MECHANISM: what nftables changed

| Problem | nftables' answer |
|---|---|
| four tools | **one tool (`nft`), one subsystem**, with *families*: `ip`, `ip6`, **`inet`** (both at once), `arp`, `bridge`, `netdev` |
| non-atomic updates | **transactions** — a ruleset either applies completely or not at all |
| a module per match | **a bytecode VM in the kernel**, like BPF. New matches are new *bytecode*, not new kernel code |
| no sets | **native sets and maps**, with hash or interval lookup |
| inconsistent syntax | one grammar |

> **The bytecode VM is the architectural change.** `nft` compiles your rules into instructions for a
> small kernel virtual machine. Adding a match type becomes a userspace concern — which is why
> `nftables` gained features rapidly while `iptables` had stalled.

And the `inet` family is the practical one:

```
table inet filter { ... }     # ONE table covering IPv4 and IPv6
```

That alone removes the most common real-world firewall bug.

## 48.5 Debian's transition

> **Confidence: high.** Debian 10 (buster) switched the default `iptables` command to the
> **`iptables-nft`** backend — a compatibility layer accepting iptables syntax and programming
> nftables underneath.

```bash
iptables -V
update-alternatives --display iptables
ls -l /usr/sbin/iptables
```

```
iptables v1.8.9 (nf_tables)
```

**`(nf_tables)` versus `(legacy)`** is the tell. Your `iptables` commands work; they just produce
nftables rules. Which you can see:

```bash
sudo nft list ruleset
sudo iptables -L -n -v
```

> **A genuine trap that follows:** rules added via `iptables-nft` and rules added via `nft` live in
> the same kernel subsystem but **`iptables -L` will not show you native nft rules.** On a machine
> where both have been used, `iptables -L` shows an incomplete picture. **`nft list ruleset` is the
> authoritative view.** Always check that one before concluding a machine has no firewall.

Debian's shipped service loads a plain config file:

```bash
systemctl status nftables 2>/dev/null
cat /etc/nftables.conf 2>/dev/null
```

## 48.6 A rule you can verify — safely

> ⚠ **FLAGGED, as promised.** Firewall rules can lock you out of a machine, and a mistake on a
> remote host is unrecoverable without console access. **So the first demonstration below runs
> entirely inside a network namespace (§46.4), where the blast radius is exactly zero** — the
> ruleset lives in that namespace and vanishes when the shell exits.

### The safe version

```bash
sudo unshare --net bash -c '
    ip link set lo up
    nft add table inet demo
    nft add chain inet demo input "{ type filter hook input priority 0; policy accept; }"

    echo "--- before the rule ---"
    ping -c1 -W1 127.0.0.1 | tail -2

    nft add rule inet demo input ip daddr 127.0.0.1 icmp type echo-request counter drop

    echo "--- after the rule ---"
    ping -c1 -W1 127.0.0.1 | tail -2

    echo "--- the ruleset, with its counter ---"
    nft list ruleset
'
echo "host ruleset, untouched:"; sudo nft list ruleset | head -5
```

*(Describing — no `nft` on my test box. **The `unshare --net` isolation itself is verified**, §46.4.)*

You should see the ping succeed, then fail, and the rule's `counter` showing exactly one packet
dropped — and the host's ruleset unchanged, because the namespace had its own.

> **`counter` is the feature to remember.** Attach it to any rule and nftables tallies packets and
> bytes matching it. **The way to find out whether a rule is doing anything is to count**, rather
> than reasoning about ordering.

### The real version, with an undo plan

If you want a rule on the host, do it in a **separate table** so cleanup is scoped and cannot touch
anything else:

```bash
# 1. SAVE the current state first
sudo nft list ruleset > /tmp/ruleset-backup.nft

# 2. add an isolated table
sudo nft add table inet mytest
sudo nft add chain inet mytest output '{ type filter hook output priority 0; policy accept; }'
sudo nft add rule inet mytest output ip daddr 192.0.2.1 counter drop   # TEST-NET-1, routes nowhere

# 3. verify
ping -c1 -W1 192.0.2.1; echo "exit: $?"
sudo nft list table inet mytest

# 4. REMOVE — deletes only this table
sudo nft delete table inet mytest
sudo nft list ruleset
```

> **Three habits that make firewall work survivable:**
> 1. **Back up the ruleset before touching it.** `nft list ruleset > file`, restore with
>    `nft -f file`.
> 2. **Use your own table**, so `delete table` is a complete, scoped undo.
> 3. **On a remote machine, set a dead-man's switch first**, so a mistake heals itself:
>    ```bash
>    sudo systemd-run --on-active=5min --unit=fw-rollback \
>         nft -f /tmp/ruleset-backup.nft
>    ```
>    That's Volume 7 §42.8's transient timer used as an insurance policy. Cancel it with
>    `systemctl stop fw-rollback.timer` once you've confirmed you still have access.

A realistic host ruleset, for reference:

```
#!/usr/sbin/nft -f
flush ruleset

table inet filter {
    chain input {
        type filter hook input priority 0; policy drop;

        ct state established,related accept       # replies to things we started
        ct state invalid drop
        iif lo accept                             # loopback always
        ip protocol icmp accept                   # and icmpv6 for IPv6 — mandatory
        ip6 nexthdr icmpv6 accept
        tcp dport 22 ct state new limit rate 10/minute accept
        counter                                   # count what falls through to DROP
    }
    chain forward { type filter hook forward priority 0; policy drop; }
    chain output  { type filter hook output  priority 0; policy accept; }
}
```

> **`ct state established,related accept` as the first rule is what makes a default-drop policy
> usable at all** — it's connection tracking, and it's why you don't need a rule for every reply
> packet. And **never drop ICMPv6**: IPv6 depends on it for neighbour discovery and path MTU
> discovery, so a firewall that blocks it produces the worst kind of failure — intermittent and
> size-dependent.

And Debian's friendlier front-ends, both of which generate nftables underneath:

```bash
apt-cache show ufw firewalld 2>/dev/null | grep -E '^(Package|Description:)' | head -4
sudo ufw status verbose 2>/dev/null
```

## 48.7 Hardening that isn't a firewall

A firewall controls packets. Most of the useful hardening on a single-user laptop isn't about
packets at all, and this book has already covered nearly all of it:

```bash
echo "=== what is even listening? (Volume 5 §29.5) ==="
sudo ss -tlnp | awk 'NR==1 || $4 !~ /^(127\.|\[::1\])/'

echo "=== sysctl network hardening (Volume 2 §12.7's debt) ==="
sysctl net.ipv4.conf.all.rp_filter net.ipv4.tcp_syncookies \
       net.ipv4.conf.all.accept_redirects net.ipv4.ip_forward 2>/dev/null

echo "=== the symlink protections Volume 3 §19.7 said to CHECK ==="
sysctl fs.protected_symlinks fs.protected_hardlinks fs.protected_fifos 2>/dev/null

echo "=== kernel pointer exposure, and BPF ==="
sysctl kernel.kptr_restrict kernel.dmesg_restrict kernel.unprivileged_bpf_disabled 2>/dev/null

echo "=== mount options (Volume 3 §17.7) ==="
findmnt -no TARGET,OPTIONS /tmp /home /var 2>/dev/null | grep -E 'nosuid|noexec|nodev' \
  || echo "  none of /tmp /home /var use nosuid/noexec/nodev"

echo "=== AppArmor (Debian ships it enabled) ==="
sudo aa-status 2>/dev/null | head -5
```

Set them persistently the usual way — a drop-in, for the seventh time in this book:

```bash
sudo tee /etc/sysctl.d/99-local-hardening.conf >/dev/null <<'EOF'
net.ipv4.conf.all.accept_redirects = 0
net.ipv4.conf.all.send_redirects = 0
net.ipv4.tcp_syncookies = 1
fs.protected_symlinks = 1
fs.protected_hardlinks = 1
kernel.kptr_restrict = 1
EOF
sudo sysctl --system
```

> **On a laptop with nothing listening on a non-loopback address, a packet firewall protects against
> very little** — there is nothing for a packet to reach. The higher-value work is Volume 3 §17.7's
> mount options, Volume 2 §11.8's setuid inventory, Volume 5's "what's listening," Volume 6 §36.8's
> persistent journal, and keeping the machine patched. Volume 7's `sysnap` reports on most of it
> weekly.

---

# Chapter 49 — The Synthesis: One Command, Eight Volumes

## 49.1 The hook

> **`sudo apt install cowsay`**
>
> **Four words. Roughly three seconds. Every single mechanism in this book.**

Let's trace it. Every step names the volume that explained it, and most have a command that lets you
watch that step happen.

## 49.2 The trace

### Steps 1–3: getting the command into bash

**1. Your keystrokes go to the kernel, not to bash.** (Volume 1 §2.3)

The terminal emulator holds a pty master; bash reads the slave. Between them sits the **line
discipline** — kernel code that handles Backspace and turns Ctrl+C into SIGINT. Except bash has
switched it into raw mode so readline can do arrow keys, and will switch it back before running
anything.

```bash
tty; stty -a | head -2
```

**2. Enter. Bash expands, in a defined order.** (Volume 1 §2.4)

Brace, tilde, parameter, command substitution, **word splitting**, globbing, quote removal. Nothing
here needs it — but this is where `"$var"` would have mattered, and where Volume 1 §7.6's Steam bug
lived.

**3. Bash resolves `sudo`.** (Volume 1 §2.5)

Alias → function → builtin → `$PATH`, left to right, first match wins, result cached in the hash
table.

```bash
type -a sudo; hash
```

### Steps 4–6: becoming root

**4. `fork()` — which is really `clone`, syscall 56.** (Volume 1 §2.6, §44.4)

Bash duplicates itself copy-on-write. The child gets the same memory, descriptors, environment and
working directory; only the return value differs.

**5. `execve()`, syscall 59.** (Volume 1 §2.7, §44.4)

The child's memory image is discarded and `/usr/bin/sudo` is mapped in. **The PID survives; the
program doesn't.** Open file descriptors survive too — which §46 and Volume 6 §36.4 both turned into
security mechanisms.

**6. The setuid bit fires.** (Volume 2 §11.3)

```bash
ls -l /usr/bin/sudo
```

```
-rwsr-xr-x 1 root root ... /usr/bin/sudo
```

At `execve` time the kernel sets the **effective UID to 0** while leaving the **real UID** as yours.
Volume 2 §11.3 showed this split with a setuid copy of `id` returning two different answers.

### Steps 7–9: sudo decides, and discards your world

**7. Policy check.** (Volume 2 §11.5) `/etc/sudoers` is consulted, your group membership checked
against `%sudo ALL=(ALL:ALL) ALL`.

**8. `env_reset` and `secure_path`.** (Volume 2 §11.6)

> **sudo throws your entire environment away** and substitutes its own `$PATH`. Volume 1 §7's
> Shellshock exploited transparent environment inheritance; Volume 1 §2.5's trojan exploited `$PATH`
> order. **sudo refuses to trust either** — allowlist, not blocklist.

```bash
FOO=bar sudo env | grep -c '^FOO=' || echo "stripped"
sudo sh -c 'echo "$PATH"'
```

**9. It's logged, with your name.** (Volume 6 §36.7)

```bash
sudo journalctl -t sudo -n 3 --no-pager
```

Not "someone became root." **You, your tty, your working directory, the exact command.** That was
Volume 2 §11.4's strongest argument for the sudo model over a shared root password.

### Steps 10–12: apt thinks

**10. apt reads its configuration.** (Volume 3 §14, §18)

`open()`, `read()`, `close()` — syscalls 257, 0, 3 — against `/etc/apt/sources.list`, the
`sources.list.d` drop-ins, and `/var/lib/dpkg/status`. That last file is **plain text you can grep**
(Volume 4 §21.4), 25,000 lines of RFC-822 stanzas.

```bash
grep -c '^Package:' /var/lib/dpkg/status
```

**11. Dependency resolution.** (Volume 4 §23.2)

apt must find a set of package versions satisfying every `Depends`, violating no `Conflicts`, keeping
everything installed still satisfiable. **This is NP-complete** — reducible from 3-SAT — over roughly
60,000 packages, and it finishes before you've read the prompt.

```bash
apt-cache stats | head -5
apt-get -s install cowsay
```

**12. `Recommends` are pulled in too**, because that's Debian's default (Volume 4 §23.3).

### Steps 13–17: the network

**13. Name resolution.** (Volume 5 §27.4)

`getaddrinfo("deb.debian.org")` → NSS → `/etc/nsswitch.conf` → `files` then `dns` → your resolver →
possibly a full delegation walk from the root servers.

```bash
grep '^hosts:' /etc/nsswitch.conf
getent hosts deb.debian.org
```

**14. Routing decision.** (Volume 5 §26.5) `(dest & mask) == (mine & mask)`? No → the default route.

```bash
ip route get "$(getent hosts deb.debian.org | awk '{print $1; exit}')"
```

**15. ARP for the gateway's MAC.** (Volume 5 §26.6) The IP header names the server; the **ethernet
header names your router**, and will be rewritten at every hop.

**16. TCP handshake, then TLS.** (Volume 5 §28.6–28.7)

SYN, SYN-ACK, ACK. Then **X25519 ephemeral key exchange** — Volume 5 §30.5's Diffie–Hellman on a
curve, which you verified by hand with `p=23, g=5` — and certificate validation against
`/etc/ssl/certs/ca-certificates.crt`, **which arrived via apt** (Volume 5 §28.7).

```bash
curl -s -o /dev/null -w 'dns %{time_namelookup}s  tcp %{time_connect}s  tls %{time_appconnect}s\n' \
  https://deb.debian.org/
```

**17. Signature verification.** (Volume 4 §23.6)

`InRelease` is PGP-signed and contains SHA256 hashes of `Packages`; `Packages` contains the SHA256 of
each `.deb`. **One signature covers the whole archive transitively.** Tamper anywhere and a hash
fails.

```bash
head -12 /var/lib/apt/lists/*InRelease 2>/dev/null
```

### Steps 18–22: dpkg does the work

**18. The `.deb` is opened.** (Volume 4 §22.3)

An **`ar` archive** with three members in a mandated order: `debian-binary`, `control.tar.*`,
`data.tar.*`.

```bash
apt download cowsay && ar t cowsay_*.deb && dpkg-deb -c cowsay_*.deb | head -5
```

**19. Files are written.** (Volume 3 §15, §19; Volume 2 §10)

Each file gets an **inode** — mode bits, owner, timestamps, block pointers, link count. The data
lands in the **page cache as dirty pages** and reaches the disk seconds later, which is Volume 3
§19's entire incident.

```bash
grep -E '^(Dirty|Writeback):' /proc/meminfo
```

**20. Maintainer scripts run as root.** (Volume 4 §21.6)

`preinst`, then unpack, then `postinst configure`. **Arbitrary root code from the internet** — which
is exactly why step 17 is not optional.

**21. Triggers fire.** (Volume 4 §21.8) `Processing triggers for man-db` — the index rebuilt once at
the end rather than per-package.

**22. For a service, systemd takes over.** (Volume 6 §36)

`daemon-reload`, the unit starts in **its own cgroup**, and every process it forks stays there — so
`systemctl stop` reaches all of them and Volume 2 §12.2's PID-reuse hazard never applies.

```bash
systemd-cgls /system.slice 2>/dev/null | head -10
```

### Steps 23–24: afterwards

**23. All of it is in the journal.** (Volume 6 §36.7) With trusted `_PID`, `_UID` and `_SYSTEMD_UNIT`
fields the kernel supplied, not the program.

**24. And next Sunday at 04:00** — plus up to 30 minutes of jitter — **`sysnap` records the change**
(Volume 7 §43): a new entry in `packages-manual.txt`, logged, and an alarm if it fails.

```bash
cowsay "eight volumes"
```

## 49.3 What the trace shows

Read back over those twenty-four steps and three things stand out.

**Every layer hides the one below, and that's what made it buildable.** `apt` doesn't know about
TCP; TCP doesn't know about ethernet; ethernet doesn't know about the files being written. Volume 5
§26.2's layering principle isn't a diagram in a textbook — it's why a single command can traverse
thirty years of independently-developed software without any of it coordinating.

**Every security control in the chain is a *narrowing*, not an addition.** setuid narrows *when*
privilege applies. `env_reset` narrows what's inherited. The hash chain narrows what counts as a
valid package. cgroups narrow what a process may consume. seccomp narrows which of 373 syscalls it
may make. **Nothing in the chain grants capability; everything restricts it** — which is the shape
of a system designed by people who assumed things would go wrong.

**And the whole thing is inspectable.** Every step above has a command. Not a debugger, not vendor
tooling — `cat`, `ls`, `grep` against `/proc` and `/sys` and plain-text databases. That is not an
accident either; it's Volume 3 §14's "everything is a file" cashed out over an entire operating
system.

---

# Chapter 50 — Rabbit Holes Worth Falling Into

Things that didn't fit anywhere else and deserve to exist somewhere.

## 50.1 `/dev/full` — a device that is always out of space

```bash
ls -l /dev/full
echo "hello" > /dev/full; echo "exit status: $?"
```

```
crw-rw-rw- 1 root root 1, 7 /dev/full
bash: echo: write error: No space left on device
exit status: 1
```

*(Verified.)* **A character device whose only behaviour is to return `ENOSPC` on every write.** It
exists so you can test whether your software handles a full disk without filling one. Reading from it
returns an infinite stream of zero bytes, like `/dev/zero`.

```bash
ls -l /dev/null /dev/zero /dev/full /dev/random /dev/urandom
```

Four devices that do nothing, in four different ways, and every one is load-bearing somewhere.

## 50.2 Magic SysRq — the kernel's emergency console

```bash
cat /proc/sys/kernel/sysrq
```

```
1
```

*(Verified — `1` means all functions enabled.)* SysRq is a **direct line to the kernel** that works
even when userspace is completely wedged — no shell, no X, no responding init. Press
**Alt + SysRq (PrintScreen) + a letter**:

| Key | Does |
|---|---|
| **R** | take keyboard control back from X |
| **E** | SIGTERM to all processes except init |
| **I** | SIGKILL to all processes except init |
| **S** | **sync all filesystems** |
| **U** | remount all filesystems read-only |
| **B** | reboot **immediately**, no shutdown |

> **"REISUB"** — the mnemonic is "BUSIER" backwards — is the sequence for a machine that has stopped
> responding entirely. Wait a few seconds between letters. **It is dramatically better than holding
> the power button**, because `S` and `U` get your filesystems to a consistent state first.
>
> Worth knowing *before* you need it, since by definition you won't be able to look it up.

```bash
# to enable if it's 0 (as a drop-in — the seventh appearance of the pattern)
echo 'kernel.sysrq = 1' | sudo tee /etc/sysctl.d/99-sysrq.conf
```

## 50.3 Your machine lies about memory, deliberately

```bash
cat /proc/sys/vm/overcommit_memory
cat /proc/self/oom_score /proc/self/oom_score_adj
free -h
```

```
0
666
0
```

*(Verified — and yes, my shell's OOM score really was 666.)*

> **Linux grants more memory than it has**, because programs routinely allocate far more than they
> touch. Mode `0` is a heuristic: allow anything that isn't obviously absurd.
>
> Which creates the **OOM killer**: when the lie comes due, something must die. The kernel scores
> every process — largely by memory footprint, adjusted by `oom_score_adj` — and kills the highest.
> Famously, this often means the database, because it was using the most memory, which is also why it
> mattered.

```bash
# make a process a preferred victim (range: -1000 protected .. 1000 kill me first)
echo 500 | sudo tee /proc/$$/oom_score_adj
sudo dmesg | grep -i 'killed process' | tail -3
```

Volume 6 §36.5's `MemoryMax=` is the civilised alternative: a cgroup limit fails the allocation *in
that service* rather than letting the kernel pick a victim system-wide.

## 50.4 Programs older than the C language

```bash
sudo apt install dc ed units bsdgames
echo '2 3 + 4 * p' | dc
```

**`dc`** — desk calculator, reverse Polish notation — is among the very oldest surviving Unix
programs. It was written **before C existed**, in B, and `bc` was originally a *front end* that
compiled infix expressions down to `dc`.

> **Confidence: moderate-high** on `dc` predating C and on `bc` originally being a `dc` front end.
> This is well attested in Unix histories, though I'd check a primary source before quoting it.

**`ed`** is "the standard editor" — the joke being that it's the one you're guaranteed to have. It's
also genuinely the ancestor: `ed` → `ex` → `vi` → `vim`. The `:`-commands in vim are `ex` commands,
which are `ed` commands.

```bash
printf 'a\nhello from ed\n.\nw /tmp/ed-demo.txt\nq\n' | ed -s
cat /tmp/ed-demo.txt && rm -f /tmp/ed-demo.txt
```

And **`units`**, which is obscure and immediately useful:

```bash
units -t '25 degC' 'degF'
units -t '1 lightyear' 'km'
units -t '100 km/hour' 'mph'
```

## 50.5 The coreutils nobody uses

```bash
factor 1234567890
rev <<< "Debian"
shuf -i 1-10 -n 3
tac /etc/hostname
numfmt --to=iec 1234567890
seq -s, 1 10
paste <(seq 3) <(echo -e "a\nb\nc")
```

```
1234567890: 2 3 3 5 3607 3803
naibeD
```

*(Both verified.)* `factor` is in coreutils because early Unix was a research OS at a company with a
lot of mathematicians, and nobody ever removed it.

## 50.6 The `man 7` section, which nobody reads

Volume 1 §5.2 listed the manual sections. **Section 7 is the one worth browsing for its own sake** —
it's conventions and overviews rather than commands:

```bash
man 7 hier           # the filesystem hierarchy      (Volume 3 §16)
man 7 signal         # every signal and its number   (Volume 2 §12.4)
man 7 glob           # the wildcard rules            (Volume 1 §3.6)
man 7 capabilities   # every capability, explained   (Volume 2 §11.8)
man 7 namespaces     # the eight, authoritatively    (§46.4)
man 7 credentials    # real/effective/saved UIDs     (Volume 2 §11.3)
man 7 ascii          # the table, right there
man 7 units          # binary vs decimal prefixes
man 7 random         # how the kernel's CSPRNG works (Volume 4 §25)
man 7 inode          # what an inode contains        (Volume 3 §15)
man 7 socket         # the socket API                (Volume 5 §29)
```

```bash
man -k . -s 7 2>/dev/null | head -30
```

> **`man 7 capabilities` and `man 7 namespaces` in particular are better than most of what's written
> about them elsewhere**, because they're maintained alongside the kernel by the people who
> implemented it. Michael Kerrisk maintained the Linux man-pages project for two decades and the
> quality shows.

## 50.7 The documentation you already have

```bash
ls /usr/share/doc/ | wc -l
zless /usr/share/doc/bash/changelog.Debian.gz     # Volume 1 §5.4
find /usr/share/doc -name 'README.Debian*' | head
ls /usr/share/doc/*/examples/ 2>/dev/null | head -20
```

Volume 1 §5.4 established that **Debian Policy requires** every package to ship documentation. So
`/usr/share/doc` contains a few hundred megabytes of material written by the people who packaged
your software, and almost nobody opens it.

```bash
sudo apt install debian-policy developers-reference
ls /usr/share/doc/debian-policy/
sudo apt install linux-doc      # the kernel's own Documentation/ tree
ls /usr/share/doc/linux-doc*/ 2>/dev/null
```

## 50.8 Genuinely fun, and verified real

```bash
apt moo
aptitude -vvvvvv moo
sudo apt install sl cowsay fortune-mod cmatrix bsdgames
sl                          # type it when you meant ls
fortune | cowsay -f tux
fortune debian-hints        # actually useful hints, from fortune-mod
cmatrix
ls /usr/games/              # bsdgames: tetris-bsd, worm, hangman, adventure...
```

Volume 1's TRY THIS #6 started this; `fortune debian-hints` is the one that's both a joke and
genuinely educational.

## 50.9 Where to go from here

| If you want | Read |
|---|---|
| Authoritative kernel interface docs | `man 2 syscalls`, `man 7 *`, the kernel's `Documentation/` |
| How Debian actually works | `debian-policy`, `developers-reference` packages |
| To package something | the **Debian New Maintainers' Guide**; `dh_make`, `lintian` |
| To contribute | `bugs.debian.org`, `reportbug`, the mentors process |
| Deeper kernel | *Linux Kernel Development* (Love); *Understanding the Linux Kernel* (Bovet & Cesati) |
| Deeper Unix history | Kernighan's *Unix: A History and a Memoir*; the Ritchie and Thompson papers |
| To practise | run `testing` in a VM, break it, fix it |

```bash
sudo apt install reportbug lintian devscripts
reportbug --help | head -5
```

> **And the highest-leverage next step is not reading.** Install Debian in a VM, deliberately break
> something from each volume — corrupt `fstab`, lock yourself out of sudoers, install a broken
> initramfs — and recover it. Volume 6 §33.5's `init=/bin/bash` and `emergency.target` are the tools.
> **You will learn more from one recovered system than from another book.**

---

# TRY THIS ON YOUR MACHINE

Six things for the last volume. **Items 1–3 are fully verified**; the rest need tooling my test box
lacked and are marked.

---

## 1. Catch a process inside a syscall, and name it

**Needs:** `manpages-dev` for the header. *(Verified.)*

```bash
H=/usr/include/x86_64-linux-gnu/asm/unistd_64.h
decode() { grep -E "^#define __NR_\w+ $1$" "$H" | awk '{print $2}' | sed 's/__NR_//'; }

echo "total syscalls on this architecture: $(grep -c '^#define __NR_' "$H")"

sleep 30 & P=$!; sleep 0.3
echo "sleep  is in #$(awk '{print $1}' /proc/$P/syscall) = $(decode "$(awk '{print $1}' /proc/$P/syscall)")"
kill $P

cat >/dev/null & C=$!; sleep 0.3
echo "cat    is in #$(awk '{print $1}' /proc/$C/syscall) = $(decode "$(awk '{print $1}' /proc/$C/syscall)")"
kill $C

echo "bash   is in #$(awk '{print $1}' /proc/$$/syscall) = $(decode "$(awk '{print $1}' /proc/$$/syscall)")"
```

**What you should see:** `sleep` in **`clock_nanosleep`** (#230), `cat` in **`read`** (#0), and your
shell in **`wait4`** (#61) — exactly the call Volume 1 §2.8 said the shell blocks in while a child
runs.

**Why it's interesting:** 373 numbered entry points are the *entire* interface between every program
on your machine and the kernel. You can point at any process and name the one it's sitting in.
Volume 1 §2.8's "bash is blocked in `wait4()`" stops being a claim and becomes something you read out
of `/proc`.

---

## 2. Become PID 1

**Needs:** `util-linux` (installed by default) and `sudo`. *(Verified.)*

```bash
echo "outside: \$\$=$$, PID 1 is $(cat /proc/1/comm), $(ls /proc | grep -c '^[0-9]') processes"
echo "outside pid namespace: $(readlink /proc/self/ns/pid)"

sudo unshare --pid --fork --mount-proc bash -c '
    echo "inside:  \$\$=$$, PID 1 is $(cat /proc/1/comm)"
    echo "inside pid namespace: $(readlink /proc/self/ns/pid)"
    echo "processes I can see:"
    ps -eo pid,comm --no-headers | sed "s/^/    /"
'
```

**What you should see** *(this is my real output)*:

```
outside: $$=499, PID 1 is process_api, 51 processes
outside pid namespace: pid:[4026531836]
inside:  $$=1, PID 1 is bash
inside pid namespace: pid:[4026532209]
processes I can see:
      1 bash
      3 ps
```

**Why it's interesting:** **that's a container**, in one command, with no Docker. Volume 2 §12.2 said
PID 1 is special; here *bash* is PID 1. And the changed namespace inode is the proof — two processes
are in the same namespace **if and only if** those numbers match, which makes "is this contained?" a
comparison rather than a guess. Note `--mount-proc`: without it, `/proc` would still show the host's
process table and the illusion would collapse instantly.

---

## 3. Isolate the other four namespaces

**Needs:** `sudo`. *(All verified.)*

```bash
echo "=== UTS: your own hostname ==="
echo "  outside: $(hostname)"
sudo unshare --uts bash -c 'hostname container-demo; echo "  inside:  $(hostname)"'
echo "  outside: $(hostname)   (unchanged)"

echo; echo "=== NET: your own network stack ==="
echo "  outside: $(awk 'NR>2{print $1}' /proc/net/dev | tr -d ':' | tr '\n' ' ')"
sudo unshare --net bash -c 'echo "  inside:  $(awk "NR>2{print \$1}" /proc/net/dev | tr -d ":" | tr "\n" " ")"'

echo; echo "=== MNT: your own mount table ==="
mkdir -p /tmp/nsdemo && echo "visible outside" > /tmp/nsdemo/file
sudo unshare --mount bash -c 'mount -t tmpfs none /tmp/nsdemo; echo "  inside:  $(ls /tmp/nsdemo | wc -l) files"'
echo "  outside: $(ls /tmp/nsdemo | wc -l) files — the mount was PRIVATE"
rm -rf /tmp/nsdemo

echo; echo "=== and all namespaces on this machine ==="
sudo lsns
```

**What you should see:** hostname changed inside and not outside; interfaces reduced to just `lo`; a
tmpfs mounted over a directory that remains untouched from outside.

**Why it's interesting:** each of these is a *different table the kernel consults on the process's
behalf*. That's the whole of container isolation — not virtualisation, just **different lookup
results**. The net namespace also explains how two containers both bind port 80: Volume 5 §29.4's
four-tuple uniqueness, scoped per namespace. And the mount one is Volume 3 §17.4's shadowing, made
private.

---

## 4. Make a syscall without libc

**Needs:** `gcc`. *(Verified.)*

```bash
cat > /tmp/raw.c <<'EOF'
#include <unistd.h>
#include <sys/syscall.h>
#include <string.h>
#include <stdio.h>
int main(void) {
    const char *m = "written with syscall(SYS_write, ...) — no printf, no write()\n";
    syscall(SYS_write, 1, m, strlen(m));
    char b[80];
    int n = snprintf(b, sizeof b, "SYS_write=%d  SYS_getpid=%d  my pid=%ld\n",
                     SYS_write, SYS_getpid, syscall(SYS_getpid));
    syscall(SYS_write, 1, b, n);
    return 0;
}
EOF
gcc -O0 -o /tmp/raw /tmp/raw.c && /tmp/raw
objdump -d /tmp/raw | grep -c syscall
rm -f /tmp/raw /tmp/raw.c
```

**What you should see:** both lines printed, with `SYS_write=1` and `SYS_getpid=39`.

**Why it's interesting:** you just did what `printf` does, minus every layer of libc. The numbers
are a **permanently stable ABI** — `write` has been 1 on x86-64 since the port existed, and will
stay 1, because binaries compiled a decade ago must keep working. And the `syscall` *instruction*
inside glibc's wrapper is the literal boundary: one instruction, ring 3 to ring 0, and back.

---

## 5. Find everything sandboxing itself

**Needs:** nothing. *(Partly verified — the fields exist; my box had nothing sandboxed.)*

```bash
echo "=== processes running under a seccomp filter ==="
for p in /proc/[0-9]*; do
  s=$(awk '/^Seccomp:/{print $2}' "$p/status" 2>/dev/null)
  [[ ${s:-0} -gt 0 ]] && printf '  mode %s  %s\n' "$s" "$(cat "$p/comm" 2>/dev/null)"
done | sort -u | head -15

echo; echo "=== systemd units that restrict their own syscalls ==="
systemctl show '*' -p Names -p SystemCallFilter -p NoNewPrivileges 2>/dev/null \
  | paste - - - | grep -v 'SystemCallFilter=$' | head -10

echo; echo "=== capabilities instead of full root (Volume 2 §11.8) ==="
getcap -r /usr/bin /usr/sbin 2>/dev/null

echo; echo "=== and the setuid inventory, for comparison ==="
find / -xdev -perm -4000 -type f 2>/dev/null | wc -l
```

**What you should see:** browser processes and container runtimes in seccomp mode 2; several systemd
units with `SystemCallFilter=`; `ping` carrying `cap_net_raw` rather than being setuid.

**Why it's interesting:** these are three *different* ways to narrow the §44 boundary — **seccomp
filters which syscalls, capabilities subdivide what's behind them, and namespaces change what they
return.** Compare the seccomp list against the setuid count: the setuid binaries are the programs
where one bug means root (Volume 2 §11.8), and the trend across the last decade has been to shrink
that list by moving to the other two mechanisms.

---

## 6. Build a firewall rule that cannot possibly affect you

**Needs:** `nftables` and `sudo`. *(Described — no `nft` on my test box. The `unshare --net`
isolation **is** verified, item 3.)*

```bash
sudo unshare --net bash -c '
    ip link set lo up
    nft add table inet demo
    nft add chain inet demo input "{ type filter hook input priority 0; policy accept; }"

    echo "--- before ---"
    ping -c1 -W1 127.0.0.1 2>&1 | tail -2

    nft add rule inet demo input ip daddr 127.0.0.1 icmp type echo-request counter drop

    echo "--- after ---"
    ping -c1 -W1 127.0.0.1 2>&1 | tail -2

    echo "--- the rule, with its counter ---"
    nft list ruleset
'
echo "=== and the host ruleset, untouched ==="
sudo nft list ruleset | head -10
```

**What you should see:** ping succeeding, then failing, the rule's `counter` showing exactly one
dropped packet — and the host's ruleset entirely unchanged.

**Why it's interesting:** this is the safest possible way to learn firewalling. **The network
namespace has its own interfaces, routes and ruleset**, so a mistake is contained to a shell that
exits; there is no lockout to recover from. It also demonstrates the feature worth remembering:
**`counter` on a rule is how you find out whether it's doing anything**, rather than reasoning about
rule ordering. And on a real host, always: back up the ruleset, use your own table so `delete table`
is a complete undo, and on a remote machine arm a `systemd-run --on-active` rollback first (§48.6).

---

# Volume 8 Retrospective

**1. There are 373 syscalls, and that's the whole interface.** Everything privileged your machine
does goes through one CPU instruction, one kernel-chosen entry address, and a numbered table. Once
you see that, the security mechanisms stop being a grab-bag: **seccomp filters which entries,
capabilities subdivide what's behind them, namespaces change what they return.**

**2. `linux-vdso.so.1` is not a file.** It's kernel code mapped into every process so that frequent,
unprivileged calls like `clock_gettime()` never trap at all. Volume 1 §2.7's unexplained `ldd` line,
resolved.

**3. A kernel module doesn't run *in* the kernel — it *becomes* the kernel.** No isolation, no memory
protection, ring 0. That's why `vermagic` refuses mismatched builds, why Secure Boot must cover
modules or achieve nothing, and why DKMS exists.

**4. A container is not a lightweight VM. It's a process with different tables.** Five namespaces, a
cgroup, and `pivot_root` — assembled by hand in §46.7. Docker's real contributions are the image
format, the registry, and the *default* capability and seccomp restrictions, which are stronger than
what `unshare` gives you.

**5. Namespace membership is an inode comparison.** `readlink /proc/PID/ns/pid`. Two processes are in
the same namespace if and only if the numbers match — verified, `4026531836` outside and
`4026532209` inside.

**6. Docker group membership is root**, and now for a specific reason: the socket's permissions are
the entire authentication, and a `--privileged` container bind-mounting `/` has all capabilities and
no seccomp filter. Volume 2 §14.3's `disk` group, again.

**7. Build kernels with `make bindeb-pkg`, never `make install`** — because then Volume 4's dpkg
tracks it, Volume 6's hooks run `update-initramfs` and `update-grub`, DKMS rebuilds against it, and
`apt purge` removes it. And keep the old kernel until the new one boots.

**8. iptables was replaced for five concrete reasons**, not fashion: four tools duplicating kernel
code, non-atomic O(n) updates, a kernel module per match type, no native sets, and inconsistent
syntax. nftables answers each with one tool, transactions, a bytecode VM, and native sets. **Debian
10 made `iptables` a shim** — check with `iptables -V` for `(nf_tables)`, and remember `nft list
ruleset` is the authoritative view.

**9. A network namespace is the right place to learn firewalling**, because the blast radius is
exactly zero.

**10. And the synthesis holds up.** Four words — `sudo apt install cowsay` — traverse the line
discipline, expansion order, fork/exec, setuid, sudoers, env_reset, the dpkg database, an NP-complete
solver, DNS, routing, ARP, TCP, X25519, a hash chain, an `ar` archive, inode allocation, the page
cache, maintainer scripts, triggers, cgroups and the journal. **Every layer hides the one below,
every security control is a narrowing rather than an addition, and every single step is inspectable
with `cat` and `grep`.**

---

# The Book Is Finished

**File: `volume-8-advanced-and-synthesis.md`**

Eight volumes, fifty chapters, and a machine you can now read.

## What ran through all of it

**Six incidents, one shape.** Shellshock's `() {` prefix, Steam's empty variable, Baron Samedit's
trailing backslash, ext4's write-that-wasn't, Debian's 32,768 keys, Kaminsky's transaction ID,
regreSSHion's signal handler, and Toy Story 2's backup. Every one is the same failure: **something
was assumed to guarantee a property it never actually provided**, and the code behaved perfectly
right up until it mattered. That pattern is worth more than any individual fact in this book.

**Debian's answer to "how do I change this without fighting the package manager" is always a drop-in
directory.** `/etc/sudoers.d`, `/etc/apt/sources.list.d`, `/etc/ssh/sshd_config.d`, `/etc/grub.d`,
`/etc/systemd/system/*.d`, `/etc/modprobe.d`, `/etc/sysctl.d`. Seven appearances, one idea.

**And there's a validation tool for every file that can lock you out.** `visudo`,
`findmnt --verify`, `sshd -t`, `systemd-analyze verify`, `systemd-analyze calendar`, `shellcheck`,
`nft -c`. **Use them.** The whole category exists because people learned the hard way, repeatedly.

**A bit that is set is not a bit that is honoured.** `chown` strips setuid silently; the kernel
ignores it on scripts; `nosuid` disables it wholesale. The `s` in `ls -l` means "this bit is set,"
not "this will work."

## On being wrong

Something worth saying plainly, because it shaped the book.

I was wrong repeatedly while writing this, and caught it only by running the commands. `/proc/PID/environ`
turned out to be a snapshot rather than live state. `chown` silently stripped a setuid bit I'd set in
the wrong order. `fs.protected_symlinks` didn't have the uniform default I expected. In Volume 7 my
test harness for `set -e` was disabled by the very rule it was testing — and then, twenty minutes
after documenting that class of bug, I wrote one into the capstone script.

Every one of those is still in the text, with the mistake visible.

> **That's the actual method, and it's the most transferable thing here.** The documentation tells you
> what should happen. `/proc`, `strace`, `stat`, `nft list ruleset` and `echo $?` tell you what does.
> **When they disagree, the machine is right.**

You now have the tools to check anything in this book on your own system. Several claims here carry
confidence flags precisely because I couldn't verify them in my environment and you can in yours.
**Go and check them.** Finding one of them wrong would be the best possible outcome.

## What to do next

Install Debian in a VM. Break it — corrupt `/etc/fstab`, remove yourself from `sudo`, ship a bad
initramfs, write a firewall rule that locks you out. Then recover it, using `init=/bin/bash`,
`emergency.target`, and a rescue USB.

**You will learn more from one system you broke and fixed than from a second reading of this.**

```bash
cowsay "Good luck."
```

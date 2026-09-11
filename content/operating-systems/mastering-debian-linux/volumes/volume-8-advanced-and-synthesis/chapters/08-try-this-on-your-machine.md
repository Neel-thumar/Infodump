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


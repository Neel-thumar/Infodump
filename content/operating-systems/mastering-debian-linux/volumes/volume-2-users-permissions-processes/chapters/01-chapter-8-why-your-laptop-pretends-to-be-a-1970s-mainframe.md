# Chapter 8 — Why Your Laptop Pretends to Be a 1970s Mainframe

## 8.1 The hook

> **You are the only person who uses your laptop. So why does every single file on it record an
> owner, a group, and nine separate permission bits — and why does the machine maintain a list of
> forty-odd "users" who are not you?**

Run this and look at what's there:

```bash
cut -d: -f1,3 /etc/passwd | column -t -s:
wc -l /etc/passwd
```

```
root            0
daemon          1
bin             2
sys             3
sync            4
games           5
man             6
...
systemd-network 998
messagebus      100
sshd            104
you             1000
```

Forty or so accounts. One of them is you. **None of the others is a person**, and yet the system
maintains passwords, home directories and login shells for all of them.

The answer to the hook is historical and then, surprisingly, becomes contemporary again.

## 8.2 THE PROBLEM: computers were shared, because they were unaffordable

In 1970 a PDP-11 cost roughly the price of a house and occupied a rack. **The idea of one computer
per person was economically absurd.** A department bought one machine and everybody used it at once,
through terminals.

That model is called **timesharing**, and it was the dominant research direction of the era:

- **CTSS** — the Compatible Time-Sharing System, MIT, first demonstrated around 1961–1962, led by
  Fernando Corbató. One of the first working timesharing systems.
- **Multics** — CTSS's ambitious successor (Volume 1 §1.2), designed explicitly as a *computing
  utility*: you'd buy computing the way you buy electricity, and the system would keep strangers'
  data separate as a matter of course.
- **Unix** — built by people who had just spent years on Multics and had absorbed its assumptions,
  while rejecting its size.

> **Confidence: high** on CTSS's existence, Corbató's leadership and the early-1960s timeframe;
> **moderate** on the precise first-demonstration date, which is variously given as 1961 or 1962.

So the requirement Unix inherited was not "protect the user from mistakes." It was:

> **Twenty people are logged in right now. Some of them are undergraduates. None of them should be
> able to read, modify, or delete each other's work, and none of them should be able to take down the
> machine.**

Every permission bit in this volume exists to answer that sentence.

## 8.3 THE INCIDENT: the CTSS password file, 1966

The best evidence that this was a real problem — not a theoretical one — is that the first documented
password disaster happened before Unix existed at all.

CTSS had a text editor which, when invoked, wrote its working file to a **fixed temporary filename in
a common directory**. One afternoon two administrators were editing simultaneously: one had the
**password file** open, the other had the **message-of-the-day** file open.

The temporary files collided. The password file's contents ended up in the message file.

**And the message of the day is printed to every user at login.**

> **Confidence: moderate-high on the incident, moderate on the date.** The story is recounted by
> Fernando Corbató himself in interviews and retrospectives, and 1966 is the year usually given.
> The precise mechanism is described slightly differently in different tellings. I would treat it as
> substantially true and the details as approximate.

Two things about that incident echo through this entire volume:

1. **The passwords were stored in plaintext.** Once the file leaked, every account was compromised
   immediately, with no further work required. §9.4 is the direct response to this.
2. **The failure was not an attack.** Nobody broke in. Two ordinary operations interacted badly. The
   permission model has to survive *accidents*, not just adversaries — which is a much harder
   requirement, and one that Volume 1 §7's Steam incident showed is still not solved.

## 8.4 THE MECHANISM: how Unix simplified Multics into nine bits

Multics had genuine **access control lists** — for each object, an arbitrary list of principals and
what each may do. Fully general. Also variable-length, requiring storage per file and a search on
every access.

Unix, running on a machine with 64 KB of address space, could not afford that. So it made a radical
simplification that we still live with:

> **Instead of an arbitrary list of who may do what, record three *classes* of person and three
> *operations*.**
>
> **Classes:** the file's **owner**, the file's **group**, and **everyone else**.
> **Operations:** **read**, **write**, **execute**.
>
> 3 × 3 = **nine bits.**

That's it. That is the entire model, and Chapter 10 derives everything else from those nine bits.

The cost of the simplification is real: you cannot say "Alice and Bob may read this, but not Carol"
without creating a group containing exactly Alice and Bob. In exchange you get a permission check
that is a handful of bitwise operations against a value already in the inode, with no allocation and
no search — which is why it was affordable in 1971 and why it is still the fast path today.

> Linux *does* now have real ACLs (`setfacl`, `getfacl`) layered on top, and SELinux/AppArmor on top
> of that. Debian ships AppArmor enabled by default as of recent releases. But the nine bits remain
> the primary mechanism, checked first, on every single file access on your machine.

## 8.5 And why it still matters on a single-user laptop

The historical answer is only half of it. The reason your laptop has forty users is **contemporary**,
and it's a genuinely good idea:

> **Every network-facing service on your machine runs as its own unprivileged user, so that
> compromising the service does not compromise the machine.**

Look at who owns what's actually running:

```bash
ps -eo user,comm --sort=user | uniq -c -f1 | sort -rn | head -15
```

```
     35 root            systemd
      8 you             bash
      2 systemd-resolve systemd-resolve
      1 messagebus      dbus-daemon
      1 systemd-timesync systemd-timesyn
      ...
```

And see the deliberate un-loginability of those accounts:

```bash
grep -E 'nologin|/bin/false' /etc/passwd | head -10
```

```
daemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin
bin:x:2:2:bin:/bin:/usr/sbin/nologin
sys:x:3:3:sys:/dev:/usr/sbin/nologin
sync:x:4:65534:sync:/bin:/bin/sync
...
```

**Their login shell is `/usr/sbin/nologin`.** Volume 1 §2.7 explained that `execve()` runs whatever
the login process asks it to; `nologin` is a program whose entire job is to print a message and exit
with a failure status. These accounts exist to *own things*, not to be logged into.

```bash
cat /usr/sbin/nologin > /dev/null; file /usr/sbin/nologin
/usr/sbin/nologin; echo "exit status: $?"
```

```
This account is currently not available.
exit status: 1
```

That is the whole program.

> **The reframing worth keeping:** the multi-user model was built to separate *people*. It is now
> used overwhelmingly to separate *programs*. Same nine bits, completely different threat model, and
> it worked for the second job without modification — which is a decent argument that the 1971
> simplification was the right one.

---


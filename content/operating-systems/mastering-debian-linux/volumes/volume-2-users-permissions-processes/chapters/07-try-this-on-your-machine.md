# TRY THIS ON YOUR MACHINE

Six things that make Volume 2's machinery visible. **All of these were run and verified while
writing.** Everything is confined to `/tmp` and your home directory, nothing needs a reboot, and
cleanup is included in every block.

> **One safety note:** items 1 and 2 create a **setuid-root file in `/tmp`**. Each block removes it at
> the end. Don't skip that step, and don't leave one lying around.

---

## 1. Build a setuid binary and watch one command give two answers

**Needs:** `sudo`.

```bash
cp /usr/bin/id /tmp/myid
sudo chown root:root /tmp/myid
sudo chmod 4755 /tmp/myid        # chmod AFTER chown — see item 2
ls -l /tmp/myid

echo -n "effective UID: "; /tmp/myid -u
echo -n "real UID:      "; /tmp/myid -ru

sudo rm -f /tmp/myid             # ← do not skip
```

**What you should see:** `-rwsr-xr-x`, then `0` and then your own UID (usually `1000`).

**Why it's interesting:** the same binary, invoked once, reports two different identities. That split
— real UID says who you are, effective UID says whose privileges you're borrowing — is the entire
mechanism behind `passwd`, `su`, `mount` and `sudo`, and it's normally invisible because for ordinary
programs the two numbers are equal. Cross-check with `grep Uid: /proc/self/status`, which shows all
four (real, effective, saved, filesystem) at once.

---

## 2. Watch `chown` silently disarm a setuid bit

**Needs:** `sudo`. This is the mistake I made while writing §11.3.

```bash
cd /tmp && printf '#!/bin/bash\necho hi\n' > su.sh

sudo chown root:root su.sh
sudo chmod 4755 su.sh
echo -n "after chmod:          "; ls -l su.sh | awk '{print $1}'

sudo chown root:root su.sh       # change the owner to what it already is
echo -n "after a second chown: "; ls -l su.sh | awk '{print $1}'

rm -f su.sh
```

**What you should see:**

```
after chmod:          -rwsr-xr-x
after a second chown: -rwxr-xr-x
```

**Why it's interesting:** a `chown` that changed *nothing* silently removed the setuid bit. This is a
deliberate kernel defence: if ownership transfer preserved setuid, an attacker could prepare a
malicious binary and trick an admin into `chown root`-ing it, creating a setuid-root backdoor out of
someone else's file. It's also the reason for a rule you'll otherwise learn the hard way — **always
`chmod` after `chown`, never before.**

---

## 3. Delete root's file, then fail to — the sticky bit, A/B

**Needs:** `sudo`.

```bash
# WITHOUT the sticky bit
mkdir -p /tmp/nosticky && chmod 777 /tmp/nosticky
sudo touch /tmp/nosticky/roots-file
ls -ld /tmp/nosticky ; ls -l /tmp/nosticky/roots-file
rm /tmp/nosticky/roots-file          # as YOU
ls /tmp/nosticky/                     # gone?
sudo rm -rf /tmp/nosticky

# WITH the sticky bit — /tmp itself, mode 1777
ls -ld /tmp
sudo touch /tmp/roots-file
rm /tmp/roots-file                    # as YOU
sudo rm -f /tmp/roots-file
```

**What you should see:** in the first case, you delete a root-owned file you have no write access to.
In the second, `rm: cannot remove '/tmp/roots-file': Operation not permitted`.

**Why it's interesting:** identical directory permissions (`777` vs `1777`), one bit of difference,
and the difference is whether any user on the system can wipe out any other user's temporary files —
including root's. It also demonstrates §10.5's rule concretely: **deletion is governed by the
directory, not the file.** The `t` in `drwxrwxrwt` is the only thing standing between `/tmp` and
chaos.

---

## 4. Make a directory you can enter but not list

**Needs:** nothing. **Run as your normal user — `sudo` bypasses all permission checks.**

```bash
mkdir -p /tmp/rx && touch /tmp/rx/alpha /tmp/rx/beta

echo "--- 400: readable, not traversable ---"
chmod 400 /tmp/rx
ls /tmp/rx ; ls -l /tmp/rx ; cat /tmp/rx/alpha

echo "--- 100: traversable, not readable ---"
chmod 100 /tmp/rx
ls /tmp/rx ; stat -c '%n is %s bytes' /tmp/rx/alpha

chmod 755 /tmp/rx && rm -rf /tmp/rx
```

**What you should see:** with `400`, `ls` prints the names but `ls -l` and `cat` both fail with
Permission denied. With `100`, `ls` fails outright but `stat` on a known filename succeeds.

**Why it's interesting:** `r` and `x` on a directory are genuinely independent capabilities —
*knowing what's there* and *being able to reach it* — and you can have either without the other. The
`x`-without-`r` mode is deployed in the real world: a `711` directory lets people use paths you gave
them without letting them enumerate what else is in there. Check `ls -ld /home/*` on a multi-user
box and you'll often find it.

---

## 5. Create a zombie and discover you can't kill it

**Needs:** `python3` (present on a default Debian install).

```bash
python3 -c '
import os, time
if os.fork(): time.sleep(15)   # parent deliberately never wait()s
else: os._exit(0)              # child exits at once
' &

sleep 1
ps -eo pid,ppid,stat,cmd | awk 'NR==1 || $3 ~ /^Z/'
```

Note the zombie's PID from that output, then:

```bash
kill -9 <ZOMBIE_PID>                              # try to kill it
ps -eo pid,ppid,stat,cmd | awk '$3 ~ /^Z/'        # still there

kill <PARENT_PID>                                  # kill the PARENT instead
sleep 1
ps -eo pid,stat,cmd | awk '$2 ~ /^Z/' ; echo "(gone)"
```

**What you should see:** `Z` state and `[python3] <defunct>`. `kill -9` does nothing. Killing the
parent makes it vanish instantly.

**Why it's interesting:** `kill -9` is supposed to be the thing that always works, and here it does
nothing at all — because there is nothing left to signal. A zombie is a **PID and an exit status and
nothing else**; its memory, descriptors and command line are already gone (hence `<defunct>`). It
exists purely because the exit status has to survive until the parent asks for it. When it's
reparented to PID 1 on the parent's death, systemd reaps it immediately, which is why the last step
works.

---

## 6. Debian-specific: audit your privilege surface

**Needs:** `sudo`. Nothing here changes anything.

```bash
echo "=== is root locked? ==="
sudo passwd -S root

echo; echo "=== what am I allowed to do? ==="
sudo -l

echo; echo "=== every setuid binary on this system ==="
find / -perm -4000 -type f 2>/dev/null | sort

echo; echo "=== every setgid binary ==="
find / -perm -2000 -type f 2>/dev/null | sort

echo; echo "=== capabilities instead of setuid ==="
getcap -r /usr/bin /usr/sbin 2>/dev/null

echo; echo "=== sudo throws your environment away ==="
FOO=bar sudo env | grep '^FOO=' || echo "FOO stripped by env_reset"
echo "your PATH:  $PATH"
sudo sh -c 'echo "sudo PATH: $PATH"'
```

**What you should see:** `root L` if you left the root password blank at install; a setuid list of
roughly ten to fifteen entries; `chage` and `expiry` as setgid `shadow`; `ping` (and possibly others)
carrying `cap_net_raw` instead of being setuid; and `FOO` stripped, with a `PATH` that isn't yours.

**Why it's interesting:** that setuid list is the complete inventory of programs on your machine
where a single bug means root — Chapter 13's list, for your specific system. It's short, which is the
point. And the last two commands show `sudo` actively refusing to trust two things Volume 1 taught
you are inherited by default: the environment (Shellshock's vector) and `$PATH` (the trojan vector).
Both are thrown away and rebuilt, because **allowlisting is the only defence that scales.**

---


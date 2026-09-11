# Volume 2 Retrospective

**1. The multi-user model was built to separate people and is now used to separate programs.** Your
laptop has forty users because every network-facing service runs as its own unprivileged account with
`/usr/sbin/nologin` as its shell. Same nine bits, completely different threat model, no modification
required — which is a decent argument that the 1971 simplification was the right one.

**2. Nine bits, because three classes × three operations, and octal because three bits is exactly one
octal digit.** That's the whole derivation. `r`=4, `w`=2, `x`=1 are bit positions, so you add rather
than memorise. And the type bits plus the permission bits together are exactly sixteen — one PDP-11
word, visible in `stat -c %f` today.

**3. `r`, `w` and `x` mean different things on directories, and the deletion rule follows.** `x` means
*traverse*, not execute — so a `100` directory is enterable but unlistable. And **deleting a file
requires write permission on the directory, not the file**, because deletion removes a name from a
directory. A mode-`000` file you own deletes fine; a `644` file in a `555` directory won't.

**4. Passwords have been hashed and salted since 1979, and the reasoning still holds.** Morris and
Thompson made guessing expensive in *time* and made precomputation useless with a salt. yescrypt
makes it expensive in *memory*, because that's what today's attack hardware is short of. `/etc/passwd`
must stay world-readable so `ls -l` can print owner names — which is precisely why the hashes had to
move to `/etc/shadow`.

**5. Setuid is one line in `execve()` and it's the foundation of the whole privilege model.** Real
UID says who you are; effective UID says whose privileges you're using. You can see both from one
binary in one command. And `chown` silently strips the bit, deliberately, which is why you always
`chmod` last.

**6. Debian's locked root account is an attribution decision more than a security one.** No shared
secret, revocation by group membership, and — the strongest argument — `journalctl -t sudo` tells you
*who* ran *what*. The honest counterweights: `sudo` is itself a large setuid-root C program, and
`sudo -i` throws away the granularity anyway.

**7. `sudo`'s `env_reset` and `secure_path` are direct answers to Volume 1.** Shellshock exploited
transparent environment inheritance; `sudo` discards the environment. The `$PATH` trojan exploited
search order; `sudo` discards your `$PATH`. Both are **allowlists replacing trust**, which is the
same structural fix as Shellshock's `BASH_FUNC_` namespace.

**8. `128 + N` is closed.** A signal is an asynchronous kernel notification; SIGKILL and SIGSTOP are
uncatchable by guarantee; and `yes | head` terminates because the kernel sends SIGPIPE — which is
part of why pipes needed no changes to existing programs in 1973.

**9. Three incidents, one shape.** Steam's empty variable, Shellshock's `() {` prefix, and Baron
Samedit's trailing backslash are all the same bug: **a string was assumed to have a form it didn't
have, and the code did exactly what it was told with the bytes it actually received.**

---


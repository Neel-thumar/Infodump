# Chapter 7 — The Incident: Shellshock

## 7.1 The hook

> Everything in Chapter 2 was about bash taking a string and **parsing** it into commands. Here is
> the uncomfortable question that follows:
>
> **What if some of that string didn't come from you?**

## 7.2 THE PROBLEM: a feature nobody thought about for twenty-five years

Bash can export **functions**, not just variables, to child processes. You use it like this:

```bash
greet() { echo "hello from an exported function"; }
export -f greet
bash -c 'greet'
```

```
hello from an exported function
```

Useful, occasionally. The question is: **how?** `execve()` (§2.7) only carries an array of
`KEY=VALUE` strings. There is no "function" slot. So bash smuggled functions through the environment
by encoding them as ordinary variables whose **value began with `() {`**.

On startup, bash scanned its inherited environment, and for every variable whose value started with
that marker, **it parsed the value as a function definition.**

**The bug:** bash used its ordinary parser, and having read the function definition, it **kept
going** — executing anything that followed the closing brace, immediately, at startup, before the
shell did anything else.

That's it. That's Shellshock.

```
env  x='() { :;}; echo VULNERABLE'  bash -c 'echo test'
          └───┬───┘└──────┬───────┘
        looks like a     ...and bash executed THIS TOO,
        function          at startup, no questions asked
        definition
```

The vulnerable code is generally reported to date from around **1989** — roughly the very first
releases of bash, written by Brian Fox for the GNU Project. It sat there for about twenty-five
years.

> **Confidence: moderate-high** on the ~1989 origin and the ~25-year figure, which were widely
> reported at disclosure and repeated by bash's maintainer.

## 7.3 THE MECHANISM: why this was catastrophic and not just embarrassing

A bug that requires you to already be able to set environment variables in a shell you're about to
run sounds unexciting. It was rated maximum severity, and the reason is a chain of entirely
reasonable design decisions from earlier in this book.

**Recall §2.7: the environment survives `execve()`.** That is a *feature*. It's how `$PATH`,
`$HOME`, `$LANG` and everything else propagate. Nobody has to do anything to make it work.

**Now recall how CGI works.** When a web server runs a CGI script, the CGI specification says it
should pass the HTTP request's headers to the script **as environment variables**, upper-cased and
prefixed with `HTTP_`. So an incoming header:

```
User-Agent: Mozilla/5.0
```

becomes, in the CGI process's environment:

```
HTTP_USER_AGENT=Mozilla/5.0
```

**And an enormous number of CGI scripts were shell scripts, or invoked shell scripts, or invoked
`system()`, which runs `/bin/sh`.**

Put the three facts together:

```
   ATTACKER                    WEB SERVER                      BASH
      │                            │                             │
      │  GET /cgi-bin/status       │                             │
      │  User-Agent: () { :;};     │                             │
      │      /bin/cat /etc/passwd  │                             │
      ├───────────────────────────►│                             │
      │                            │ sets                        │
      │                            │ HTTP_USER_AGENT="() { :;};  │
      │                            │      /bin/cat /etc/passwd"  │
      │                            │ then forks + execs the      │
      │                            │ CGI script                  │
      │                            ├────────────────────────────►│
      │                            │                             │ bash starts,
      │                            │                             │ scans environ,
      │                            │                             │ sees "() {",
      │                            │                             │ parses...
      │                            │                             │ and RUNS the
      │                            │                             │ trailing command
      │                            │                             │
      │   ◄────────────────────────┴─────────────────────────────┤
      │   the contents of /etc/passwd
```

**Unauthenticated remote code execution, in one HTTP header, with no exploit code — just a string.**
No memory corruption, no shellcode, no ROP chain. You typed a header and the server ran your command.

Other affected paths, all for the same reason — something puts untrusted data into the environment
and then a shell runs:

| Vector | How the data gets into the environment |
|---|---|
| **CGI** (Apache `mod_cgi`, `mod_cgid`) | HTTP headers → `HTTP_*` variables. **The big one.** |
| **DHCP clients** | a hostile DHCP server's option strings passed to `dhclient` hook scripts |
| **OpenSSH `ForceCommand`** | `command=` in `authorized_keys` — the original command lands in `SSH_ORIGINAL_COMMAND`, limiting an already-authenticated user's restriction |
| **CUPS**, **qmail**, various setuid wrappers | anything invoking a shell with attacker-influenced environment |

The DHCP one deserves a moment: connect a laptop to a hostile wireless network, and the DHCP server
could run commands as root on your machine, before you'd opened a browser.

## 7.4 The timeline, and the part that's most instructive

| Date | Event |
|---|---|
| ~12 Sep 2014 | **Stéphane Chazelas**, a Unix/Linux specialist in the UK, discovers the flaw and reports it privately to the bash maintainer |
| 12–24 Sep 2014 | Coordinated embargo; distributions prepare patches |
| **24 Sep 2014** | Public disclosure as **CVE-2014-6271**. Debian issues a security advisory the same day |
| **within ~24 hours** | **Tavis Ormandy** (Google) demonstrates the patch is **incomplete** → **CVE-2014-7169** |
| following days | Fuzzing by Michał Zalewski and others finds more parser bugs: **CVE-2014-7186**, **CVE-2014-7187**, **CVE-2014-6277**, **CVE-2014-6278** |
| within days | Mass exploitation observed in the wild; botnets scanning for `/cgi-bin/` |

> **Confidence: high** on Chazelas as the discoverer, the 24 September 2014 disclosure date, the CVE
> numbers, and Ormandy finding the incomplete fix within about a day. **Moderate** on the exact
> Debian advisory numbers (DSA-3032-1 and a follow-up are the usually-cited ones) — check
> `security-tracker.debian.org` if you need to cite them.

**The most instructive part is not the original bug. It's that the first fix was wrong.**

The initial patch tried to make the parser stop at the end of the function definition. Ormandy showed
within a day that you could still get out. That is the signature of trying to **patch a parser**
rather than remove the ambiguity.

## 7.5 The actual fix — and you can see it on your machine right now

The eventual fix was not a better parser. It was to **change the encoding so that attacker-controlled
variable names can no longer produce a function-carrying variable at all.**

Before Shellshock, exporting a function called `greet` created an environment variable literally
named `greet`. After the fix, it creates one named `BASH_FUNC_greet%%`.

Look at it:

```bash
greet() { echo hi; }
export -f greet
bash -c 'tr "\0" "\n" < /proc/$$/environ | grep -i BASH_FUNC'
unset -f greet
```

```
BASH_FUNC_greet%%=() {  echo hi
```

**That is the Shellshock fix, visible in your own process's memory.** *(Verified on a live system
while writing this.)*

Why it works: a CGI server turns the header `User-Agent` into `HTTP_USER_AGENT`. It cannot produce a
variable named `BASH_FUNC_anything%%`, because `%` is not a legal character in an HTTP header name
and the `HTTP_` prefix is forced. The **namespace was separated**, so data can no longer be mistaken
for code.

> **The generalisable lesson, and it's the one worth carrying out of this volume:** the original bug
> was that **the boundary between "data" and "code" was a string prefix**. Anything starting with
> `() {` became code. The fix was not to parse more carefully — it was to make the boundary
> structural, so that untrusted input **cannot express** the thing you don't want it to express.
>
> Every time you write `eval`, or build a shell command by string concatenation, or pass user data
> into a `system()` call, you are re-creating exactly this bug shape.

### Check your own machine

```bash
env x='() { :;}; echo VULNERABLE' bash -c 'echo "test complete"'
```

| Output | Means |
|---|---|
| `test complete` (possibly with a warning) | **patched** — the function-shaped variable was ignored |
| `VULNERABLE` then `test complete` | vulnerable — you are running something ten years out of date |

On any supported Debian this will show `test complete`. Confirm your bash's provenance:

```bash
dpkg -l bash | tail -1
apt changelog bash 2>/dev/null | head -20    # needs network; shows Debian's own changelog
```

## 7.6 The everyday version: Steam, January 2015

Shellshock is the dramatic one. Here is the one that will actually happen to you, and it is a direct
consequence of §2.4's expansion order.

Valve's Steam client for Linux shipped a shell script containing, in effect:

```sh
rm -rf "$STEAMROOT/"*
```

That looks careful. The variable is quoted. What could go wrong?

**`STEAMROOT` could be empty.** It was set by something like `STEAMROOT="$(cd "${0%/*}" && echo "$PWD")"`
— and if that `cd` failed, the assignment produced an empty string. Then:

```sh
rm -rf "$STEAMROOT/"*      →      rm -rf "/"*      →      rm -rf /bin /boot /etc /home ...
```

Users reported losing their entire home directory, and — because the glob matched everything at the
root — **anything else they had write access to, including mounted external and network drives.**

> **Confidence: high** that this happened and was publicly reported in January 2015 against
> `steam-for-linux`; **moderate** on the exact line of script, which was described slightly
> differently in different reports and subsequently patched.

Walk through why quoting didn't save it, using §2.4's ordering:

| Step | What happens |
|---|---|
| 3. Variable expansion | `"$STEAMROOT/"` → `"/"` — **the quotes worked perfectly.** They protected an empty string. |
| 4. Word splitting | suppressed by the quotes, correctly |
| 5. **Pathname expansion** | `*` is **outside** the quotes, so it globs — against `/` |

**Quoting protects you from word splitting. It does not protect you from the variable being empty.**
Those are different failure modes and the second one is the one that deletes your disk.

### The three habits that prevent it

```bash
set -u                              # error on any unset variable
: "${STEAMROOT:?STEAMROOT not set}"  # explicit assertion with a message
cd "$STEAMROOT" || exit 1            # ALWAYS check that cd succeeded
```

Demonstrate `set -u` safely — no `rm` involved:

```bash
bash -c 'set -u; echo "value is [${NOPE}]"; echo "we should never get here"'
```

```
bash: line 1: NOPE: unbound variable
```

The script **stopped**. That single line would have prevented the Steam bug entirely.

And the parameter-expansion assertion form, which is even more explicit:

```bash
bash -c 'ROOT=""; : "${ROOT:?refusing to run with an empty ROOT}"; echo unreachable'
```

```
bash: line 1: ROOT: refusing to run with an empty ROOT
```

> **The pattern to internalise.** Shellshock and the Steam bug look unrelated — one is a remote code
> execution in a parser, one is a deleted home directory. They are the same shape: **a string that
> was assumed to have a certain form turned out not to, and the shell did exactly what it was told
> with the string it actually got.** The shell has no concept of what you meant.

---


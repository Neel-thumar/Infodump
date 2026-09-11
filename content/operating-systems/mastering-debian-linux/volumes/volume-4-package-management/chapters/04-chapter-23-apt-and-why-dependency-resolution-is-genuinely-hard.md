# Chapter 23 — `apt`, and Why Dependency Resolution Is Genuinely Hard

## 23.1 The hook

> **You type `apt install thunderbird`. Sixty seconds later, forty packages are installed in a
> workable order.**
>
> **That is not a lookup. It is a search of a constraint space that is, in the general case,
> NP-complete — and apt does it fast enough that you don't notice.**

## 23.2 THE PROBLEM: it really is that hard

Consider what apt is given: roughly 60,000 packages, each with version constraints, alternatives,
conflicts, and virtual packages, and a request like "install X." It must find a set of package
versions that:

- includes X
- satisfies **every** `Depends` of every selected package
- violates **no** `Conflicts` or `Breaks`
- keeps everything already installed still satisfied
- and, ideally, is minimal and doesn't remove things you wanted

**That is a satisfiability problem.** Watch it encode:

| Debian relationship | Boolean clause |
|---|---|
| `Depends: A \| B` | (A ∨ B) |
| `Depends: A, B` | (A) ∧ (B) |
| `Conflicts: C` | ¬C |
| `Depends: A (>= 2)` | (A₂ ∨ A₃ ∨ …) — one variable per available version |

You can build arbitrary boolean formulas out of those. Which means:

> **Deciding whether a package is installable is NP-complete**, by reduction from 3-SAT.
>
> **Confidence: moderate-high.** This was established formally by Mancinelli, Boender, Di Cosmo,
> Vouillon, Durak, Leroy and Treinen in "Managing the Complexity of Large Free and Open Source
> Package-Based Software Distributions" (ASE 2006), out of the EU-funded EDOS and later Mancoosi
> projects. The `dose3` toolchain came from that work and is still used for Debian archive quality
> assurance.

So apt is not doing a lookup. It is running a solver, on a graph with tens of thousands of nodes,
and it usually finishes before you've finished reading the prompt.

## 23.3 The relationship vocabulary

Debian has more relationship types than most systems, and the distinctions matter.

| Field | Meaning | Installed by default? |
|---|---|---|
| **`Pre-Depends`** | must be **fully configured before this package is even unpacked** | yes |
| **`Depends`** | must be configured before *this* is configured | yes |
| **`Recommends`** | "you almost certainly want this" | **YES on Debian** |
| **`Suggests`** | "this might be useful" | no |
| **`Enhances`** | reverse `Suggests` — declared by the *other* package | no |
| **`Breaks`** | cannot be **configured** simultaneously with the named version | — |
| **`Conflicts`** | cannot be **unpacked** simultaneously | — |
| **`Provides`** | declares a **virtual package** name | — |
| **`Replaces`** | takes over files previously owned by another package | — |

**`Pre-Depends` versus `Depends`** is the one people miss. Ordinary `Depends` only has to be
satisfied by *configure* time, so dpkg has latitude to unpack several packages then configure them
in order. `Pre-Depends` is stronger: the dependency must be **completely installed and configured
before this package is unpacked at all** — because its own `preinst` script needs it. It's
deliberately rare, since it constrains dpkg's ordering freedom.

```bash
grep -c '^Pre-Depends:' /var/lib/dpkg/status
awk '/^Package:/{p=$2} /^Pre-Depends:/{print p": "$0}' /var/lib/dpkg/status | head -5
```

**`Recommends` being installed by default is a Debian choice**, and it's why `apt install` sometimes
pulls in more than you expected:

```bash
apt-cache show bash | grep -E '^(Depends|Recommends|Suggests):'
sudo apt install --no-install-recommends <package>       # opt out for one install
```

To turn it off globally — think first, since many packages assume their Recommends are present:

```bash
cat /etc/apt/apt.conf.d/*recommends* 2>/dev/null
# echo 'APT::Install-Recommends "false";' | sudo tee /etc/apt/apt.conf.d/99norecommends
```

**`Provides` — virtual packages** — is how alternatives work. Nothing depends on `postfix`
specifically; things depend on `mail-transport-agent`, and several packages provide it:

```bash
apt-cache showpkg mail-transport-agent 2>/dev/null | head -20
apt-cache show exim4-daemon-light 2>/dev/null | grep -i provides
```

## 23.4 Inspecting the graph

```bash
apt-cache depends bash                 # what bash needs
apt-cache rdepends bash | head -20     # what needs bash  ← the scary one
apt-cache policy bash                  # installed version, candidate, and SOURCES
apt-cache show bash | head -20
```

`apt-cache policy` is the one to reach for when a package won't upgrade to the version you expect:

```bash
apt-cache policy
apt-cache policy bash
```

```
bash:
  Installed: 5.2.15-2+b7
  Candidate: 5.2.15-2+b7
  Version table:
 *** 5.2.15-2+b7 500
        500 http://deb.debian.org/debian bookworm/main amd64 Packages
        100 /var/lib/dpkg/status
```

Those numbers on the left are **pin priorities** (§23.7). `100` for `/var/lib/dpkg/status` means
"what's already installed," which is why apt won't gratuitously downgrade you.

**Why is this thing even installed?** The best tool for this is `aptitude`:

```bash
sudo apt install aptitude
aptitude why libssl3
aptitude why-not <package>
```

`aptitude why` prints the dependency chain from something you explicitly asked for down to the
package in question. It's the answer to "I never installed this, where did it come from?"

And apt's own record of what you asked for versus what came along for the ride:

```bash
apt-mark showmanual | head -20      # you asked for these
apt-mark showauto | wc -l           # these came as dependencies
apt autoremove --dry-run            # auto packages nothing needs any more
```

> **That manual/auto distinction is how `autoremove` works.** apt marks dependency-installed
> packages as `auto`; when nothing manual depends on them any more, they become removable. If
> `autoremove` wants to delete something you actually use, the fix is
> `sudo apt-mark manual <package>`, not to avoid `autoremove`.

## 23.5 Watching the solver work

```bash
apt-get -s install thunderbird              # SIMULATE — changes nothing
apt-get -s remove libc6                     # ← try this, and read the output
```

That second one is worth doing. `libc6` is depended on by nearly everything, so apt will propose
removing most of your system — and then, because the operation is dangerous, it demands you type a
sentence to confirm. **Simulate it; don't run it.**

When apt can't find a solution it says so, and the message is more informative than it first looks:

```
The following packages have unmet dependencies:
 foo : Depends: libbar (>= 2.0) but 1.5 is to be installed
E: Unable to correct problems, you have held broken packages.
```

"Held broken packages" usually means either a genuine archive inconsistency (rare on stable) or that
you've mixed suites (§24.5).

Two other angles:

```bash
apt-get -s -o Debug::pkgProblemResolver=true install <pkg> 2>&1 | head -40
aptitude install <pkg>       # offers ALTERNATIVE solutions interactively
```

**`aptitude`'s resolver is genuinely different from apt's** — it searches for multiple candidate
solutions and lets you step through them with `n` (next solution). When apt says "no," aptitude will
sometimes show you three ways forward and let you pick. That's the single best reason to have it
installed.

> **Confidence: moderate** on the current state of apt's own solver. Recent apt versions have gained
> a new solver implementation; the classic `pkgProblemResolver` heuristic is what most deployed
> systems still use. `apt --version` and the changelog will tell you what you have.

## 23.6 Repositories, and the signature chain

> **You just downloaded and executed root-privileged maintainer scripts (§21.6) from a server on the
> internet. Why is that not insane?**

Because of a chain of hashes with a signature at the top. Look at it:

```bash
ls /var/lib/apt/lists/ | head
```

```
deb.debian.org_debian_dists_bookworm_InRelease
deb.debian.org_debian_dists_bookworm_main_binary-amd64_Packages.lz4
security.debian.org_debian-security_dists_bookworm-security_InRelease
...
```

The structure:

```
   InRelease                    ← PGP-signed, in-line, by the Debian archive key
      │  contains:
      │    Suite, Codename, Date, VALID-UNTIL
      │    SHA256 hashes of every Packages / Sources / Contents file
      ▼
   Packages                     ← one stanza per package
      │  contains:
      │    Filename: pool/main/h/hello/hello_2.10-3_amd64.deb
      │    Size, SHA256 of THAT .deb
      ▼
   hello_2.10-3_amd64.deb       ← verified against the hash above
```

**One signature, at the top, transitively covers every package in the archive.** apt verifies the
signature on `InRelease`, then checks each downloaded file against the hash chain. A tampered `.deb`
fails its hash; a tampered `Packages` fails the `InRelease` hash; a tampered `InRelease` fails the
signature.

```bash
head -20 /var/lib/apt/lists/*bookworm_InRelease 2>/dev/null
grep -A2 -m1 '^Package: bash$' /var/lib/apt/lists/*_main_binary-amd64_Packages* 2>/dev/null | head
```

**`Valid-Until` matters more than it looks.** Without it, an attacker who can intercept your traffic
could serve you an old-but-correctly-signed package list forever, freezing you on versions with
known vulnerabilities. The expiry means apt refuses stale metadata:

```bash
grep -E '^(Date|Valid-Until):' /var/lib/apt/lists/*InRelease 2>/dev/null | head -4
```

That's also why a machine that's been off for months complains about release files being expired
before it will upgrade.

### Keys, and why `apt-key` was removed

```bash
ls /etc/apt/trusted.gpg.d/
ls /usr/share/keyrings/
```

The old mechanism was `apt-key add`, which put a key in a **global** trusted set. The flaw is
structural: **a key added to trust one third-party repository could then validly sign packages for
any repository, including Debian's own.** Add a vendor's key for their one utility, and that vendor
can now silently replace your `libc6`.

The replacement scopes each key to the repository it belongs to, via **`Signed-By:`**:

```
Types: deb
URIs: https://example.com/apt
Suites: stable
Components: main
Signed-By: /usr/share/keyrings/example-archive-keyring.gpg
```

> **Confidence: high** that `apt-key` is deprecated and removed from current Debian, and that
> `Signed-By` scoping is the recommended approach.
>
> **The practical rule: when a vendor's install instructions tell you to run `apt-key add`, they are
> out of date, and you should be scoping their key with `Signed-By` instead.**

## 23.7 `sources.list`, deb822, and pinning

Two syntaxes, both supported:

**One-line (classic):**
```
deb [arch=amd64 signed-by=/usr/share/keyrings/foo.gpg] http://deb.debian.org/debian bookworm main contrib
```

**deb822 (`.sources` files) — clearer, and what Debian is moving toward:**
```
Types: deb
URIs: http://deb.debian.org/debian
Suites: bookworm bookworm-updates
Components: main contrib non-free non-free-firmware
Signed-By: /usr/share/keyrings/debian-archive-keyring.gpg
```

```bash
cat /etc/apt/sources.list 2>/dev/null
cat /etc/apt/sources.list.d/*.sources 2>/dev/null
```

> **Confidence: moderate-high** that deb822 is supported in Debian 12 and increasingly the default
> in newer installers. Your own files are the answer.

### Pinning

`/etc/apt/preferences.d/` lets you override which version apt prefers:

```
Package: *
Pin: release a=bookworm-backports
Pin-Priority: 100
```

| Priority | Effect |
|---|---|
| **< 0** | never install |
| 1–99 | install only if the package isn't installed at all |
| 100–499 | install unless a higher-priority source has it |
| **500** | the default for a normal release |
| 990 | the target release (`apt -t`) |
| **> 1000** | allow **downgrades** |

```bash
apt-cache policy
apt-config dump | grep -i default-release
```

> **The warning that belongs here.** Mixing suites — putting `unstable` in your `sources.list`
> alongside `stable` and pinning your way out of trouble — is known in Debian circles as a
> **"FrankenDebian,"** and it is the single most common way people break an otherwise reliable
> system. Packages from `unstable` pull in a newer `libc6`, which pulls in a newer everything, and
> you have silently upgraded to `unstable` one dependency at a time.
>
> If you need one newer package, in order of preference: **backports** (§24.4), a Flatpak, a
> container, or building it yourself into `/usr/local` (Volume 3 §16.6). Pinning `unstable` is the
> last resort and it is not a resort.

---


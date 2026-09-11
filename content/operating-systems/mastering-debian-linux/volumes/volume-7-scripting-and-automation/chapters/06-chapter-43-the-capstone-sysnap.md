# Chapter 43 — The Capstone: `sysnap`

Everything from §39 to §42, as one artifact. **It is read-only** — it collects, and writes only into
a directory you nominate.

## 43.1 The script

```bash
#!/usr/bin/env bash
#
# sysnap — snapshot the reproducible state of a Debian system.
# Read-only: collects information, modifies nothing.

set -euo pipefail

VERSION="1.0"
PROGNAME="${0##*/}"
SNAPSHOT_ROOT="${SNAPSHOT_ROOT:-$HOME/sysnap}"
LOCKFILE="${TMPDIR:-/tmp}/sysnap.lock"
DRY_RUN=0
VERBOSE=0

declare -A COUNTS=()
declare -a WARNINGS=()

# --------------------------------------------------------------- logging
log()  { printf '[%(%H:%M:%S)T] %s\n' -1 "$*" >&2; }
vlog() { (( VERBOSE )) && log "  $*"; return 0; }
warn() { WARNINGS+=("$*"); printf '[%(%H:%M:%S)T] WARN: %s\n' -1 "$*" >&2; }
die()  { printf '%s: %s\n' "$PROGNAME" "$*" >&2; exit 1; }

usage() {
    cat <<EOF
$PROGNAME $VERSION — snapshot a Debian system's reproducible state

Usage: $PROGNAME [OPTIONS]

  -o, --output DIR   parent directory for snapshots (default: \$HOME/sysnap)
  -n, --dry-run      show what would be collected; write nothing
  -v, --verbose      report each step
  -h, --help         this message

Exits non-zero if any collector produced a warning.
EOF
}

# --------------------------------------------------------------- helpers
have() { command -v "$1" >/dev/null 2>&1; }

# collect NAME COMMAND... — run COMMAND, save stdout, record the line count
collect() {
    local name="$1"; shift
    if (( DRY_RUN )); then
        log "would collect: $name  (\$ $*)"
        COUNTS[$name]=0
        return 0
    fi
    if "$@" > "$outdir/$name.txt" 2>/dev/null; then
        COUNTS[$name]=$(wc -l < "$outdir/$name.txt")
        vlog "$name: ${COUNTS[$name]} lines"
    else
        COUNTS[$name]=0
        warn "$name: collector exited non-zero"
    fi
    return 0                      # ← see §43.2. This is not optional.
}

# --------------------------------------------------------------- sections
sec_packages() {                                    # Volume 4 §23.4
    have apt-mark || { warn "apt-mark not found; skipping packages"; return 0; }
    collect packages-manual apt-mark showmanual
    collect packages-all    dpkg-query -W -f='${binary:Package}\t${Version}\n'
    return 0
}

sec_configs() {                                     # Volume 4 §21.7
    have dpkg-query || { warn "dpkg-query not found; skipping configs"; return 0; }
    if (( DRY_RUN )); then
        log "would collect: configs-modified"
        COUNTS[configs-modified]=0
        return 0
    fi
    local out="$outdir/configs-modified.txt"
    : > "$out"
    local f h n=0
    while IFS=' ' read -r f h _; do
        [[ -f $f && -r $f ]] || continue
        [[ "$(md5sum "$f" | cut -d' ' -f1)" == "$h" ]] && continue
        printf '%s\n' "$f" >> "$out"
        n=$(( n + 1 ))            # ← NOT (( n++ )) — §40.3 case 6
    done < <(dpkg-query -W -f='${Conffiles}\n' 2>/dev/null \
             | awk 'NF>=2 && $2!="obsolete"')
    COUNTS[configs-modified]=$n
    vlog "configs-modified: $n files"
    return 0
}

sec_storage() {                                     # Volume 3 §15.9, §17
    have lsblk && collect storage-lsblk lsblk -f
    collect storage-df  df -h
    collect storage-dfi df -i                       # INODES, not just bytes
    [[ -r /etc/fstab ]] && collect storage-fstab cat /etc/fstab
    return 0
}

sec_security() {                                    # Volume 2 §11.8, Volume 5 §29.5
    collect security-setuid find / -xdev -perm -4000 -type f
    collect security-setgid find / -xdev -perm -2000 -type f
    have ss && collect security-listening ss -tlnH
    return 0
}

sec_system() {
    collect system-kernel uname -a
    [[ -r /etc/os-release ]] && collect system-osrelease cat /etc/os-release
    [[ -r /proc/cmdline ]]   && collect system-cmdline   cat /proc/cmdline
    return 0
}

# --------------------------------------------------------------- lifecycle
cleanup() {
    local status=$?               # capture FIRST — §40.6
    (( status == 0 )) || log "exiting with status $status"
    return 0
}

main() {
    while (( $# )); do
        case "$1" in
            -o|--output)  SNAPSHOT_ROOT="${2:?--output needs a directory}"; shift 2 ;;
            -n|--dry-run) DRY_RUN=1; shift ;;
            -v|--verbose) VERBOSE=1; shift ;;
            -h|--help)    usage; exit 0 ;;
            *)            die "unknown option: $1 (try --help)" ;;
        esac
    done

    : "${SNAPSHOT_ROOT:?SNAPSHOT_ROOT must not be empty}"   # §40.4

    trap cleanup EXIT
    trap 'log "interrupted"; exit 130' INT TERM

    outdir="$SNAPSHOT_ROOT/$(date +%Y-%m-%d_%H%M%S)"
    if (( DRY_RUN )); then
        log "DRY RUN — nothing will be written"
    else
        mkdir -p "$outdir" || die "cannot create $outdir"
        log "writing to $outdir"
    fi

    local -a sections=(packages configs storage security system)
    local s
    for s in "${sections[@]}"; do
        vlog "--- section: $s"
        "sec_$s"
    done

    local total=0 k
    for k in "${!COUNTS[@]}"; do total=$(( total + COUNTS[$k] )); done

    if (( ! DRY_RUN )); then
        {   printf 'sysnap %s\ngenerated: %s\nhost: %s\n\n' \
                   "$VERSION" "$(date -Is)" "$(hostname)"
            for k in $(printf '%s\n' "${!COUNTS[@]}" | sort); do
                printf '  %-24s %s\n' "$k" "${COUNTS[$k]}"
            done
            if (( ${#WARNINGS[@]} )); then
                printf '\nwarnings:\n'
                printf '  - %s\n' "${WARNINGS[@]}"
            fi
        } > "$outdir/SUMMARY.txt"
        cat "$outdir/SUMMARY.txt"
    fi

    log "collected $total records across ${#COUNTS[@]} files, ${#WARNINGS[@]} warnings"

    if have logger && (( ! DRY_RUN )); then
        logger -t sysnap -p user.info \
          "snapshot ok dir=$outdir files=${#COUNTS[@]} records=$total warnings=${#WARNINGS[@]}"
    fi

    (( ${#WARNINGS[@]} == 0 )) || return 1          # §41.4: fail loudly
}

# Take the lock for the whole run — §42.4 failing #7, belt and braces
exec 9>"$LOCKFILE"
flock -n 9 || die "another sysnap is already running"

main "$@"
```

Install it:

```bash
sudo install -m 755 sysnap /usr/local/bin/sysnap     # Volume 3 §16.6: /usr/local is YOURS
shellcheck /usr/local/bin/sysnap
sysnap --dry-run -v
sysnap -v
```

Verified output on a real run:

```
[05:18:07] writing to /tmp/cap/out/2026-09-11_051807
[05:18:07]   --- section: packages
[05:18:09]   packages-manual: 729 lines
[05:18:09]   packages-all: 866 lines
...
  configs-modified         1
  packages-all             866
  packages-manual          729
  security-setgid          4
  security-setuid          11
  storage-df               8
  storage-dfi              8
  storage-fstab            1
  storage-lsblk            6
  system-cmdline           1
  system-kernel            1
  system-osrelease         13
[05:18:07] collected 1649 records across 12 files, 0 warnings
```

## 43.2 The bug I wrote while writing this chapter

The `return 0` at the end of every section function is not stylistic padding. **My first version
didn't have it, and the script silently stopped two sections early.**

Here's what happened, verified:

```
[05:17:49]   security-setuid: 11 lines
[05:17:50]   security-setgid: 4 lines
[05:17:50] exiting with status 1
```

**`sec_system` never ran.** No error message, no indication of what went wrong.

**The cause.** `sec_security` ended with:

```bash
have ss && collect security-listening ss -tlnH
```

My test machine has no `ss`. So `have ss` returned 1, the `&&` list returned 1, and **that was the
function's last command — so the function returned 1.** Called bare under `set -e`, a function
returning non-zero **exits the script.**

Isolated *(both halves verified)*:

```bash
# dies at `sec`, exit status 1, nothing after it runs
set -euo pipefail
have() { command -v "$1" >/dev/null 2>&1; }
sec() { have definitely-not-real && echo "collected"; }
sec
echo "REACHED"                # never printed

# with `return 0` appended to sec, this prints and exits 0
```

> **This is §40.3's list biting in practice**, in code written by someone who had just finished
> documenting §40.3. Which is the honest point of including it:
>
> **`cmd_a && cmd_b` as the final line of a function is a landmine under `set -e`**, because the
> function's exit status becomes the `&&` list's. It's completely invisible in review — the line
> looks like a conditional action, not a return value.
>
> **Three fixes**, in order of preference:
> ```bash
> sec() { if have ss; then collect ...; fi; }     # clearest
> sec() { have ss && collect ...; return 0; }     # explicit
> sec() { have ss && collect ... || true; }       # terse, easy to misread
> ```
>
> And the reason I caught it at all is that I **ran the script and checked the exit status** rather
> than reading it. §40.7's point exactly: `set -euo pipefail` converts silent failures into loud
> ones, and then you still have to listen.

Note the same class of fix elsewhere in the script: `n=$(( n + 1 ))` rather than `(( n++ ))`, because
§40.3 case 6 would kill the script on the very first increment when `n` is 0.

## 43.3 The service unit

```ini
# /etc/systemd/system/sysnap.service
[Unit]
Description=System configuration snapshot
Documentation=https://example.invalid/sysnap
After=local-fs.target

[Service]
Type=oneshot
ExecStart=/usr/local/bin/sysnap --output /var/backups/sysnap --verbose

# §41.3 failing #1 — an explicit, testable environment
Environment=PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
WorkingDirectory=/

# §41.3 failing #3 — Volume 6 §36.5's cgroup resource control
MemoryMax=256M
CPUQuota=50%
TasksMax=64

# it only ever reads; let the kernel enforce that
ProtectSystem=strict
ReadWritePaths=/var/backups/sysnap
ProtectHome=read-only
PrivateTmp=true
NoNewPrivileges=true

# §43.5
OnFailure=sysnap-failure@%n.service
```

> **`ProtectSystem=strict` mounts the entire filesystem read-only for this service**, with only
> `ReadWritePaths=` writable. `NoNewPrivileges=true` means the process cannot gain privileges via
> setuid — Volume 2 §11.8's mechanism, disabled at the kernel level for this unit specifically.
>
> These are cheap and worth having on anything scheduled. A backup script has no business writing
> outside its output directory, and now it structurally cannot.

## 43.4 The timer unit

```ini
# /etc/systemd/system/sysnap.timer
[Unit]
Description=Run system snapshot weekly

[Timer]
OnCalendar=Sun 04:00
Persistent=true            # §42.4 failing #5 — catch up if the laptop was off
RandomizedDelaySec=30min   # §42.4 failing #6
AccuracySec=1m

[Install]
WantedBy=timers.target
```

```bash
systemd-analyze calendar "Sun 04:00"        # check BEFORE installing
sudo systemctl daemon-reload
sudo systemctl enable --now sysnap.timer
systemctl list-timers sysnap.timer
sudo systemctl start sysnap.service         # run it now, once
journalctl -u sysnap.service -n 30
```

## 43.5 Failing loudly — §41.4's actual lesson

Toy Story 2's backups ran nightly and produced nothing, and **nobody was told**. The fix is one
directive plus one templated unit:

```ini
# /etc/systemd/system/sysnap-failure@.service
[Unit]
Description=Report failure of %i

[Service]
Type=oneshot
ExecStart=/usr/bin/logger -t sysnap -p user.err "UNIT FAILED: %i"
ExecStart=/usr/bin/notify-send -u critical "sysnap failed" "See journalctl -u %i"
```

The `@` makes it a **template**: `OnFailure=sysnap-failure@%n.service` passes the failing unit's name
in as `%i`, so one handler serves every unit you point at it.

Test that the alarm actually works, which is the whole point:

```bash
sudo systemctl start sysnap.service         # should succeed
sudo SNAPSHOT_ROOT=/nonexistent/path systemctl start sysnap.service 2>&1 | tail -3
journalctl -t sysnap -p err -n 10
systemctl --failed
```

> **Verify the failure path, not just the success path.** A monitoring system nobody has ever seen
> fire is indistinguishable from one that doesn't work — which is precisely the Pixar failure mode.

And a monthly nudge to check the thing exists at all:

```bash
ls -lt /var/backups/sysnap/ | head -5
diff -u <(ls /var/backups/sysnap/*/packages-manual.txt | tail -2 | head -1 | xargs cat) \
        <(apt-mark showmanual) | head -20
```

## 43.6 What you now have

```
   /usr/local/bin/sysnap                    the script      (Volume 3 §16.6)
   /etc/systemd/system/sysnap.service       what to run     (Volume 6 §36)
   /etc/systemd/system/sysnap.timer         when            (§42)
   /etc/systemd/system/sysnap-failure@.service   the alarm  (§43.5)
   /var/backups/sysnap/<timestamp>/         the output
```

A weekly, logged, locked, resource-limited, read-only, self-alarming job that captures everything
about this machine that a Debian ISO can't reproduce — and complains when it doesn't.

**Extensions worth making it yours:**

```bash
# the LUKS header — Volume 6 §35.3 said this, and it is the one that is unrecoverable
sudo cryptsetup luksHeaderBackup /dev/nvme0n1p3 --header-backup-file "$outdir/luks-header.img"

# actually COPY the modified configs, not just list them
tar czf "$outdir/etc-modified.tar.gz" -T "$outdir/configs-modified.txt" 2>/dev/null

# failed units — Volume 6 §36.6
collect system-failed systemctl list-units --state=failed --no-legend

# prune old snapshots (the only line that deletes anything — write it carefully)
find "$SNAPSHOT_ROOT" -mindepth 1 -maxdepth 1 -type d -mtime +90 -print
```

> **Note that last one prints rather than deletes.** Volume 1 §7.6 and §41.4 are both about deletion
> going wrong. When you add `-delete`, run it with `-print` first, every time, and keep `-mindepth 1`
> so the expression can never match `$SNAPSHOT_ROOT` itself.

---


## The incident: the restart loop that filled the disk

**A note on this one.** Volumes 1 and 2 had named, individually documented incidents with CVE numbers and researcher names. This volume's failure is different in kind: it is a *pattern* that recurs constantly across many organizations, written up repeatedly in incident retrospectives and vendor postmortems, rather than one famous outage with a canonical public writeup. I'd rather tell you that than dress up a composite as a specific event. The mechanism below is well documented; treat the narrative as representative rather than as a particular company's 3am.

**The setup.** A service runs with `restart: always`. It's reliable, so nobody thinks about it. Docker's default logging driver, `json-file`, is in use — because it's the default and nobody changed it. It has **no size limit by default**.

**The trigger.** A dependency becomes unreachable — a broker, a database, a DNS change. The application enters a retry loop and logs every attempt. Thousands of lines per minute, all to stdout, all captured by the logging driver and written to `/var/lib/docker/containers/<id>/<id>-json.log`.

**The escalation.** In the documented cases, one chatty container producing a few megabytes per minute reaches tens of gigabytes in days. The reported pattern is a single JSON log file exceeding 10 GB, and in another case roughly 42 GB accumulated over six days from one service logging at about 5 MB/minute. Then the disk hits 100%.

**The cascade.** Now *every* container on the host fails, because nothing can write. They crash. The restart policy dutifully restarts them. They crash again — and each failed attempt logs more, to a disk that has no space, which fails, which logs. The restart policy converts a single service's bug into a total host outage, and the exponential backoff means it happens quietly over hours rather than announcing itself.

**Why it's genuinely hard to diagnose at 3am.** `docker system df` doesn't obviously show it, because the space isn't in images or volumes — it's in container log files, which that command doesn't foreground. `df -h` says 100% full while `du` on the obvious directories doesn't add up, because a deleted-but-still-open log file holds its blocks until the writing process exits. And the containers you're looking at — all of them restarting — are victims, not the cause. The one service that caused it looks exactly like the others.

**The three independent mistakes**, each individually harmless:

1. **No log rotation.** The default is unbounded. Fix it globally in `/etc/docker/daemon.json`:

```json
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}
```

Then `sudo systemctl restart docker`. This applies to **newly created** containers only — existing ones keep their original settings, which is a nasty surprise when you "fix" it and nothing changes.

2. **`always` instead of `unless-stopped`,** and no thought about what a restart policy is for. A policy is a safety net for transient failures. It is not a fix for a broken container, and it actively hides the failure — the container looks like it's running because it keeps being restarted.

3. **No resource limits and no monitoring of `RestartCount`.** A container restarting 400 times overnight should page someone. Nothing was watching.

**The rules that fall out:**

- Configure log rotation on every host, before you need it. This is a two-line file.
- Use `unless-stopped` for services, `on-failure:N` for jobs. A bounded retry count makes failures visible instead of eternal.
- Alert on `RestartCount` increasing, not just on "container down" — a crash-looping container is *up* most of the time.
- Set memory limits with headroom, and watch `OOMKilled` and `nr_throttled`.
- When you find a crash loop: `docker update --restart no <name>` first, then read the logs. Debugging while something restarts under you wastes the worst hour of the night.

The deeper point, and it's the theme of this volume: **the restart policy is not resilience. It is a retry.** Resilience means the failure is visible, bounded, and attributable. A retry that hides the error and amplifies its side effects is the opposite.

---


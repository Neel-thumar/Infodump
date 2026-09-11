---
id: data-and-persistence
title: Volume 4 — Data and Persistence
order: 4
description: Where container data actually lives, how volumes, bind mounts and tmpfs differ at the mount-namespace level, and a worked backup and restore.
draft: false
---

# Mastering Docker: The Engineering, The History, The Incidents

## Volume 4 — Data and Persistence

---

## The question this volume answers

Everything you've learned so far pushes in one direction: containers are cheap, disposable, replaceable. Volume 2 built images you can rebuild in seconds. Volume 3 had you throwing containers away with `--rm` and treating a crash-restart as routine. The whole model assumes a container is a thing you can destroy without thinking.

Then reality: your database has forty gigabytes of customer records in it.

**These two facts are in direct tension, and the tension is real rather than a gap in your understanding.** A disposable process cannot own durable state. So the question this volume answers is: if containers are disposable, where does the data that must *not* be disposable actually live, and what exactly is the mechanism that lets a throwaway process reach it?

The answer turns out to be one mechanism you already met in Volume 1 — the mount namespace — used three slightly different ways.

---

## First, watch the data loss

Before any theory. This is the failure the whole volume exists to prevent, and it takes ninety seconds.

```bash
docker run -d --name db1 -e POSTGRES_PASSWORD=localdev postgres:16
sleep 8
docker exec db1 psql -U postgres -c "CREATE TABLE customers (id int, name text);"
docker exec db1 psql -U postgres -c "INSERT INTO customers VALUES (1, 'Important Client');"
docker exec db1 psql -U postgres -c "SELECT * FROM customers;"
```

**Expect:** your row. Now do the thing that feels harmless — stop and start it:

```bash
docker stop db1 && docker start db1
sleep 5
docker exec db1 psql -U postgres -c "SELECT * FROM customers;"
```

**Expect:** the row is still there. Stopping does not destroy the writable layer — you proved that in exercise 3.1.

Now the thing people do without thinking, because the image needs updating, or a flag needs changing, or the container is in a bad state:

```bash
docker rm -f db1
docker run -d --name db1 -e POSTGRES_PASSWORD=localdev postgres:16
sleep 8
docker exec db1 psql -U postgres -c "SELECT * FROM customers;"
```

**Expect:** `ERROR: relation "customers" does not exist`.

Gone. Not corrupted, not recoverable, not in a backup — the directory that held it was deleted by `docker rm`, exactly as designed. No warning, no prompt, no error. The command did precisely what it says it does.

```bash
docker rm -f db1
```

**Why this happens, in one sentence you can already derive:** the container's writes went to the **upper directory of an overlay mount** (Volume 1), that directory is owned by the container object (Volume 3's `create` allocates it, `rm` destroys it), and nothing about it was ever persistent. It survived `stop` only because `stop` doesn't remove the container.

The fix is not "be careful with `docker rm`." Careful is not a strategy. The fix is to make the data live somewhere the container's lifecycle cannot touch.

---

## The mechanism: it's all mounts

Here's the unifying idea, and it makes all three storage types fall out at once.

The container has its own **mount namespace** (Volume 1). Docker can put anything it likes into that namespace's mount tree at any path. So "persisting data" is just: **mount something from outside the container's lifecycle at the path where the application writes.** Writes to that path go to the mounted filesystem, not to the overlay's upper directory — the overlay isn't even involved, because a mount at `/var/lib/postgresql/data` shadows whatever the image had there.

The three options differ only in *what* gets mounted:

| Type | What's mounted | Lives where | Survives `docker rm` | Managed by |
| --- | --- | --- | --- | --- |
| **Volume** | A directory Docker created and tracks | `/var/lib/docker/volumes/<name>/_data` | **Yes** | Docker |
| **Bind mount** | Any path on your host | wherever you said | **Yes** (it's your host's) | You |
| **tmpfs mount** | A RAM-backed filesystem | memory only | **No — by design** | kernel |

Confirm it's really the mount namespace doing the work:

```bash
docker volume create demo-vol
docker run --rm -v demo-vol:/data -v /tmp:/hosttmp --tmpfs /scratch alpine \
  sh -c 'findmnt -no TARGET,SOURCE,FSTYPE /data /hosttmp /scratch'
```

**Expect:** three entries. `/data` and `/hosttmp` show as mounts from your host filesystem (with the source path visible), `/scratch` shows as `tmpfs`. The container's own root is `overlay`; these three paths are not.

There is no "volume subsystem" doing anything magical. It's `mount` inside a namespace.

---

## Volumes

### Creating and using them

```bash
docker volume create pgdata
docker volume ls
docker volume inspect pgdata
```

**Expect:** `inspect` reports a `Mountpoint` like `/var/lib/docker/volumes/pgdata/_data`, a driver of `local`, and a creation timestamp.

Now repeat the earlier experiment with the volume in place:

```bash
docker run -d --name db2 -v pgdata:/var/lib/postgresql/data \
  -e POSTGRES_PASSWORD=localdev postgres:16
sleep 8
docker exec db2 psql -U postgres -c "CREATE TABLE customers (id int, name text);"
docker exec db2 psql -U postgres -c "INSERT INTO customers VALUES (1, 'Important Client');"

docker rm -f db2
docker run -d --name db3 -v pgdata:/var/lib/postgresql/data \
  -e POSTGRES_PASSWORD=localdev postgres:16
sleep 8
docker exec db3 psql -U postgres -c "SELECT * FROM customers;"
```

**Expect:** the row is there. The container was destroyed and recreated — a different container, a different ID, a different writable layer — and the data didn't care, because it was never in the container.

### Go find it yourself

```bash
sudo ls -la /var/lib/docker/volumes/
sudo ls -la /var/lib/docker/volumes/pgdata/_data | head -15
sudo du -sh /var/lib/docker/volumes/pgdata/_data
```

**Expect:** PostgreSQL's actual data directory — `base/`, `pg_wal/`, `postgresql.conf`, the lot — sitting as ordinary files on your host, readable with ordinary commands.

That `_data` subdirectory is worth noting: the volume directory contains `_data` plus Docker's own metadata, which is why you mount the volume by *name* rather than poking at the path.

> **Don't edit files under `/var/lib/docker/volumes/` while a container is using them.** Not because it's forbidden — you just saw it's a plain directory — but because you'd be writing under a running database with no coordination. Read freely; write through a container.

### The pre-population behaviour that surprises people

Volumes have one genuinely non-obvious property: **an empty volume mounted onto a path that has content in the image gets seeded with that content.**

```bash
docker volume create confvol
docker run --rm -v confvol:/etc/nginx nginx:1.27 true
sudo ls /var/lib/docker/volumes/confvol/_data/
```

**Expect:** nginx's full config directory, copied out of the image into your empty volume on first use.

This happens **only for volumes, only when the volume is empty, and never for bind mounts.** It's why `-v pgdata:/var/lib/postgresql/data` works on a fresh volume without you initializing anything, and it's also a trap: once seeded, the volume keeps its copy forever. Update the image with new default config, and your volume still serves the old files. Half the "I updated the image but nothing changed" reports come from this.

### Anonymous volumes, and why you have 47 of them

```bash
docker run -d --name anon --rm postgres:16 -e POSTGRES_PASSWORD=x 2>/dev/null || true
docker volume ls | head
```

Many official images — postgres, mysql, mongo — include a `VOLUME` instruction in their Dockerfile. When you run them without specifying a volume, Docker creates an **anonymous volume**: a real, persistent volume with a 64-hex-character name and no indication of what it belongs to.

```bash
docker volume ls -f dangling=true
```

**Expect:** possibly several, from your earlier experiments in this and previous volumes.

The consequences are both directions of bad. Your data *is* being persisted, in something you can't identify. And these accumulate silently until a disk fills. Check the damage:

```bash
docker system df -v | head -20
```

**Always name your volumes.** `-v pgdata:/path`, never bare. Then `docker volume prune` is safe, because anything dangling really is garbage.

### `-v` versus `--mount`

Two syntaxes do the same job:

```bash
docker run -v pgdata:/var/lib/postgresql/data ...
docker run --mount type=volume,source=pgdata,target=/var/lib/postgresql/data ...
```

`--mount` is verbose and explicit; `-v` is terse and has one genuinely dangerous behaviour, covered next. Use `-v` for convenience, know that `--mount` errors where `-v` guesses.

---

## Bind mounts

### What they are

A bind mount maps a **host path** into the container. No Docker management, no volume namespace — the kernel's `mount --bind`, inside the container's mount namespace.

```bash
cd ~/docker-app
docker run -d --name dev --rm -p 8000:8000 \
  -v ~/docker-app:/app \
  -e GREETING="live reload" \
  myapp:v2
curl -s localhost:8000
```

Now edit the source on your host and watch the container see it:

```bash
docker exec dev cat /app/app.py | head -3
echo "# edited from the host at $(date)" >> ~/docker-app/app.py
docker exec dev tail -1 /app/app.py
docker stop dev
```

**Expect:** the change is visible instantly inside the container. That's the entire value proposition — **development**. Your editor on the host, the runtime in the container, no rebuild between them.

### The `-v` footgun

```bash
docker run --rm -v /home/$USER/typoed-path:/data alpine ls -la /data
ls -la ~/typoed-path
```

**Expect:** no error, and **a new empty directory created on your host** (owned by root). `-v` silently creates missing host paths. Your app then starts with an empty config directory and fails in a confusing way somewhere else entirely.

`--mount` refuses:

```bash
docker run --rm --mount type=bind,source=/home/$USER/another-typo,target=/data alpine ls /data
```

**Expect:** an error saying the bind source path does not exist. That is the correct behaviour, and it is why `--mount` is worth the extra typing in anything automated.

```bash
sudo rmdir ~/typoed-path
```

### The permissions problem

The single most common bind-mount frustration, and it follows directly from Volume 1: **there is no user namespace by default, so UIDs mean the same thing inside and outside.**

```bash
docker run --rm -v ~/docker-app:/app alpine sh -c 'id; ls -la /app | head -3'
docker run --rm -u 10001 -v ~/docker-app:/app alpine sh -c 'touch /app/newfile 2>&1 || echo "permission denied"'
```

The container's user is UID 10001. Your files are owned by your UID (probably 1000). The kernel compares numbers; it knows nothing about "the container's user." Files created by a root container on a bind mount end up **owned by root on your host**, which is how people end up needing `sudo` to delete files their own `npm install` created.

Options, in rough order of preference:

- `-u $(id -u):$(id -g)` — run the container as you. Simple, works, occasionally breaks images expecting to be root.
- Build the image with a user whose UID matches yours (`--build-arg UID=$(id -u)`).
- Use a **named volume** instead, and copy data in and out. Sidesteps the problem entirely, which is why volumes are the production answer and bind mounts are the development answer.
- Enable user namespaces (`userns-remap`). Correct, and has knock-on effects; Volume 7.

### Read-only, and mount propagation

```bash
docker run --rm -v ~/docker-app:/app:ro alpine sh -c 'touch /app/x 2>&1 || echo "read-only as intended"'
```

The `:ro` suffix is cheap and worth it for any bind mount the container has no business writing to — config files, certificates, source code in a production image.

And a callback to Volume 1's note on **mount propagation**: bind mounts have propagation modes (`rprivate` by default, plus `shared`, `slave`). If you bind-mount a host directory and later mount a new filesystem *underneath* it on the host, the container won't see it unless propagation is `shared` or `rslave`. This matters for anything mounting network storage or block devices at runtime, and it's the cause of a small family of otherwise baffling "the directory is empty inside the container" reports.

---

## tmpfs mounts

The third type, and the one people forget exists.

```bash
docker run --rm --tmpfs /scratch:size=64m alpine sh -c '
  findmnt -no TARGET,FSTYPE,OPTIONS /scratch
  dd if=/dev/zero of=/scratch/f bs=1M count=10 2>&1 | tail -1
  df -h /scratch
'
```

**Expect:** `/scratch` is `tmpfs`, sized at 64 MB, and writes to it are RAM-speed.

A tmpfs mount is **deliberately not persistent**. It exists for three real jobs:

- **Secrets at runtime.** A decrypted credential written to tmpfs never touches a disk, so it can't end up in an image layer, a volume backup, or a forensic disk image. Volume 7 builds on this.
- **Speed for scratch data.** Caches, sockets, PID files, temp files in a write-heavy pipeline. Recall from Volume 1 that overlay writes are expensive (copy-on-write copies whole files); tmpfs avoids that entirely.
- **Making `--read-only` usable.** A hardened container with an immutable root filesystem still needs somewhere to write `/tmp` and `/run`:

```bash
docker run --rm --read-only --tmpfs /tmp --tmpfs /run alpine sh -c '
  touch /tmp/ok && echo "tmp writable"
  touch /rootfile 2>&1 || echo "root filesystem is immutable"
'
```

**That two-flag combination is a genuinely strong hardening posture** and it costs nothing. Note the honest caveat: tmpfs uses your RAM, and without `size=` it can grow until it competes with everything else on the host. Pair it with the memory limits from Volume 3.

---

## Volume drivers

`docker volume create` has a `--driver` flag, defaulting to `local`. The driver is the plugin that decides what a volume actually *is*.

```bash
docker info --format '{{json .Plugins.Volume}}'
```

**Expect:** `["local"]` on a default install.

The `local` driver is more capable than its name suggests — it can pass arbitrary mount options through to the kernel, which means NFS works with no plugin at all:

```bash
# Illustrative — needs a real NFS server, don't run as-is
docker volume create --driver local \
  --opt type=nfs \
  --opt o=addr=192.168.1.50,rw,nfsvers=4 \
  --opt device=:/exports/appdata \
  nfsdata
```

You can also create a volume backed by tmpfs, or by a specific host path (which is a bind mount wearing a volume's clothes, useful when you want a stable *name* for a host path):

```bash
docker volume create --driver local \
  --opt type=none --opt o=bind --opt device=/srv/appdata \
  appdata
docker volume inspect appdata
docker volume rm appdata
```

Third-party drivers exist for cloud block storage, distributed filesystems, and so on. The honest scoping: **volume plugins are largely a pre-Kubernetes answer to a problem Kubernetes now solves with CSI** (the Container Storage Interface). For single-host Docker, `local` plus your own backup strategy covers the overwhelming majority of real use. Know the flag exists; don't go shopping for plugins you don't need. **Confidence: high** on the mechanism, **medium** on the ecosystem's current shape — worth checking whether specific drivers are still maintained before adopting one.

---

## Backing up and restoring a volume

A volume that has never been restored is not a backup. Here's the full worked cycle.

### Set up something worth backing up

```bash
docker rm -f db3 2>/dev/null
docker volume rm pgdata 2>/dev/null
docker volume create pgdata

docker run -d --name pg -v pgdata:/var/lib/postgresql/data \
  -e POSTGRES_PASSWORD=localdev postgres:16
sleep 8
docker exec pg psql -U postgres -c "CREATE TABLE customers (id serial, name text, joined date);"
docker exec pg psql -U postgres -c "
INSERT INTO customers (name, joined) VALUES
  ('Acme Corp','2024-03-01'),
  ('Globex','2024-06-15'),
  ('Initech','2025-01-20');"
docker exec pg psql -U postgres -c "SELECT count(*) FROM customers;"
```

### Method 1: logical backup (`pg_dump`) — the correct one for a database

```bash
mkdir -p ~/backups
docker exec pg pg_dump -U postgres postgres > ~/backups/pg-$(date +%F).sql
ls -lh ~/backups/
head -5 ~/backups/pg-$(date +%F).sql
```

**This is the right method for a running database**, because the database itself produces a consistent snapshot. Copying data files out from underneath a live PostgreSQL gives you a torn, possibly unusable copy.

### Method 2: filesystem backup — the generic one for any volume

The pattern to memorize: **a throwaway container that mounts both the volume and a host directory, and tars one into the other.**

```bash
docker stop pg

docker run --rm \
  -v pgdata:/source:ro \
  -v ~/backups:/backup \
  alpine \
  tar czf /backup/pgdata-$(date +%F).tar.gz -C /source .

ls -lh ~/backups/
docker start pg
```

Read that command carefully, because it's the generic answer to "how do I get at volume data" for *any* purpose — inspection, migration between hosts, copying to another volume. The volume is mounted `:ro` so the backup can't corrupt the source. **Stopping the container first is not optional for a database**; for an append-only log directory you might get away with it, and for anything with an internal consistency model you will not.

### Now actually restore it — to a different volume

This is the step almost nobody does, and it's the only one that proves anything.

```bash
docker volume create pgdata-restored

docker run --rm \
  -v pgdata-restored:/target \
  -v ~/backups:/backup \
  alpine \
  sh -c 'cd /target && tar xzf /backup/pgdata-'"$(date +%F)"'.tar.gz'

docker run -d --name pg-restored -v pgdata-restored:/var/lib/postgresql/data \
  -e POSTGRES_PASSWORD=localdev postgres:16
sleep 8
docker exec pg-restored psql -U postgres -c "SELECT * FROM customers;"
```

**Expect:** all three rows, in a container running from a volume that didn't exist two minutes ago.

And restoring the logical dump, for completeness:

```bash
docker volume create pgdata-fromdump
docker run -d --name pg-fromdump -v pgdata-fromdump:/var/lib/postgresql/data \
  -e POSTGRES_PASSWORD=localdev postgres:16
sleep 8
cat ~/backups/pg-$(date +%F).sql | docker exec -i pg-fromdump psql -U postgres
docker exec pg-fromdump psql -U postgres -c "SELECT count(*) FROM customers;"
```

Note the `-i` on `docker exec` — Volume 3's flag, keeping stdin open so the pipe works. No `-t`, because a TTY would corrupt the stream.

### Cleanup

```bash
docker rm -f pg pg-restored pg-fromdump
docker volume rm pgdata pgdata-restored pgdata-fromdump
rm -rf ~/backups
```

### The rules

- **Database volumes get logical dumps**, not file copies, unless the container is stopped.
- **Restore into a fresh volume**, never over the original. You want the original intact if the restore is bad.
- **Test the restore on a schedule**, not when you need it. The next section is entirely about this.
- **Copy the backups off the host.** A backup on the same disk as the data protects you from `docker rm` and from nothing else.

---

## The incident

This volume's failure comes in two parts: the container-specific mistake, and a named public example of the deeper lesson it points at.

### Part one: the writable layer treated as storage

**A note on framing, as in Volume 3.** This is a pattern, not a single famous outage — it happens constantly, at small scale, mostly to teams too embarrassed or too small to write it up. The mechanism is exactly what you executed at the top of this volume, so I'm not going to invent a company name for it.

The shape is always the same. A service is containerized quickly, often by someone learning Docker. It writes something — uploaded files, a SQLite database, generated reports, session data — to a path inside the container. It works. It works in staging. It works in production for months, because **stopping and starting a container preserves the writable layer**, so nothing ever signals a problem.

Then one of these happens:

- A deploy runs `docker rm` before `docker run` (which is what nearly every simple deploy script does).
- Someone runs `docker-compose down` — which removes containers.
- A `docker system prune -a` frees disk on a full host.
- The container is recreated to change one flag or bump one image tag.
- An orchestrator reschedules it to another node, where the writable layer never existed at all.

And the data is gone, with no error, because deleting a container's writable layer is the documented, intended behaviour of the command that was run.

**What makes it especially cruel** is the delay between the mistake and the consequence. The bad decision — no volume — was made months earlier by someone who has since left. The person who runs `docker rm` did nothing wrong. There is no error message anywhere in the chain. And the classic aggravating factor: the *database* was properly configured with a volume, because databases are obviously stateful, while the uploads directory sitting next to it was not.

**The prevention is structural, not behavioural:**

- Audit every container for what it writes. `docker diff <container>` (Volume 3) lists every path modified since start — anything in there that matters needs a mount.
- Treat `docker run` without a `-v` on a stateful service as a review failure.
- In Compose, name every volume; never rely on anonymous ones.
- Know that `docker-compose down` removes containers but **keeps named volumes**, while **`docker-compose down -v` deletes them**. That single flag is the difference between a restart and a wipe. Volume 6 returns to it.

### Part two: GitLab, 31 January 2017

Now the deeper lesson, with a named incident and an unusually honest public postmortem.

This one is not a container story — GitLab's databases ran on VMs — and I'm including it anyway, because it is the best-documented demonstration of the thing that actually kills you, which is not the deletion but the recovery.

**What happened.** On 31 January 2017, GitLab.com was suffering database load from spam. An engineer working on replication setup ran a removal command **on the primary database server rather than the intended secondary**, deleting the PostgreSQL data directory. GitLab's own summary: they lost modifications made between **17:20 and 00:00 UTC**, affecting roughly **5,000 projects, 5,000 comments, and 700 new user accounts**. Git repositories and wikis were unavailable during the outage but were not affected by the data loss, and self-managed installations were unaffected.

**The part worth studying is the recovery.** GitLab had multiple backup and recovery mechanisms. In the moment, essentially all of them failed:

- **Failover to the secondary** — impossible; the secondary had been wiped as part of the replication work being attempted.
- **`pg_dump` to S3** — failing silently for some time, because the `pg_dump` binary in use was **PostgreSQL 9.2 while the database was 9.6**, so the dumps produced nothing useful. The failure notification emails were being rejected on delivery, so nobody knew.
- **Azure disk snapshots** — not enabled for the database servers.
- **What actually saved them** was an **LVM snapshot taken by chance about six hours earlier**, manually, to load production data into staging for the load-testing work that started the whole day. Not a backup system. A side effect.

Recovery ran for many hours, restoring from a slower machine in a different region.

> **Confidence: high.** Sourced from GitLab's own two public posts — the 1 February incident note and the 10 February postmortem — with details corroborated across independent writeups. The numbers above (the UTC window, ~5,000 projects, ~5,000 comments, ~700 accounts) are GitLab's own stated best estimates.

**Why this belongs in a volume about Docker volumes.** Every lesson transfers directly and the container context makes each one *more* likely, not less:

| GitLab's failure | The container-era version |
| --- | --- |
| Backups failed silently for months | Your `docker run ... tar czf` cron job exits non-zero into `/dev/null` |
| Version mismatch made dumps useless | You dump with `postgres:16` tooling and restore into `postgres:17`, or vice versa |
| Snapshots existed but weren't enabled | Named volumes exist but the service uses an anonymous one |
| Replica and primary were both destroyed | Backup tarball sits on the same host, in the same `docker system prune` blast radius |
| Recovery had never been rehearsed | Nobody has ever restored a volume into a fresh one and started a container from it |

The one-line version, and it is the most valuable sentence in this volume: **you do not have backups; you have restores that have or have not been tested.** Everything else is a file of unknown quality.

Which is exactly why the worked example above restored into a *different* volume and started a *real* container from it. Do that on a schedule. Put it in CI if you can. An untested backup and no backup differ only in how you feel before you find out.

---

## TRY THIS ON YOUR MACHINE

> Disk and cleanup flagged per item. Several exercises create volumes — the final cleanup block removes them all.

### 4.1 — Watch a mount shadow the image's own files

```bash
docker run --rm alpine ls /etc/hostname /etc/hosts
docker volume create shadow
docker run --rm -v shadow:/etc alpine ls /etc | head -5
docker run --rm -v /tmp:/etc alpine ls /etc | head -5
```

**Expect:** the first shows Alpine's `/etc`. The second shows Alpine's `/etc` too — because the *volume was empty and got seeded* from the image. The third shows **your `/tmp` contents**, because bind mounts never seed; they just cover.

**Why it's interesting:** it isolates the one behavioural difference between volumes and bind mounts in a single comparison. It also demonstrates that mounting over a populated path doesn't delete anything — the image's files are still in the lower layer, merely hidden. Unmount and they're back, which is why a typo'd mount target produces "the file disappeared" rather than any error. **Cleanup:** `docker volume rm shadow`

### 4.2 — Move a volume between containers, then to another machine's format

```bash
docker volume create movable
docker run --rm -v movable:/d alpine sh -c 'echo "written by container A" > /d/note.txt; date >> /d/note.txt'
docker run --rm -v movable:/d alpine cat /d/note.txt
docker run --rm -v movable:/d ubuntu:24.04 cat /d/note.txt

docker run --rm -v movable:/d -v /tmp:/out alpine tar czf /out/movable.tgz -C /d .
ls -lh /tmp/movable.tgz
tar tzf /tmp/movable.tgz
```

**Expect:** two different distributions read the same file, and the volume's entire contents become a portable tarball you could `scp` anywhere.

**Why it's interesting:** the volume is genuinely independent of any container *and* of any image. That tarball is the whole migration story for single-host Docker — no export format, no proprietary anything, just tar. **Cleanup:** `docker volume rm movable; rm /tmp/movable.tgz`

### 4.3 — Measure the cost of copy-on-write versus a volume

This makes Volume 1's theory financial.

```bash
echo "--- writable layer (overlay, copy-on-write) ---"
docker run --rm alpine sh -c 'time dd if=/dev/zero of=/test.bin bs=1M count=300 conv=fsync 2>&1 | tail -3'

echo "--- named volume (direct to host filesystem) ---"
docker volume create speedtest
docker run --rm -v speedtest:/v alpine sh -c 'time dd if=/dev/zero of=/v/test.bin bs=1M count=300 conv=fsync 2>&1 | tail -3'

echo "--- tmpfs (RAM) ---"
docker run --rm --tmpfs /t:size=400m alpine sh -c 'time dd if=/dev/zero of=/t/test.bin bs=1M count=300 conv=fsync 2>&1 | tail -3'
```

**Expect:** tmpfs dramatically fastest. The volume should beat the overlay, though on a fast NVMe disk with a fresh file the gap may be modest — overlay's real penalty shows on *modifying existing large files*, where copy-up dominates.

Make the copy-up penalty visible:

```bash
docker run --rm alpine sh -c '
  dd if=/dev/zero of=/big.bin bs=1M count=300 2>/dev/null
  sync
  echo "now appending one byte to a 300MB file already in the upper layer:"
  time sh -c "echo x >> /big.bin"'
```

**Why it's interesting:** it quantifies the advice "don't do heavy I/O on the container filesystem" instead of asking you to take it on faith. **Disk:** ~300 MB transiently, freed by `--rm`. **Memory:** 300 MB for the tmpfs run. **Cleanup:** `docker volume rm speedtest`

### 4.4 — Find an orphaned volume and work out what it was

```bash
docker run -d --name orphan-maker --rm postgres:16 -e POSTGRES_PASSWORD=x 2>/dev/null
sleep 3
docker stop orphan-maker 2>/dev/null
docker volume ls -f dangling=true
```

Pick one of the dangling hashes and investigate it:

```bash
VOL=$(docker volume ls -qf dangling=true | head -1)
docker volume inspect $VOL
sudo ls /var/lib/docker/volumes/$VOL/_data | head
sudo du -sh /var/lib/docker/volumes/$VOL/_data
```

**Expect:** a 64-character name, a creation date, and contents you can only identify by looking at the files. If it's a postgres data directory, you can tell — but you cannot tell *which application's* postgres data directory, or whether anything still needs it.

**Why it's interesting:** this is the real-world state of most long-lived Docker hosts, and it's the reason `docker volume prune` is nerve-racking on a machine you inherited. You're looking at data that is simultaneously too important to delete and impossible to attribute. Naming volumes is a five-second habit that prevents an unsolvable problem. **Cleanup:** `docker volume prune -f` (safe here, since you know what created these)

### 4.5 — Build a tested restore into a one-liner you'd actually run

```bash
docker volume create app-data
docker run --rm -v app-data:/d alpine sh -c 'for i in 1 2 3; do echo "record $i" > /d/rec-$i.txt; done; ls /d'

mkdir -p ~/vol-backups
docker run --rm -v app-data:/src:ro -v ~/vol-backups:/bak alpine \
  tar czf /bak/app-data.tgz -C /src .

# Simulate catastrophe
docker volume rm app-data

# Restore and verify — into a fresh volume, then check the contents
docker volume create app-data-restored
docker run --rm -v app-data-restored:/dst -v ~/vol-backups:/bak alpine \
  sh -c 'tar xzf /bak/app-data.tgz -C /dst'
docker run --rm -v app-data-restored:/d alpine sh -c 'ls /d && cat /d/rec-2.txt'
```

**Expect:** all three records, and `record 2` printed from a volume that is not the one you backed up.

**Why it's interesting:** this is the whole discipline in six commands, and the verification step at the end is the one that distinguishes it from theatre. Wrap it in a script, add a checksum comparison, and run it on a timer — that's a tested backup rather than a hopeful one. Note also that the restore ran `alpine`, not the application image: volume data is just files, so restores don't depend on the app being runnable. **Cleanup:** `docker volume rm app-data-restored; rm -rf ~/vol-backups`

### Cleanup for this volume

```bash
docker ps -aq | xargs -r docker rm -f
docker volume prune -f
docker system df
```

---

## Where this leaves you, and what's next

You can now state exactly where every byte a container writes ends up, and why. Three storage types, one mechanism — a mount placed into the container's mount namespace — differing only in what sits behind it. You've watched a database's data vanish, then not vanish, and understood the difference as a lifecycle property rather than a Docker mystery. You've found volume data on your own disk, moved it between containers and distributions as a tarball, and completed a restore into a fresh volume that proved the backup was real.

The through-line of Volumes 1 to 4: **Docker's abstractions are thin, and every one of them bottoms out in something you can inspect with standard Linux tools.** Namespaces in `/proc`. cgroups in `/sys/fs/cgroup`. Layers in `/var/lib/docker/overlay2`. Volumes in `/var/lib/docker/volumes`. There is no hidden layer left where the magic could be hiding.

Except one. Networking is the last part of Volume 1's list you've only used practically, never opened up. You've published ports without knowing what publishing does to your host. You've resolved container names by DNS without knowing who answers. And in Volume 3 I claimed — without proof — that Docker writes firewall rules that may bypass rules you wrote yourself.

**Volume 5: Networking, Deeply.**

The four network drivers at the namespace and `iptables` level. Veth pairs and the bridge: what physically connects an isolated network namespace to the outside world. A packet traced from an external client all the way to a process inside a container, hop by hop, with you running the commands to see each hop. How NAT and port publishing are actually implemented, including the exact rules in your `nat` table right now. How embedded DNS makes container names resolve, and where that server lives. And we close on a documented case of container networking misconfiguration causing real security exposure — the "I thought that port was internal" failure, with specifics.

Say "continue" when you're ready.

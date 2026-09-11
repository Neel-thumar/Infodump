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


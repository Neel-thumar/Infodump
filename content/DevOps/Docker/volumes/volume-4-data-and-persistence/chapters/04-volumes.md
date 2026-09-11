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


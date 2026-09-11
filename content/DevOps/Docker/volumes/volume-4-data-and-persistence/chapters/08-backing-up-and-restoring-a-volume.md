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


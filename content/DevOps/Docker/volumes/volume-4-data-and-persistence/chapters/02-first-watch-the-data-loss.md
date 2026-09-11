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


## The commands

```bash
docker compose up -d              # create/start everything, detached
docker compose up -d --build      # rebuild images first
docker compose ps                 # state of this project's services
docker compose logs -f api        # follow one service's logs
docker compose logs -f            # all services, interleaved and colour-coded
docker compose exec api bash      # shell into a running service
docker compose run --rm api python migrate.py   # one-off container, then discard
docker compose restart api
docker compose stop
docker compose down               # stop and remove containers + network
docker compose down -v            # ...AND DELETE THE NAMED VOLUMES
docker compose config             # resolved configuration
docker compose top                # processes across services
```

Two distinctions worth committing to memory.

**`exec` versus `run`.** `exec` runs a command in an *existing, running* container (Volume 3's `setns`). `run` starts a *new* container from the service definition — useful for one-off tasks, and it ignores `ports` by default to avoid conflicts. If a service isn't running, `exec` fails and `run` works.

**`down` versus `down -v`.** `down` removes containers and the network and **keeps named volumes**. `down -v` deletes them. That single flag is the difference between "restart the stack" and "destroy the database," and it is exactly the Volume 4 data-loss mechanism with a friendlier interface. Anonymous volumes are removed by plain `down` too, which is one more reason to name everything.

---


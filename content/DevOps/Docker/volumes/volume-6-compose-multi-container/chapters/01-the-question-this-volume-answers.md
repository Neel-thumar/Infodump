## The question this volume answers

Every command in this guide so far has managed exactly one container. Real applications are not one container. A modest web application is an API, a database, a cache, and a reverse proxy — four containers that need the right network, the right volumes, the right environment variables, and a workable startup order.

You can do all of that with the commands you already know. Here is what that looks like:

```bash
docker network create myapp-net
docker volume create myapp-pgdata

docker run -d --name myapp-db --network myapp-net \
  -v myapp-pgdata:/var/lib/postgresql/data \
  -e POSTGRES_USER=appuser -e POSTGRES_PASSWORD=localdev -e POSTGRES_DB=appdb \
  --restart unless-stopped -m 512m \
  postgres:16

docker run -d --name myapp-cache --network myapp-net \
  --restart unless-stopped -m 128m \
  redis:7-alpine

sleep 10   # hope that's long enough

docker build -t myapp:latest ./api
docker run -d --name myapp-api --network myapp-net \
  -p 127.0.0.1:8000:8000 \
  -e DATABASE_URL=postgresql://appuser:localdev@myapp-db:5432/appdb \
  -e REDIS_URL=redis://myapp-cache:6379 \
  --restart unless-stopped -m 256m \
  myapp:latest
```

Nothing there is new — networks from Volume 5, volumes from Volume 4, flags from Volume 3, the build from Volume 2. It works.

And it is unusable as a way to run software. It lives in someone's shell history or a bash script nobody trusts. There's no way to see the current state as a whole, no way to tear it down cleanly, no way to know whether the running system matches the script. New team members clone the repo and get nothing. And that `sleep 10` is load-bearing.

**So the question: what is the minimum thing that turns "a pile of docker run commands" into a describable, reproducible, version-controlled application?**

Compose is that thing. It is worth being precise about what it is and isn't, because people either undersell it ("just a dev tool") or oversell it ("basically Kubernetes"). Compose is **a declarative front end to the Docker API for a single host**. It types your `docker run` commands for you, from a file. That's the whole value proposition, and it is a much bigger deal than it sounds.

---


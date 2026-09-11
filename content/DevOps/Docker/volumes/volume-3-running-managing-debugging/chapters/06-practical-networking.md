## Practical networking

Internals are Volume 5. Here is the working knowledge.

### The default bridge, and why you shouldn't use it

```bash
docker network ls
```

`bridge`, `host`, and `none` ship by default. Containers with no `--network` flag land on `bridge` — and on the default bridge, **name resolution does not work**. Containers can reach each other by IP only.

### User-defined networks: the actual answer

```bash
docker network create appnet
docker run -d --name api --rm --network appnet -e GREETING="from api" myapp:v2
docker run --rm --network appnet alpine sh -c 'apk add -q curl && curl -s http://api:8000'
```

**Expect:** the second container reaches the first **by the name `api`**. Docker runs an embedded DNS server at `127.0.0.11` inside each container on a user-defined network, resolving container names and aliases to current IPs.

Prove it:

```bash
docker run --rm --network appnet alpine cat /etc/resolv.conf
docker run --rm --network appnet alpine nslookup api
```

**This is the single most important practical networking fact in Docker:** create a user-defined network, name your containers, and address them by name. IPs change on every restart; names don't. Every Compose file in Volume 6 relies on this, and Compose creates such a network for you automatically — which is why service names "just work" there.

### Publishing versus connecting

Two distinct things people conflate:

- **Container-to-container on the same network:** use the **container port** directly (`http://api:8000`). No `-p` needed. Publishing is irrelevant here.
- **Host or outside world to container:** requires `-p`. This is the only case that needs it.

So a database used only by your app should have **no `-p` at all**. Every `-p 5432:5432` in a Compose file is a database exposed to the host, and often to the network. It's there because someone wanted to connect a GUI client once.

```bash
docker network inspect appnet --format '{{json .Containers}}' | python3 -m json.tool
docker stop api
docker network rm appnet
```

### The other drivers, briefly

| Driver | What it does | When |
| --- | --- | --- |
| `bridge` | Private network + NAT (default) | Almost always |
| `host` | No network namespace at all — container uses host's stack | Extreme performance need, or port-scanning tools. Loses isolation and port remapping |
| `none` | Network namespace with only `lo` | Batch jobs that must not touch the network |
| `overlay` | Multi-host networking | Swarm / orchestration (Volume 8) |

```bash
docker run --rm --network host alpine ip addr | head -5
docker run --rm --network none alpine ip addr
```

**Expect:** `host` shows your machine's real interfaces; `none` shows only loopback. This is Volume 1's network namespace, exposed as a flag.

---


## DNS and service discovery

### The problem

Container IPs are assigned at start time from the bridge's pool and change on every restart. Hardcoding them is impossible. Volume 3's answer was "use a user-defined network and address containers by name" — here's the implementation.

```bash
docker network create appnet
docker run -d --name api --rm --network appnet nginx:1.27
docker run -d --name client --rm --network appnet alpine sleep 300

docker exec client cat /etc/resolv.conf
```

**Expect:** `nameserver 127.0.0.11`.

That is a **loopback address inside the container's network namespace** — not your host, not your router, not a real external server. Docker runs an embedded DNS resolver and makes it reachable there.

```bash
docker exec client nslookup api
docker exec client nslookup google.com | tail -4
```

**Expect:** `api` resolves to its container IP; external names resolve too, because the embedded server forwards anything it doesn't own to your host's configured resolvers.

### How it's actually wired

```bash
PID=$(docker inspect -f '{{.State.Pid}}' client)
sudo nsenter -t $PID -n iptables -t nat -L -n 2>/dev/null | head -20
```

**Expect:** NAT rules **inside the container's own network namespace**, redirecting traffic to `127.0.0.11` on port 53 to a high port where the daemon's resolver is listening.

This is the elegant bit: because each container has its own network namespace, it also has its own **independent iptables ruleset**. Docker can install per-container NAT rules that only that container sees. `127.0.0.11` isn't a real service anywhere — it's an address that gets rewritten before it goes anywhere, differently in each container.

### Aliases and multiple networks

```bash
docker network create backend
docker network connect backend api
docker run --rm --network appnet --network-alias frontend alpine nslookup api

docker inspect api --format '{{json .NetworkSettings.Networks}}' | python3 -m json.tool | head -20
```

A container can sit on several networks with a different IP on each, and can carry aliases beyond its name. This is how you build tiers: a proxy on both the public and backend networks, a database only on the backend, and `DOCKER-ISOLATION` chains keeping the tiers apart.

```bash
docker stop api client
docker network rm appnet backend
```

**The rule that follows:** containers that must talk to each other go on a shared user-defined network and address each other by name on the **container** port. Nothing needs publishing. Volume 6 is built entirely on this.

---


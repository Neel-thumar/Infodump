## Tracing a packet, hop by hop

Set up a target and follow a request from outside the host all the way to the process.

```bash
docker run -d --name traced --rm -p 8080:80 nginx:1.27
CIP=$(docker inspect -f '{{.NetworkSettings.IPAddress}}' traced)
echo "container IP: $CIP"
```

### The path

```text
  external client  →  eth0 (host NIC)
        │
        ▼
  [ nat: PREROUTING ]   DNAT: dst 192.168.1.10:8080  →  172.17.0.2:80
        │
        ▼
  routing decision: "not for me — 172.17.0.2 is via docker0" → FORWARD path
        │
        ▼
  [ filter: FORWARD ] → DOCKER-USER → DOCKER-ISOLATION-STAGE-1 → DOCKER
        │                (your rules)      (network separation)   (published ports)
        ▼
  docker0 bridge  →  vethXXXX  ═══ veth pair ═══  eth0 (in container netns)
        │
        ▼
  nginx, listening on 0.0.0.0:80 inside the container's network namespace

  ── reply path ──
  container → docker0 → [ nat: POSTROUTING ] MASQUERADE → host NIC → client
```

The single most important structural fact in that diagram: **the packet never enters the `INPUT` chain.** It is DNAT'd in `PREROUTING`, then *routed* to another interface, which puts it on the `FORWARD` path. `INPUT` is only for packets destined to the host itself. Hold onto that; it's this volume's incident.

### Now see the actual rules on your machine

```bash
sudo iptables -t nat -L PREROUTING -n --line-numbers
sudo iptables -t nat -L DOCKER -n
```

**Expect:** `PREROUTING` jumps to the `DOCKER` chain for local destinations, and the `DOCKER` chain contains a line like:

```text
DNAT  tcp  --  0.0.0.0/0  0.0.0.0/0  tcp dpt:8080 to:172.17.0.2:80
```

**That line is your `-p 8080:80`.** It is the same rule you wrote by hand in Step 6, generated automatically.

Outbound masquerading:

```bash
sudo iptables -t nat -L POSTROUTING -n
```

**Expect:** `MASQUERADE all -- 172.17.0.0/16 !docker0` — your Step 5 rule, scoped to the Docker subnet and excluding traffic that stays on the bridge.

The filter chains:

```bash
sudo iptables -L FORWARD -n --line-numbers | head
sudo iptables -L DOCKER-USER -n
sudo iptables -L DOCKER-ISOLATION-STAGE-1 -n | head
```

| Chain | Purpose |
| --- | --- |
| `DOCKER-USER` | **Empty by default. Yours.** Evaluated before Docker's own rules, and Docker never touches it |
| `DOCKER-ISOLATION-STAGE-1/2` | Stops containers on different user-defined networks reaching each other |
| `DOCKER` | The per-published-port ACCEPT rules |

`DOCKER-USER` existing at all is the fix for the problem this volume ends on — Docker rewrites its own chains constantly, so it deliberately provides one it will never rewrite.

### Watch the translation happen live

```bash
sudo conntrack -L 2>/dev/null | head -5 || sudo apt install -y conntrack
curl -s localhost:8080 > /dev/null
sudo conntrack -L 2>/dev/null | grep 8080 | head -3
```

**Expect:** a connection-tracking entry showing the original tuple (`dport=8080`) and the reply tuple (`sport=80` from `172.17.0.2`). **This is where NAT actually lives** — the rule fires once per connection, and conntrack remembers the mapping so every subsequent packet, in both directions, is rewritten consistently.

### The `docker-proxy` mystery

```bash
ps aux | grep -c "[d]ocker-proxy"
sudo ss -tlnp | grep 8080
```

**Expect:** a `docker-proxy` process per published port, listening on 8080.

If DNAT already does the job, why is there a userspace proxy? Because DNAT in `PREROUTING` doesn't catch every case — notably some loopback traffic and setups where the kernel path doesn't apply. `docker-proxy` is a fallback that accepts connections in userspace and copies bytes to the container. In the normal path the iptables rule wins and the proxy is idle. It's an implementation detail worth recognizing so you don't mistake it for the primary mechanism, and it can be disabled (`"userland-proxy": false` in `daemon.json`) with some trade-offs.

```bash
docker stop traced
```

---


## TRY THIS ON YOUR MACHINE

> Several exercises inspect firewall state; none modify it except where flagged. Cleanup per item.

### 5.1 — Watch a packet get rewritten, in real time

```bash
docker run -d --name sniff --rm -p 8080:80 nginx:1.27
sudo apt install -y tcpdump
```

Two terminals. Terminal A — watch the bridge:

```bash
sudo tcpdump -i docker0 -n -c 10 'tcp port 80'
```

Terminal B:

```bash
curl -s localhost:8080 > /dev/null
```

**Expect:** terminal A shows packets addressed to `172.17.0.2:80` — but you typed `localhost:8080`. The destination address and port were both rewritten in `PREROUTING` before the packet ever reached the bridge.

Now watch the same connection from inside the container's namespace:

```bash
PID=$(docker inspect -f '{{.State.Pid}}' sniff)
sudo nsenter -t $PID -n tcpdump -i eth0 -n -c 5 &
sleep 1
curl -s localhost:8080 > /dev/null
sleep 2
```

**Expect:** from the container's perspective, the connection simply arrived on port 80 from `172.17.0.1`. It has no idea a translation occurred or that the client asked for port 8080.

**Why it's interesting:** you're seeing both sides of the same NAT, and the asymmetry explains a real operational problem — **the container sees the gateway's IP as the client address, not the real client's.** That's why access logs in containerized web servers show `172.17.0.1` for everything, and why `X-Forwarded-For` headers exist. **Cleanup:** `docker stop sniff`

### 5.2 — Prove network isolation between user-defined networks

```bash
docker network create net-a
docker network create net-b
docker run -d --name a1 --rm --network net-a alpine sleep 300
docker run -d --name b1 --rm --network net-b alpine sleep 300

IPB=$(docker inspect -f '{{.NetworkSettings.Networks.net_b.IPAddress}}' b1 2>/dev/null || \
      docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' b1)
echo "b1 is at $IPB"
docker exec a1 ping -c2 -W2 $IPB 2>&1 | tail -2
```

**Expect:** no reply. Both containers are on the same host, both have routes toward each other's subnet — and the packets are dropped.

Find out where:

```bash
sudo iptables -L DOCKER-ISOLATION-STAGE-1 -n -v | head
sudo iptables -L DOCKER-ISOLATION-STAGE-2 -n -v | head
```

Now connect `a1` to `net-b` and watch it start working:

```bash
docker network connect net-b a1
docker exec a1 ping -c2 -W2 $IPB 2>&1 | tail -2
```

**Expect:** replies, and `a1` now has two interfaces.

**Why it's interesting:** the isolation is enforced by explicit DROP rules with packet counters you can watch increment, not by anything structural. Network membership is the actual security boundary between container tiers — which makes "which network is this service on" a security question, not a convenience one. **Cleanup:** `docker stop a1 b1; docker network rm net-a net-b`

### 5.3 — Find every port your host is exposing, and verify from outside

```bash
sudo ss -tlnp | grep -E "0\.0\.0\.0|\[::\]"
docker ps --format "table {{.Names}}\t{{.Ports}}"
sudo iptables -t nat -L DOCKER -n | grep DNAT
```

Three views of the same question: what the kernel has listening, what Docker thinks it published, and what the NAT table will actually translate. Cross-check them.

Then the only test that counts — from a **different device on your network** (another laptop, your phone with a scanner app):

```bash
# run this FROM another machine, replacing the IP with your host's LAN address
nmap -p 1-10000 192.168.1.X
```

**Expect:** possibly more open ports than you expected.

**Why it's interesting:** this is the incident above, performed as a drill rather than as a discovery. Doing it once on your own machine builds the reflex that prevents it on a server. **Flagged:** only scan machines you own. `nmap` against other people's hosts is at best rude and often illegal.

### 5.4 — Break DNS deliberately, then see who was answering

```bash
docker network create dnsdemo
docker run -d --name resolver-target --rm --network dnsdemo nginx:1.27
docker run --rm --network dnsdemo alpine sh -c '
  cat /etc/resolv.conf
  echo "--- resolving by name ---"
  nslookup resolver-target
  echo "--- who is 127.0.0.11? ---"
  nc -z -v -w1 127.0.0.11 53 2>&1 | tail -1
'
```

Now remove the resolver from the equation by using the default bridge:

```bash
docker run --rm alpine sh -c 'cat /etc/resolv.conf; nslookup resolver-target 2>&1 | tail -2'
```

**Expect:** on the user-defined network, `/etc/resolv.conf` points at `127.0.0.11` and the name resolves. On the default bridge, `resolv.conf` contains your **host's** nameservers and the container name doesn't resolve at all.

**Why it's interesting:** it pins down exactly what a user-defined network gives you. The connectivity is identical on both; what changes is *which resolver the container is pointed at*. Everything people call "Docker service discovery" is that one substitution. **Cleanup:** `docker stop resolver-target; docker network rm dnsdemo`

### 5.5 — Share one network namespace between two containers

```bash
docker run -d --name owner --rm -p 8080:80 nginx:1.27
docker run --rm --network container:owner alpine sh -c '
  ip addr show eth0
  echo "--- can I reach nginx on localhost? ---"
  wget -qO- http://127.0.0.1:80 2>/dev/null | head -2
  readlink /proc/self/ns/net
'
PID=$(docker inspect -f '{{.State.Pid}}' owner)
sudo readlink /proc/$PID/ns/net
```

**Expect:** the second container has the **same `eth0` and same IP** as the first, can reach nginx on `127.0.0.1` (they share a loopback), and the two `net` namespace inodes match.

**Why it's interesting:** this is the Volume 3 debugging trick with its mechanism now fully visible, and it's the same primitive Kubernetes pods are built on — several containers sharing one network namespace, so they address each other over localhost and share a single IP. When someone says "containers in a pod share a network," this is literally it: `setns()` into an existing namespace rather than creating a new one. **Cleanup:** `docker stop owner`

### Cleanup for this volume

```bash
docker ps -aq | xargs -r docker rm -f
docker network prune -f
ip link show type veth
sudo iptables -t nat -L DOCKER -n
```

The last two should show no leftover veth interfaces and an empty-ish `DOCKER` chain once all containers are gone — Docker cleans up its own rules and interfaces on container removal.

---


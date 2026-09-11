---
id: networking-deeply
title: Volume 5 — Networking, Deeply
order: 5
description: Veth pairs, bridges and NAT built by hand, a packet traced hop by hop into a container, the real iptables rules Docker writes, and how embedded DNS works.
draft: false
---

# Mastering Docker: The Engineering, The History, The Incidents

## Volume 5 — Networking, Deeply

---

## The question this volume answers

In Volume 1 you ran this and saw something stark:

```bash
sudo unshare --net bash
ip addr
exit
```

One interface — `lo`, down. No routes. A network namespace is an island with no bridge to the mainland. That process couldn't reach the internet, couldn't reach your host, couldn't even reach itself.

And yet in Volume 3 you ran `docker run -d -p 8080:80 nginx`, typed `curl localhost:8080` on your host, and got a response from a process living in exactly that kind of island.

**So: what physically connects an isolated network namespace to the outside world, and what happens to a packet on its way in?**

The honest answer is that Docker performs about five distinct operations, all of them standard Linux networking, none of them Docker-specific. This volume does them by hand first, then finds Docker doing the same thing, then traces a real packet through the result.

One note before we start. Modern Debian uses the **nftables** backend, with `iptables` provided as a compatibility wrapper (`iptables-nft`). The `iptables` commands below work regardless, and Docker still speaks in `iptables` terms. Check which you have:

```bash
sudo iptables --version
```

If it says `nf_tables`, you're on the wrapper. Everything here still applies.

---

## Build container networking by hand

No Docker. Just `iproute2` and `iptables`, which are already on your machine. By the end of this section you'll have a network namespace with internet access that you built yourself — and Docker's design will look inevitable rather than magical.

### Step 1: an island

```bash
sudo ip netns add manual-ns
sudo ip netns exec manual-ns ip addr
```

**Expect:** only `lo`, DOWN. Same island as before, but now it's a *named, persistent* namespace you can enter repeatedly — that's all `ip netns` adds over `unshare --net`.

```bash
sudo ip netns exec manual-ns ping -c1 8.8.8.8
```

**Expect:** "Network is unreachable." No interface, no route, nowhere to send anything.

### Step 2: the cable — a veth pair

A **veth pair** is a virtual Ethernet cable: two interfaces, permanently connected, where anything written into one comes out of the other. Critically, **the two ends can live in different network namespaces.** That property is the entire basis of container networking.

```bash
sudo ip link add veth-host type veth peer name veth-ns
ip link show veth-host
```

**Expect:** `veth-host@veth-ns` — the `@` names its peer. Both ends are currently in your host's namespace, which is useless. Move one end across:

```bash
sudo ip link set veth-ns netns manual-ns
ip link show veth-ns 2>&1 | tail -1
sudo ip netns exec manual-ns ip link show veth-ns
```

**Expect:** the host no longer has `veth-ns`; the namespace does. **You just moved a network interface between namespaces.** An interface belongs to exactly one network namespace at a time, and moving it is a single command. (Note: moving an interface resets its configuration, which is why you address it after the move, not before.)

### Step 3: address both ends and bring them up

```bash
sudo ip addr add 10.99.0.1/24 dev veth-host
sudo ip link set veth-host up

sudo ip netns exec manual-ns ip addr add 10.99.0.2/24 dev veth-ns
sudo ip netns exec manual-ns ip link set veth-ns up
sudo ip netns exec manual-ns ip link set lo up

sudo ip netns exec manual-ns ping -c2 10.99.0.1
```

**Expect:** replies. The namespace can now reach your host over the virtual cable.

### Step 4: a default route

```bash
sudo ip netns exec manual-ns ip route
sudo ip netns exec manual-ns ip route add default via 10.99.0.1
sudo ip netns exec manual-ns ping -c1 8.8.8.8
```

**Expect:** the ping now *leaves* (no "unreachable") but still gets no reply. Progress — the packet reaches your host and then dies there, for two reasons.

### Step 5: forwarding and NAT

Reason one: your host is not a router, so it drops packets that aren't for it.

```bash
cat /proc/sys/net/ipv4/ip_forward
sudo sysctl -w net.ipv4.ip_forward=1
```

Reason two, and the more interesting one: the packet has source address `10.99.0.2`, which is meaningless on the internet. It would go out, and the reply would have nowhere to come back to. The fix is **source NAT** — rewrite the source address to your host's, remember the mapping, and rewrite replies back:

```bash
IFACE=$(ip route show default | awk '{print $5; exit}')
echo "uplink interface: $IFACE"
sudo iptables -t nat -A POSTROUTING -s 10.99.0.0/24 -o $IFACE -j MASQUERADE

sudo ip netns exec manual-ns ping -c2 8.8.8.8
```

**Expect:** replies from the internet, from inside a namespace that started with nothing.

`MASQUERADE` is source NAT that uses whatever address the outgoing interface currently has. That's exactly what Docker does for outbound container traffic, and you'll find a nearly identical rule in your NAT table in a moment.

### Step 6: publish a port inbound

Outbound works. Inbound — reaching a server *inside* the namespace from outside — needs **destination NAT**.

```bash
sudo ip netns exec manual-ns sh -c 'nc -l -p 8000 -k -e /bin/echo "hello from the namespace" &' 2>/dev/null || \
  echo "starting a listener instead:"
sudo ip netns exec manual-ns python3 -m http.server 8000 &
sleep 2
curl -s --max-time 2 http://10.99.0.2:8000 | head -3
```

That works from your host because you have a route to `10.99.0.2`. But nobody else does — that address doesn't exist outside your machine. So: DNAT any packet arriving at host port 9000 to `10.99.0.2:8000`.

```bash
sudo iptables -t nat -A PREROUTING -p tcp --dport 9000 -j DNAT --to-destination 10.99.0.2:8000
sudo iptables -t nat -A OUTPUT -p tcp -d 127.0.0.1 --dport 9000 -j DNAT --to-destination 10.99.0.2:8000
curl -s --max-time 2 http://127.0.0.1:9000 | head -3
```

**Expect:** the listing served from inside the namespace, reached via a host port.

You now have the complete mechanism. **`docker run -p 9000:8000` is that DNAT rule.** The `OUTPUT` rule is needed separately because locally-generated traffic doesn't traverse `PREROUTING` — a detail that will matter when we discuss why the firewall gets bypassed.

### Step 7: why a bridge

One namespace needed one veth pair. Ten namespaces would need ten veth pairs, ten subnets, ten sets of routes — and they still couldn't talk to *each other*.

A **Linux bridge** is a virtual switch. Put one end of every veth pair into it, give the bridge an IP, and every namespace lands on a shared L2 segment with one gateway. That's what `docker0` is.

```bash
sudo ip link show type bridge
```

**Cleanup for this section:**

```bash
sudo pkill -f "http.server 8000"
IFACE=$(ip route show default | awk '{print $5; exit}')
sudo iptables -t nat -D POSTROUTING -s 10.99.0.0/24 -o $IFACE -j MASQUERADE
sudo iptables -t nat -D PREROUTING -p tcp --dport 9000 -j DNAT --to-destination 10.99.0.2:8000
sudo iptables -t nat -D OUTPUT -p tcp -d 127.0.0.1 --dport 9000 -j DNAT --to-destination 10.99.0.2:8000
sudo ip netns del manual-ns
sudo ip link del veth-host 2>/dev/null
```

> **Flagged:** this section enables IP forwarding and adds NAT rules to your host. The cleanup removes the rules; `ip_forward` was almost certainly already `1` if Docker is running, and Docker needs it. Nothing here opens a port to the internet unless your host is directly internet-facing — if it is, run the `curl` steps but skip leaving the DNAT rule in place.

---

## Now find Docker doing exactly this

### The bridge

```bash
ip addr show docker0
ip -d link show docker0 | head -3
```

**Expect:** a bridge named `docker0`, typically `172.17.0.1/16`. That's the gateway address every container on the default bridge uses — your Step 3 host end, generalized.

### The veth pairs

```bash
docker run -d --name net1 --rm alpine sleep 300
docker run -d --name net2 --rm alpine sleep 300

ip link show type veth
bridge link show
```

**Expect:** two new interfaces with names like `vethXXXXXX@ifN`, both enslaved to `docker0`. Each is the host end of a pair whose other end lives in a container.

Match a specific one to its container:

```bash
PID=$(docker inspect -f '{{.State.Pid}}' net1)
sudo nsenter -t $PID -n ip addr show eth0
sudo nsenter -t $PID -n ip link show eth0 | head -1
```

**Expect:** `eth0` inside the container, with an address like `172.17.0.2/16`, and a line ending in `@if<N>` where `<N>` is the host-side interface index. Look it up:

```bash
IFINDEX=$(sudo nsenter -t $PID -n cat /sys/class/net/eth0/iflink)
echo "peer host ifindex: $IFINDEX"
ip link | grep "^$IFINDEX:"
```

**Expect:** the host-side `veth` that pairs with this container's `eth0`. You just traced a virtual cable across a namespace boundary.

**The container's `eth0` is not special.** It's the far end of a veth pair, renamed. Containers see `eth0` for the same reason your laptop does: convention.

### Routes and gateway

```bash
sudo nsenter -t $PID -n ip route
sudo nsenter -t $PID -n cat /etc/resolv.conf
```

**Expect:** a default route via `172.17.0.1` — the `docker0` address — exactly like your Step 4.

### Container-to-container on the same bridge

```bash
IP2=$(docker inspect -f '{{.NetworkSettings.IPAddress}}' net2)
docker exec net1 ping -c2 $IP2
docker exec net1 ping -c2 net2 2>&1 | tail -2
```

**Expect:** the IP works; the **name does not** ("bad address"). This is the default-bridge limitation from Volume 3, and now you know it's a DNS question, not a connectivity one — the packets would flow fine if the name resolved.

```bash
docker stop net1 net2
```

---

## The four drivers, at namespace level

| Driver | Network namespace | Connectivity mechanism |
| --- | --- | --- |
| `bridge` | **New**, private | veth pair into a bridge + NAT. The default |
| `host` | **None — shares the host's** | No isolation at all; container binds host interfaces directly |
| `none` | **New**, empty | Only `lo`. No veth, no route |
| `overlay` | **New**, private | VXLAN tunnels between hosts (Swarm/orchestration) |

Prove the `host` case is literally namespace sharing, using Volume 1's inode comparison:

```bash
readlink /proc/self/ns/net
docker run --rm --network host alpine readlink /proc/self/ns/net
docker run --rm alpine readlink /proc/self/ns/net
```

**Expect:** the first two print the **same inode**; the third differs. `--network host` is not "a faster network mode." It is *the absence of a network namespace*, which is why there's no NAT overhead, no port mapping, and no isolation. A container on `--network host` binding port 80 is binding your host's port 80.

And `none`:

```bash
docker run --rm --network none alpine sh -c 'ip addr; ip route; ping -c1 -W1 8.8.8.8 2>&1 | tail -1'
```

Genuinely useful for batch jobs that process local data and have no business touching a network — an isolation win that costs nothing.

---

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

## The incident: the firewall that wasn't consulted

This one is unusual: it is not a bug, not a CVE, and not a single company's outage. It is a **documented design decision** whose consequences have exposed an enormous number of databases to the internet, and Docker documents it themselves.

### The setup

An Ubuntu or Debian server. The admin does the responsible thing:

```bash
# illustrative — don't run this unless you know your SSH access survives it
sudo ufw default deny incoming
sudo ufw allow 22/tcp
sudo ufw enable
sudo ufw status
```

Default deny. Only SSH open. Then a container is started for an internal service:

```bash
docker run -d --name db -p 5432:5432 -e POSTGRES_PASSWORD=devpassword postgres:16
```

The admin's mental model: UFW denies everything except 22, so 5432 is internal only.

**The reality: port 5432 is open to the entire internet.** And it is not subtle — `ufw deny 5432` explicitly will not close it either.

### Why, and you can already derive it

Look back at the packet trace. `ufw` writes its rules into the **`INPUT`** chain (via `ufw-user-input`). Docker publishes ports with a **DNAT rule in the `nat` table's `PREROUTING`** chain, which rewrites the destination *before* the routing decision. The rewritten packet is destined for `172.17.0.2`, which is not the host, so the kernel puts it on the **`FORWARD`** path.

The packet never enters `INPUT`. UFW's rules live in `INPUT`. **The two systems operate on entirely different parts of the packet path**, so `ufw status` can honestly report "deny incoming" while the port answers the world.

Docker's own documentation states this plainly: traffic to and from published container ports is diverted before it reaches the chains ufw uses, because Docker routes container traffic in the `nat` table.

> **Confidence: high.** This is documented in Docker's official networking documentation and independently described across many technical writeups. It is longstanding intended behaviour, not a defect — which is precisely why it keeps catching people.

### Why it's so dangerous in practice

Four factors compound:

1. **`-p 5432:5432` binds `0.0.0.0`** — every interface, including the public one. The short form gives no hint of this.
2. **The admin has positive evidence they're safe.** `ufw status` says default deny. That's worse than no firewall, because it stops the investigation.
3. **Database images ship with weak development defaults**, and a `POSTGRES_PASSWORD` set for local convenience becomes a production credential.
4. **The internet is scanned continuously.** An exposed database on a default port is typically found within hours, not weeks. This is the same automated-scanning economy behind Volume 2's cryptomining images, and it's the direct precursor to Volume 7's exposed-daemon attacks.

Copy-pasting a Compose file that publishes every service's port — extremely common, because it's convenient during development — turns this from one mistake into several at once.

### The fixes, in order of preference

**1. Don't publish what doesn't need publishing.** The strongest fix, and free. A database used only by your app needs no `-p` at all — it needs a shared network and a name:

```bash
docker network create private
docker run -d --name db --network private -e POSTGRES_PASSWORD=x postgres:16
docker run -d --name app --network private -p 127.0.0.1:8080:8080 myapp:v2
```

**2. Bind to loopback when you do publish.** `-p 127.0.0.1:5432:5432` is reachable from the host (and SSH tunnels) and from nowhere else. Make this your reflex for anything not deliberately public.

**3. Use `DOCKER-USER` for real filtering.** It's evaluated before Docker's rules and Docker never rewrites it:

```bash
# illustrative — understand each line before running on a host you care about
sudo iptables -I DOCKER-USER -i eth0 -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
sudo iptables -I DOCKER-USER -i eth0 -j DROP
```

Order matters (later `-I` inserts go first), the interface name must match your real uplink, and these do not survive a reboot without `iptables-persistent`. Community tooling exists to bridge UFW config into `DOCKER-USER`; read it before trusting it.

**4. Put a firewall outside the host.** Cloud security groups, a VPC firewall, or a hardware firewall sit on the wire and don't care what your host's iptables say. This is the only layer that's robust against the entire class of mistake.

**5. Verify from outside, always.** The most valuable habit in this volume:

```bash
sudo ss -tlnp | grep -E "0.0.0.0|\[::\]"
```

Anything bound to `0.0.0.0` is a candidate for public exposure. Then scan from a *different machine* — `nmap` from your laptop against the server. **Do not trust `ufw status`; trust what the network can actually see.**

### The general lesson

Two subsystems each behaved correctly and documented themselves accurately. The failure was in the seam — the same shape as Volume 1's CVE-2019-5736, where every namespace worked and the escape came through a file descriptor nobody had considered crossing the boundary.

**Isolation is a property of a whole system, not of any component.** Your security posture is not the sum of your tools' configurations; it's what actually happens to a packet. The only way to know that is to test it from the outside.

---

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

## Where this leaves you, and what's next

You built container networking from nothing: a namespace, a veth pair, an address, a route, forwarding, source NAT out, destination NAT in. Then you found every one of those pieces in Docker's own setup, read the actual DNAT rule your `-p` flag generated, watched conntrack hold the translation, traced a packet through `PREROUTING` to the bridge to the container, and found the embedded resolver living behind a per-namespace NAT rule at an address that doesn't exist anywhere.

And you understand the firewall bypass not as a gotcha to memorize but as a consequence you could have predicted from the packet path.

That completes the mechanism tour. Volumes 1 to 5 covered namespaces, cgroups, layered filesystems, storage, and networking — every kernel feature that makes a container. **From here the guide shifts from "how does this work" to "how do you actually build and run things with it."**

**Volume 6: Docker Compose and Multi-Container Applications.**

Every command you've typed has managed one container. Real applications are an app, a database, a cache, a proxy — each needing the right network, the right volumes, the right environment, started in a workable order, reproducibly, by anyone who clones the repo. We'll derive what Compose is actually for, build `docker-compose.yml` from first principles (services, networks, volumes, env files) using the networking and storage you now understand rather than treating them as magic, and build a real multi-service application end to end. Then the classic gotcha, with a proper look at why it bites: `depends_on` waits for *started*, not for *ready* — and the race condition that follows has broken more first deployments than any other single misunderstanding in Docker.

Say "continue" when you're ready.
